import { getRobloxId } from "./bloxlinkSync.js";

const COMMUNITY_GROUP_ID = 165095337;
const ROBLOX_GROUP_ROLES_API = "https://groups.roblox.com/v1/users";

const RANK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface RobloxGroupRolesResponse {
    data: Array<{
        group: { id: number; name: string };
        role: { id: number; name: string; rank: number };
    }>;
}

const rankCache = new Map<string, { rank: number; expiresAt: number }>();

/**
 * Returns a Roblox user's rank (0-255) in the community group, or 0 if
 * they're not in the group / the lookup fails. Results are cached briefly
 * to avoid hammering the Roblox API when many commands run back-to-back.
 */
async function fetchGroupRank(robloxUserId: string): Promise<number> {
    const cached = rankCache.get(robloxUserId);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.rank;
    }

    const url = `${ROBLOX_GROUP_ROLES_API}/${robloxUserId}/groups/roles`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.error(
                `[GroupRankGuard] Roblox groups API returned HTTP ${response.status} ` +
                `for user ${robloxUserId}`
            );
            return 0;
        }

        const payload = await response.json() as RobloxGroupRolesResponse;

        const membership = payload.data?.find(
            entry => entry.group.id === COMMUNITY_GROUP_ID
        );

        const rank = membership?.role.rank ?? 0;

        rankCache.set(robloxUserId, { rank, expiresAt: Date.now() + RANK_CACHE_TTL_MS });

        return rank;
    } catch (error) {
        console.error(
            `[GroupRankGuard] Failed to fetch group roles for ${robloxUserId}:`,
            error
        );
        return 0;
    }
}

export interface RankCheckResult {
    allowed: boolean;
    reason?: string;
    moderatorRank: number;
    targetRank: number;
}

/**
 * Denies a moderation action if the Discord user issuing it has a lower rank
 * than the target Roblox player in community group 165095337. Also denies
 * (fails closed) if the moderator has no Roblox account linked via Bloxlink.
 */
export async function ensureOutranksTarget(
    discordModeratorId: string,
    targetRobloxUserId: string
): Promise<RankCheckResult> {
    const moderatorRobloxId = await getRobloxId(discordModeratorId);

    if (!moderatorRobloxId) {
        return {
            allowed: false,
            reason: "You need to verify your Roblox account with Bloxlink before using this command.",
            moderatorRank: 0,
            targetRank: 0
        };
    }

    const [moderatorRank, targetRank] = await Promise.all([
        fetchGroupRank(moderatorRobloxId),
        fetchGroupRank(targetRobloxUserId)
    ]);

    if (moderatorRank < targetRank) {
        return {
            allowed: false,
            reason:
                `Your group rank (${moderatorRank}) is lower than the target's rank ` +
                `(${targetRank}). You can't moderate a higher-ranked member.`,
            moderatorRank,
            targetRank
        };
    }

    return { allowed: true, moderatorRank, targetRank };
}