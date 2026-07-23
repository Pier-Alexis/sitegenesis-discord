import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import { buildModerationPayload, forwardModerationToBackend, resolveRobloxUserIdByUsername } from "../services/robloxBridge.js";
import { notifyRobloxBanByUserId } from "../services/banNotification.js";

export const data = new SlashCommandBuilder()
    .setName("gameban")
    .setDescription("Banning a Roblox player from the experience")
    .addStringOption(option =>
        option
            .setName("roblox_username")
            .setDescription("Roblox username to ban")
            .setRequired(true)
    )

    .addStringOption(option =>
        option
            .setName("duration")
            .setDescription("Duration of the ban (e.g., 1d, 2h, 30m). Leave empty for a permanent ban.")
            .setRequired(false)
    )

    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Reason for the ban")
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

    /**
     * Everything past this point involves network calls
     * (Roblox API lookup, backend forward) that can easily
     * exceed Discord's 3-second reply window. Defer now so
     * we have up to 15 minutes to editReply with the result,
     * instead of risking a dead interaction token later.
     */
    await interaction.deferReply();

    const robloxUserId = await resolveRobloxUserIdByUsername(robloxUsername);

    if (!robloxUserId) {
        await interaction.editReply({
            content: "⚠️ I could not find that Roblox username."
        });
        return;
    }

    const payload = buildModerationPayload({
        action: "ban",
        targetUserId: robloxUserId,
        targetUsername: robloxUsername,
        reason,
        moderator: interaction.user.tag
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
            reason
        });

        const dmResult = await notifyRobloxBanByUserId({
            client: interaction.client,
            guild,
            robloxUserId,
            robloxUsername,
            reason
        });

        if (!dmResult.delivered) {
            console.warn("Roblox ban DM was not delivered", {
                robloxUserId,
                robloxUsername,
                reason: dmResult.reason
            });
        }

        await interaction.editReply({
            content: `✅ Queued a ban for ${robloxUsername} for: ${reason}`
        });

    } catch (error) {

        console.error("Failed to queue Roblox ban", error);

        await interaction.editReply({
            content: "⚠️ Failed to queue the ban action."
        });
    }
}
