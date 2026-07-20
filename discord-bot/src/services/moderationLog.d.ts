import { type Guild } from "discord.js";
export type ModerationEventType = "ban" | "unban" | "mute" | "unmute" | "warning" | "softban" | "setgrouprank" | "kick";
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
    currentRanks?: string[];
    newRank?: string;
};
export declare function recordModerationEvent(guild: Guild, event: Omit<ModerationEvent, "id" | "createdAt">): Promise<ModerationEvent>;
export declare function getModerationEvents(guild: Guild, type: ModerationEventType, targetUser?: {
    id: string;
    tag: string;
    username: string;
}): Promise<ModerationEvent[]>;
//# sourceMappingURL=moderationLog.d.ts.map