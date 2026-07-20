import express from "express";
import { Client, ChannelType } from "discord.js";
import dotenv from "dotenv";
import { config } from "./config.js";
import { logUserEvent, logServerUserEvent, logServerUserChatMessage, logServerChannelChatMessage, ensureServerLogForum } from "./services/logger.js";
dotenv.config();
const app = express();
const recentRadioChatKeys = new Map();
const RADIO_CHAT_DEDUP_WINDOW_MS = 2500;
const PLAYER_CHAT_HOLD_MS = 350;
function normalizeChatMessageForKey(message) {
    return message
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}
function buildChatEventKey(event) {
    return [
        event.serverId,
        String(event.userId),
        normalizeChatMessageForKey(event.message)
    ].join("|");
}
function cleanupOldRecentRadioEntries(now) {
    for (const [key, timestamp] of recentRadioChatKeys.entries()) {
        if (now - timestamp > RADIO_CHAT_DEDUP_WINDOW_MS) {
            recentRadioChatKeys.delete(key);
        }
    }
}
app.use(express.json());
export function startApi(client) {
    app.post("/events", async (req, res) => {
        try {
            // ==========================================
            // API KEY VALIDATION
            // ==========================================
            const apiKey = req.header("x-api-key");
            if (apiKey !==
                process.env.API_KEY) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized"
                });
            }
            const event = req.body;
            console.log("Received an event:", event);
            // ==========================================
            // BASIC EVENT VALIDATION
            // ==========================================
            if (!event ||
                typeof event !== "object" ||
                !event.type) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid event payload"
                });
            }
            // ==========================================
            // SERVER CREATED VALIDATION
            // ==========================================
            if (event.type ===
                "serverCreated" &&
                (!event.serverId ||
                    !event.serverName)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid serverCreated event payload"
                });
            }
            // ==========================================
            // PLAYER EVENT VALIDATION
            //
            // Supported:
            // - playerJoin
            // - playerLeave
            // - teamChanged
            // - playerChat
            // - playerRadioChat
            // ==========================================
            if ((event.type ===
                "playerJoin" ||
                event.type ===
                    "playerLeave" ||
                event.type ===
                    "playerChat" ||
                event.type ===
                    "playerRadioChat" ||
                event.type ===
                    "teamChanged") &&
                (!event.username ||
                    !event.userId ||
                    !event.serverId ||
                    !event.serverName)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid player event payload"
                });
            }
            // ==========================================
            // TEAM CHANGE VALIDATION
            // ==========================================
            if (event.type ===
                "teamChanged" &&
                !event.team) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid teamChanged event payload"
                });
            }
            // ==========================================
            // CHAT VALIDATION
            // ==========================================
            if ((event.type ===
                "playerChat" ||
                event.type ===
                    "playerRadioChat") &&
                (typeof event.message !== "string" ||
                    event.message.length === 0)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid playerChat event payload"
                });
            }
            // ==========================================
            // RESOLVE AUTHORIZED DISCORD GUILD
            // ==========================================
            if (!config.guildId) {
                console.error("GUILD_ID is not configured.");
                return res.status(500).json({
                    success: false,
                    message: "GUILD_ID is not configured"
                });
            }
            let guild;
            try {
                guild =
                    await client.guilds.fetch(config.guildId);
            }
            catch (error) {
                console.error(`Failed to fetch configured Discord guild ${config.guildId}:`, error);
                return res.status(500).json({
                    success: false,
                    message: "Configured Discord guild not found"
                });
            }
            if (!guild) {
                return res.status(500).json({
                    success: false,
                    message: "Configured Discord guild is unavailable"
                });
            }
            console.log(`Using authorized Discord guild: ${guild.name} (${guild.id})`);
            // ==========================================
            // ROBLOX SERVER CREATED
            // ==========================================
            if (event.type ===
                "serverCreated") {
                const categoryName = `${event.serverName} - ${event.serverId}`;
                const archivedCategoryName = `(ARCHIVE) ${categoryName}`;
                // ------------------------------------------
                // CHECK NORMAL CATEGORY
                // ------------------------------------------
                const existingCategory = guild.channels.cache.find(channel => channel.type ===
                    ChannelType.GuildCategory &&
                    channel.name ===
                        categoryName);
                if (existingCategory) {
                    console.log(`Category already exists: ` +
                        `${categoryName}`);
                    await ensureServerLogForum(guild, event.serverId, event.serverName);
                    return res.json({
                        success: true,
                        created: false,
                        categoryId: existingCategory.id,
                        message: "Category already exists"
                    });
                }
                // ------------------------------------------
                // CHECK ARCHIVED CATEGORY
                //
                // If the same Roblox server starts again,
                // restore the archived category.
                // ------------------------------------------
                const archivedCategory = guild.channels.cache.find(channel => channel.type ===
                    ChannelType.GuildCategory &&
                    channel.name ===
                        archivedCategoryName);
                if (archivedCategory) {
                    await archivedCategory.setName(categoryName, "Roblox server became active again");
                    console.log(`Restored archived Roblox server category: ` +
                        `${categoryName}`);
                    await ensureServerLogForum(guild, event.serverId, event.serverName);
                    return res.json({
                        success: true,
                        created: false,
                        restored: true,
                        categoryId: archivedCategory.id,
                        message: "Archived category restored"
                    });
                }
                // ------------------------------------------
                // CREATE SERVER CATEGORY
                // ------------------------------------------
                const category = await guild.channels.create({
                    name: categoryName,
                    type: ChannelType.GuildCategory,
                    reason: `Created for Roblox server ` +
                        `${event.serverId}`
                });
                console.log(`Created category ` +
                    `"${category.name}" ` +
                    `(${category.id}) for Roblox server ` +
                    `${event.serverId}`);
                // ------------------------------------------
                // CREATE SERVER USER-LOGS FORUM
                // ------------------------------------------
                const forum = await ensureServerLogForum(guild, event.serverId, event.serverName);
                console.log(`Created server user-logs forum ` +
                    `"${forum.name}" ` +
                    `(${forum.id})`);
                return res.json({
                    success: true,
                    created: true,
                    categoryId: category.id,
                    forumId: forum.id
                });
            }
            // ==========================================
            // PLAYER CHAT
            //
            // Chat is logged as plain text in the
            // server-specific player thread.
            // ==========================================
            if (event.type ===
                "playerChat" ||
                event.type ===
                    "playerRadioChat") {
                const chatEventKey = buildChatEventKey({
                    serverId: event.serverId,
                    userId: event.userId,
                    message: event.message
                });
                const now = Date.now();
                cleanupOldRecentRadioEntries(now);
                if (event.type ===
                    "playerRadioChat") {
                    recentRadioChatKeys.set(chatEventKey, now);
                }
                if (event.type ===
                    "playerChat") {
                    await new Promise(resolve => {
                        setTimeout(resolve, PLAYER_CHAT_HOLD_MS);
                    });
                    cleanupOldRecentRadioEntries(Date.now());
                    if (recentRadioChatKeys.has(chatEventKey)) {
                        return res.json({
                            success: true,
                            skipped: true,
                            reason: "Duplicate of playerRadioChat"
                        });
                    }
                }
                const robloxUser = {
                    tag: event.username,
                    username: event.username,
                    id: String(event.userId)
                };
                await logServerUserChatMessage(guild, robloxUser, event.message, event.serverId, event.serverName);
                await logServerChannelChatMessage(guild, robloxUser, event.message, event.serverId, event.serverName, {
                    isRadio: event.type ===
                        "playerRadioChat",
                    radioChannelName: event.radioChannel
                });
                return res.json({
                    success: true
                });
            }
            // ==========================================
            // BUILD ROBLOX USER
            // ==========================================
            const robloxUser = {
                tag: event.username,
                username: event.username,
                id: String(event.userId)
            };
            // ==========================================
            // EVENT NAME
            // ==========================================
            let eventName;
            if (event.type ===
                "playerJoin") {
                eventName =
                    "Player Joined";
            }
            else if (event.type ===
                "playerLeave") {
                eventName =
                    "Player Left";
            }
            else if (event.type ===
                "teamChanged") {
                eventName =
                    "Team Changed";
            }
            else {
                eventName =
                    `Event: ${event.type}`;
            }
            // ==========================================
            // BUILD EVENT DETAILS
            // ==========================================
            const metaLines = [];
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
            if (event.team) {
                metaLines.push(`Team: ${event.team}`);
            }
            const details = metaLines.join("\n");
            // ==========================================
            // GLOBAL USER-LOGS
            // ==========================================
            await logUserEvent(guild, robloxUser, eventName, details);
            // ==========================================
            // SERVER-SPECIFIC USER-LOGS
            // ==========================================
            if (event.serverId &&
                event.serverName &&
                (event.type ===
                    "playerJoin" ||
                    event.type ===
                        "playerLeave" ||
                    event.type ===
                        "teamChanged")) {
                await logServerUserEvent(guild, robloxUser, eventName, details, event.serverId, event.serverName);
            }
            // ==========================================
            // SUCCESS RESPONSE
            // ==========================================
            return res.json({
                success: true
            });
        }
        catch (error) {
            console.error("Error processing Roblox event:", error);
            return res.status(500).json({
                success: false,
                message: "Internal Server Error"
            });
        }
    });
    // ==========================================
    // START API
    // ==========================================
    app.listen(4000, "0.0.0.0", () => {
        console.log("Discord API listening on port 4000");
    });
}
//# sourceMappingURL=api.js.map