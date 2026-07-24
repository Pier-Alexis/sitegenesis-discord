import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ChatInputCommandInteraction,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    type Guild
} from "discord.js";

import {
    buildModerationPayload,
    forwardModerationToBackend
} from "../services/robloxBridge.js";
import { logServerCommandUsage } from "../services/logger.js";
import {
    isAuthorizedForServerMsg,
    type ServerMsgPermission
} from "../services/serverMsgPermissions.js";

const ARCHIVE_PREFIX = "(ARCHIVE) ";
const SERVER_NAME_SEPARATOR = " - ";
const COMPONENT_TIMEOUT_MS = 60_000;
const MAX_SERVER_OPTIONS = 25;

/** Sentinel metadata.serverId value meaning "broadcast to every Roblox server". */
export const ALL_SERVERS_SENTINEL = "*";

type ParsedServerCategory = {
    serverName: string;
    serverId: string;
    isArchived: boolean;
};

type ServerCommandConfig = {
    commandName: string;
    description: string;
    radioUsername: string;
    permission: ServerMsgPermission;
    /** If true, skips the server picker and broadcasts to every Roblox server. */
    broadcastAll?: boolean;
};

function normalizeMessage(rawMessage: string) {
    return rawMessage
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseServerCategoryName(categoryName: string): ParsedServerCategory | null {
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

async function collectServerDirectory(guild: Guild) {
    await guild.channels.fetch();

    const byServerId = new Map<string, ParsedServerCategory>();

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

function buildServerOptions(serverDirectory: Map<string, ParsedServerCategory>) {
    return [...serverDirectory.values()]
        .sort((left, right) => left.serverName.localeCompare(right.serverName))
        .slice(0, MAX_SERVER_OPTIONS)
        .map(server => ({
            label: server.serverName.slice(0, 100),
            description: server.serverId.slice(0, 100),
            value: server.serverId
        }));
}

async function queueServerRadioMessage(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
    commandName: string,
    radioUsername: string,
    serverId: string,
    message: string,
    knownServerName: string | null
) {
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
        await logServerCommandUsage(
            guild,
            interaction.user,
            commandName,
            `${serverId} ${message}`,
            serverId,
            resolvedServerName
        );
    }
}

export function createServerMessageCommand(config: ServerCommandConfig) {
    const data = new SlashCommandBuilder()
        .setName(config.commandName)
        .setDescription(config.description)
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Message that should appear in-game")
                .setRequired(true)
                .setMaxLength(300)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false);

    async function execute(interaction: ChatInputCommandInteraction) {
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

        if (!isAuthorizedForServerMsg(interaction, config.permission)) {
            await interaction.reply({
                content: "⛔ You don't have permission to use this command.",
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

        if (config.broadcastAll) {
            await interaction.reply({
                content: `⏳ Queueing [${config.radioUsername}] radio message for every server...`,
                flags: MessageFlags.Ephemeral
            });

            try {
                await queueServerRadioMessage(
                    interaction,
                    guild,
                    config.commandName,
                    config.radioUsername,
                    ALL_SERVERS_SENTINEL,
                    message,
                    null
                );

                await interaction.editReply({
                    content: `✅ Queued [${config.radioUsername}] radio message for every server: ${message}`
                });
            } catch (error) {
                console.error(`Failed to queue ${config.commandName}`, error);

                await interaction.editReply({
                    content: "⚠️ Failed to queue the server message."
                });
            }

            return;
        }

        const serverDirectory = await collectServerDirectory(guild);
        const selectOptions = buildServerOptions(serverDirectory);

        const selectId = `${config.commandName}_select_server`;
        const customButtonId = `${config.commandName}_custom_server`;

        const serverSelect = new StringSelectMenuBuilder()
            .setCustomId(selectId)
            .setPlaceholder("Choose a target server")
            .setMinValues(1)
            .setMaxValues(1);

        if (selectOptions.length > 0) {
            serverSelect.addOptions(selectOptions);
        } else {
            serverSelect
                .addOptions({
                    label: "No tracked servers found",
                    description: "Use Custom Server ID instead",
                    value: "__no_servers__"
                })
                .setDisabled(true);
        }

        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(serverSelect);

        const customRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(customButtonId)
                    .setLabel("Use Custom Server ID")
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({
            content:
                `Choose where to send your [${config.radioUsername}] radio message.\n` +
                "Use the menu to pick a known server, or click the button to enter a custom server ID.",
            components: [selectRow, customRow],
            flags: MessageFlags.Ephemeral
        });

        const pickerMessage = await interaction.fetchReply();

        let serverId: string | null = null;
        let knownServerName: string | null = null;

        try {
            const pickerInteraction = await pickerMessage.awaitMessageComponent({
                filter: componentInteraction =>
                    componentInteraction.user.id === interaction.user.id &&
                    (componentInteraction.customId === selectId ||
                        componentInteraction.customId === customButtonId),
                time: COMPONENT_TIMEOUT_MS
            });

            if (pickerInteraction.isStringSelectMenu()) {
                serverId = pickerInteraction.values[0]?.trim() ?? null;
                knownServerName = serverId
                    ? serverDirectory.get(serverId)?.serverName ?? null
                    : null;

                await pickerInteraction.deferUpdate();
            } else {
                const modalId = `${config.commandName}_server_modal_${interaction.id}`;
                const serverIdFieldId = `${config.commandName}_serverid`;

                const modal = new ModalBuilder()
                    .setCustomId(modalId)
                    .setTitle("Custom Server ID")
                    .addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId(serverIdFieldId)
                                .setLabel("Roblox Server ID (JobId)")
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setMaxLength(200)
                                .setPlaceholder("Enter the exact server ID")
                        )
                    );

                await pickerInteraction.showModal(modal);

                const modalSubmit = await pickerInteraction.awaitModalSubmit({
                    filter: modalInteraction =>
                        modalInteraction.user.id === interaction.user.id &&
                        modalInteraction.customId === modalId,
                    time: COMPONENT_TIMEOUT_MS
                });

                serverId = modalSubmit.fields.getTextInputValue(serverIdFieldId).trim();
                knownServerName = serverId
                    ? serverDirectory.get(serverId)?.serverName ?? null
                    : null;

                await modalSubmit.deferUpdate();
            }
        } catch {
            await interaction.editReply({
                content: "⌛ Server selection timed out. Please run the command again.",
                components: []
            });
            return;
        }

        if (!serverId || serverId === "__no_servers__") {
            await interaction.editReply({
                content: "⚠️ Please provide a valid server ID.",
                components: []
            });
            return;
        }

        await interaction.editReply({
            content: `⏳ Queueing [${config.radioUsername}] radio message for server ${serverId}...`,
            components: []
        });

        try {
            await queueServerRadioMessage(
                interaction,
                guild,
                config.commandName,
                config.radioUsername,
                serverId,
                message,
                knownServerName
            );

            await interaction.editReply({
                content: `✅ Queued [${config.radioUsername}] radio message for server ${serverId}: ${message}`,
                components: []
            });
        } catch (error) {
            console.error(`Failed to queue ${config.commandName}`, error);

            await interaction.editReply({
                content: "⚠️ Failed to queue the server message.",
                components: []
            });
        }
    }

    return { data, execute };
}
