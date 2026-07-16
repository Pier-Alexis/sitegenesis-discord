import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { logUserEvent } from "../services/logger.js";

export const data = new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user from this server")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The user to unban")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Reason for the unban")
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: "⚠️ This command can only be used in a server.",
            ephemeral: true
        });
        return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    try {
        await interaction.guild.members.unban(targetUser, reason);

        await logUserEvent(
            interaction.guild,
            targetUser,
            "User Unbanned",
            `Unbanned by ${interaction.user.tag} for: ${reason}`
        );

        await interaction.reply({
            content: `✅ Unbanned ${targetUser.tag} for: ${reason}`
        });
    } catch (error) {
        await interaction.reply({
            content: "⚠️ I could not unban that user. Make sure they are actually banned.",
            ephemeral: true
        });
    }
}
