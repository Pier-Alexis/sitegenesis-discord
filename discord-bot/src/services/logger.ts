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

    const category = guild.channels.cache.find(
        channel =>
            channel.type === ChannelType.GuildCategory &&
            channel.name === categoryName
    ) as CategoryChannel | undefined;

    if (!category) {
        throw new Error(
            `Server category not found: ${categoryName}`
        );
    }

    const forumName = "user-logs";

    const existingForum =
        category.children.cache.find(
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
        parent: category.id,
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

    const usernameBase =
        user.tag.includes("#")
            ? user.tag.split("#")[0]
            : user.tag;

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

    const candidates = [
        buildUserThreadName(user),
        `User ${user.username} (${user.id})`,
        `User ${user.tag} (${user.id})`,
        `User ${user.tag.split("#")[0]} (${user.id})`,
        `User ${user.username}`,
        `User ${user.tag}`,
        `User ${user.tag.split("#")[0]}`
    ].filter(Boolean);

    for (const forum of forums) {

        await forum.threads.fetch();

        const matchingThread =
            forum.threads.cache.find(thread => {

                const name =
                    thread.name?.toLowerCase() ?? "";

                const nameMatches =
                    candidates.some(candidate => {

                        const normalizedCandidate =
                            candidate.toLowerCase();

                        return (
                            name === normalizedCandidate ||
                            name.includes(normalizedCandidate) ||
                            normalizedCandidate.includes(name)
                        );
                    });

                if (nameMatches) {
                    return true;
                }

                const starterMessage =
                    thread.messages.cache.first();

                const starterText =
                    starterMessage?.content?.toLowerCase() ?? "";

                return (
                    starterText.includes(user.id) ||
                    starterText.includes(
                        user.tag.toLowerCase()
                    ) ||
                    starterText.includes(
                        user.username.toLowerCase()
                    )
                );
            });

        if (matchingThread) {
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

    await forumChannel.threads.fetch();

    const threadName =
        buildUserThreadName(user);

    const existingThread =
        forumChannel.threads.cache.find(
            thread =>
                thread.name === threadName
        );

    if (existingThread) {
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

    await forum.threads.fetch();

    const threadName =
        buildUserThreadName(user);

    const existingThread =
        forum.threads.cache.find(
            thread =>
                thread.name === threadName
        );

    if (existingThread) {
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