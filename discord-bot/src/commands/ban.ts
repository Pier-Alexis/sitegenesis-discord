import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { logUserEvent } from "../services/logger.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import { buildModerationPayload, forwardModerationToBackend } from "../services/robloxBridge.js";

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
            content: "⚠️ You cannot ban yourself.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

    if (targetMember && !targetMember.bannable) {
        await interaction.reply({
            content: "⚠️ I cannot ban that user.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await guild.members.ban(targetUser, { reason });

    await logUserEvent(
        guild,
        targetUser,
        "User Banned",
        `Banned by ${interaction.user.tag} for: ${reason}`
    );

    await recordModerationEvent(guild, {
        type: "ban",
        guildId: guild.id,
        guildName: guild.name,
        targetUserId: targetUser.id,
        targetUserTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason
    });

    const payload = buildModerationPayload({
        action: "ban",
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        reason,
        moderator: interaction.user.tag
    });

    try {
        await forwardModerationToBackend(payload);
    } catch (error) {
        console.error("Failed to forward moderation to backend", error);
    }

    await interaction.reply({
        content: `✅ Banned ${targetUser.tag} for: ${reason}`
    });
}
