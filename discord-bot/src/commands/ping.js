import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
export const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!");
export async function execute(interaction) {
    await interaction.reply({
        content: `🏓 Pong! Latency: ${interaction.client.ws.ping}ms`
    });
}
//# sourceMappingURL=ping.js.map