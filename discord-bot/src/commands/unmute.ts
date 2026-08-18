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

async function respond(
    interaction: ChatInputCommandInteraction,
    content: string,
    ephemeral = false
) {
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content });
        return;
    }

    await interaction.reply({
        content,
        ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {})
    });
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await respond(interaction, "⚠️ This command can only be used in a server.", true);
        return;
    }

    const guild = interaction.guild;
    if (!guild) {
        await respond(interaction, "⚠️ I could not access this server information.", true);
        return;
    }

    const robloxUsername = interaction.options.getString("roblox_username", true).trim();
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    console.log("[unmute] Received command", {
        guildId: guild.id,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        robloxUsername,
        reason
    });

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(robloxUsername)) {
        await respond(
            interaction,
            "⚠️ Enter a valid Roblox username (3-20 letters, numbers, or underscores).",
            true
        );
        return;
    }

    const robloxUserId = await resolveRobloxUserIdByUsername(robloxUsername);

    console.log("[unmute] Roblox username resolution result", {
        robloxUsername,
        robloxUserId
    });

    if (!robloxUserId) {
        await respond(interaction, "⚠️ I could not find that Roblox username.", true);
        return;
    }

    const payload = buildModerationPayload({
        action: "unmute",
        targetUserId: robloxUserId,
        targetUsername: robloxUsername,
        reason,
        moderator: interaction.user.tag
    });

    console.log("[unmute] Sending moderation payload", payload);

    try {
        const backendResponse = await forwardModerationToBackend(payload);

        console.log("[unmute] Backend accepted moderation payload", {
            robloxUsername,
            robloxUserId,
            backendResponse
        });

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

        await respond(interaction, `✅ Queued an in-game unmute for ${robloxUsername}`);
    } catch (error) {
        console.error("[unmute] Failed to queue Roblox unmute", {
            robloxUsername,
            robloxUserId,
            error
        });
        await respond(interaction, "⚠️ Failed to queue the unmute action.", true);
    }
}
