import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { logUserEvent } from "../services/logger.js";

export const data = new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Temporarily ban and immediately unban a member")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The member to softban")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Reason for the softban")
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
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

    if (targetUser.id === interaction.user.id) {
        await interaction.reply({
            content: "⚠️ You cannot softban yourself.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        await guild.members.ban(targetUser, {
            deleteMessageSeconds: 60,
            reason
        });

        await guild.members.unban(targetUser, "Softban complete");

        await logUserEvent(
            guild,
            targetUser,
            "User Softbanned",
            `Softbanned by ${interaction.user.tag} for: ${reason}`
        );

        await interaction.reply({
            content: `✅ Softbanned ${targetUser.tag} for: ${reason}`
        });
    } catch (error) {
        await interaction.reply({
            content: "⚠️ I could not softban that user.",
            flags: MessageFlags.Ephemeral
        });
    }
}
