import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { logUserEvent } from "../services/logger.js";

export const data = new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from this server")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The member to ban")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Reason for the ban")
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

    if (targetUser.id === interaction.user.id) {
        await interaction.reply({
            content: "⚠️ You cannot ban yourself.",
            ephemeral: true
        });
        return;
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (targetMember && !targetMember.bannable) {
        await interaction.reply({
            content: "⚠️ I cannot ban that user.",
            ephemeral: true
        });
        return;
    }

    await interaction.guild.members.ban(targetUser, { reason });

    await logUserEvent(
        interaction.guild,
        targetUser,
        "User Banned",
        `Banned by ${interaction.user.tag} for: ${reason}`
    );

    await interaction.reply({
        content: `✅ Banned ${targetUser.tag} for: ${reason}`
    });
}
