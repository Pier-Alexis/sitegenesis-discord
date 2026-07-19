export type RobloxModerationAction = "ban" | "unban" | "mute" | "unmute" | "warn";

export type RobloxModerationPayload = {
    action: RobloxModerationAction;
    userId: string;
    username: string;
    reason: string;
    moderator: string;
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

export function buildModerationPayload(input: {
    action: RobloxModerationAction;
    targetUserId: string;
    targetUsername: string;
    reason: string;
    moderator: string;
}): RobloxModerationPayload {
    return {
        action: input.action,
        userId: input.targetUserId,
        username: input.targetUsername,
        reason: input.reason,
        moderator: input.moderator
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
        throw new Error(`Backend moderation request failed: ${response.status}`);
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
