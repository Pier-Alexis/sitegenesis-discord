import {
    Client,
    Collection,
    Events,
    GatewayIntentBits
} from "discord.js";

process.on("uncaughtException", error => {
    console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", reason => {
    console.error("Unhandled rejection:", reason);
});

import { config } from "./config.js";

import { commandModules } from "./commands/registry.js";
import { logMessageEvent, logUserEvent } from "./services/logger.js";


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
    commands.set(commandModule.data.name, commandModule as Command);
}


client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}`);

    client.user?.setActivity("Site Genesis Development");
});

client.on(Events.GuildMemberAdd, async member => {
    await logUserEvent(member.guild, member.user, "User Joined", `${member.user.tag} joined the server.`);
});

client.on(Events.GuildMemberRemove, async member => {
    await logUserEvent(member.guild, member.user, "User Left", `${member.user.tag} left the server.`);
});

client.on(Events.GuildBanAdd, async banEntry => {
    await logUserEvent(banEntry.guild, banEntry.user, "User Banned", "The user was banned from the server.");
});

client.on(Events.GuildBanRemove, async banEntry => {
    await logUserEvent(banEntry.guild, banEntry.user, "User Unbanned", "The user was unbanned from the server.");
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const nicknameChanged = oldMember.nickname !== newMember.nickname;
    const oldRoleIds = new Set(oldMember.roles.cache.keys());
    const newRoleIds = new Set(newMember.roles.cache.keys());
    const rolesChanged = oldRoleIds.size !== newRoleIds.size || [...oldRoleIds].some(id => !newRoleIds.has(id));

    if (!nicknameChanged && !rolesChanged) {
        return;
    }

    const changes: string[] = [];

    if (nicknameChanged) {
        changes.push(`Nickname: ${oldMember.nickname ?? "None"} -> ${newMember.nickname ?? "None"}`);
    }

    if (rolesChanged) {
        const addedRoles = [...newRoleIds].filter(id => !oldRoleIds.has(id));
        const removedRoles = [...oldRoleIds].filter(id => !newRoleIds.has(id));
        if (addedRoles.length) {
            changes.push(`Added roles: ${addedRoles.map(id => `<@&${id}>`).join(", ")}`);
        }
        if (removedRoles.length) {
            changes.push(`Removed roles: ${removedRoles.map(id => `<@&${id}>`).join(", ")}`);
        }
    }

    await logUserEvent(newMember.guild, newMember.user, "User Updated", changes.join("\n"));
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) {
        return;
    }

    if (!oldState.channelId && newState.channelId) {
        await logUserEvent(newState.guild, member.user, "Voice Joined", `Joined voice channel: ${newState.channel?.name ?? "unknown"}`);
    } else if (oldState.channelId && !newState.channelId) {
        await logUserEvent(newState.guild, member.user, "Voice Left", `Left voice channel: ${oldState.channel?.name ?? "unknown"}`);
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        await logUserEvent(newState.guild, member.user, "Voice Moved", `Moved from ${oldState.channel?.name ?? "unknown"} to ${newState.channel?.name ?? "unknown"}`);
    }
});

client.on(Events.MessageDelete, async message => {
    if (!message.guild || !message.author || message.author.bot) {
        return;
    }

    await logMessageEvent(message.guild, message.author, "Message Deleted", message, `Content: ${message.content || "(empty)"}`);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot || oldMessage.content === newMessage.content) {
        return;
    }

    await logMessageEvent(newMessage.guild, newMessage.author, "Message Edited", newMessage, `Before: ${oldMessage.content || "(empty)"}\nAfter: ${newMessage.content || "(empty)"}`);
});

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isChatInputCommand())
        return;

    const command = commands.get(interaction.commandName);

    if (!command)
        return;

    try {
        await command.execute(interaction);
    }
    catch(error) {
        console.error(error);
        await interaction.reply("❌ Error executing command.");
    }

});


client.login(config.token);