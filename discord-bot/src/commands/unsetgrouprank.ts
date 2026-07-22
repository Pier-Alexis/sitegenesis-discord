import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import { buildModerationPayload, forwardModerationToBackend, resolveRobloxRankContext } from "../services/robloxBridge.js";

export const data = new SlashCommandBuilder()
    .setName("unsetgrouprank")
    .setDescription("Remove a user's role in the Roblox community/group (no replacement rank)")
    .addStringOption(option =>
        option
            .setName("roblox_username")
            .setDescription("Roblox username to remove the group role from")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Reason for the removal")
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
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
    const configuredGroupId = process.env.ROBLOX_GROUP_ID?.trim();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(robloxUsername)) {
        await interaction.reply({
            content: "⚠️ Enter a valid Roblox username (3-20 letters, numbers, or underscores).",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const payload = buildModerationPayload({
        action: "removeGroupRank",
        targetUserId: "",
        targetUsername: robloxUsername,
        reason,
        moderator: interaction.user.tag
    });

    try {
        const rankContext = await resolveRobloxRankContext({
            username: robloxUsername,
            ...(configuredGroupId
                ? { groupId: configuredGroupId }
                : {})
        }).catch(() => ({
            robloxUserId: null,
            currentRanks: [],
            newRankName: null
        }));

        await forwardModerationToBackend(payload);

        await recordModerationEvent(guild, {
            type: "unsetgrouprank",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: rankContext.robloxUserId ?? `roblox:${robloxUsername}`,
            targetUserTag: `${robloxUsername} (Roblox)`,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: `Removed group role. ${reason}`,
            currentRanks: rankContext.currentRanks,
            newRank: "None (role removed)"
        });

        await interaction.reply({
            content: `✅ Queued group role removal for ${robloxUsername}.`
        });
    } catch (error) {
        console.error("Failed to queue group role removal", error);
        await interaction.reply({
            content: "⚠️ Failed to queue the group role removal action.",
            flags: MessageFlags.Ephemeral
        });
    }
}