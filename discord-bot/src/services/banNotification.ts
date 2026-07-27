import type { Client, Guild, User } from "discord.js";
import { config } from "../config.js";

type RoverLookupResponse = {
    discordId?: string;
    discordUserId?: string;
    discord_id?: string;
    discordUser?: {
        id?: string;
    };
    user?: {
        id?: string;
    };
    /** Bloxlink's roblox-to-discord response shape: { discordIDs: ["123..."] } */
    discordIDs?: unknown;
    data?: unknown;
    result?: unknown;
};

type BanDmResult = {
    delivered: boolean;
    reason:
        | "disabled"
        | "no-match"
        | "lookup-failed"
        | "discord-user-not-found"
        | "dm-failed"
        | "delivered";
};

function isSnowflake(value: unknown): value is string {
    return typeof value === "string" && /^\d{16,21}$/.test(value);
}

function extractDiscordId(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const typed = payload as RoverLookupResponse;

    if (isSnowflake(typed.discordId)) {
        return typed.discordId;
    }

    if (isSnowflake(typed.discordUserId)) {
        return typed.discordUserId;
    }

    if (isSnowflake(typed.discord_id)) {
        return typed.discord_id;
    }

    if (isSnowflake(typed.discordUser?.id)) {
        return typed.discordUser.id;
    }

    if (isSnowflake(typed.user?.id)) {
        return typed.user.id;
    }

    if (Array.isArray(typed.discordIDs) && isSnowflake(typed.discordIDs[0])) {
        return typed.discordIDs[0];
    }

    if (Array.isArray(typed.data)) {
        for (const entry of typed.data) {
            const found = extractDiscordId(entry);
            if (found) {
                return found;
            }
        }
    } else if (typed.data && typeof typed.data === "object") {
        const found = extractDiscordId(typed.data);
        if (found) {
            return found;
        }
    }

    if (typed.result && typeof typed.result === "object") {
        const found = extractDiscordId(typed.result);
        if (found) {
            return found;
        }
    }

    return null;
}

async function resolveDiscordIdFromRoblox_Bloxlink(robloxUserId: string): Promise<string | null> {
    const apiKey = config.bloxlink.apiKey;
    const urlTemplate = config.bloxlink.robloxToDiscordUrlTemplate;

    if (!apiKey || !urlTemplate) {
        return null;
    }

    const guildId = config.bloxlink.guildId ?? config.guildId;
    if (!guildId) {
        return null;
    }

    const url = urlTemplate
        .replace("{guildId}", encodeURIComponent(guildId))
        .replace("{robloxUserId}", encodeURIComponent(robloxUserId));

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Accept: "application/json",
            // Bloxlink's Server API key is sent as-is, no "Bearer" prefix.
            Authorization: apiKey
        },
        signal: AbortSignal.timeout(7000)
    });

    if (!response.ok) {
        return null;
    }

    const payload = await response.json();
    return extractDiscordId(payload);
}

async function resolveDiscordIdFromRoblox_RoVer(robloxUserId: string): Promise<string | null> {
    const apiKey = config.rover.apiKey;
    const urlTemplate = config.rover.robloxToDiscordUrlTemplate;

    if (!apiKey || !urlTemplate) {
        return null;
    }

    const guildId = config.rover.guildId ?? config.guildId;
    if (!guildId) {
        return null;
    }

    const url = urlTemplate
        .replace("{guildId}", encodeURIComponent(guildId))
        .replace("{robloxUserId}", encodeURIComponent(robloxUserId));

    const headers: Record<string, string> = {
        Accept: "application/json"
    };

    headers.Authorization = `${config.rover.authScheme} ${apiKey}`;
    headers["x-api-key"] = apiKey;

    const response = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(7000)
    });

    if (!response.ok) {
        return null;
    }

    const payload = await response.json();
    return extractDiscordId(payload);
}

/**
 * Tries Bloxlink first (primary verification provider), then falls
 * back to RoVer if Bloxlink isn't configured or finds no match. If
 * you only run one provider, the unconfigured one is a no-op.
 */
async function resolveDiscordIdFromRobloxUserId(robloxUserId: string): Promise<string | null> {
    const bloxlinkResult = await resolveDiscordIdFromRoblox_Bloxlink(robloxUserId);
    if (bloxlinkResult) {
        return bloxlinkResult;
    }

    return resolveDiscordIdFromRoblox_RoVer(robloxUserId);
}

export async function notifyDiscordBanByUser(user: User, guild: Guild, reason: string): Promise<BanDmResult> {
    try {
        await user.send({
            content: [
                `You were banned from **${guild.name}**.`,
                `Reason: ${reason || "No reason provided"}`
            ].join("\n")
        });

        return {
            delivered: true,
            reason: "delivered"
        };
    } catch (error) {
        console.warn("Failed to send Discord ban DM", {
            guildId: guild.id,
            guildName: guild.name,
            targetDiscordId: user.id,
            error
        });

        return {
            delivered: false,
            reason: "dm-failed"
        };
    }
}

export async function notifyRobloxBanByUserId(input: {
    client: Client;
    guild: Guild;
    robloxUserId: string;
    robloxUsername: string;
    reason: string;
}): Promise<BanDmResult> {
    const bloxlinkConfigured = Boolean(config.bloxlink.apiKey && config.bloxlink.robloxToDiscordUrlTemplate);
    const roverConfigured = Boolean(config.rover.apiKey && config.rover.robloxToDiscordUrlTemplate);

    if (!bloxlinkConfigured && !roverConfigured) {
        return {
            delivered: false,
            reason: "disabled"
        };
    }

    let discordUserId: string | null = null;

    try {
        discordUserId = await resolveDiscordIdFromRobloxUserId(input.robloxUserId);
    } catch (error) {
        console.warn("Roblox-to-Discord lookup failed", {
            robloxUserId: input.robloxUserId,
            robloxUsername: input.robloxUsername,
            error
        });

        return {
            delivered: false,
            reason: "lookup-failed"
        };
    }

    if (!discordUserId) {
        return {
            delivered: false,
            reason: "no-match"
        };
    }

    let user: User;
    try {
        user = await input.client.users.fetch(discordUserId);
    } catch (error) {
        console.warn("Discord user lookup failed for Roblox ban notification", {
            robloxUserId: input.robloxUserId,
            robloxUsername: input.robloxUsername,
            discordUserId,
            error
        });

        return {
            delivered: false,
            reason: "discord-user-not-found"
        };
    }

    try {
        await user.send({
            content: [
                `You were banned from the Roblox experience linked to **${input.guild.name}**.`,
                `Roblox account: ${input.robloxUsername} (${input.robloxUserId})`,
                `Reason: ${input.reason || "No reason provided"}`
            ].join("\n")
        });

        return {
            delivered: true,
            reason: "delivered"
        };
    } catch (error) {
        console.warn("Failed to send Roblox ban DM", {
            guildId: input.guild.id,
            guildName: input.guild.name,
            robloxUserId: input.robloxUserId,
            robloxUsername: input.robloxUsername,
            discordUserId,
            error
        });

        return {
            delivered: false,
            reason: "dm-failed"
        };
    }
}