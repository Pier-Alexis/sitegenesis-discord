import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CategoryChannel,
    ChannelType,
    ChatInputCommandInteraction,
    ComponentType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} from "discord.js";
import { logDiscordCommandUsage } from "../services/logger.js";

const PRIORITY_CATEGORY_NAME = "PriorityCategory";

const CONFIRM_BUTTON_ID = "purgecategories_confirm";
const CANCEL_BUTTON_ID = "purgecategories_cancel";

const CONFIRMATION_TIMEOUT_MS = 30_000;

export const data = new SlashCommandBuilder()
    .setName("purgecategories")
    .setDescription("Delete every category on this server, except PriorityCategory")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false);

/**
 * Une catégorie est protégée si elle s'appelle "PriorityCategory",
 * qu'elle soit archivée ou non (ex: "(ARCHIVE) PriorityCategory").
 */
function isProtectedCategory(categoryName: string): boolean {
    const normalized = categoryName.trim().toLowerCase();

    return (
        normalized === PRIORITY_CATEGORY_NAME.toLowerCase() ||
        normalized === `(archive) ${PRIORITY_CATEGORY_NAME.toLowerCase()}`
    );
}

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

    await guild.channels.fetch();

    const categoryList = [...guild.channels.cache.values()].filter(
        (channel): channel is CategoryChannel =>
            channel.type === ChannelType.GuildCategory &&
            !isProtectedCategory(channel.name)
    );

    if (categoryList.length === 0) {
        await interaction.reply({
            content: `ℹ️ There are no categories to delete. Only \`${PRIORITY_CATEGORY_NAME}\` (or its archived version) exists, or the server has no categories.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const previewNames = categoryList
        .slice(0, 15)
        .map(category => `• ${category.name}`)
        .join("\n");

    const remainingCount = categoryList.length - 15;
    const preview =
        remainingCount > 0
            ? `${previewNames}\n…and ${remainingCount} more`
            : previewNames;

    const confirmRow =
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(CONFIRM_BUTTON_ID)
                .setLabel("Yes, delete them")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(CANCEL_BUTTON_ID)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.reply({
        content:
            `⚠️ **Are you sure?**\n` +
            `This will permanently delete **${categoryList.length}** ` +
            `categor${categoryList.length === 1 ? "y" : "ies"} (and every channel inside them), ` +
            `keeping only \`${PRIORITY_CATEGORY_NAME}\` (archived or not).\n\n` +
            `${preview}\n\n` +
            `This action **cannot be undone**.`,
        components: [confirmRow],
        flags: MessageFlags.Ephemeral
    });

    const confirmationMessage = await interaction.fetchReply();

    let buttonInteraction;

    try {
        buttonInteraction = await confirmationMessage.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: componentInteraction =>
                componentInteraction.user.id === interaction.user.id,
            time: CONFIRMATION_TIMEOUT_MS
        });
    } catch {
        await interaction.editReply({
            content: "⌛ Confirmation timed out. No category was deleted.",
            components: []
        });
        return;
    }

    if (buttonInteraction.customId === CANCEL_BUTTON_ID) {
        await buttonInteraction.update({
            content: "❌ Cancelled. No category was deleted.",
            components: []
        });
        return;
    }

    await buttonInteraction.update({
        content: `⏳ Deleting ${categoryList.length} categories, please wait…`,
        components: []
    });

    let deletedCategories = 0;
    let deletedChannels = 0;
    const errors: string[] = [];

    for (const category of categoryList) {
        try {
            const children = [...category.children.cache.values()];

            for (const child of children) {
                await child.delete(
                    `Category purge requested by ${interaction.user.tag}`
                ).catch(error => {
                    errors.push(`Failed to delete channel "${child.name}": ${error}`);
                });

                deletedChannels++;
            }

            await category.delete(
                `Category purge requested by ${interaction.user.tag}`
            );

            deletedCategories++;
        } catch (error) {
            errors.push(`Failed to delete category "${category.name}": ${error}`);
        }
    }

    const summary =
        `✅ Deleted **${deletedCategories}** categor${deletedCategories === 1 ? "y" : "ies"} ` +
        `and **${deletedChannels}** channel${deletedChannels === 1 ? "" : "s"}.` +
        (errors.length > 0
            ? `\n\n⚠️ ${errors.length} error(s) occurred:\n${errors.slice(0, 10).join("\n")}`
            : "");

    await interaction.editReply({
        content: summary,
        components: []
    });

    await logDiscordCommandUsage(
        guild,
        interaction.user,
        "purgecategories",
        `Deleted ${deletedCategories} categories / ${deletedChannels} channels`,
        interaction.channel && "name" in interaction.channel
            ? String(interaction.channel.name)
            : "unknown-channel"
    ).catch(error => {
        console.error("Failed to log purgecategories usage", error);
    });
}