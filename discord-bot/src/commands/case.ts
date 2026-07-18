import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { forwardCaseToBackend } from "../services/robloxBridge.js";

export const data = new SlashCommandBuilder()
    .setName("case")
    .setDescription("Create a moderation case entry for a Roblox or Discord punishment")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The user to log a case for")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("reason")
            .setDescription("Reason for the case")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("type")
            .setDescription("Case type")
            .setRequired(false)
            .addChoices(
                { name: "Warning", value: "warning" },
                { name: "Mute", value: "mute" },
                { name: "Ban", value: "ban" }
            )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "⚠️ This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    const type = interaction.options.getString("type") ?? "warning";

    await forwardCaseToBackend({
        moderator: interaction.user.tag,
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        reason,
        type
    });

    await interaction.reply({ content: `📝 Case recorded for ${targetUser.tag} (${type}).` });
}
