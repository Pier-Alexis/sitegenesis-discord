import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import {
    buildModerationPayload,
    fetchLatestBanForUser,
    forwardModerationToBackend,
    resolveRobloxUserIdByUsername
} from "../services/robloxBridge.js";
import { notifyRobloxBanByUserId } from "../services/banNotification.js";
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

    const existingBan = await fetchLatestBanForUser(robloxUserId);

    if (!existingBan) {
        await interaction.editReply({ content: "⚠️ No existing ban found for that user." });
        return;
    }

    /**
     * Roblox's BanAsync only lets us set the reason by re-issuing the ban,
     * and its Duration parameter is always measured from the moment of the
     * call — NOT from the original ban time. If we naively resent the
     * original duration, a temp ban with 2 days left would silently jump
     * back up to its full original length just from editing the reason.
     *
     * So we compute the *remaining* time instead and send that, preserving
     * the ban's real end date. Permanent bans (duration null or -1) pass
     * through unchanged, since there's no clock to preserve.
     */
    let remainingDuration: number | undefined;

    const isPermanent = existingBan.duration === null || existingBan.duration === -1;

    if (isPermanent) {
        remainingDuration = -1;
    } else {
        const elapsedSeconds = Math.floor((Date.now() - existingBan.createdAt) / 1000);
        const remaining = existingBan.duration! - elapsedSeconds;

        if (remaining <= 0) {
            await interaction.editReply({
                content: "⚠️ That ban has already expired — nothing to edit. Use `/gameban` to issue a new one."
            });
            return;
        }

        remainingDuration = remaining;
    }

    const payload = buildModerationPayload({
        action: "ban",
        targetUserId: robloxUserId,
        targetUsername: robloxUsername,
        reason,
        moderator: interaction.user.tag,
        duration: remainingDuration
    });

    try {
        await forwardModerationToBackend(payload);

        await recordModerationEvent(guild, {
            type: "ban",
            source: "discord",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: robloxUserId,
            targetUserTag: `${robloxUsername} (Roblox)`,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: `[Reason edited] ${reason}`
        });

        const dmResult = await notifyRobloxBanByUserId({
            client: interaction.client,
            guild,
            robloxUserId,
            robloxUsername,
            reason
        });

        if (!dmResult.delivered) {
            console.warn("Roblox ban-edit DM was not delivered", {
                robloxUserId,
                robloxUsername,
                reason: dmResult.reason
            });
        }

        await interaction.editReply({
            content: isPermanent
                ? `✅ Updated ban reason for ${robloxUsername} to: ${reason}`
                : `✅ Updated ban reason for ${robloxUsername} to: ${reason} (remaining duration preserved, ~${Math.ceil(remainingDuration! / 3600)}h left)`
        });

    } catch (error) {
        console.error("Failed to edit Roblox ban reason", error);
        await interaction.editReply({ content: "⚠️ Failed to update the ban reason." });
    }
}