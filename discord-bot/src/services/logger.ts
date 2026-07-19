import { ChannelType, EmbedBuilder, ForumChannel, Guild, TextChannel, ThreadChannel, User, CategoryChannel, type Message, type PartialMessage } from "discord.js";
import { config } from "../config.js";

const LOG_CHANNEL_NAME = config.channels.moderationLogs || "user-logs";

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

export async function getModerationLogForums(guild: Guild): Promise<ForumChannel[]> {
    await guild.channels.fetch();

    const forumChannels = [...guild.channels.cache.values()].filter(
        channel => channel.type === ChannelType.GuildForum
    ) as ForumChannel[];

    if (!forumChannels.length) {
        return [];
    }

    const configuredName = (config.channels.moderationLogs || LOG_CHANNEL_NAME).toLowerCase();
    const exactMatches = forumChannels.filter(channel => channel.name.toLowerCase() === configuredName || channel.id === configuredName);
    if (exactMatches.length) {
        return exactMatches;
    }

    const logMatches = forumChannels.filter(channel =>
        channel.name.toLowerCase().includes("log") || channel.name.toLowerCase().includes("mod")
    );

    if (logMatches.length) {
        return logMatches;
    }

    return forumChannels;
}

export async function ensureModerationLogForum(guild: Guild): Promise<ForumChannel> {
    const existing = (await getModerationLogForums(guild))[0];
    if (existing) {
        return existing;
    }

    return guild.channels.create({
        name: LOG_CHANNEL_NAME,
        type: ChannelType.GuildForum,
        reason: "Create a forum channel for user activity logs"
    }) as Promise<ForumChannel>;
}

export function buildUserThreadName(user: Pick<User, "tag" | "username" | "id">): string {
    const usernameBase = user.tag.includes("#") ? user.tag.split("#")[0] : user.tag;
    return `User ${usernameBase} (${user.id})`;
}

export async function findUserThread(guild: Guild, user: Pick<User, "tag" | "username" | "id">): Promise<ThreadChannel | null> {
    const forums = await getModerationLogForums(guild);

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
        const matchingThread = forum.threads.cache.find(thread => {
            const name = thread.name?.toLowerCase() ?? "";
            const nameMatches = candidates.some(candidate => {
                const normalizedCandidate = candidate.toLowerCase();
                return name === normalizedCandidate || name.includes(normalizedCandidate) || normalizedCandidate.includes(name);
            });

            if (nameMatches) {
                return true;
            }

            const starterMessage = thread.messages.cache.first();
            const starterText = starterMessage?.content?.toLowerCase() ?? "";
            return starterText.includes(user.id) || starterText.includes(user.tag.toLowerCase()) || starterText.includes(user.username.toLowerCase());
        });

        if (matchingThread) {
            return matchingThread;
        }
    }

    return null;
}

export async function ensureUserThread(guild: Guild, user: User): Promise<ThreadChannel> {
    const forumChannel = await ensureModerationLogForum(guild);
    await forumChannel.threads.fetch();

    const threadName = buildUserThreadName(user);
    const existingThread = forumChannel.threads.cache.find(thread => thread.name === threadName);

    if (existingThread) {
        return existingThread;
    }

    return forumChannel.threads.create({
        name: threadName,
        message: {
            content: `📌 Activity log for ${user.tag} (${user.id})`
        }
    });
}

export async function logUserEvent(guild: Guild, user: User, event: string, details: string) {
    try {
        const thread = await ensureUserThread(guild, user);

        const embed = new EmbedBuilder()
            .setTitle(`📝 ${event}`)
            .setColor(0x5865F2)
            .addFields(
                {
                    name: "User",
                    value: `${user.tag} (${user.id})`
                },
                {
                    name: "Details",
                    value: details
                }
            )
            .setTimestamp();

        await thread.send({ embeds: [embed] });
    } catch (error) {
        console.error("Failed to log user event:", error);
    }
}

export async function logMessageEvent(guild: Guild, user: User, event: string, message: Message<boolean> | PartialMessage, details?: string) {
    try {
        const thread = await ensureUserThread(guild, user);

        const embed = new EmbedBuilder()
            .setTitle(`💬 ${event}`)
            .setColor(0x57F287)
            .addFields(
                {
                    name: "User",
                    value: `${user.tag} (${user.id})`
                },
                {
                    name: "Channel",
                    value: `<#${message.channelId}>`
                },
                {
                    name: "Message ID",
                    value: message.id
                },
                {
                    name: "Details",
                    value: details ?? "No additional details"
                }
            )
            .setTimestamp();

        await thread.send({ embeds: [embed] });
    } catch (error) {
        console.error("Failed to log message event:", error);
    }
}

export async function ensurePlayerChannel(
    guild: Guild,
    username: string,
    userId: string,
    serverId: string,
    serverName: string
): Promise<TextChannel> {

    await guild.channels.fetch();

    const categoryName = `${serverName} - ${serverId}`;

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

    const channelName = `${username}-${userId}`;

    const existingChannel = guild.channels.cache.find(
        channel =>
            channel.type === ChannelType.GuildText &&
            channel.parentId === category.id &&
            channel.name === channelName
    ) as TextChannel | undefined;

    if (existingChannel) {
        return existingChannel;
    }

    return guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `Player channel for ${username} (${userId})`
    });
}


export async function deletePlayerChannel(
    guild: Guild,
    username: string,
    userId: string,
    serverId: string,
    serverName: string
): Promise<void> {
    await guild.channels.fetch();

    const categoryName = `${serverName} - ${serverId}`;

    const category = guild.channels.cache.find(
        channel =>
            channel.type === ChannelType.GuildCategory &&
            channel.name === categoryName
    ) as CategoryChannel | undefined;

    if (!category) {
        console.log(
            `Server category not found: ${categoryName}`
        );
        return;
    }

    const channelName = `${username}-${userId}`;

    // Search directly inside the category
    const playerChannel = category.children.cache.find(
        channel =>
            channel.type === ChannelType.GuildText &&
            channel.name === channelName
    ) as TextChannel | undefined;

    if (!playerChannel) {
        console.log(
            `Player channel not found: ${channelName} in category ${categoryName}`
        );

        console.log(
            "Channels currently in category:",
            category.children.cache.map(channel => channel.name)
        );

        return;
    }

    try {
        await playerChannel.delete(
            `Player ${username} (${userId}) left Roblox server`
        );
        console.log(
            `Successfully deleted player channel: ${channelName} in category ${categoryName}`
        );
    } catch (err) {
        console.log(
            `Failed to delete player channel: ${channelName} in category ${categoryName}`,
            err
        );
    }
}