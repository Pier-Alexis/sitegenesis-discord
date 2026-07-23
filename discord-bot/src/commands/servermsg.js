import {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} from "discord.js";
import {
    buildModerationPayload,
    forwardModerationToBackend
} from "../services/robloxBridge.js";
import { logServerCommandUsage } from "../services/logger.js";
function normalizeMessage(rawMessage) {
    return rawMessage
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
async function resolveServerNameById(guild, serverId) {
    await guild.channels.fetch();
    const suffix = ` - ${serverId}`;
    const category = guild.channels.cache.find(channel => {
        if (channel.type !== ChannelType.GuildCategory) {
            return false;
        }
        const baseName = channel.name.startsWith("(ARCHIVE) ")
            ? channel.name.slice("(ARCHIVE) ".length)
            : channel.name;
        return baseName.endsWith(suffix);
    });
    if (!category) {
        return null;
    }
    const baseName = category.name.startsWith("(ARCHIVE) ")
        ? category.name.slice("(ARCHIVE) ".length)
        : category.name;
    return baseName.slice(0, Math.max(0, baseName.length - suffix.length));
}
export const data = new SlashCommandBuilder()
    .setName("servermsg")
    .setDescription("Send a [SystemGenesis] radio message to a specific Roblox server")
    .addStringOption(option => option
    .setName("serverid")
    .setDescription("Target Roblox server ID (JobId)")
    .setRequired(true))
    .addStringOption(option => option
    .setName("message")
    .setDescription("Message that should appear in-game")
    .setRequired(true)
    .setMaxLength(300))
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
    const serverId = interaction.options.getString("serverid", true).trim();
    const message = normalizeMessage(interaction.options.getString("message", true));
    if (serverId.length === 0) {
        await interaction.reply({
            content: "⚠️ Server ID cannot be empty.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    if (message.length === 0) {
        await interaction.reply({
            content: "⚠️ Message cannot be empty.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    await interaction.deferReply();
    try {
        const payload = buildModerationPayload({
            action: "serverMessage",
            targetUserId: "0",
            targetUsername: "SystemGenesis",
            reason: message,
            moderator: interaction.user.tag,
            metadata: {
                serverId,
                senderTag: interaction.user.tag,
                source: "discord"
            }
        });
        await forwardModerationToBackend(payload);
        const resolvedServerName = await resolveServerNameById(guild, serverId);
        if (resolvedServerName) {
            await logServerCommandUsage(guild, interaction.user, "servermsg", `${serverId} ${message}`, serverId, resolvedServerName);
        }
        await interaction.editReply({
            content: `✅ Queued [SystemGenesis] radio message for server ${serverId}: ${message}`
        });
    }
    catch (error) {
        console.error("Failed to queue servermsg", error);
        await interaction.editReply({
            content: "⚠️ Failed to queue the server message."
        });
    }
}
//# sourceMappingURL=servermsg.js.map
