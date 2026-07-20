import { EmbedBuilder } from "discord.js";
import { ensureUserThread, findUserThread, getModerationLogForums } from "./logger.js";
function truncateFieldValue(value, maxLength = 1024) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
function formatRanksFieldValue(ranks) {
    if (!ranks.length) {
        return "Unknown";
    }
    return truncateFieldValue(ranks.join("\n"));
}
function getActionLabel(type) {
    switch (type) {
        case "ban": return "Ban";
        case "unban": return "Unban";
        case "mute": return "Mute";
        case "unmute": return "Unmute";
        case "warning": return "Warning";
        case "softban": return "Softban";
        case "setgrouprank": return "Set Group Rank";
        case "kick": return "Kick";
    }
}
function getActionColor(type) {
    switch (type) {
        case "ban": return 0xed4245;
        case "unban": return 0x57f287;
        case "mute": return 0xfaa61a;
        case "unmute": return 0x5865f2;
        case "warning": return 0xffcc4d;
        case "softban": return 0xfee75c;
        case "setgrouprank": return 0x64d2ff;
        case "kick": return 0xeb459e;
    }
}
function normalizeEventType(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "ban" || normalized === "bans")
        return "ban";
    if (normalized === "unban" || normalized === "unbans")
        return "unban";
    if (normalized === "mute" || normalized === "mutes")
        return "mute";
    if (normalized === "unmute" || normalized === "unmutes")
        return "unmute";
    if (normalized === "warning" || normalized === "warnings")
        return "warning";
    if (normalized === "softban" || normalized === "softbans")
        return "softban";
    if (normalized === "kick" || normalized === "kicks")
        return "kick";
    if (normalized === "setgrouprank" || normalized === "set group rank" || normalized === "grouprank")
        return "setgrouprank";
    if (normalized.includes("softban"))
        return "softban";
    if (normalized.includes("kick"))
        return "kick";
    if (/group\s*rank/.test(normalized))
        return "setgrouprank";
    return null;
}
function getFieldValue(message, fieldName) {
    return message.embeds[0]?.fields.find(field => field.name === fieldName)?.value ?? "";
}
function isNewModerationEmbed(message) {
    const embed = message.embeds[0];
    if (!embed) {
        return false;
    }
    const fieldNames = embed.fields.map(field => field.name);
    return Boolean(embed.title?.startsWith("🛡️") &&
        fieldNames.includes("Type") &&
        fieldNames.includes("Target User") &&
        fieldNames.includes("Target ID") &&
        fieldNames.includes("Moderator") &&
        fieldNames.includes("Reason"));
}
function isLegacyModerationEmbed(message) {
    const embed = message.embeds[0];
    if (!embed) {
        return false;
    }
    const fieldNames = embed.fields.map(field => field.name.toLowerCase());
    const title = embed.title?.toLowerCase() ?? "";
    const hasModerationFields = [
        "type",
        "target user",
        "target id",
        "moderator",
        "reason",
        "guild"
    ].some(field => fieldNames.includes(field));
    const isActivityEmbed = fieldNames.includes("user") || fieldNames.includes("details");
    const isNewFormat = isNewModerationEmbed(message);
    return hasModerationFields && !isActivityEmbed && !isNewFormat && title.includes("mod") || title.includes("ban") || title.includes("warn") || title.includes("mute") || title.includes("unban") || title.includes("unmute");
}
function getEventTypeFromMessage(message) {
    const embedTitle = message.embeds[0]?.title ?? "";
    const fieldValue = getFieldValue(message, "Type");
    const titleValue = embedTitle.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    return normalizeEventType(fieldValue || titleValue);
}
async function cleanupLegacyModerationMessages(thread) {
    await thread.messages.fetch({ limit: 100 });
    const botId = thread.client.user?.id;
    if (!botId) {
        return;
    }
    const legacyMessages = [...thread.messages.cache.values()].filter(message => message.author.id === botId &&
        message.embeds.length > 0 &&
        isLegacyModerationEmbed(message));
    await Promise.all(legacyMessages.map(message => message.delete().catch(() => undefined)));
}
export async function recordModerationEvent(guild, event) {
    const targetUser = await guild.client.users.fetch(event.targetUserId).catch(() => null);
    const userTag = targetUser?.tag ?? event.targetUserTag;
    const thread = await ensureUserThread(guild, targetUser ?? { tag: userTag, id: event.targetUserId });
    const rankFields = event.type === "setgrouprank"
        ? [
            {
                name: "Current Rank(s)",
                value: formatRanksFieldValue(event.currentRanks ?? [])
            },
            {
                name: "New Rank",
                value: truncateFieldValue(event.newRank ?? "Unknown")
            }
        ]
        : [];
    const embed = new EmbedBuilder()
        .setTitle(`🛡️ ${getActionLabel(event.type)}`)
        .setColor(getActionColor(event.type))
        .addFields({ name: "Type", value: getActionLabel(event.type) }, { name: "Target User", value: userTag }, { name: "Target ID", value: event.targetUserId }, { name: "Moderator", value: event.moderatorTag }, { name: "Moderator ID", value: event.moderatorId }, { name: "Reason", value: event.reason }, ...rankFields, { name: "Guild", value: event.guildName })
        .setTimestamp();
    await cleanupLegacyModerationMessages(thread);
    const sentMessage = await thread.send({ embeds: [embed] });
    return {
        ...event,
        id: sentMessage.id,
        targetUserTag: userTag,
        createdAt: sentMessage.createdAt.toISOString()
    };
}
export async function getModerationEvents(guild, type, targetUser) {
    const forums = await getModerationLogForums(guild);
    const threadMessages = await Promise.all(forums.map(async (forum) => {
        await forum.threads.fetch();
        const threadsToRead = targetUser
            ? [await findUserThread(guild, targetUser)].filter((thread) => Boolean(thread))
            : [...forum.threads.cache.values()];
        const threadResults = await Promise.all(threadsToRead.map(async (thread) => {
            await thread.messages.fetch({ limit: 100 });
            return [...thread.messages.cache.values()];
        }));
        return threadResults.flat();
    }));
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
            }];
    });
    return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
//# sourceMappingURL=moderationLog.js.map