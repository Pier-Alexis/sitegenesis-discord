import { EmbedBuilder, type Guild, type Message, type ThreadChannel } from "discord.js";
import { ensureUserThread, findUserThread, getModerationLogForums } from "./logger.js";

export type ModerationEventType = "ban" | "unban" | "mute" | "unmute" | "warning" | "softban";

export type ModerationEvent = {
    id: string;
    type: ModerationEventType;
    guildId: string;
    guildName: string;
    targetUserId: string;
    targetUserTag: string;
    moderatorId: string;
    moderatorTag: string;
    reason: string;
    createdAt: string;
    dmSent?: boolean;
};

function getActionLabel(type: ModerationEventType) {
    switch (type) {
        case "ban": return "Ban";
        case "unban": return "Unban";
        case "mute": return "Mute";
        case "unmute": return "Unmute";
        case "warning": return "Warning";
        case "softban": return "Softban";
    }
}

function getActionColor(type: ModerationEventType) {
    switch (type) {
        case "ban": return 0xed4245;
        case "unban": return 0x57f287;
        case "mute": return 0xfaa61a;
        case "unmute": return 0x5865f2;
        case "warning": return 0xffcc4d;
        case "softban": return 0xfee75c;
    }
}

function normalizeEventType(value: string): ModerationEventType | null {
    const normalized = value.trim().toLowerCase();
    if (normalized === "ban" || normalized === "bans") return "ban";
    if (normalized === "unban" || normalized === "unbans") return "unban";
    if (normalized === "mute" || normalized === "mutes") return "mute";
    if (normalized === "unmute" || normalized === "unmutes") return "unmute";
    if (normalized === "warning" || normalized === "warnings") return "warning";
    if (normalized === "softban" || normalized === "softbans") return "softban";
    if (normalized.includes("softban")) return "softban";
    return null;
}

function getFieldValue(message: Message<boolean>, fieldName: string) {
    return message.embeds[0]?.fields.find(field => field.name === fieldName)?.value ?? "";
}

function isNewModerationEmbed(message: Message<boolean>): boolean {
    const embed = message.embeds[0];
    if (!embed) {
        return false;
    }

    const fieldNames = embed.fields.map(field => field.name);
    return Boolean(
        embed.title?.startsWith("🛡️") &&
        fieldNames.includes("Type") &&
        fieldNames.includes("Target User") &&
        fieldNames.includes("Target ID") &&
        fieldNames.includes("Moderator") &&
        fieldNames.includes("Reason")
    );
}

function getEventTypeFromMessage(message: Message<boolean>): ModerationEventType | null {
    const embedTitle = message.embeds[0]?.title ?? "";
    const fieldValue = getFieldValue(message, "Type");
    const titleValue = embedTitle.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");

    return normalizeEventType(fieldValue || titleValue);
}

async function cleanupLegacyModerationMessages(thread: ThreadChannel) {
    await thread.messages.fetch({ limit: 100 });
    const botId = thread.client.user?.id;

    if (!botId) {
        return;
    }

    const legacyMessages = [...thread.messages.cache.values()].filter(message =>
        message.author.id === botId &&
        message.embeds.length > 0 &&
        !isNewModerationEmbed(message)
    );

    await Promise.all(legacyMessages.map(message => message.delete().catch(() => undefined)));
}

export async function recordModerationEvent(guild: Guild, event: Omit<ModerationEvent, "id" | "createdAt">) {
    const targetUser = await guild.client.users.fetch(event.targetUserId).catch(() => null);
    const userTag = targetUser?.tag ?? event.targetUserTag;
    const thread = await ensureUserThread(guild, targetUser ?? ({ tag: userTag, id: event.targetUserId } as any));

    const embed = new EmbedBuilder()
        .setTitle(`🛡️ ${getActionLabel(event.type)}`)
        .setColor(getActionColor(event.type))
        .addFields(
            { name: "Type", value: getActionLabel(event.type) },
            { name: "Target User", value: userTag },
            { name: "Target ID", value: event.targetUserId },
            { name: "Moderator", value: event.moderatorTag },
            { name: "Moderator ID", value: event.moderatorId },
            { name: "Reason", value: event.reason },
            { name: "Guild", value: event.guildName }
        )
        .setTimestamp();

    await cleanupLegacyModerationMessages(thread);

    const sentMessage = await thread.send({ embeds: [embed] });

    return {
        ...event,
        id: sentMessage.id,
        targetUserTag: userTag,
        createdAt: sentMessage.createdAt.toISOString()
    } as ModerationEvent;
}

export async function getModerationEvents(guild: Guild, type: ModerationEventType, targetUser?: { id: string; tag: string; username: string }) {
    const forums = await getModerationLogForums(guild);

    const threadMessages = await Promise.all(
        forums.map(async forum => {
            await forum.threads.fetch();

            const threadsToRead = targetUser
                ? [await findUserThread(guild, targetUser)].filter((thread): thread is NonNullable<typeof thread> => Boolean(thread))
                : [...forum.threads.cache.values()];

            const threadResults = await Promise.all(
                threadsToRead.map(async thread => {
                    await thread.messages.fetch({ limit: 100 });
                    return [...thread.messages.cache.values()];
                })
            );

            return threadResults.flat();
        })
    );

    const events = threadMessages.flat().flatMap(message => {
        if (!message.embeds.length && !message.content) {
            return [];
        }

        if (!isNewModerationEmbed(message)) {
            return [];
        }

        const eventType = getEventTypeFromMessage(message);
        if (!eventType || eventType !== type) {
            return [];
        }

        const targetUserId = getFieldValue(message, "Target ID");
        const targetUserTag = getFieldValue(message, "Target User");
        const moderatorTag = getFieldValue(message, "Moderator");
        const moderatorId = getFieldValue(message, "Moderator ID");
        const reason = getFieldValue(message, "Reason");
        const guildName = getFieldValue(message, "Guild");

        return [{
            id: message.id,
            type: eventType,
            guildId: guild.id,
            guildName,
            targetUserId,
            targetUserTag,
            moderatorId,
            moderatorTag,
            reason,
            createdAt: message.createdAt.toISOString()
        }] as ModerationEvent[];
    });

    return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
