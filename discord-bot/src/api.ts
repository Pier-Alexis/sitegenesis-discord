import express from "express";
import { Client, ChannelType } from "discord.js";
import dotenv from "dotenv";
import { config } from "./config.js";
import {
    logUserEvent,
    logServerUserEvent,
    ensureServerLogForum
} from "./services/logger.js";
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
            if (
                !event ||
                typeof event !== "object" ||
                !event.type
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid event payload"
                });
            }

            // Validate server creation event
            if (
                event.type === "serverCreated" &&
                (!event.serverId || !event.serverName)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid serverCreated event payload"
                });
            }

            // Validate player events
            if (
                (
                    event.type === "playerJoin" ||
                    event.type === "playerLeave" ||
                    event.type === "teamChange"
                ) &&
                (
                    !event.username ||
                    !event.userId ||
                    !event.serverId ||
                    !event.serverName
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid player event payload"
                });
            }

            // Validate team change event
            if (
                event.type === "teamChange" &&
                !event.team
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid teamChange event payload"
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
                guild = client.guilds.cache.values().next().value;
            }

            if (!guild) {
                return res.status(500).json({
                    success: false,
                    message: "Bot is not in any guild"
                });
            }

            // ==========================================
            // ROBLOX SERVER CREATED
            // ==========================================

            if (event.type === "serverCreated") {
                const categoryName =
                    `${event.serverName} - ${event.serverId}`;

                // Check if category already exists
                const existingCategory = guild.channels.cache.find(
                    channel =>
                        channel.type === ChannelType.GuildCategory &&
                        channel.name === categoryName
                );

                if (existingCategory) {
                    console.log(
                        `Category already exists: ${categoryName}`
                    );

                    // Make sure the forum exists even if
                    // the category already existed
                    await ensureServerLogForum(
                        guild,
                        event.serverId,
                        event.serverName
                    );

                    return res.json({
                        success: true,
                        created: false,
                        categoryId: existingCategory.id,
                        message: "Category already exists"
                    });
                }

                // Create Discord category
                const category = await guild.channels.create({
                    name: categoryName,
                    type: ChannelType.GuildCategory,
                    reason:
                        `Created for Roblox server ${event.serverId}`
                });

                console.log(
                    `Created category "${category.name}" ` +
                    `(${category.id}) for Roblox server ` +
                    `${event.serverId}`
                );

                // Create user-logs Forum inside category
                const forum = await ensureServerLogForum(
                    guild,
                    event.serverId,
                    event.serverName
                );

                console.log(
                    `Created server user-logs forum ` +
                    `"${forum.name}" (${forum.id})`
                );

                return res.json({
                    success: true,
                    created: true,
                    categoryId: category.id,
                    forumId: forum.id
                });
            }

            // ==========================================
            // BUILD ROBLOX USER
            // ==========================================

            const robloxUser = ({
                tag: event.username,
                username: event.username,
                id: String(event.userId)
            } as unknown) as User;

            // ==========================================
            // EVENT NAME
            // ==========================================

            let eventName: string;

            if (event.type === "playerJoin") {
                eventName = "Player Joined";
            } else if (event.type === "playerLeave") {
                eventName = "Player Left";
            } else if (event.type === "teamChange") {
                eventName = "Team Changed";
            } else {
                eventName = `Event: ${event.type}`;
            }

            // ==========================================
            // EVENT DETAILS
            // ==========================================

            const metaLines: string[] = [];

            metaLines.push(
                `Roblox username: ${event.username}`
            );

            metaLines.push(
                `Roblox ID: ${event.userId}`
            );

            if (event.placeName) {
                metaLines.push(
                    `Place: ${event.placeName}`
                );
            }

            if (event.placeId) {
                metaLines.push(
                    `Place ID: ${event.placeId}`
                );
            }

            if (event.serverId) {
                metaLines.push(
                    `Server ID: ${event.serverId}`
                );
            }

            if (event.serverName) {
                metaLines.push(
                    `Server: ${event.serverName}`
                );
            }

            if (event.team) {
                metaLines.push(
                    `Team: ${event.team}`
                );
            }

            metaLines.push(
                `Reported by: ${event.username}`
            );

            const details = metaLines.join("\n");

            // ==========================================
            // GLOBAL USER-LOGS FORUM
            // ==========================================

            await logUserEvent(
                guild,
                robloxUser,
                eventName,
                details
            );

            // ==========================================
            // SERVER-SPECIFIC USER-LOGS FORUM
            // ==========================================

            if (
                event.serverId &&
                event.serverName &&
                (
                    event.type === "playerJoin" ||
                    event.type === "playerLeave" ||
                    event.type === "teamChange"
                )
            ) {
                await logServerUserEvent(
                    guild,
                    robloxUser,
                    eventName,
                    details,
                    event.serverId,
                    event.serverName
                );
            }

            // ==========================================
            // RESPONSE
            // ==========================================

            res.json({
                success: true
            });

        } catch (error) {
            console.error(
                "Error processing Roblox event:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Internal Server Error"
            });
        }
    });

    app.listen(
        4000,
        "0.0.0.0",
        () => {
            console.log(
                "Discord API listening on port 4000"
            );
        }
    );
}