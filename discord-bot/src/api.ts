import express from "express";
import { Client } from "discord.js";
import dotenv from "dotenv";
import { config } from "./config.js";
import { logUserEvent } from "./services/logger.js";
import type { User } from "discord.js";

dotenv.config();

const app = express();

app.use(express.json());

export function startApi(client: Client) {
    app.post("/events", async (req, res) => {
        try {
            const apiKey = req.header("x-api-key");

            if (apiKey !== process.env.API_KEY) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized"
                });
            }

            const event = req.body;

            console.log("Received an event:", event);

            if (!event || typeof event !== "object" || !event.type || !event.username || !event.userId) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid event payload"
                });
            }

            // Resolve guild
            let guild;
            if (config.guildId) {
                try {
                    guild = await client.guilds.fetch(config.guildId);
                } catch (err) {
                    guild = client.guilds.cache.get(config.guildId!);
                }
            }

            if (!guild) {
                // fallback to first available guild
                guild = client.guilds.cache.values().next().value;
            }

            if (!guild) {
                return res.status(500).json({ success: false, message: "Bot is not in any guild" });
            }

            // Build a lightweight User-like object for logger utilities
            const robloxUser = ({
                tag: event.username,
                username: event.username,
                id: String(event.userId)
            } as unknown) as User;

            const human = event.username;
            const eventName = event.type === "playerJoin" ? "Player Joined" : event.type === "playerLeave" ? "Player Left" : `Event: ${event.type}`;

            const metaLines: string[] = [];
            metaLines.push(`Roblox username: ${event.username}`);
            metaLines.push(`Roblox ID: ${event.userId}`);
            if (event.placeName) metaLines.push(`Place: ${event.placeName}`);
            if (event.placeId) metaLines.push(`Place ID: ${event.placeId}`);
            if (event.serverId) metaLines.push(`Server ID: ${event.serverId}`);
            if (event.serverName) metaLines.push(`Server: ${event.serverName}`);

            metaLines.push(`Reported by: ${human}`);

            const details = metaLines.join("\n");

            await logUserEvent(guild, robloxUser, eventName, details);

            res.json({ success: true });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: "Internal Server Error"
            });
        }
    });

    app.listen(4000, "0.0.0.0", () => {
        console.log("Discord API listening on port 4000");
    });
}
