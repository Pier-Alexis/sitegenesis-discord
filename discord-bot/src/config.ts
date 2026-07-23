import dotenv from "dotenv";

dotenv.config();

export function isDiscordTokenConfigured(token: string | undefined): boolean {
    if (!token) {
        return false;
    }

    const normalized = token.trim();
    return normalized.length > 0 && !["change-me", "your-discord-bot-token", "token"].includes(normalized.toLowerCase());
}

export const config = {
    token: process.env.TOKEN ?? "",
    clientId: process.env.CLIENT_ID ?? "",
    guildId: process.env.GUILD_ID,
    rover: {
        apiKey: process.env.ROVER_API_KEY,
        guildId: process.env.ROVER_GUILD_ID,
        authScheme: process.env.ROVER_AUTH_SCHEME ?? "Bearer",
        robloxToDiscordUrlTemplate:
            process.env.ROVER_ROBLOX_TO_DISCORD_URL_TEMPLATE ??
            "https://registry.rover.link/api/guilds/{guildId}/roblox-to-discord/{robloxUserId}"
    },

    botName: "Site-Genesis",
    version: "0.1.0",

    channels: {
        gameEvents: "game-events",
        moderationLogs: process.env.MODERATION_LOGS_CHANNEL ?? "user-logs",
        radioLogs: process.env.RADIO_LOGS_CHANNEL ?? "radiochannel",
        chatLogs: process.env.CHAT_LOGS_CHANNEL ?? "chatchannel",
        commandsLogs: process.env.COMMANDS_LOGS_CHANNEL ?? "commands"
    }
};

export default config;