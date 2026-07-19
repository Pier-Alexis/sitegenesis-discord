import express from "express";
import { Client, ChannelType } from "discord.js";
import dotenv from "dotenv";
import { config } from "./config.js";
import { logUserEvent, ensurePlayerChannel, deletePlayerChannel } from "./services/logger.js";
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

            // Basic event validation
            if (!event || typeof event !== "object" || !event.type) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid event payload"
                });
            }

            // Validate player events
            if (
                (event.type === "playerJoin" || event.type === "playerLeave") &&
                (!event.username || !event.userId)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid player event payload"
                });
            }

            // Validate server creation events
            if (
                event.type === "serverCreated" &&
                (!event.serverId || !event.serverName)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid serverCreated event payload"
                });
            }

            // Resolve guild
            let guild;

            if (config.guildId) {
                try {
                    guild = await client.guilds.fetch(config.guildId);
                } catch (err) {
                    guild = client.guilds.cache.get(config.guildId);
                }
            }

            if (!guild) {
                // Fallback to first available guild
                guild = client.guilds.cache.values().next().value;
            }

            if (!guild) {
                return res.status(500).json({
                    success: false,
                    message: "Bot is not in any guild"
                });
            }

            // Handle Roblox server creation
            if (event.type === "serverCreated") {
                const categoryName = `${event.serverName} - ${event.serverId}`;

                // Check if the category already exists
                const existingCategory = guild.channels.cache.find(
                    channel =>
                        channel.type === ChannelType.GuildCategory &&
                        channel.name === categoryName
                );

                if (existingCategory) {
                    console.log(
                        `Category already exists: ${categoryName}`
                    );

                    return res.json({
                        success: true,
                        created: false,
                        categoryId: existingCategory.id,
                        message: "Category already exists"
                    });
                }

                // Create the Discord category
                const category = await guild.channels.create({
                    name: categoryName,
                    type: ChannelType.GuildCategory,
                    reason: `Created for Roblox server ${event.serverId}`
                });

                console.log(
                    `Created category "${category.name}" (${category.id}) for Roblox server ${event.serverId}`
                );

                return res.json({
                    success: true,
                    created: true,
                    categoryId: category.id
                });
            }

            // Build a lightweight User-like object for logger utilities
            const robloxUser = ({
                tag: event.username,
                username: event.username,
                id: String(event.userId)
            } as unknown) as User;

            const human = event.username;

            const eventName =
                event.type === "playerJoin"
                    ? "Player Joined"
                    : event.type === "playerLeave"
                        ? "Player Left"
                        : `Event: ${event.type}`;

            const metaLines: string[] = [];

            metaLines.push(`Roblox username: ${event.username}`);
            metaLines.push(`Roblox ID: ${event.userId}`);

            if (event.placeName) {
                metaLines.push(`Place: ${event.placeName}`);
            }

            if (event.placeId) {
                metaLines.push(`Place ID: ${event.placeId}`);
            }

            if (event.serverId) {
                metaLines.push(`Server ID: ${event.serverId}`);
            }

            if (event.serverName) {
                metaLines.push(`Server: ${event.serverName}`);
            }

            metaLines.push(`Reported by: ${human}`);

            const details = metaLines.join("\n");

            await logUserEvent(
                guild,
                robloxUser,
                eventName,
                details
            );

            if (
                event.type === "playerJoin" &&
                event.serverId &&
                event.serverName
            ) {
                console.log(
                    `Creating player channel for ${event.username} (${event.userId})`
                );

                try {
                    await ensurePlayerChannel(
                        guild,
                        event.username,
                        String(event.userId),
                        event.serverId,
                        event.serverName
                    );

                    console.log(
                        `Player channel created successfully for ${event.username}`
                    );
                } catch (error) {
                    console.error(
                        `Failed to create player channel for ${event.username}:`,
                        error
                    );
                }
            }

            if (
                event.type === "playerLeave" &&
                event.serverId &&
                event.serverName
            ) {
                console.log(
                    `Deleting player channel for ${event.username} (${event.userId})`
                );

                try {
                    await deletePlayerChannel(
                        guild,
                        event.username,
                        String(event.userId),
                        event.serverId,
                        event.serverName
                    );

                    console.log(
                        `Player channel deleted successfully for ${event.username}`
                    );
                } catch (error) {
                    console.error(
                        `Failed to delete player channel for ${event.username}:`,
                        error
                    );
                }
            }

            res.json({
                success: true
            });

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