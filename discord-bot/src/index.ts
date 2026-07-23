import {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    PermissionFlagsBits,
    type ChatInputCommandInteraction
} from "discord.js";

process.on("uncaughtException", error => {
    console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", reason => {
    console.error("Unhandled rejection:", reason);
});

import { config } from "./config.js";
import { handlePrefixCommand } from "./handlers/prefixCommandHandler.js";

import { commandModules } from "./commands/registry.js";
import {
    ensurePriorityAuditLogChannels,
    logDiscordCommandUsage,
    logMessageEvent,
    logUserEvent
} from "./services/logger.js";
import { handleCommandError } from "./services/commandErrorHandler.js";
import { startApi } from "./api.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});


type Command = {
    data: { name: string };
    execute: (interaction: any) => Promise<unknown>;
};

const commands = new Collection<string, Command>();

for (const commandModule of commandModules) {
    commands.set(
        commandModule.data.name,
        commandModule as Command
    );
}


/**
 * Vérifie si un événement vient du serveur Discord autorisé.
 *
 * Le bot ignore complètement tous les autres serveurs.
 */
function isAllowedGuild(guildId: string | null | undefined): boolean {
    if (!guildId) {
        return false;
    }

    if (!config.guildId) {
        console.error(
            "GUILD_ID is not configured. Ignoring Discord event."
        );

        return false;
    }

    return guildId === config.guildId;
}

function formatCommandOptions(
    interaction: ChatInputCommandInteraction
) {
    type SerializableCommandOption = {
        name: string;
        value?: unknown;
        options?: readonly SerializableCommandOption[];
    };

    const pieces: string[] = [];

    const walk = (
        options: readonly SerializableCommandOption[],
        pathPrefix = ""
    ) => {
        for (const option of options) {
            const path = pathPrefix
                ? `${pathPrefix}.${option.name}`
                : option.name;

            if (Array.isArray(option.options) && option.options.length > 0) {
                walk(option.options, path);
                continue;
            }

            if (typeof option.value !== "undefined") {
                pieces.push(`${path}=${String(option.value)}`);
            }
        }
    };

    walk(interaction.options.data as readonly SerializableCommandOption[]);

    return pieces.join(" | ");
}


client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}`);

    console.log(
        `Bot restricted to Discord guild: ${config.guildId}`
    );

    startApi(client);

    if (config.guildId) {
        client.guilds.fetch(config.guildId)
            .then(guild => ensurePriorityAuditLogChannels(guild))
            .catch(error => {
                console.error(
                    `Failed to ensure PriorityCategory audit channels for guild ${config.guildId}:`,
                    error
                );
            });
    }

    client.user?.setActivity(
        "Site Genesis Development"
    );
});


/**
 * USER JOINED
 */
client.on(Events.GuildMemberAdd, async member => {

    if (!isAllowedGuild(member.guild.id)) {
        return;
    }

    if (member.user.bot) {
        return;
    }

    await logUserEvent(
        member.guild,
        member.user,
        "User Joined",
        `${member.user.tag} joined the server.`
    );
});


/**
 * USER LEFT
 */
client.on(Events.GuildMemberRemove, async member => {

    if (!isAllowedGuild(member.guild.id)) {
        return;
    }

    if (member.user.bot) {
        return;
    }

    await logUserEvent(
        member.guild,
        member.user,
        "User Left",
        `${member.user.tag} left the server.`
    );
});


/**
 * USER BANNED
 */
client.on(Events.GuildBanAdd, async banEntry => {

    if (!isAllowedGuild(banEntry.guild.id)) {
        return;
    }

    if (banEntry.user.bot) {
        return;
    }

    await logUserEvent(
        banEntry.guild,
        banEntry.user,
        "User Banned",
        "The user was banned from the server."
    );
});


/**
 * USER UNBANNED
 */
client.on(Events.GuildBanRemove, async banEntry => {

    if (!isAllowedGuild(banEntry.guild.id)) {
        return;
    }

    if (banEntry.user.bot) {
        return;
    }

    await logUserEvent(
        banEntry.guild,
        banEntry.user,
        "User Unbanned",
        "The user was unbanned from the server."
    );
});


/**
 * USER UPDATED
 *
 * Detects:
 * - Nickname changes
 * - Role additions
 * - Role removals
 */
client.on(
    Events.GuildMemberUpdate,
    async (oldMember, newMember) => {

        if (!isAllowedGuild(newMember.guild.id)) {
            return;
        }

        if (newMember.user.bot) {
            return;
        }

        const nicknameChanged =
            oldMember.nickname !== newMember.nickname;

        const oldRoleIds =
            new Set(oldMember.roles.cache.keys());

        const newRoleIds =
            new Set(newMember.roles.cache.keys());

        const rolesChanged =
            oldRoleIds.size !== newRoleIds.size ||
            [...oldRoleIds].some(
                id => !newRoleIds.has(id)
            );

        if (!nicknameChanged && !rolesChanged) {
            return;
        }

        const changes: string[] = [];

        if (nicknameChanged) {
            changes.push(
                `Nickname: ${
                    oldMember.nickname ?? "None"
                } -> ${
                    newMember.nickname ?? "None"
                }`
            );
        }

        if (rolesChanged) {

            const addedRoles =
                [...newRoleIds].filter(
                    id => !oldRoleIds.has(id)
                );

            const removedRoles =
                [...oldRoleIds].filter(
                    id => !newRoleIds.has(id)
                );

            if (addedRoles.length) {
                changes.push(
                    `Added roles: ${
                        addedRoles
                            .map(id => `<@&${id}>`)
                            .join(", ")
                    }`
                );
            }

            if (removedRoles.length) {
                changes.push(
                    `Removed roles: ${
                        removedRoles
                            .map(id => `<@&${id}>`)
                            .join(", ")
                    }`
                );
            }
        }

        await logUserEvent(
            newMember.guild,
            newMember.user,
            "User Updated",
            changes.join("\n")
        );
    }
);

/**
 * PREFIX COMMANDS (?embed, ?text)
 *
 * Unlike everything else in this file, these are NOT gated
 * by isAllowedGuild() — they work in every guild the bot is
 * a member of, not just config.guildId.
 */
client.on(Events.MessageCreate, async message => {
    await handlePrefixCommand(message).catch(error => {
        console.error("Error handling prefix command:", error);
    });
});

/**
 * VOICE STATE UPDATE
 *
 * Detects:
 * - Voice channel joined
 * - Voice channel left
 * - Voice channel moved
 */
client.on(
    Events.VoiceStateUpdate,
    async (oldState, newState) => {

        if (!isAllowedGuild(newState.guild.id)) {
            return;
        }

        const member = newState.member;

        if (!member || member.user.bot) {
            return;
        }

        if (
            !oldState.channelId &&
            newState.channelId
        ) {

            await logUserEvent(
                newState.guild,
                member.user,
                "Voice Joined",
                `Joined voice channel: ${
                    newState.channel?.name ?? "unknown"
                }`
            );

        } else if (
            oldState.channelId &&
            !newState.channelId
        ) {

            await logUserEvent(
                newState.guild,
                member.user,
                "Voice Left",
                `Left voice channel: ${
                    oldState.channel?.name ?? "unknown"
                }`
            );

        } else if (
            oldState.channelId &&
            newState.channelId &&
            oldState.channelId !== newState.channelId
        ) {

            await logUserEvent(
                newState.guild,
                member.user,
                "Voice Moved",
                `Moved from ${
                    oldState.channel?.name ?? "unknown"
                } to ${
                    newState.channel?.name ?? "unknown"
                }`
            );
        }
    }
);


/**
 * MESSAGE DELETED
 */
client.on(
    Events.MessageDelete,
    async message => {

        if (
            !message.guild ||
            !isAllowedGuild(message.guild.id)
        ) {
            return;
        }

        if (
            !message.author ||
            message.author.bot
        ) {
            return;
        }

        await logMessageEvent(
            message.guild,
            message.author,
            "Message Deleted",
            message,
            `Content: ${
                message.content || "(empty)"
            }`
        );
    }
);


/**
 * MESSAGE EDITED
 */
client.on(
    Events.MessageUpdate,
    async (oldMessage, newMessage) => {

        if (
            !newMessage.guild ||
            !isAllowedGuild(newMessage.guild.id)
        ) {
            return;
        }

        if (
            newMessage.author?.bot ||
            oldMessage.content === newMessage.content
        ) {
            return;
        }

        if (!newMessage.author) {
            return;
        }

        await logMessageEvent(
            newMessage.guild,
            newMessage.author,
            "Message Edited",
            newMessage,
            `Before: ${
                oldMessage.content || "(empty)"
            }\nAfter: ${
                newMessage.content || "(empty)"
            }`
        );
    }
);


/**
 * DISCORD COMMANDS
 *
 * Commands from other Discord servers
 * are completely ignored.
 */
client.on(
    Events.InteractionCreate,
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        if (
            !interaction.guild ||
            !isAllowedGuild(interaction.guild.id)
        ) {
            return;
        }

        const command =
            commands.get(
                interaction.commandName
            );

        if (!command) {
            return;
        }

        const isAdminInvoker =
            interaction.memberPermissions?.has(
                PermissionFlagsBits.Administrator
            ) ?? false;

        if (isAdminInvoker) {
            const sourceChannelName =
                interaction.channel?.isTextBased() &&
                "name" in interaction.channel &&
                typeof interaction.channel.name === "string"
                    ? interaction.channel.name
                    : "unknown-channel";

            await logDiscordCommandUsage(
                interaction.guild,
                interaction.user,
                interaction.commandName,
                formatCommandOptions(interaction),
                sourceChannelName
            );
        }

        /**
         * Safeguard against the 3-second interaction
         * response window.
         *
         * If a command hasn't replied or deferred within
         * 2 seconds (e.g. it's doing a slow DB call, API
         * request, etc. before its first reply), we defer
         * automatically. This keeps the interaction token
         * alive for up to 15 minutes and prevents
         * "Unknown interaction" (10062) errors later,
         * including inside the error handler itself.
         */
        const deferTimer = setTimeout(() => {
            if (!interaction.replied && !interaction.deferred) {
                interaction.deferReply().catch(deferError => {
                    console.error(
                        `Failed to auto-defer interaction for command "${interaction.commandName}":`,
                        deferError
                    );
                });
            }
        }, 2000);

        try {

            await command.execute(
                interaction
            );

        } catch (error) {

            await handleCommandError(
                interaction,
                error
            );

        } finally {

            clearTimeout(deferTimer);
        }
    }
);


client.login(config.token);
