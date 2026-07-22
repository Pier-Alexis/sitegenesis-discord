export type RobloxModerationAction = "ban" | "unban" | "mute" | "unmute" | "warn" | "setGroupRank" | "removeGroupRank" | "kick";

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

type RobloxUsernameLookupResponse = {
    data?: Array<{
        requestedUsername?: string;
        id?: number;
        name?: string;
    }>;
};

type RobloxUserGroupsResponse = {
    data?: Array<{
        group?: {
            id?: number;
            name?: string;
        };
        role?: {
            id?: number;
            name?: string;
            rank?: number;
        };
    }>;
};

type RobloxGroupRolesResponse = {
    roles?: Array<{
        id?: number;
        name?: string;
        rank?: number;
    }>;
};

export function buildApiHeaders() {
    const headers: Record<string, string> = {
        "Content-Type": "application/json"
    };

    const apiKey = process.env.API_KEY;
    if (apiKey) {
        headers["x-api-key"] = apiKey;
    }

    return headers;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

async function fetchRobloxUserIdByUsername(username: string): Promise<string | null> {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            usernames: [username],
            excludeBannedUsers: false
        })
    });

    if (!response.ok) {
        return null;
    }

    const payload = await response.json() as RobloxUsernameLookupResponse;
    const userId = payload.data?.[0]?.id;

    return isFiniteNumber(userId) ? String(userId) : null;
}

export async function resolveRobloxUserIdByUsername(username: string): Promise<string | null> {
    return fetchRobloxUserIdByUsername(username);
}

async function fetchRobloxGroupRolesForUser(userId: string) {
    const response = await fetch(`https://groups.roblox.com/v2/users/${encodeURIComponent(userId)}/groups/roles`);

    if (!response.ok) {
        return [] as Array<{
            groupId: number;
            groupName: string;
            roleId: number;
            roleName: string;
            roleRank: number;
        }>;
    }

    const payload = await response.json() as RobloxUserGroupsResponse;
    const roles = payload.data ?? [];

    return roles.flatMap(entry => {
        const groupId = entry.group?.id;
        const groupName = entry.group?.name;
        const roleId = entry.role?.id;
        const roleName = entry.role?.name;
        const roleRank = entry.role?.rank;

        if (!isFiniteNumber(groupId) || !groupName || !isFiniteNumber(roleId) || !roleName || !isFiniteNumber(roleRank)) {
            return [];
        }

        return [{
            groupId,
            groupName,
            roleId,
            roleName,
            roleRank
        }];
    });
}

async function fetchGroupRoleName(groupId: string, roleId: number): Promise<string | null> {
    const response = await fetch(`https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}/roles`);

    if (!response.ok) {
        return null;
    }

    const payload = await response.json() as RobloxGroupRolesResponse;
    const role = (payload.roles ?? []).find(candidate => candidate.id === roleId);

    return role?.name ?? null;
}

export async function resolveRobloxRankContext(input: {
    username: string;
    targetRoleId?: number;
    groupId?: string;
}): Promise<RobloxRankContext> {
    const robloxUserId = await fetchRobloxUserIdByUsername(input.username);

    if (!robloxUserId) {
        return {
            robloxUserId: null,
            currentRanks: [],
            newRankName: input.groupId && input.targetRoleId !== undefined
                ? await fetchGroupRoleName(input.groupId, input.targetRoleId)
                : null
        };
    }

    const memberships = await fetchRobloxGroupRolesForUser(robloxUserId);

    const currentRanks = input.groupId
        ? memberships
            .filter(entry => String(entry.groupId) === input.groupId)
            .map(entry => `${entry.groupName}: ${entry.roleName} (Rank ${entry.roleRank}, Role ID ${entry.roleId})`)
        : memberships
            .map(entry => `${entry.groupName}: ${entry.roleName} (Rank ${entry.roleRank}, Role ID ${entry.roleId})`);

    const newRankName = input.groupId && input.targetRoleId !== undefined
        ? await fetchGroupRoleName(input.groupId, input.targetRoleId)
        : null;

    return {
        robloxUserId,
        currentRanks,
        newRankName
    };
}

export function buildModerationPayload(input: {
    action: RobloxModerationAction;
    targetUserId: string;
    targetUsername: string;
    reason: string;
    moderator: string;
    metadata?: Record<string, unknown>;
}): RobloxModerationPayload {
    return {
        action: input.action,
        userId: input.targetUserId,
        username: input.targetUsername,
        reason: input.reason,
        moderator: input.moderator,
        ...(input.metadata ? { metadata: input.metadata } : {})
    };
}

export function formatPlayerListEntry(player: RobloxPlayerEntry): string {
    return `${player.username} (${player.displayName}) (${player.userId}) (${player.team})`;
}

export function buildPlayerSearchSummary(player: RobloxPlayerSearchResult): string {
    const groups = player.groups.length ? player.groups.join(", ") : "None";

    return [
        `Username: ${player.username}`,
        `Display Name: ${player.displayName}`,
        `Roblox User ID: ${player.userId}`,
        `Groups: ${groups}`,
        `Current Team: ${player.team}`
    ].join("\n");
}

export async function forwardModerationToBackend(payload: RobloxModerationPayload) {
    const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000/api";
    const response = await fetch(`${baseUrl}/roblox/moderation`, {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
            `Backend moderation request failed: ${response.status}${errorText ? ` - ${errorText}` : ""}`
        );
    }

    return response.json();
}

export async function forwardCaseToBackend(payload: {
    moderator: string;
    targetUserId: string;
    targetUsername: string;
    reason: string;
    type: string;
}) {
    const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000/api";
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        throw new Error("API_KEY is not configured");
    }

    const response = await fetch(`${baseUrl}/cases`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Backend cases request failed: ${response.status}`);
    }

    return response.json();
}