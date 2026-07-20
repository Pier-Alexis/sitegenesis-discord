import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, TimestampStyles, time } from "discord.js";
import { logUserEvent } from "../services/logger.js";
import { recordModerationEvent } from "../services/moderationLog.js";
export const data = new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout a member from this server")
    .addUserOption(option => option
    .setName("user")
    .setDescription("The member to timeout")
    .setRequired(true))
    .addIntegerOption(option => option
    .setName("minutes")
    .setDescription("Timeout duration in minutes")
    .setRequired(true)
    .setMinValue(1)
    .setMaxValue(10080))
    .addStringOption(option => option
    .setName("reason")
    .setDescription("Reason for the timeout")
    .setRequired(false))
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
    const minutes = interaction.options.getInteger("minutes", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    if (targetUser.id === interaction.user.id) {
        await interaction.reply({
            content: "⚠️ You cannot timeout yourself.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
        await interaction.reply({
            content: "⚠️ I could not find that member.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    if (!targetMember.moderatable) {
        await interaction.reply({
            content: "⚠️ I cannot timeout that member.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const timeoutDurationMs = minutes * 60 * 1000;
    const timeoutUntil = new Date(Date.now() + timeoutDurationMs);
    await targetMember.timeout(timeoutDurationMs, reason);
    const formattedUntil = time(timeoutUntil, TimestampStyles.RelativeTime);
    await logUserEvent(guild, targetUser, "User Timed Out", `Timed out by ${interaction.user.tag} for ${minutes} minute(s) for: ${reason}. Ends ${formattedUntil}`);
    await recordModerationEvent(guild, {
        type: "mute",
        guildId: guild.id,
        guildName: guild.name,
        targetUserId: targetUser.id,
        targetUserTag: targetUser.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason: `Muted for ${minutes} minute(s): ${reason}`
    });
    await interaction.reply({
        content: `✅ Timed out ${targetUser.tag} for ${minutes} minute(s) for: ${reason}`
    });
}
//# sourceMappingURL=mute.js.map