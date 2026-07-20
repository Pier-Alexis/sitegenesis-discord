export type RobloxModerationAction = "ban" | "unban" | "mute" | "unmute" | "warn" | "setGroupRank" | "kick";
export type RobloxModerationPayload = {
    action: RobloxModerationAction;
    userId: string;
    username: string;
    reason: string;
    moderator: string;
    metadata?: Record<string, unknown>;
};
export type RobloxPlayerEntry = {
    username: string;
    displayName: string;
    userId: string;
    team: string;
};
export type RobloxPlayerSearchResult = RobloxPlayerEntry & {
    groups: string[];
};
export type RobloxRankContext = {
    robloxUserId: string | null;
    currentRanks: string[];
    newRankName: string | null;
};
export declare function buildApiHeaders(): Record<string, string>;
export declare function resolveRobloxUserIdByUsername(username: string): Promise<string | null>;
export declare function resolveRobloxRankContext(input: {
    username: string;
    targetRoleId: number;
    groupId?: string;
}): Promise<RobloxRankContext>;
export declare function buildModerationPayload(input: {
    action: RobloxModerationAction;
    targetUserId: string;
    targetUsername: string;
    reason: string;
    moderator: string;
    metadata?: Record<string, unknown>;
}): RobloxModerationPayload;
export declare function formatPlayerListEntry(player: RobloxPlayerEntry): string;
export declare function buildPlayerSearchSummary(player: RobloxPlayerSearchResult): string;
export declare function forwardModerationToBackend(payload: RobloxModerationPayload): Promise<any>;
export declare function forwardCaseToBackend(payload: {
    moderator: string;
    targetUserId: string;
    targetUsername: string;
    reason: string;
    type: string;
}): Promise<any>;
//# sourceMappingURL=robloxBridge.d.ts.map