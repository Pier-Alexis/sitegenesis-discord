import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import { forwardBanReasonEditToBackend, resolveRobloxUserIdByUsername } from "../services/robloxBridge.js";
import { ensureOutranksTarget } from "../services/groupRankGuard.js";

export const data = new SlashCommandBuilder()
    .setName("editgameban")
    .setDescription("Edit the reason of an existing Roblox game ban")
    .addStringOption(option =>
        option
            .setName("roblox_username")
            .setDescription("Roblox username of the banned player")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("New reason for the ban")
            .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
        await interaction.reply({
            content: "⚠️ This command can only be used in a server.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const guild = interaction.guild;
    const robloxUsername = interaction.options.getString("roblox_username", true).trim();
    const reason = interaction.options.getString("reason", true).trim();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(robloxUsername)) {
        await interaction.reply({
            content: "⚠️ Enter a valid Roblox username (3-20 letters, numbers, or underscores).",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply();

    const robloxUserId = await resolveRobloxUserIdByUsername(robloxUsername);

    if (!robloxUserId) {
        await interaction.editReply({ content: "⚠️ I could not find that Roblox username." });
        return;
    }

    const rankCheck = await ensureOutranksTarget(interaction.user.id, robloxUserId);
    if (!rankCheck.allowed) {
        await interaction.editReply({ content: `⛔ ${rankCheck.reason}` });
        return;
    }

    try {
        await forwardBanReasonEditToBackend({
            userId: robloxUserId,
            reason,
            moderator: interaction.user.tag
        });

        await recordModerationEvent(guild, {
            type: "ban",
            source: "discord",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: robloxUserId,
            targetUserTag: `${robloxUsername} (Roblox)`,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: `[Edited] ${reason}`
        });

        await interaction.editReply({
            content: `✅ Updated ban reason for ${robloxUsername} to: ${reason}`
        });
    } catch (error) {
        console.error("Failed to edit Roblox ban reason", error);
        await interaction.editReply({ content: "⚠️ Failed to update the ban reason." });
    }
}