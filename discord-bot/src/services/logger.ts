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

import { config } from "../config.js";

const LOG_CHANNEL_NAME =
    config.channels.moderationLogs || "user-logs";

const DISCORD_MAX_CONTENT_LENGTH = 2000;

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

function getUserThreadLabel(user: Pick<User, "tag" | "username" | "id">) {
    const usernameLabel = normalizeThreadLabel(user.username?.trim() ?? "");

    if (usernameLabel) {
        return usernameLabel;
    }

    const tagLabel = user.tag.includes("#")
        ? user.tag.split("#")[0]
        : user.tag;
    const normalizedTagLabel = normalizeThreadLabel(tagLabel ?? "");

    return normalizedTagLabel || user.id;
}

function getUserThreadCandidates(user: Pick<User, "tag" | "username" | "id">) {
    const canonicalLabel = getUserThreadLabel(user);
    const tagLabel = user.tag.includes("#")
        ? user.tag.split("#")[0]
        : user.tag;

    return [
        `User ${canonicalLabel} (${user.id})`,
        `User ${normalizeThreadLabel(tagLabel ?? "")} (${user.id})`,
        `User ${user.username} (${user.id})`,
        `User ${user.tag} (${user.id})`,
        `User ${tagLabel} (${user.id})`,
        `User ${user.username}`,
        `User ${user.tag}`,
        `User ${tagLabel}`
    ].filter((candidate, index, allCandidates) => Boolean(candidate) && allCandidates.indexOf(candidate) === index);
}

function isMatchingUserThread(
    thread: ThreadChannel,
    user: Pick<User, "tag" | "username" | "id">
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

    return (
        starterText.includes(user.id) ||
        starterText.includes(user.tag.toLowerCase()) ||
        starterText.includes(user.username.toLowerCase())
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

async function ensureServerTextChannel(
    guild: Guild,
    serverId: string,
    serverName: string,
    channelName: string
) {
    await guild.channels.fetch();

    const categoryName =
        `${serverName} - ${serverId}`;

    const archivedCategoryName =
        `(ARCHIVE) ${categoryName}`;

    const category =
        guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildCategory &&
                (
                    channel.name === categoryName ||
                    channel.name === archivedCategoryName
                )
        ) as CategoryChannel | undefined;

    if (!category) {
        throw new Error(
            `Server category not found for text log channel: ${categoryName}`
        );
    }

    const existingChannel =
        category.children.cache.find(
            channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === channelName
        ) as TextChannel | undefined;

    if (existingChannel) {
        return existingChannel;
    }

    const createdChannel =
        await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: `Auto-created channel for ${channelName} logs`
        });

    return createdChannel as TextChannel;
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
        `${serverName} - ${serverId}`;

    const archivedCategoryName =
        `(ARCHIVE) ${categoryName}`;

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

    await guild.channels.fetch();

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
 */
export async function ensureServerLogForum(
    guild: Guild,
    serverId: string,
    serverName: string
): Promise<ForumChannel> {

    await guild.channels.fetch();

    const categoryName =
        `${serverName} - ${serverId}`;

    const archivedCategoryName =
        `(ARCHIVE) ${categoryName}`;

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
        reason: `Create server category for Roblox server ${serverId}`
    }) as CategoryChannel;

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
    user: Pick<User, "tag" | "username" | "id">
): string {

    const usernameBase = getUserThreadLabel(user);

    return `User ${usernameBase} (${user.id})`;
}

/**
 * Find a user thread inside the global moderation log forums.
 */
export async function findUserThread(
    guild: Guild,
    user: Pick<User, "tag" | "username" | "id">
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
    user: User
): Promise<ThreadChannel> {

    const forumChannel =
        await ensureModerationLogForum(guild);

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

        return existingThread;
    }

    return forumChannel.threads.create({
        name: threadName,
        message: {
            content:
                `📌 Activity log for ${user.tag} (${user.id})`
        }
    });
}

/**
 * Log an event in the global user-logs forum.
 */
export async function logUserEvent(
    guild: Guild,
    user: User,
    event: string,
    details: string
) {

    try {

        const thread =
            await ensureUserThread(
                guild,
                user
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

        const thread =
            await ensureUserThread(
                guild,
                user
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

        return existingThread;
    }

    return forum.threads.create({
        name: threadName,
        message: {
            content:
                `📌 Activity log for ${user.tag} (${user.id})`
        }
    });
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
 */
export async function logServerUserChatMessage(
    guild: Guild,
    user: User,
    message: string,
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

        await thread.send({
            content: buildServerUserChatContent(
                user.username,
                message
            )
        });

        console.log(
            `Logged chat message for ${user.username} ` +
            `in server ${serverName} (${serverId})`
        );

    } catch (error) {

        console.error(
            "Failed to log server user chat message:",
            error
        );
    }
}

export async function logServerChannelChatMessage(
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

    try {

        const isRadio =
            options?.isRadio ?? false;

        const targetChannelName =
            isRadio
                ? config.channels.radioLogs
                : config.channels.chatLogs;

        const targetChannel =
            await ensureServerTextChannel(
                guild,
                serverId,
                serverName,
                targetChannelName
            );

        await targetChannel.send({
            content: buildChannelChatContent(
                user.username,
                user.id,
                message,
                options?.radioChannelName
            )
        });

    } catch (error) {

        console.error(
            "Failed to log server channel chat message:",
            error
        );
    }
}