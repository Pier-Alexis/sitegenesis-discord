import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} from "discord.js";
import { MANAGED_GROUPS, VERIFY_BUTTON_ID } from "../services/groupRoleSync.js";

export const data = new SlashCommandBuilder()
    .setName("setupverify")
    .setDescription("Post the Site: 45 group verification embed in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.channel?.isTextBased()) {
        await interaction.reply({
            content: "⚠️ This command can only be used in a server text channel.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const groupList = MANAGED_GROUPS
        .map(group => `• **${group.shortCode}** — ${group.groupName}`)
        .join("\n");

    const embed = new EmbedBuilder()
        .setTitle("🔗 Site: 45 — Group Verification")
        .setDescription(
            "Click **Verify** below to sync your Discord roles with your current Roblox rank " +
            "across every Site: 45 department.\n\n" +
            "You need to be linked with Bloxlink first (run Bloxlink's `/verify` if you haven't) — " +
            "this only reads the Roblox account already linked to your Discord account, it doesn't " +
            "link one itself.\n\n" +
            `**Departments checked:**\n${groupList}`
        )
        .setColor(0x5865f2)
        .setFooter({ text: "Ranks change? Just click Verify again to re-sync." });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(VERIFY_BUTTON_ID)
            .setLabel("Verify")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🔗")
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });

    await interaction.reply({
        content: "✅ Verification embed posted.",
        flags: MessageFlags.Ephemeral
    });
}