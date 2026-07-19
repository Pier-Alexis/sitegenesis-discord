import express from "express";
import {
    Client,
    ChannelType
} from "discord.js";

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

    app.post(
        "/events",
        async (req, res) => {

            try {

                // ==========================================
                // API KEY VALIDATION
                // ==========================================

                const apiKey =
                    req.header("x-api-key");

                if (
                    apiKey !==
                    process.env.API_KEY
                ) {

                    return res.status(401).json({
                        success: false,
                        message: "Unauthorized"
                    });
                }

                const event =
                    req.body;

                console.log(
                    "Received an event:",
                    event
                );

                // ==========================================
                // BASIC EVENT VALIDATION
                // ==========================================

                if (
                    !event ||
                    typeof event !== "object" ||
                    !event.type
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid event payload"
                    });
                }

                // ==========================================
                // SERVER CREATED VALIDATION
                // ==========================================

                if (
                    event.type ===
                    "serverCreated" &&
                    (
                        !event.serverId ||
                        !event.serverName
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid serverCreated event payload"
                    });
                }

                // ==========================================
                // SERVER EMPTY VALIDATION
                // ==========================================

                if (
                    event.type ===
                    "serverEmpty" &&
                    (
                        !event.serverId ||
                        !event.serverName
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid serverEmpty event payload"
                    });
                }

                // ==========================================
                // PLAYER EVENT VALIDATION
                //
                // Supported:
                // - playerJoin
                // - playerLeave
                // - teamChanged
                // ==========================================

                if (
                    (
                        event.type ===
                            "playerJoin" ||
                        event.type ===
                            "playerLeave" ||
                        event.type ===
                            "teamChanged"
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
                        message:
                            "Invalid player event payload"
                    });
                }

                // ==========================================
                // TEAM CHANGE VALIDATION
                // ==========================================

                if (
                    event.type ===
                        "teamChanged" &&
                    !event.team
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid teamChanged event payload"
                    });
                }

                // ==========================================
                // RESOLVE AUTHORIZED DISCORD GUILD
                // ==========================================

                if (!config.guildId) {

                    console.error(
                        "GUILD_ID is not configured."
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "GUILD_ID is not configured"
                    });
                }

                let guild;

                try {

                    guild =
                        await client.guilds.fetch(
                            config.guildId
                        );

                } catch (error) {

                    console.error(
                        `Failed to fetch configured Discord guild ${config.guildId}:`,
                        error
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Configured Discord guild not found"
                    });
                }

                if (!guild) {

                    return res.status(500).json({
                        success: false,
                        message:
                            "Configured Discord guild is unavailable"
                    });
                }

                console.log(
                    `Using authorized Discord guild: ${guild.name} (${guild.id})`
                );

                // ==========================================
                // ROBLOX SERVER CREATED
                // ==========================================

                if (
                    event.type ===
                    "serverCreated"
                ) {

                    const categoryName =
                        `${event.serverName} - ${event.serverId}`;

                    const archivedCategoryName =
                        `(ARCHIVE) ${categoryName}`;

                    // ------------------------------------------
                    // CHECK NORMAL CATEGORY
                    // ------------------------------------------

                    const existingCategory =
                        guild.channels.cache.find(
                            channel =>
                                channel.type ===
                                    ChannelType.GuildCategory &&
                                channel.name ===
                                    categoryName
                        );

                    if (existingCategory) {

                        console.log(
                            `Category already exists: ` +
                            `${categoryName}`
                        );

                        await ensureServerLogForum(
                            guild,
                            event.serverId,
                            event.serverName
                        );

                        return res.json({
                            success: true,
                            created: false,
                            categoryId:
                                existingCategory.id,
                            message:
                                "Category already exists"
                        });
                    }

                    // ------------------------------------------
                    // CHECK ARCHIVED CATEGORY
                    //
                    // If the same Roblox server starts again,
                    // restore the archived category.
                    // ------------------------------------------

                    const archivedCategory =
                        guild.channels.cache.find(
                            channel =>
                                channel.type ===
                                    ChannelType.GuildCategory &&
                                channel.name ===
                                    archivedCategoryName
                        );

                    if (archivedCategory) {

                        await archivedCategory.setName(
                            categoryName,
                            "Roblox server became active again"
                        );

                        console.log(
                            `Restored archived Roblox server category: ` +
                            `${categoryName}`
                        );

                        await ensureServerLogForum(
                            guild,
                            event.serverId,
                            event.serverName
                        );

                        return res.json({
                            success: true,
                            created: false,
                            restored: true,
                            categoryId:
                                archivedCategory.id,
                            message:
                                "Archived category restored"
                        });
                    }

                    // ------------------------------------------
                    // CREATE SERVER CATEGORY
                    // ------------------------------------------

                    const category =
                        await guild.channels.create({
                            name:
                                categoryName,

                            type:
                                ChannelType.GuildCategory,

                            reason:
                                `Created for Roblox server ` +
                                `${event.serverId}`
                        });

                    console.log(
                        `Created category ` +
                        `"${category.name}" ` +
                        `(${category.id}) for Roblox server ` +
                        `${event.serverId}`
                    );

                    // ------------------------------------------
                    // CREATE SERVER USER-LOGS FORUM
                    // ------------------------------------------

                    const forum =
                        await ensureServerLogForum(
                            guild,
                            event.serverId,
                            event.serverName
                        );

                    console.log(
                        `Created server user-logs forum ` +
                        `"${forum.name}" ` +
                        `(${forum.id})`
                    );

                    return res.json({
                        success: true,
                        created: true,
                        categoryId:
                            category.id,
                        forumId:
                            forum.id
                    });
                }

                // ==========================================
                // SERVER EMPTY
                //
                // Roblox informs the API that there are
                // currently zero players in the server.
                //
                // The Discord category is renamed:
                //
                // ServerName - ServerID
                //
                // ->
                //
                // (ARCHIVE) ServerName - ServerID
                // ==========================================

                if (
                    event.type ===
                    "serverEmpty"
                ) {

                    const categoryName =
                        `${event.serverName} - ${event.serverId}`;

                    const archivedCategoryName =
                        `(ARCHIVE) ${categoryName}`;

                    // ------------------------------------------
                    // FIND ACTIVE CATEGORY
                    // ------------------------------------------

                    const category =
                        guild.channels.cache.find(
                            channel =>
                                channel.type ===
                                    ChannelType.GuildCategory &&
                                channel.name ===
                                    categoryName
                        );

                    if (!category) {

                        console.log(
                            `Could not find active category ` +
                            `to archive: ${categoryName}`
                        );

                        return res.json({
                            success: true,
                            archived: false,
                            message:
                                "Category not found"
                        });
                    }

                    // ------------------------------------------
                    // ARCHIVE CATEGORY
                    // ------------------------------------------

                    await category.setName(
                        archivedCategoryName,
                        "Roblox server became empty"
                    );

                    console.log(
                        `Archived Roblox server category: ` +
                        `${archivedCategoryName}`
                    );

                    return res.json({
                        success: true,
                        archived: true,
                        categoryId:
                            category.id,
                        categoryName:
                            archivedCategoryName
                    });
                }

                // ==========================================
                // BUILD ROBLOX USER
                // ==========================================

                const robloxUser = ({
                    tag:
                        event.username,

                    username:
                        event.username,

                    id:
                        String(event.userId)

                } as unknown) as User;

                // ==========================================
                // EVENT NAME
                // ==========================================

                let eventName: string;

                if (
                    event.type ===
                    "playerJoin"
                ) {

                    eventName =
                        "Player Joined";

                } else if (
                    event.type ===
                    "playerLeave"
                ) {

                    eventName =
                        "Player Left";

                } else if (
                    event.type ===
                    "teamChanged"
                ) {

                    eventName =
                        "Team Changed";

                } else {

                    eventName =
                        `Event: ${event.type}`;
                }

                // ==========================================
                // BUILD EVENT DETAILS
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

                const details =
                    metaLines.join("\n");

                // ==========================================
                // GLOBAL USER-LOGS
                // ==========================================

                await logUserEvent(
                    guild,
                    robloxUser,
                    eventName,
                    details
                );

                // ==========================================
                // SERVER-SPECIFIC USER-LOGS
                // ==========================================

                if (
                    event.serverId &&
                    event.serverName &&
                    (
                        event.type ===
                            "playerJoin" ||
                        event.type ===
                            "playerLeave" ||
                        event.type ===
                            "teamChanged"
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
                // SUCCESS RESPONSE
                // ==========================================

                return res.json({
                    success: true
                });

            } catch (error) {

                console.error(
                    "Error processing Roblox event:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Internal Server Error"
                });
            }
        }
    );

    // ==========================================
    // START API
    // ==========================================

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