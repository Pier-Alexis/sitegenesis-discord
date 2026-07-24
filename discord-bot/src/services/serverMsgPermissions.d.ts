import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
export declare const MAIN_GUILD_ID = "1515795950218510468";
export declare const SITE_DIRECTOR_ROLE_ID = "1523577644346642535";
export declare const O5_COUNCIL_ROLE_ID = "1515797256719044798";
export declare const ADMIN_USER_ID = "914669712431009863";
export declare const BYPASS_USER_IDS: ReadonlySet<string>;
export type ServerMsgPermission =
    | { type: "role"; roleId: string }
    | { type: "userOnly"; userId: string }
    | { type: "any" }
    | { type: "o5OrAdmin" };
export declare function isAuthorizedForServerMsg(
    interaction: ChatInputCommandInteraction,
    permission: ServerMsgPermission
): Promise<boolean>;
export declare const SITE_DIRECTOR_PERMISSION: ServerMsgPermission;
export declare const O5_COUNCIL_PERMISSION: ServerMsgPermission;
export declare const ADMIN_ONLY_PERMISSION: ServerMsgPermission;
export declare const ANY_SERVER_MSG_PERMISSION: ServerMsgPermission;
export declare const SYSTEM_GENESIS_PERMISSION: ServerMsgPermission;
