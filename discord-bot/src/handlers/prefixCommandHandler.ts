import {
    EmbedBuilder,
    Message,
    PermissionFlagsBits
} from "discord.js";

const PREFIX = "?";

/**
 * These commands are intentionally NOT restricted to
 * config.guildId — they work in every guild the bot is in.
 */
function canUsePrefixCommands(message: Message): boolean {
    if (!message.inGuild() || !message.member) return false;
    // Adjust this permission to taste; ManageMessages is a
    // reasonable default so random members can't spam embeds.
    return message.member.permissions.has(PermissionFlagsBits.ManageMessages);
}

export async function handlePrefixCommand(message: Message): Promise<boolean> {
    if (message.author.bot) return false;
    if (!message.content.startsWith(PREFIX)) return false;

    const withoutPrefix = message.content.slice(PREFIX.length);
    const commandName = withoutPrefix.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
    const body = withoutPrefix.slice(commandName.length).trim();

    switch (commandName) {
        case "embed":
            return handleEmbed(message, body);
        case "text":
            return handleText(message, body);
        default:
            return false;
    }
}

async function handleEmbed(message: Message, body: string): Promise<boolean> {
    if (!canUsePrefixCommands(message)) {
        await message.reply("⚠️ You don't have permission to use this command.");
        return true;
    }

    if (!body) {
        await message.reply("⚠️ Usage: `?embed Title | Description (markdown supported)`");
        return true;
    }

    // ?embed Title | Description
    // If there's no "|", the whole thing becomes the description with no title.
    const [titlePart, ...descParts] = body.split("|");
    const hasTitle = descParts.length > 0;
    const title = hasTitle ? titlePart.trim() : undefined;
    const description = (hasTitle ? descParts.join("|") : body).trim();

    if (description.length > 4096) {
        await message.reply("⚠️ Description is too long (max 4096 characters).");
        return true;
    }

    const embed = new EmbedBuilder().setDescription(description);
    if (title) embed.setTitle(title.slice(0, 256));

    await message.channel.send({ embeds: [embed] });

    if (message.deletable) {
        await message.delete().catch(() => {});
    }

    return true;
}

async function handleText(message: Message, body: string): Promise<boolean> {
    if (!canUsePrefixCommands(message)) {
        await message.reply("⚠️ You don't have permission to use this command.");
        return true;
    }

    if (!body) {
        await message.reply("⚠️ Usage: `?text Your message here`");
        return true;
    }

    if (body.length > 2000) {
        await message.reply("⚠️ Message is too long (max 2000 characters).");
        return true;
    }

    await message.channel.send({ content: body });

    if (message.deletable) {
        await message.delete().catch(() => {});
    }

    return true;
}