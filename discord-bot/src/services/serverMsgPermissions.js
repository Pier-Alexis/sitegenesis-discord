export const MAIN_GUILD_ID = "1515795950218510468";
export const SITE_DIRECTOR_ROLE_ID = "1523577644346642535";
export const O5_COUNCIL_ROLE_ID = "1515797256719044798";
export const ADMIN_USER_ID = "914669712431009863";
export const BYPASS_USER_IDS = new Set([
    ADMIN_USER_ID,
    "983413792174129153"
]);
function memberHasRole(member, roleId) {
    if (!member) {
        return false;
    }
    return member.roles.cache.has(roleId);
}
function resolveGuildMember(interaction) {
    const member = interaction.member;
    if (member && "roles" in member && "cache" in member.roles) {
        return member;
    }
    return null;
}
export function isAuthorizedForServerMsg(interaction, permission) {
    if (BYPASS_USER_IDS.has(interaction.user.id)) {
        return true;
    }
    const member = resolveGuildMember(interaction);
    switch (permission.type) {
        case "role":
            return memberHasRole(member, permission.roleId);
        case "userOnly":
            return interaction.user.id === permission.userId;
        case "any":
            return (memberHasRole(member, SITE_DIRECTOR_ROLE_ID) ||
                memberHasRole(member, O5_COUNCIL_ROLE_ID) ||
                interaction.user.id === ADMIN_USER_ID);
    }
}
export const SITE_DIRECTOR_PERMISSION = {
    type: "role",
    roleId: SITE_DIRECTOR_ROLE_ID
};
export const O5_COUNCIL_PERMISSION = {
    type: "role",
    roleId: O5_COUNCIL_ROLE_ID
};
export const ADMIN_ONLY_PERMISSION = {
    type: "userOnly",
    userId: ADMIN_USER_ID
};
export const ANY_SERVER_MSG_PERMISSION = {
    type: "any"
};
