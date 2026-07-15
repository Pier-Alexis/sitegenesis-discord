import dotenv from "dotenv";

dotenv.config();

export const config = {
    token: process.env.TOKEN!,
    clientId: process.env.CLIENT_ID!,
    guildId: process.env.GUILD_ID!,

    botName: "Site-Genesis",
    version: "0.1.0",

    channels: {
        gameEvents: "game-events",
        moderationLogs: "moderation-logs"
    }
};