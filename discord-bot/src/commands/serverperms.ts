import {
    CategoryChannel,
    ChannelType,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} from "discord.js";
import { logDiscordCommandUsage } from "../services/logger.js";
import {
    buildServerCategoryPermissionOverwrites,
    hasServerCategoryPermissions
} from "../services/serverCategoryPermissions.js";
import {
    ARCHIVE_PREFIX,
    resolveServerIdFromCategoryName
} from "../services/serverCodenames.js";

type PermissionScope = "archived" | "active" | "all";

const SCOPE_LABELS: Record<PermissionScope, string> = {
    archived: "archived",
    active: "active",
    all: "all"
};

export const data = new SlashCommandBuilder()
    .setName("serverperms")
    .setDescription("Apply configured role permissions to Roblox server categories")
    .addStringOption(option =>
        option
            .setName("scope")
            .setDescription("Which server categories to update")
            .setRequired(true)
            .addChoices(
                { name: "Archived only", value: "archived" },
                { name: "Active only", value: "active" },
                { name: "All (archived + active)", value: "all" }
            )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false);

function matchesScope(categoryName: string, scope: PermissionScope): boolean {
    const isArchived = categoryName.startsWith(ARCHIVE_PREFIX);

    if (scope === "archived") {
        return isArchived;
    }

    if (scope === "active") {
        return !isArchived;
    }

    return true;
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

    const scope = interaction.options.getString("scope", true) as PermissionScope;
    const scopeLabel = SCOPE_LABELS[scope];

    await guild.channels.fetch();

    const categoryList = [...guild.channels.cache.values()].filter(
        (channel): channel is CategoryChannel =>
            channel.type === ChannelType.GuildCategory &&
            resolveServerIdFromCategoryName(channel.name) !== null &&
            matchesScope(channel.name, scope)
    );

    if (categoryList.length === 0) {
        await interaction.reply({
            content: `ℹ️ There are no ${scopeLabel} server categories to update.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const overwrites = buildServerCategoryPermissionOverwrites(
        guild.roles.everyone.id
    );

    let applied = 0;
    let alreadyConfigured = 0;
    let syncedChannels = 0;
    const errors: string[] = [];

    for (const category of categoryList) {
        try {
            if (!hasServerCategoryPermissions(category)) {
                await category.permissionOverwrites.set(
                    overwrites,
                    "Apply configured server category role permissions"
                );
                applied++;
            } else {
                alreadyConfigured++;
            }

            for (const child of category.children.cache.values()) {
                await child.permissionOverwrites.set(
                    overwrites,
                    "Sync child channel to server category role permissions"
                );
                syncedChannels++;
            }
        } catch (error) {
            errors.push(`Failed to update category "${category.name}": ${error}`);
        }
    }

    const summary =
        `✅ Updated **${applied}** ${scopeLabel} categor${applied === 1 ? "y" : "ies"} ` +
        `(skipped **${alreadyConfigured}** already configured) and ` +
        `synced **${syncedChannels}** child channel${syncedChannels === 1 ? "" : "s"}.` +
        (errors.length > 0
            ? `\n\n⚠️ ${errors.length} error(s) occurred:\n${errors.slice(0, 10).join("\n")}`
            : "");

    await interaction.editReply({ content: summary });

    await logDiscordCommandUsage(
        guild,
        interaction.user,
        "serverperms",
        `scope=${scope}; Applied ${applied} / skipped ${alreadyConfigured} / synced ${syncedChannels} child channels`,
        interaction.channel && "name" in interaction.channel
            ? String(interaction.channel.name)
            : "unknown-channel"
    ).catch(error => {
        console.error("Failed to log serverperms usage", error);
    });
}
