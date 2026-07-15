import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("testlog")
    .setDescription("Send a fake Roblox event");

export async function execute(interaction: ChatInputCommandInteraction) {

    const channel = interaction.guild?.channels.cache.find(
        c => c.name === "game-events"
    );

    if (!channel || !channel.isTextBased()) {
        await interaction.reply("❌ Channel #game-events not found.");
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("🎮 Roblox Event")
        .addFields(
            {
                name: "Event",
                value: "Player Joined"
            },
            {
                name: "Player",
                value: "TestPlayer"
            }
        )
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    });

    await interaction.reply("✅ Test event sent!");
}