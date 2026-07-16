import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { logUserEvent } from "../services/logger.js";

export const data = new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove a timeout from a member")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The member to untimeout")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Reason for removing the timeout")
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
        await interaction.reply({
            content: "⚠️ I could not find that member.",
            ephemeral: true
        });
        return;
    }

    try {
        await targetMember.timeout(null, reason);

        await logUserEvent(
            interaction.guild,
            targetUser,
            "User Unmuted",
            `Timeout removed by ${interaction.user.tag} for: ${reason}`
        );

        await interaction.reply({
            content: `✅ Removed the timeout from ${targetUser.tag}`
        });
    } catch (error) {
        await interaction.reply({
            content: "⚠️ I could not remove that timeout.",
            ephemeral: true
        });
    }
}
