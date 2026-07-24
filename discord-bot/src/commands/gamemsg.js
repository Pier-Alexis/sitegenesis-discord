import {
    ActionRowBuilder,
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder
} from "discord.js";
import {
    buildModerationPayload,
    forwardModerationToBackend
} from "../services/robloxBridge.js";
import { logServerCommandUsage } from "../services/logger.js";
import {
    ADMIN_ONLY_PERMISSION,
    O5_COUNCIL_PERMISSION,
    SITE_DIRECTOR_PERMISSION,
    SYSTEM_GENESIS_PERMISSION,
    isAuthorizedForServerMsg
} from "../services/serverMsgPermissions.js";
const ARCHIVE_PREFIX = "(ARCHIVE) ";
const SERVER_NAME_SEPARATOR = " - ";
const COMPONENT_TIMEOUT_MS = 60000;
const MAX_SERVER_OPTIONS = 25;
const ALL_SERVERS_SENTINEL = "*";
const ANNOUNCEMENT_TYPES = [
    {
        id: "systemgenesis",
        label: "SystemGenesis",
        radioUsername: "SystemGenesis",
        permission: SYSTEM_GENESIS_PERMISSION
    },
    {
        id: "sitedirector",
        label: "SiteDirector",
        radioUsername: "SiteDirector",
        permission: SITE_DIRECTOR_PERMISSION
    },
    {
        id: "o5",
        label: "O5 Council",
        radioUsername: "O5 Council",
        permission: O5_COUNCIL_PERMISSION
    },
    {
        id: "admin",
        label: "The Administrator",
        radioUsername: "The Administrator",
        permission: ADMIN_ONLY_PERMISSION
    }
];
function normalizeMessage(rawMessage) {
    return rawMessage
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function parseServerCategoryName(categoryName) {
    const isArchived = categoryName.startsWith(ARCHIVE_PREFIX);
    const baseName = isArchived
        ? categoryName.slice(ARCHIVE_PREFIX.length)
        : categoryName;
    const separatorIndex = baseName.lastIndexOf(SERVER_NAME_SEPARATOR);
    if (separatorIndex <= 0) {
        return null;
    }
    const serverName = baseName.slice(0, separatorIndex).trim();
    const serverId = baseName.slice(separatorIndex + SERVER_NAME_SEPARATOR.length).trim();
    if (serverName.length === 0 || serverId.length === 0) {
        return null;
    }
    return {
        serverName,
        serverId,
        isArchived
    };
}
async function collectServerDirectory(guild) {
    await guild.channels.fetch();
    const byServerId = new Map();
    for (const channel of guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildCategory) {
            continue;
        }
        const parsed = parseServerCategoryName(channel.name);
        if (!parsed) {
            continue;
        }
        const existing = byServerId.get(parsed.serverId);
        if (!existing || (existing.isArchived && !parsed.isArchived)) {
            byServerId.set(parsed.serverId, parsed);
        }
    }
    return byServerId;
}
function buildServerOptions(serverDirectory) {
    return [...serverDirectory.values()]
        .sort((left, right) => left.serverName.localeCompare(right.serverName))
        .slice(0, MAX_SERVER_OPTIONS - 1)
        .map(server => ({
            label: server.serverName.slice(0, 100),
            description: server.serverId.slice(0, 100),
            value: server.serverId
        }));
}
function buildPromptContent(selectedTypeLabel, selectedServerLabel) {
    return [
        "Choose your announcement type and server.",
        `Type: ${selectedTypeLabel ?? "Not selected"}`,
        `Server: ${selectedServerLabel ?? "Not selected"}`
    ].join("\n");
}
function buildTypeMenu(allowedTypes, selectedTypeId) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("gamemsg_type")
        .setPlaceholder("Choose announcement type")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(allowedTypes.map(type => ({
        label: type.label,
        value: type.id,
        default: selectedTypeId === type.id
    })));
    return new ActionRowBuilder().addComponents(menu);
}
function buildServerMenu(serverDirectory, selectedServerId) {
    const knownOptions = buildServerOptions(serverDirectory);
    const everyOption = {
        label: "Every",
        description: "Broadcast to every Roblox server",
        value: ALL_SERVERS_SENTINEL,
        default: selectedServerId === ALL_SERVERS_SENTINEL
    };
    const options = [
        everyOption,
        ...knownOptions.map(option => ({
            ...option,
            default: selectedServerId === option.value
        }))
    ];
    const menu = new StringSelectMenuBuilder()
        .setCustomId("gamemsg_server")
        .setPlaceholder("Choose target server")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);
    return new ActionRowBuilder().addComponents(menu);
}
async function queueServerRadioMessage(interaction, guild, radioUsername, serverId, message, knownServerName) {
    const payload = buildModerationPayload({
        action: "serverMessage",
        targetUserId: "0",
        targetUsername: radioUsername,
        reason: message,
        moderator: interaction.user.tag,
        metadata: {
            serverId,
            senderTag: interaction.user.tag,
            source: "discord"
        }
    });
    await forwardModerationToBackend(payload);
    const resolvedServerName = knownServerName?.trim().length
        ? knownServerName
        : null;
    if (resolvedServerName) {
        await logServerCommandUsage(guild, interaction.user, "gamemsg", `${serverId} ${message}`, serverId, resolvedServerName);
    }
}
export const data = new SlashCommandBuilder()
    .setName("gamemsg")
    .setDescription("Send a radio announcement to one server or every server")
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
    const allowedTypeChecks = await Promise.all(ANNOUNCEMENT_TYPES.map(async (type) => ({
        type,
        allowed: await isAuthorizedForServerMsg(interaction, type.permission)
    })));
    const allowedTypes = allowedTypeChecks
        .filter(entry => entry.allowed)
        .map(entry => entry.type);
    if (allowedTypes.length === 0) {
        await interaction.reply({
            content: "⛔ You don't have permission to use any game message type.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const message = normalizeMessage(interaction.options.getString("message", true));
    if (message.length === 0) {
        await interaction.reply({
            content: "⚠️ Message cannot be empty.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const serverDirectory = await collectServerDirectory(guild);
    let selectedTypeId = null;
    let selectedServerId = null;
    await interaction.reply({
        content: buildPromptContent(null, null),
        components: [
            buildTypeMenu(allowedTypes, selectedTypeId),
            buildServerMenu(serverDirectory, selectedServerId)
        ],
        flags: MessageFlags.Ephemeral
    });
    const pickerMessage = await interaction.fetchReply();
    while (!selectedTypeId || !selectedServerId) {
        let pickerInteraction;
        try {
            pickerInteraction = await pickerMessage.awaitMessageComponent({
                filter: componentInteraction => componentInteraction.user.id === interaction.user.id &&
                    (componentInteraction.customId === "gamemsg_type" ||
                        componentInteraction.customId === "gamemsg_server"),
                time: COMPONENT_TIMEOUT_MS
            });
        }
        catch {
            await interaction.editReply({
                content: "⌛ Selection timed out. Please run /gamemsg again.",
                components: []
            });
            return;
        }
        if (!pickerInteraction.isStringSelectMenu()) {
            continue;
        }
        const value = pickerInteraction.values[0]?.trim() ?? null;
        if (!value) {
            await pickerInteraction.deferUpdate();
            continue;
        }
        if (pickerInteraction.customId === "gamemsg_type") {
            selectedTypeId = value;
        }
        if (pickerInteraction.customId === "gamemsg_server") {
            selectedServerId = value;
        }
        await pickerInteraction.deferUpdate();
        const selectedType = allowedTypes.find(type => type.id === selectedTypeId);
        const selectedServerLabel = selectedServerId === ALL_SERVERS_SENTINEL
            ? "Every"
            : (selectedServerId ? serverDirectory.get(selectedServerId)?.serverName ?? selectedServerId : null);
        await interaction.editReply({
            content: buildPromptContent(selectedType?.label ?? null, selectedServerLabel),
            components: [
                buildTypeMenu(allowedTypes, selectedTypeId),
                buildServerMenu(serverDirectory, selectedServerId)
            ]
        });
    }
    const selectedType = allowedTypes.find(type => type.id === selectedTypeId);
    if (!selectedType) {
        await interaction.editReply({
            content: "⚠️ Invalid announcement type selected.",
            components: []
        });
        return;
    }
    if (!await isAuthorizedForServerMsg(interaction, selectedType.permission)) {
        await interaction.editReply({
            content: "⛔ You don't have permission for that announcement type.",
            components: []
        });
        return;
    }
    const knownServerName = selectedServerId === ALL_SERVERS_SENTINEL
        ? null
        : (selectedServerId ? serverDirectory.get(selectedServerId)?.serverName ?? null : null);
    const queueTarget = selectedServerId === ALL_SERVERS_SENTINEL
        ? "every server"
        : `server ${selectedServerId}`;
    await interaction.editReply({
        content: `⏳ Queueing [${selectedType.radioUsername}] radio message for ${queueTarget}...`,
        components: []
    });
    try {
        await queueServerRadioMessage(interaction, guild, selectedType.radioUsername, selectedServerId, message, knownServerName);
        await interaction.editReply({
            content: selectedServerId === ALL_SERVERS_SENTINEL
                ? `✅ Queued [${selectedType.radioUsername}] radio message for every server: ${message}`
                : `✅ Queued [${selectedType.radioUsername}] radio message for server ${selectedServerId}: ${message}`
        });
    }
    catch (error) {
        console.error("Failed to queue gamemsg", error);
        await interaction.editReply({
            content: "⚠️ Failed to queue the server message."
        });
    }
}
