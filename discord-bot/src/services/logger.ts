import {
    ChannelType,
    EmbedBuilder,
    ForumChannel,
    Guild,
    TextChannel,
    ThreadChannel,
    User,
    CategoryChannel,
    type Message,
    type PartialMessage
} from "discord.js";

import { buildCategoryDisplayName, reorderServerCategories } from "./serverCodenames.js";
import { buildServerCategoryPermissionOverwrites, ensureServerCategoryPermissions } from "./serverCategoryPermissions.js";
import { config } from "../config.js";
import { getRobloxId } from "./bloxlinkSync.js";
import { resolveDiscordIdFromRobloxUserId } from "./banNotification.js";

const LOG_CHANNEL_NAME =
    config.channels.moderationLogs || "user-logs";

const DISCORD_MAX_CONTENT_LENGTH = 2000;
const PRIORITY_CATEGORY_NAME = "PriorityCategory";
const ROBLOX_COMMANDS_AUDIT_CHANNEL_NAME = "robloxCommandsLogs";
const DISCORD_COMMANDS_AUDIT_CHANNEL_NAME = "discordCommandsLogs";
const GAME_COMMANDS_AUDIT_CHANNEL_NAME = "bans-unban-logs";

const PLAYER_LEFT_TITLES = [
    "player left",
    "player leaved"
];

function normalizeEmbedTitle(title: string | null | undefined) {
    return title
        ?.toLowerCase()
        .replace(/^[^a-z]+|[^a-z]+$/g, "")
        .trim() ?? "";
}

function normalizeThreadLabel(value: string) {
    return value
        .replace(/\s*\(Roblox\)\s*$/i, "")
        .trim();
}

function normalizeTextChannelName(name: string) {
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
}

function truncateDiscordContent(content: string) {
    if (content.length <= DISCORD_MAX_CONTENT_LENGTH) {
        return content;
    }

    return content.slice(0, DISCORD_MAX_CONTENT_LENGTH - 1) + "…";
}

/**
 * Batches rapid-fire plain-text log lines (chat, radio) so a busy
 * Roblox server doesn't send one Discord message per game chat
 * line.
 *
 * Discord rate-limits a channel to ~5 messages/5s. With many
 * concurrent players, every chat line becoming its own message hits
 * that wall constantly and everything queues up behind it — this is
 * the actual lag ceiling, not something caching alone fixes.
 *
 * Instead, lines are buffered per target (a specific thread or
 * channel) for BATCH_WINDOW_MS and flushed as one message (or a
 * handful, if the batch is big enough to need chunking). The target
 * itself (thread/channel resolution) is also only looked up once
 * per flush instead of once per line, which compounds nicely with
 * the id caches added earlier.
 */
const BATCH_WINDOW_MS = 1200;

type BatchSendTarget = {
    send: (payload: { content: string }) => Promise<unknown>;
};

type PendingLogBatch = {
    lines: string[];
    timer: ReturnType<typeof setTimeout>;
    resolveTarget: () => Promise<BatchSendTarget>;
    onError: (error: unknown) => void;
};

const pendingLogBatches = new Map<string, PendingLogBatch>();

/**
 * Packs already-formatted lines into as few Discord messages as
 * possible, each kept under the 2000 character content limit.
 */
function chunkLinesForDiscord(lines: readonly string[]): string[] {
    const chunks: string[] = [];
    let current = "";

    for (const rawLine of lines) {
        const line = truncateDiscordContent(rawLine);
        const candidate = current ? `${current}\n${line}` : line;

        if (candidate.length > DISCORD_MAX_CONTENT_LENGTH) {
            if (current) {
                chunks.push(current);
            }
            current = line;
        } else {
            current = candidate;
        }
    }

    if (current) {
        chunks.push(current);
    }

    return chunks;
}

/**
 * Sends the buffered lines for a pending batch right now (used both by
 * the normal BATCH_WINDOW_MS timer and by flushBatchedLogLine's
 * on-demand early flush).
 */
async function flushBatch(batchKey: string, batch: PendingLogBatch) {
    pendingLogBatches.delete(batchKey);
    clearTimeout(batch.timer);

    try {
        const target = await batch.resolveTarget();
        const chunks = chunkLinesForDiscord(batch.lines);

        for (const chunk of chunks) {
            await target.send({ content: chunk });
        }
    } catch (error) {
        batch.onError(error);
    }
}

/**
 * Queue a formatted line to be sent as part of a batched flush for
 * `batchKey`. If a batch for that key is already pending, the line
 * just joins it — no extra timer, no extra target resolution.
 *
 * `resolveTarget` is called exactly once per flush (not once per
 * line) when the window closes.
 */
function queueBatchedLogLine(
    batchKey: string,
    line: string,
    resolveTarget: () => Promise<BatchSendTarget>,
    onError: (error: unknown) => void
) {
    const existingBatch = pendingLogBatches.get(batchKey);

    if (existingBatch) {
        existingBatch.lines.push(line);
        return;
    }

    const batch: PendingLogBatch = {
        lines: [line],
        resolveTarget,
        onError,
        timer: setTimeout(() => void flushBatch(batchKey, batch), BATCH_WINDOW_MS)
    };

    pendingLogBatches.set(batchKey, batch);
}

/**
 * Immediately sends any pending batched lines for `batchKey`, bypassing
 * the BATCH_WINDOW_MS wait. Used before posting a message that must be
 * guaranteed to land after any already-queued lines for the same
 * target — e.g. a "Player Left" embed, so a chat line queued moments
 * before the player left can't flush afterward and silently become the
 * thread's new last message (which blocks archiveServerCategoryIfEmpty).
 */
export async function flushBatchedLogLine(batchKey: string) {
    const batch = pendingLogBatches.get(batchKey);

    if (!batch) {
        return;
    }

    await flushBatch(batchKey, batch);
}

/**
 * Some callers pass a full discord.js User, others pass a
 * lightweight synthetic object (e.g. for Roblox-only targets
 * that have no real Discord account). Only `id` is guaranteed.
 * These helpers must never assume `tag` or `username` exist.
 */
type ThreadUserLike = {
    id: string;
    tag?: string | null;
    username?: string | null;
};

function getUserThreadLabel(user: ThreadUserLike) {
    const usernameLabel = normalizeThreadLabel(user.username?.trim() ?? "");

    if (usernameLabel) {
        return usernameLabel;
    }

    const tag = user.tag ?? "";
    const tagLabel = tag.includes("#")
        ? tag.split("#")[0]
        : tag;
    const normalizedTagLabel = normalizeThreadLabel(tagLabel ?? "");

    return normalizedTagLabel || user.id;
}

function getUserThreadCandidates(user: ThreadUserLike) {
    const canonicalLabel = getUserThreadLabel(user);
    const tag = user.tag ?? "";
    const username = user.username ?? "";
    const tagLabel = tag.includes("#")
        ? tag.split("#")[0]
        : tag;

    return [
        `User ${canonicalLabel} (${user.id})`,
        `User ${normalizeThreadLabel(tagLabel ?? "")} (${user.id})`,
        `User ${username} (${user.id})`,
        `User ${tag} (${user.id})`,
        `User ${tagLabel} (${user.id})`,
        `User ${username}`,
        `User ${tag}`,
        `User ${tagLabel}`
    ].filter((candidate, index, allCandidates) => Boolean(candidate) && allCandidates.indexOf(candidate) === index);
}

function isMatchingUserThread(
    thread: ThreadChannel,
    user: ThreadUserLike
) {
    const name = thread.name?.toLowerCase() ?? "";

    const candidates = getUserThreadCandidates(user).map(candidate => candidate.toLowerCase());

    const nameMatches = candidates.some(candidate => (
        name === candidate ||
        name.includes(candidate) ||
        candidate.includes(name)
    ));

    if (nameMatches) {
        return true;
    }

    const starterMessage = thread.messages.cache.first();
    const starterText = starterMessage?.content?.toLowerCase() ?? "";

    const tagLower = user.tag?.toLowerCase() ?? "";
    const usernameLower = user.username?.toLowerCase() ?? "";

    return (
        starterText.includes(user.id) ||
        (tagLower.length > 0 && starterText.includes(tagLower)) ||
        (usernameLower.length > 0 && starterText.includes(usernameLower))
    );
}

async function mergeDuplicateUserThreads(
    threads: ThreadChannel[],
    canonicalThread: ThreadChannel,
    canonicalName: string
) {
    if (canonicalThread.name !== canonicalName) {
        await canonicalThread.setName(
            canonicalName,
            "Normalize user log thread name"
        ).catch(() => undefined);
    }

    const duplicateThreads = threads.filter(thread => thread.id !== canonicalThread.id);

    await Promise.all(
        duplicateThreads.map(thread =>
            thread.setArchived(
                true,
                "Merged into canonical user log thread"
            ).catch(() => undefined)
        )
    );
}

/**
 * Memoized "forum + user -> thread id" lookups.
 *
 * ensureUserThreadInForum / ensureUserThread used to call
 * fetchAllForumThreads() (a full active+archived thread listing)
 * on every single call — meaning every chat message, join, and
 * leave paid for a full forum scan just to find one thread.
 *
 * Once we've resolved a user's thread once, we remember its id.
 * Next time, we try the cache first (free) and fall back to a
 * single-resource fetch (cheap, one REST call) instead of listing
 * the whole forum. We only fall back to the expensive full scan
 * on a genuine cache miss — first-ever contact with that user in
 * that forum, or the cached thread having been deleted out from
 * under us.
 */
const resolvedUserThreadIds = new Map<string, string>();

function userThreadCacheKey(forumId: string, userId: string) {
    return `${forumId}:${userId}`;
}

async function getCachedUserThread(
    forum: ForumChannel,
    userId: string
): Promise<ThreadChannel | null> {
    const cacheKey = userThreadCacheKey(forum.id, userId);
    const cachedThreadId = resolvedUserThreadIds.get(cacheKey);

    if (!cachedThreadId) {
        return null;
    }

    // Cheap path: gateway cache already has it, no REST call at all.
    const cachedThread = forum.threads.cache.get(cachedThreadId);
    if (cachedThread) {
        return cachedThread;
    }

    // Slightly more expensive, but still O(1): fetch that one
    // thread by id instead of listing the whole forum.
    try {
        const fetchedThread = await forum.threads.fetch(cachedThreadId);
        if (fetchedThread) {
            return fetchedThread;
        }
    } catch {
        // Thread no longer exists (deleted). Fall through and
        // treat this as a cache miss below.
    }

    resolvedUserThreadIds.delete(cacheKey);
    return null;
}

function rememberUserThread(
    forumId: string,
    userId: string,
    threadId: string
) {
    resolvedUserThreadIds.set(
        userThreadCacheKey(forumId, userId),
        threadId
    );
}

async function fetchAllForumThreads(forum: ForumChannel) {
    const activeThreads = await forum.threads.fetchActive();
    const archivedThreads = await forum.threads.fetchArchived({
        fetchAll: true
    });

    return [
        ...activeThreads.threads.values(),
        ...archivedThreads.threads.values()
    ].filter((thread, index, allThreads) =>
        allThreads.findIndex(candidate => candidate.id === thread.id) === index
    );
}

export function isPlayerLeftEmbedTitle(
    title: string | null | undefined
) {
    const normalizedTitle = normalizeEmbedTitle(title);

    return PLAYER_LEFT_TITLES.some(
        playerLeftTitle =>
            normalizedTitle.includes(playerLeftTitle)
    );
}

export function shouldArchiveServerFromLastEmbedTitles(
    lastEmbedTitles: Array<string | null | undefined>
) {
    return (
        lastEmbedTitles.length > 0 &&
        lastEmbedTitles.every(isPlayerLeftEmbedTitle)
    );
}

export function buildServerUserChatContent(
    username: string,
    message: string
) {
    const normalizedMessage =
        message
            .replace(/\r?\n/g, " ")
            .trim();

    const safeMessage =
        normalizedMessage.length > 0
            ? normalizedMessage
            : "[empty message]";

    const content =
        `💬 ${username}: ${safeMessage}`;

    if (content.length <= DISCORD_MAX_CONTENT_LENGTH) {
        return content;
    }

    const truncatedMessageLength =
        Math.max(
            0,
            DISCORD_MAX_CONTENT_LENGTH - (`💬 ${username}: `).length - 1
        );

    return `💬 ${username}: ${safeMessage.slice(0, truncatedMessageLength)}…`;
}

export function buildChannelChatContent(
    username: string,
    userId: string,
    message: string,
    radioChannelName?: string
) {
    const normalizedMessage =
        message
            .replace(/\r?\n/g, " ")
            .trim();

    const safeMessage =
        normalizedMessage.length > 0
            ? normalizedMessage
            : "[empty message]";

    const radioPrefix =
        radioChannelName && radioChannelName.length > 0
            ? `[${radioChannelName}] `
            : "";

    const authorPrefix =
        `${radioPrefix}${username} (${userId}): `;

    const content =
        `${authorPrefix}${safeMessage}`;

    if (content.length <= DISCORD_MAX_CONTENT_LENGTH) {
        return content;
    }

    const truncatedMessageLength =
        Math.max(
            0,
            DISCORD_MAX_CONTENT_LENGTH - authorPrefix.length - 1
        );

    return `${authorPrefix}${safeMessage.slice(0, truncatedMessageLength)}…`;
}

/**
 * Memoized "server id + channel name -> channel id" and
 * "server id -> category id" lookups.
 *
 * ensureServerTextChannel and ensurePriorityCategory used to do a
 * fresh guild.channels.cache.find() scan on every single call — a
 * chat log send, a radio log send, and a command log send each
 * scanned the category (and sometimes the whole guild) for the
 * same category by name. With one category per active Roblox
 * server, that scan gets proportionally slower as more servers are
 * live at once. Once resolved, we remember the id and go straight
 * to a cache.get(id) — O(1) regardless of how many other
 * categories/channels exist.
 */
const resolvedServerCategoryIds = new Map<string, string>();
const resolvedServerChannelIds = new Map<string, string>();
const resolvedPriorityAuditChannelIds = new Map<string, string>();

/**
 * Cache for resolved user IDs (Discord ↔ Roblox).
 *
 * When a Discord user triggers a log event, we resolve their linked
 * Roblox ID via Bloxlink so both Discord and Roblox events land in
 * the same forum thread. The reverse lookup (Roblox → Discord) is
 * used for Roblox game events so they also converge on one thread.
 *
 * Entries expire after RESOLVED_ID_CACHE_TTL_MS to avoid stale data
 * if a user unlinks their account.
 */
const RESOLVED_ID_CACHE_TTL_MS = 10 * 60 * 1000;

const resolvedIdCache = new Map<string, { resolvedId: string; expiresAt: number }>();

function getCachedResolvedId(inputId: string): string | null {
    const entry = resolvedIdCache.get(inputId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        resolvedIdCache.delete(inputId);
        return null;
    }
    return entry.resolvedId;
}

function setCachedResolvedId(inputId: string, resolvedId: string) {
    resolvedIdCache.set(inputId, {
        resolvedId,
        expiresAt: Date.now() + RESOLVED_ID_CACHE_TTL_MS
    });
}

/**
 * Given a user (Discord or Roblox synthetic), resolve the best
 * canonical ID for forum thread naming so Discord and Roblox
 * events for the same person converge on one thread.
 *
 * `source` determines lookup direction:
 * - "discord" → Bloxlink: Discord ID → Roblox ID
 * - "roblox"  → Bloxlink/RoVer: Roblox ID → Discord ID
 *
 * Falls back to the original user ID if no link is found.
 * The original user object is never mutated.
 */
export async function resolveThreadUser(
    user: ThreadUserLike,
    source: "discord" | "roblox"
): Promise<ThreadUserLike> {
    const inputId = user.id;

    const cached = getCachedResolvedId(inputId);
    if (cached && cached !== inputId) {
        return { ...user, id: cached };
    }

    if (source === "discord") {
        try {
            const robloxId = await getRobloxId(inputId);
            if (robloxId) {
                setCachedResolvedId(inputId, robloxId);
                return { ...user, id: robloxId };
            }
        } catch {
            // Bloxlink unavailable — fall through to original ID
        }
    } else {
        try {
            const discordId = await resolveDiscordIdFromRobloxUserId(inputId);
            if (discordId) {
                setCachedResolvedId(inputId, discordId);
                return { ...user, id: discordId };
            }
        } catch {
            // Reverse lookup unavailable — fall through
        }
    }

    return user;
}

function serverCategoryCacheKey(guildId: string, serverId: string) {
    return `${guildId}:${serverId}`;
}

function serverChannelCacheKey(guildId: string, serverId: string, channelName: string) {
    return `${guildId}:${serverId}:${channelName}`;
}

async function ensureServerTextChannel(
    guild: Guild,
    serverId: string,
    serverName: string,
    channelName: string
) {
    const channelCacheKey = serverChannelCacheKey(guild.id, serverId, channelName);
    const cachedChannelId = resolvedServerChannelIds.get(channelCacheKey);

    if (cachedChannelId) {
        const cachedChannel = guild.channels.cache.get(cachedChannelId) as TextChannel | undefined;
        if (cachedChannel) {
            return cachedChannel;
        }

        // Channel was deleted/renamed out from under us — drop the
        // stale entry and fall through to the normal resolution path.
        resolvedServerChannelIds.delete(channelCacheKey);
    }

    const categoryName =
        buildCategoryDisplayName(serverId);

    const archivedCategoryName =
        buildCategoryDisplayName(serverId, true);

    const categoryCacheKey = serverCategoryCacheKey(guild.id, serverId);
    const cachedCategoryId = resolvedServerCategoryIds.get(categoryCacheKey);

    const category = (
        (cachedCategoryId && guild.channels.cache.get(cachedCategoryId)) ||
        guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildCategory &&
                (
                    channel.name === categoryName ||
                    channel.name === archivedCategoryName
                )
        )
    ) as CategoryChannel | undefined;

    if (!category) {
        throw new Error(
            `Server category not found for text log channel: ${categoryName}`
        );
    }

    resolvedServerCategoryIds.set(categoryCacheKey, category.id);

    await ensureServerCategoryPermissions(category);

    const existingChannel =
        category.children.cache.find(
            channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === channelName
        ) as TextChannel | undefined;

    if (existingChannel) {
        resolvedServerChannelIds.set(channelCacheKey, existingChannel.id);
        return existingChannel;
    }

    const createdChannel =
        await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: `Auto-created channel for ${channelName} logs`
        });

    resolvedServerChannelIds.set(channelCacheKey, createdChannel.id);

    return createdChannel as TextChannel;
}

async function ensurePriorityCategory(
    guild: Guild
) {
    const existingCategory =
        guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name.toLowerCase() === PRIORITY_CATEGORY_NAME.toLowerCase()
        ) as CategoryChannel | undefined;

    if (existingCategory) {
        return existingCategory;
    }

    const createdCategory =
        await guild.channels.create({
            name: PRIORITY_CATEGORY_NAME,
            type: ChannelType.GuildCategory,
            reason: "Auto-created category for audit command logs"
        });

    return createdCategory as CategoryChannel;
}

async function ensurePriorityAuditChannel(
    guild: Guild,
    channelName: string
) {
    const category =
        await ensurePriorityCategory(guild);

    const normalizedChannelName =
        normalizeTextChannelName(channelName);

    const existingInCategory =
        category.children.cache.find(
            channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === normalizedChannelName
        ) as TextChannel | undefined;

    if (existingInCategory) {
        return existingInCategory;
    }

    const existingInGuild =
        guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === normalizedChannelName
        ) as TextChannel | undefined;

    if (existingInGuild) {
        if (existingInGuild.parentId !== category.id) {
            await existingInGuild.setParent(
                category.id,
                {
                    reason: `Move ${normalizedChannelName} under ${PRIORITY_CATEGORY_NAME}`
                }
            );
        }

        return existingInGuild;
    }

    const createdChannel =
        await guild.channels.create({
            name: normalizedChannelName,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: `Auto-created audit channel ${normalizedChannelName}`
        });

    return createdChannel as TextChannel;
}

export async function sendPriorityAuditEmbed(
    guild: Guild,
    channelName: string,
    embed: EmbedBuilder
) {
    const channel = await ensurePriorityAuditChannel(guild, channelName);

    await channel.send({
        embeds: [embed]
    });
}

async function getLastThreadEmbedTitle(
    thread: ThreadChannel
) {
    const messages =
        await thread.messages.fetch({
            limit: 1
        });

    const lastMessage =
        messages.first();

    return lastMessage?.embeds[0]?.title;
}

async function archiveServerCategoryIfEmpty(
    forum: ForumChannel,
    serverId: string,
    serverName: string
) {
    const activeThreads =
        await forum.threads.fetchActive();

    const archivedThreads =
        await forum.threads.fetchArchived({
            fetchAll: true
        });

    const threads =
        [
            ...activeThreads.threads.values(),
            ...archivedThreads.threads.values()
        ].filter(
            (thread, index, allThreads) =>
                allThreads.findIndex(
                    candidate =>
                        candidate.id === thread.id
                ) === index
        );

    const lastEmbedTitles =
        await Promise.all(
            threads.map(getLastThreadEmbedTitle)
        );

    if (!shouldArchiveServerFromLastEmbedTitles(lastEmbedTitles)) {
        return false;
    }

    const categoryName =
        buildCategoryDisplayName(serverId);

    const archivedCategoryName =
        buildCategoryDisplayName(serverId, true);

    const category =
        forum.guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name === categoryName
        ) as CategoryChannel | undefined;

    if (!category) {
        return false;
    }

    await category.setName(
        archivedCategoryName,
        "Every player thread ended with Player Left"
    );

    console.log(
        `Archived Roblox server category: ${archivedCategoryName}`
    );

    await reorderServerCategories(category.guild);

    return true;
}

/**
 * Force-archive a Roblox server category regardless of whether every
 * player thread ended with a "Player Left" event.
 *
 * Used when a server goes down through the `serverShutdown` event: the
 * Roblox server kicks everyone and dies too fast for all the individual
 * `playerLeave` events to be emitted, so the normal empty-check never
 * succeeds and the category would stay active forever.
 */
export async function archiveServerCategory(
    guild: Guild,
    serverId: string
): Promise<boolean> {
    const categoryName =
        buildCategoryDisplayName(serverId);

    const archivedCategoryName =
        buildCategoryDisplayName(serverId, true);

    const category =
        guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name === categoryName
        ) as CategoryChannel | undefined;

    if (!category) {
        return false;
    }

    await category.setName(
        archivedCategoryName,
        "Roblox server shut down (serverShutdown event)"
    );

    console.log(
        `Archived Roblox server category: ${archivedCategoryName}`
    );

    await reorderServerCategories(guild);

    return true;
}

/**
 * Send a generic Roblox game event to a text channel.
 */
export async function sendGameEvent(
    channel: TextChannel,
    event: string,
    player: string
) {
    const embed = new EmbedBuilder()
        .setTitle("🎮 Roblox Event")
        .addFields(
            {
                name: "Event",
                value: event
            },
            {
                name: "Player",
                value: player
            }
        )
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    });
}

/**
 * Find all global moderation/user log forums.
 */
export async function getModerationLogForums(
    guild: Guild
): Promise<ForumChannel[]> {

    const forumChannels = [
        ...guild.channels.cache.values()
    ].filter(
        channel =>
            channel.type === ChannelType.GuildForum
    ) as ForumChannel[];

    if (!forumChannels.length) {
        return [];
    }

    const configuredName =
        (
            config.channels.moderationLogs ||
            LOG_CHANNEL_NAME
        ).toLowerCase();

    const exactMatches = forumChannels.filter(
        channel =>
            channel.name.toLowerCase() === configuredName ||
            channel.id === configuredName
    );

    if (exactMatches.length) {
        return exactMatches;
    }

    const logMatches = forumChannels.filter(
        channel =>
            channel.name.toLowerCase().includes("log") ||
            channel.name.toLowerCase().includes("mod")
    );

    if (logMatches.length) {
        return logMatches;
    }

    return forumChannels;
}

/**
 * Ensure that the global moderation/user-logs forum exists.
 *
 * This forum is independent from Roblox server categories.
 */
export async function ensureModerationLogForum(
    guild: Guild
): Promise<ForumChannel> {

    const existing =
        (await getModerationLogForums(guild))[0];

    if (existing) {
        return existing;
    }

    const forum = await guild.channels.create({
        name: LOG_CHANNEL_NAME,
        type: ChannelType.GuildForum,
        reason:
            "Create a forum channel for user activity logs"
    });

    return forum as ForumChannel;
}

/**
 * Find or create the user-logs forum inside a Roblox
 * server category.
 *
 * Structure:
 *
 * Server Category
 * └── user-logs (Forum)
 *     ├── User Player1 (123)
 *     └── User Player2 (456)
 *
 * IMPORTANT — concurrency:
 * This is called from api.ts on every incoming Roblox game event, and
 * a busy server can easily fire several of these within milliseconds
 * of each other for the same serverId. Without a lock, two concurrent
 * calls both see "no forum exists yet" (Discord's gateway cache hasn't
 * caught up from the first call's in-flight creation) and each create
 * their own — resulting in two "user-logs" forums for the same server.
 * inFlightServerLogForums makes concurrent calls for the same
 * guild+serverId share a single creation attempt instead of racing.
 */
const inFlightServerLogForums = new Map<string, Promise<ForumChannel>>();

export async function ensureServerLogForum(
    guild: Guild,
    serverId: string,
    serverName: string
): Promise<ForumChannel> {
    const lockKey = `${guild.id}:${serverId}`;

    const inFlight = inFlightServerLogForums.get(lockKey);
    if (inFlight) {
        return inFlight;
    }

    const creation = resolveServerLogForum(guild, serverId, serverName).finally(() => {
        inFlightServerLogForums.delete(lockKey);
    });

    inFlightServerLogForums.set(lockKey, creation);

    return creation;
}

async function resolveServerLogForum(
    guild: Guild,
    serverId: string,
    serverName: string
): Promise<ForumChannel> {

    const categoryName =
        buildCategoryDisplayName(serverId);

    const archivedCategoryName =
        buildCategoryDisplayName(serverId, true);

    const category = guild.channels.cache.find(
        channel =>
            channel.type === ChannelType.GuildCategory &&
            (
                channel.name === categoryName ||
                channel.name === archivedCategoryName
            )
    ) as CategoryChannel | undefined;

    const resolvedCategory = category ?? await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        reason: `Create server category for Roblox server ${serverId}`,
        permissionOverwrites: buildServerCategoryPermissionOverwrites(guild.roles.everyone.id)
    }) as CategoryChannel;

    await ensureServerCategoryPermissions(resolvedCategory);

    const forumName = "user-logs";

    const existingForum =
        resolvedCategory.children.cache.find(
            channel =>
                channel.type === ChannelType.GuildForum &&
                channel.name === forumName
        ) as ForumChannel | undefined;

    if (existingForum) {
        return existingForum;
    }

    const forum = await guild.channels.create({
        name: forumName,
        type: ChannelType.GuildForum,
        parent: resolvedCategory.id,
        reason:
            `User logs for Roblox server ${serverId}`
    });

    console.log(
        `Created server user-logs forum "${forum.name}" ` +
        `in category "${categoryName}"`
    );

    return forum as ForumChannel;
}
/**
 * Build the thread name used for a player.
 *
 * Example:
 * User PARikiBic (1943568858)
 */
export function buildUserThreadName(
    user: ThreadUserLike
): string {

    const usernameBase = getUserThreadLabel(user);

    return `User ${usernameBase} (${user.id})`;
}

/**
 * Find a user thread inside the global moderation log forums.
 */
export async function findUserThread(
    guild: Guild,
    user: ThreadUserLike
): Promise<ThreadChannel | null> {

    const forums =
        await getModerationLogForums(guild);

    const canonicalThreadName = buildUserThreadName(user);

    for (const forum of forums) {

        const allThreads = await fetchAllForumThreads(forum);

        const matchingThread =
            allThreads.find(thread => {

                return isMatchingUserThread(thread, user);
            });

        if (matchingThread) {

            if (matchingThread.name !== canonicalThreadName) {
                const canonicalMatch = allThreads.find(thread =>
                    thread.name === canonicalThreadName
                );

                if (!canonicalMatch) {
                    await matchingThread.setName(
                        canonicalThreadName,
                        "Normalize user log thread name"
                    ).catch(() => undefined);
                }
            }

            if (matchingThread.archived) {
                await matchingThread.setArchived(
                    false,
                    "Restore canonical user log thread"
                ).catch(() => undefined);
            }

            return matchingThread;
        }
    }

    return null;
}

/**
 * Ensure a user thread exists in the global user-logs forum.
 */
export async function ensureUserThread(
    guild: Guild,
    user: ThreadUserLike
): Promise<ThreadChannel> {

    const forumChannel =
        await ensureModerationLogForum(guild);

    const cachedThread = await getCachedUserThread(forumChannel, user.id);
    if (cachedThread) {
        if (cachedThread.archived) {
            await cachedThread.setArchived(
                false,
                "Restore canonical user log thread"
            ).catch(() => undefined);
        }

        return cachedThread;
    }

    const allThreads = await fetchAllForumThreads(forumChannel);

    const threadName =
        buildUserThreadName(user);

    const matchingThreads = allThreads.filter(thread =>
        isMatchingUserThread(thread, user)
    );

    const existingThread =
        allThreads.find(thread => thread.name === threadName) ??
        matchingThreads.find(thread => thread.name !== undefined && !thread.name.toLowerCase().includes("(roblox)")) ??
        matchingThreads[0];

    if (existingThread) {

        if (existingThread.archived) {
            await existingThread.setArchived(
                false,
                "Restore canonical user log thread"
            ).catch(() => undefined);
        }

        await mergeDuplicateUserThreads(
            matchingThreads,
            existingThread,
            threadName
        );

        rememberUserThread(forumChannel.id, user.id, existingThread.id);

        return existingThread;
    }

    const createdThread = await forumChannel.threads.create({
        name: threadName,
        message: {
            content:
                `📌 Activity log for ${user.tag ?? user.username ?? user.id} (${user.id})`
        }
    });

    rememberUserThread(forumChannel.id, user.id, createdThread.id);

    return createdThread;
}

/**
 * Log an event in the global user-logs forum.
 */
export async function logUserEvent(
    guild: Guild,
    user: User,
    event: string,
    details: string,
    source: "discord" | "roblox" = "discord"
) {

    try {

        const resolvedUser =
            await resolveThreadUser(user, source);

        const thread =
            await ensureUserThread(
                guild,
                resolvedUser
            );

        const embed =
            new EmbedBuilder()
                .setTitle(`📝 ${event}`)
                .setColor(0x5865F2)
                .addFields(
                    {
                        name: "User",
                        value:
                            `${user.tag} (${user.id})`
                    },
                    {
                        name: "Details",
                        value: details
                    }
                )
                .setTimestamp();

        await thread.send({
            embeds: [embed]
        });

    } catch (error) {

        console.error(
            "Failed to log user event:",
            error
        );
    }
}

/**
 * Log Discord message events in the global user thread.
 */
export async function logMessageEvent(
    guild: Guild,
    user: User,
    event: string,
    message: Message<boolean> | PartialMessage,
    details?: string
) {

    try {

        const resolvedUser =
            await resolveThreadUser(user, "discord");

        const thread =
            await ensureUserThread(
                guild,
                resolvedUser
            );

        const embed =
            new EmbedBuilder()
                .setTitle(`💬 ${event}`)
                .setColor(0x57F287)
                .addFields(
                    {
                        name: "User",
                        value:
                            `${user.tag} (${user.id})`
                    },
                    {
                        name: "Channel",
                        value:
                            `<#${message.channelId}>`
                    },
                    {
                        name: "Message ID",
                        value: message.id
                    },
                    {
                        name: "Details",
                        value:
                            details ??
                            "No additional details"
                    }
                )
                .setTimestamp();

        await thread.send({
            embeds: [embed]
        });

    } catch (error) {

        console.error(
            "Failed to log message event:",
            error
        );
    }
}

/**
 * Ensure a user thread exists inside a specific forum.
 *
 * Used by server-specific user-logs forums.
 */
export async function ensureUserThreadInForum(
    forum: ForumChannel,
    user: User
): Promise<ThreadChannel> {

    const cachedThread = await getCachedUserThread(forum, user.id);
    if (cachedThread) {
        if (cachedThread.archived) {
            await cachedThread.setArchived(
                false,
                "Restore canonical user log thread"
            ).catch(() => undefined);
        }

        return cachedThread;
    }

    // Cache miss (first contact with this user in this forum, or
    // the previously-known thread is gone) — fall back to the full
    // scan, then remember the result so we never scan for this
    // user again.
    const allThreads = await fetchAllForumThreads(forum);

    const threadName =
        buildUserThreadName(user);

    const matchingThreads = allThreads.filter(thread =>
        isMatchingUserThread(thread, user)
    );

    const existingThread =
        allThreads.find(thread => thread.name === threadName) ??
        matchingThreads.find(thread => thread.name !== undefined && !thread.name.toLowerCase().includes("(roblox)")) ??
        matchingThreads[0];

    if (existingThread) {

        if (existingThread.archived) {
            await existingThread.setArchived(
                false,
                "Restore canonical user log thread"
            ).catch(() => undefined);
        }

        await mergeDuplicateUserThreads(
            matchingThreads,
            existingThread,
            threadName
        );

        rememberUserThread(forum.id, user.id, existingThread.id);

        return existingThread;
    }

    const createdThread = await forum.threads.create({
        name: threadName,
        message: {
            content:
                `📌 Activity log for ${user.tag} (${user.id})`
        }
    });

    rememberUserThread(forum.id, user.id, createdThread.id);

    return createdThread;
}

/**
 * Ensure a player thread exists inside the user-logs
 * forum of a specific Roblox server.
 */
export async function ensureServerUserThread(
    guild: Guild,
    user: User,
    serverId: string,
    serverName: string
): Promise<ThreadChannel> {

    const forum =
        await ensureServerLogForum(
            guild,
            serverId,
            serverName
        );

    return ensureUserThreadInForum(
        forum,
        user
    );
}

/**
 * Log a Roblox player event inside:
 *
 * Category
 * └── user-logs Forum
 *     └── User PlayerName (UserId)
 *
 * This is used for:
 * - Player Joined
 * - Player Left
 * - Team Changed
 */
export async function logServerUserEvent(
    guild: Guild,
    user: User,
    event: string,
    details: string,
    serverId: string,
    serverName: string
) {

    try {

        const forum =
            await ensureServerLogForum(
                guild,
                serverId,
                serverName
            );

        const thread =
            await ensureUserThreadInForum(
                forum,
                user
            );

        if (isPlayerLeftEmbedTitle(event)) {
            // Guarantee ordering: any chat line queued right before this
            // player left gets sent first, so the Left embed is always
            // the thread's true last message — otherwise a batched chat
            // line could flush moments AFTER this embed and silently
            // block archiveServerCategoryIfEmpty below (the last message
            // in the thread would no longer be a "Player Left" embed).
            await flushBatchedLogLine(`user-thread:${guild.id}:${serverId}:${user.id}`);
        }

        const embed =
            new EmbedBuilder()
                .setTitle(`📝 ${event}`)
                .setColor(0x5865F2)
                .addFields(
                    {
                        name: "User",
                        value:
                            `${user.tag} (${user.id})`
                    },
                    {
                        name: "Details",
                        value: details
                    }
                )
                .setTimestamp();

        await thread.send({
            embeds: [embed]
        });

        console.log(
            `Logged "${event}" for ${user.username} ` +
            `in server ${serverName} (${serverId})`
        );

        if (isPlayerLeftEmbedTitle(event)) {
            await archiveServerCategoryIfEmpty(
                forum,
                serverId,
                serverName
            );
        }

    } catch (error) {

        console.error(
            "Failed to log server user event:",
            error
        );
    }
}

/**
 * Log a Roblox chat message as plain text (no embed)
 * inside the player's server thread.
 *
 * Batched: rapid consecutive messages from the same player in the
 * same server's thread are combined into one Discord message
 * instead of one send per chat line (see queueBatchedLogLine).
 */
export function logServerUserChatMessage(
    guild: Guild,
    user: User,
    message: string,
    serverId: string,
    serverName: string
) {
    const batchKey = `user-thread:${guild.id}:${serverId}:${user.id}`;

    queueBatchedLogLine(
        batchKey,
        buildServerUserChatContent(user.username, message),
        async () => {
            const forum = await ensureServerLogForum(guild, serverId, serverName);
            return ensureUserThreadInForum(forum, user);
        },
        error => console.error("Failed to log server user chat message:", error)
    );
}

/**
 * Log a Roblox chat/radio message into the server's shared plain-text
 * log channel.
 *
 * Batched: this channel is shared by every player on that Roblox
 * server, so at real player counts this is the hottest path in the
 * whole bot — batching here is what actually keeps it under
 * Discord's per-channel rate limit instead of just avoiding waste.
 */
export function logServerChannelChatMessage(
    guild: Guild,
    user: User,
    message: string,
    serverId: string,
    serverName: string,
    options?: {
        isRadio?: boolean;
        radioChannelName?: string;
    }
) {
    const isRadio =
        options?.isRadio ?? false;

    const targetChannelName =
        isRadio
            ? config.channels.radioLogs
            : config.channels.chatLogs;

    const batchKey = `server-channel:${guild.id}:${serverId}:${targetChannelName}`;

    queueBatchedLogLine(
        batchKey,
        buildChannelChatContent(
            user.username,
            user.id,
            message,
            options?.radioChannelName
        ),
        () => ensureServerTextChannel(guild, serverId, serverName, targetChannelName),
        error => console.error("Failed to log server channel chat message:", error)
    );
}

export async function logServerCommandUsage(
    guild: Guild,
    user: User,
    commandName: string,
    rawArgs: string,
    serverId: string,
    serverName: string
) {

    try {

        const targetChannel =
            await ensureServerTextChannel(
                guild,
                serverId,
                serverName,
                config.channels.commandsLogs
            );

        const normalizedArgs =
            rawArgs
                .replace(/\r?\n/g, " ")
                .trim();

        const argsLabel =
            normalizedArgs.length > 0
                ? normalizedArgs
                : "(no args)";

        const content =
            `;${commandName} by ${user.username} (${user.id}) | args: ${argsLabel}`;

        await targetChannel.send({
            content: truncateDiscordContent(content)
        });

        const robloxAuditChannel =
            await ensurePriorityAuditChannel(
                guild,
                ROBLOX_COMMANDS_AUDIT_CHANNEL_NAME
            );

        const auditContent =
            `ROBLOX | ${serverName} (${serverId}) | ;${commandName} by ${user.username} (${user.id}) | args: ${argsLabel}`;

        await robloxAuditChannel.send({
            content: truncateDiscordContent(auditContent)
        });

    } catch (error) {

        console.error(
            "Failed to log server command usage:",
            error
        );
    }
}

export async function ensureServerCommandsLogChannel(
    guild: Guild,
    serverId: string,
    serverName: string
) {
    return ensureServerTextChannel(
        guild,
        serverId,
        serverName,
        config.channels.commandsLogs
    );
}

export async function ensurePriorityAuditLogChannels(
    guild: Guild
) {
    await ensurePriorityAuditChannel(
        guild,
        ROBLOX_COMMANDS_AUDIT_CHANNEL_NAME
    );

    await ensurePriorityAuditChannel(
        guild,
        DISCORD_COMMANDS_AUDIT_CHANNEL_NAME
    );

    await ensurePriorityAuditChannel(
        guild,
        GAME_COMMANDS_AUDIT_CHANNEL_NAME
    );
}

export async function logDiscordCommandUsage(
    guild: Guild,
    user: User,
    commandName: string,
    rawArgs: string,
    sourceChannelName: string
) {

    try {

        const targetChannel =
            await ensurePriorityAuditChannel(
                guild,
                DISCORD_COMMANDS_AUDIT_CHANNEL_NAME
            );

        const normalizedArgs =
            rawArgs
                .replace(/\r?\n/g, " ")
                .trim();

        const argsLabel =
            normalizedArgs.length > 0
                ? normalizedArgs
                : "(no args)";

        const content =
            `DISCORD | #${sourceChannelName} | /${commandName} by ${user.tag} (${user.id}) | args: ${argsLabel}`;

        await targetChannel.send({
            content: truncateDiscordContent(content)
        });

    } catch (error) {

        console.error(
            "Failed to log Discord command usage:",
            error
        );
    }
}