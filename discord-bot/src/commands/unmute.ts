import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import {
    buildModerationPayload,
    forwardModerationToBackend,
    resolveRobloxUserIdByUsername
} from "../services/robloxBridge.js";

export const data = new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a Roblox player in-game")
    .addStringOption(option =>
        option
            .setName("roblox_username")
            .setDescription("Roblox username to unmute")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Reason for unmuting")
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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

    const robloxUsername = interaction.options.getString("roblox_username", true).trim();
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(robloxUsername)) {
        await interaction.reply({
            content: "⚠️ Enter a valid Roblox username (3-20 letters, numbers, or underscores).",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const robloxUserId = await resolveRobloxUserIdByUsername(robloxUsername);

    if (!robloxUserId) {
        await interaction.reply({
            content: "⚠️ I could not find that Roblox username.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const payload = buildModerationPayload({
        action: "unmute",
        targetUserId: robloxUserId,
        targetUsername: robloxUsername,
        reason,
        moderator: interaction.user.tag
    });

    try {
        await forwardModerationToBackend(payload);

        await recordModerationEvent(guild, {
            type: "unmute",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: robloxUserId,
            targetUserTag: `${robloxUsername} (Roblox)`,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason
        });

        await interaction.reply({
            content: `✅ Queued an in-game unmute for ${robloxUsername}`
        });
    } catch (error) {
        console.error("Failed to queue Roblox unmute", error);
        await interaction.reply({
            content: "⚠️ Failed to queue the unmute action.",
            flags: MessageFlags.Ephemeral
        });
    }
}
