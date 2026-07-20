import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { logUserEvent } from "../services/logger.js";
import { recordModerationEvent } from "../services/moderationLog.js";
export const data = new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user from this server")
    .addUserOption(option => option
    .setName("user")
    .setDescription("The user to unban")
    .setRequired(true))
    .addStringOption(option => option
    .setName("reason")
    .setDescription("Reason for the unban")
    .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
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
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    try {
        await guild.members.unban(targetUser, reason);
        await logUserEvent(guild, targetUser, "User Unbanned", `Unbanned by ${interaction.user.tag} for: ${reason}`);
        await recordModerationEvent(guild, {
            type: "unban",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: targetUser.id,
            targetUserTag: targetUser.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason
        });
        await interaction.reply({
            content: `✅ Unbanned ${targetUser.tag} for: ${reason}`
        });
    }
    catch (error) {
        await interaction.reply({
            content: "⚠️ I could not unban that user. Make sure they are actually banned.",
            flags: MessageFlags.Ephemeral
        });
    }
}
//# sourceMappingURL=unban.js.map