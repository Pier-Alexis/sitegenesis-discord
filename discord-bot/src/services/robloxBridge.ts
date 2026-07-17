export type RobloxModerationAction = "ban" | "unban" | "mute" | "unmute" | "warn";

export type RobloxModerationPayload = {
    action: RobloxModerationAction;
    userId: string;
    username: string;
    reason: string;
    moderator: string;
};

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

export async function forwardModerationToBackend(payload: RobloxModerationPayload) {
    const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000/api";
    const response = await fetch(`${baseUrl}/roblox/moderation`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Backend moderation request failed: ${response.status}`);
    }

    return response.json();
}
