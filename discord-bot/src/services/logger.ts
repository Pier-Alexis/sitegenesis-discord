import { ChannelType, EmbedBuilder, ForumChannel, Guild, TextChannel, ThreadChannel, User, type Message, type PartialMessage } from "discord.js";
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

async function ensureUserLogForum(guild: Guild): Promise<ForumChannel> {
    const existing = guild.channels.cache.find(
        channel => channel.type === ChannelType.GuildForum && channel.name === LOG_CHANNEL_NAME
    ) as ForumChannel | undefined;

    if (existing) {
        return existing;
    }

    return guild.channels.create({
        name: LOG_CHANNEL_NAME,
        type: ChannelType.GuildForum,
        reason: "Create a forum channel for user activity logs"
    }) as Promise<ForumChannel>;
}

async function ensureUserThread(guild: Guild, user: User): Promise<ThreadChannel> {
    const forumChannel = await ensureUserLogForum(guild);
    await forumChannel.threads.fetch();

    const threadName = `User ${user.tag}`;
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