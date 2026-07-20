import { ForumChannel, Guild, TextChannel, ThreadChannel, User, type Message, type PartialMessage } from "discord.js";
export declare function isPlayerLeftEmbedTitle(title: string | null | undefined): boolean;
export declare function shouldArchiveServerFromLastEmbedTitles(lastEmbedTitles: Array<string | null | undefined>): boolean;
export declare function buildServerUserChatContent(username: string, message: string): string;
export declare function buildChannelChatContent(username: string, userId: string, message: string, radioChannelName?: string): string;
/**
 * Send a generic Roblox game event to a text channel.
 */
export declare function sendGameEvent(channel: TextChannel, event: string, player: string): Promise<void>;
/**
 * Find all global moderation/user log forums.
 */
export declare function getModerationLogForums(guild: Guild): Promise<ForumChannel[]>;
/**
 * Ensure that the global moderation/user-logs forum exists.
 *
 * This forum is independent from Roblox server categories.
 */
export declare function ensureModerationLogForum(guild: Guild): Promise<ForumChannel>;
/**
 * Find or create the user-logs forum inside a Roblox
 * server category.
 *
 * Structure:
 *
 * Server Category
 * └── user-logs (Forum)
 *     ├── User Player1 (123)
 *     └── User Player2 (456)
 */
export declare function ensureServerLogForum(guild: Guild, serverId: string, serverName: string): Promise<ForumChannel>;
/**
 * Build the thread name used for a player.
 *
 * Example:
 * User PARikiBic (1943568858)
 */
export declare function buildUserThreadName(user: Pick<User, "tag" | "username" | "id">): string;
/**
 * Find a user thread inside the global moderation log forums.
 */
export declare function findUserThread(guild: Guild, user: Pick<User, "tag" | "username" | "id">): Promise<ThreadChannel | null>;
/**
 * Ensure a user thread exists in the global user-logs forum.
 */
export declare function ensureUserThread(guild: Guild, user: User): Promise<ThreadChannel>;
/**
 * Log an event in the global user-logs forum.
 */
export declare function logUserEvent(guild: Guild, user: User, event: string, details: string): Promise<void>;
/**
 * Log Discord message events in the global user thread.
 */
export declare function logMessageEvent(guild: Guild, user: User, event: string, message: Message<boolean> | PartialMessage, details?: string): Promise<void>;
/**
 * Ensure a user thread exists inside a specific forum.
 *
 * Used by server-specific user-logs forums.
 */
export declare function ensureUserThreadInForum(forum: ForumChannel, user: User): Promise<ThreadChannel>;
/**
 * Ensure a player thread exists inside the user-logs
 * forum of a specific Roblox server.
 */
export declare function ensureServerUserThread(guild: Guild, user: User, serverId: string, serverName: string): Promise<ThreadChannel>;
/**
 * Log a Roblox player event inside:
 *
 * Category
 * └── user-logs Forum
 *     └── User PlayerName (UserId)
 *
 * This is used for:
 * - Player Joined
 * - Player Left
 * - Team Changed
 */
export declare function logServerUserEvent(guild: Guild, user: User, event: string, details: string, serverId: string, serverName: string): Promise<void>;
/**
 * Log a Roblox chat message as plain text (no embed)
 * inside the player's server thread.
 */
export declare function logServerUserChatMessage(guild: Guild, user: User, message: string, serverId: string, serverName: string): Promise<void>;
export declare function logServerChannelChatMessage(guild: Guild, user: User, message: string, serverId: string, serverName: string, options?: {
    isRadio?: boolean;
    radioChannelName?: string;
}): Promise<void>;
//# sourceMappingURL=logger.d.ts.map