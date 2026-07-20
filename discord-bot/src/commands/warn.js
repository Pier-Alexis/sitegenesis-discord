import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { logUserEvent } from "../services/logger.js";
import { recordModerationEvent } from "../services/moderationLog.js";
export const data = new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member and send them a DM")
    .addUserOption(option => option
    .setName("user")
    .setDescription("The member to warn")
    .setRequired(true))
    .addStringOption(option => option
    .setName("reason")
    .setDescription("Reason for the warning")
    .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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
    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    if (targetUser.id === interaction.user.id) {
        await interaction.reply({
            content: "⚠️ You cannot warn yourself.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    try {
        await targetUser.send({
            content: `⚠️ You have been warned in ${guild.name} for: ${reason}`
        });
        await logUserEvent(guild, targetUser, "User Warned", `Warned by ${interaction.user.tag} for: ${reason}`);
        await recordModerationEvent(guild, {
            type: "warning",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: targetUser.id,
            targetUserTag: targetUser.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason,
            dmSent: true
        });
        await interaction.reply({
            content: `✅ Warned ${targetUser.tag} and sent them a direct message.`
        });
    }
    catch (error) {
        await interaction.reply({
            content: "⚠️ I could not warn that user or send them a DM.",
            flags: MessageFlags.Ephemeral
        });
    }
}
//# sourceMappingURL=warn.js.map