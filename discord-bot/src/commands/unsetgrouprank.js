import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import { buildModerationPayload, forwardModerationToBackend, resolveRobloxRankContext } from "../services/robloxBridge.js";
function resolveTargetRoleId(interactionRoleId) {
    if (interactionRoleId !== null) {
        return interactionRoleId;
    }
    const envRoleId = process.env.ROBLOX_DEMOTION_ROLE_ID?.trim();
    if (!envRoleId) {
        return null;
    }
    const parsed = Number(envRoleId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}
export const data = new SlashCommandBuilder()
    .setName("unsetgrouprank")
    .setDescription("Queue a Roblox community/group demotion")
    .addStringOption(option => option
    .setName("roblox_username")
    .setDescription("Roblox username to demote")
    .setRequired(true))
    .addIntegerOption(option => option
    .setName("role_id")
    .setDescription("Target Roblox group role ID after demotion")
    .setRequired(false)
    .setMinValue(1)
    .setMaxValue(1000000000))
    .addStringOption(option => option
    .setName("reason")
    .setDescription("Reason for the demotion")
    .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false);
export async function execute(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: "⚠️ This command can only be used in a server.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const guild = interaction.guild;
    if (!guild) {
        await interaction.reply({
            content: "⚠️ I could not access this server information.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const robloxUsername = interaction.options.getString("roblox_username", true).trim();
    const roleId = resolveTargetRoleId(interaction.options.getInteger("role_id"));
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(robloxUsername)) {
        await interaction.reply({
            content: "⚠️ Enter a valid Roblox username (3-20 letters, numbers, or underscores).",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    if (!roleId) {
        await interaction.reply({
            content: "⚠️ Provide role_id or set ROBLOX_DEMOTION_ROLE_ID in environment.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const configuredGroupId = process.env.ROBLOX_GROUP_ID?.trim();
    const payload = buildModerationPayload({
        action: "setGroupRank",
        targetUserId: "",
        targetUsername: robloxUsername,
        reason,
        moderator: interaction.user.tag,
        metadata: {
            roleId
        }
    });
    try {
        const rankContext = await resolveRobloxRankContext({
            username: robloxUsername,
            targetRoleId: roleId,
            ...(configuredGroupId
                ? { groupId: configuredGroupId }
                : {})
        }).catch(() => ({
            robloxUserId: null,
            currentRanks: [],
            newRankName: null
        }));
        await forwardModerationToBackend(payload);
        const newRankLabel = rankContext.newRankName
            ? `${rankContext.newRankName} (Role ID ${roleId})`
            : `Role ID ${roleId}`;
        await recordModerationEvent(guild, {
            type: "setgrouprank",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: rankContext.robloxUserId ?? `roblox:${robloxUsername}`,
            targetUserTag: `${robloxUsername} (Roblox)`,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: `Demoted to ${newRankLabel}. ${reason}`,
            currentRanks: rankContext.currentRanks,
            newRank: newRankLabel
        });
        await interaction.reply({
            content: `✅ Queued demotion for ${robloxUsername} to ${newRankLabel}.`
        });
    }
    catch (error) {
        console.error("Failed to queue demotion", error);
        await interaction.reply({
            content: "⚠️ Failed to queue the demotion action.",
            flags: MessageFlags.Ephemeral
        });
    }
}
//# sourceMappingURL=unsetgrouprank.js.map