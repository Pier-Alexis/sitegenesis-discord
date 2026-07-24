import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

/**
 * The main Discord server where staff roles live.
 * All *msg commands are already restricted to this guild by
 * isAllowedGuild() in index.ts, but this constant documents
 * that assumption explicitly for this module.
 */
export const MAIN_GUILD_ID = "1515795950218510468";

export const SITE_DIRECTOR_ROLE_ID = "1523577644346642535";
export const O5_COUNCIL_ROLE_ID = "1515797256719044798";

/** The only user allowed to use /adminmsg on their own merit. */
export const ADMIN_USER_ID = "914669712431009863";

/** Users who can use every *msg command regardless of role. */
export const BYPASS_USER_IDS: ReadonlySet<string> = new Set([
    ADMIN_USER_ID,
    "914669712431009863"
]);

export type ServerMsgPermission =
    | { type: "role"; roleId: string }
    | { type: "userOnly"; userId: string }
    | { type: "any" }
    | { type: "o5OrAdmin" };

function memberHasRole(member: GuildMember | null, roleId: string): boolean {
    if (!member) {
        return false;
    }

    return member.roles.cache.has(roleId);
}

function resolveInteractionGuildMember(interaction: ChatInputCommandInteraction): GuildMember | null {
    const member = interaction.member;

    if (member && "roles" in member && "cache" in (member.roles as object)) {
        return member as GuildMember;
    }

    return null;
}

async function resolveMainGuildMember(interaction: ChatInputCommandInteraction): Promise<GuildMember | null> {
    const client = interaction.client;
    const guild = client.guilds.cache.get(MAIN_GUILD_ID) ?? await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);

    if (!guild) {
        return null;
    }

    const cachedMember = guild.members.cache.get(interaction.user.id);

    if (cachedMember) {
        return cachedMember;
    }

    return await guild.members.fetch(interaction.user.id).catch(() => null);
}

async function resolveGuildMemberForPermission(interaction: ChatInputCommandInteraction): Promise<GuildMember | null> {
    const mainGuildMember = await resolveMainGuildMember(interaction);

    if (mainGuildMember) {
        return mainGuildMember;
    }

    return resolveInteractionGuildMember(interaction);
}

/**
 * Checks whether the invoking user is allowed to use a *msg command.
 * Bypass users always pass. Everyone else is checked against the
 * command's specific permission requirement.
 */
export async function isAuthorizedForServerMsg(
    interaction: ChatInputCommandInteraction,
    permission: ServerMsgPermission
): Promise<boolean> {
    if (BYPASS_USER_IDS.has(interaction.user.id)) {
        return true;
    }

    const member = await resolveGuildMemberForPermission(interaction);

    switch (permission.type) {
        case "role":
            return memberHasRole(member, permission.roleId);

        case "userOnly":
            return interaction.user.id === permission.userId;

        case "any":
            return (
                memberHasRole(member, SITE_DIRECTOR_ROLE_ID) ||
                memberHasRole(member, O5_COUNCIL_ROLE_ID) ||
                interaction.user.id === ADMIN_USER_ID
            );

        case "o5OrAdmin":
            return (
                memberHasRole(member, O5_COUNCIL_ROLE_ID) ||
                interaction.user.id === ADMIN_USER_ID
            );
    }
}

export const SITE_DIRECTOR_PERMISSION: ServerMsgPermission = {
    type: "role",
    roleId: SITE_DIRECTOR_ROLE_ID
};

export const O5_COUNCIL_PERMISSION: ServerMsgPermission = {
    type: "role",
    roleId: O5_COUNCIL_ROLE_ID
};

export const ADMIN_ONLY_PERMISSION: ServerMsgPermission = {
    type: "userOnly",
    userId: ADMIN_USER_ID
};

export const ANY_SERVER_MSG_PERMISSION: ServerMsgPermission = {
    type: "any"
};

export const SYSTEM_GENESIS_PERMISSION: ServerMsgPermission = {
    type: "o5OrAdmin"
};
