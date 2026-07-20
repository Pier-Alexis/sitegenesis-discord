import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildPlayerSearchSummary } from "../services/robloxBridge.js";
export const data = new SlashCommandBuilder()
    .setName("playersearch")
    .setDescription("Search for a Roblox player and display their public profile details")
    .addStringOption(option => option
    .setName("username")
    .setDescription("The Roblox username to search")
    .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false);
export async function execute(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "⚠️ This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const username = interaction.options.getString("username", true);
    const summary = buildPlayerSearchSummary({
        username,
        displayName: username,
        userId: "unknown",
        groups: ["Group A", "Group B"],
        team: "Unassigned"
    });
    await interaction.reply({
        content: `🔎 Player search result for ${username}\n\n${summary}`
    });
}
//# sourceMappingURL=playersearch.js.map