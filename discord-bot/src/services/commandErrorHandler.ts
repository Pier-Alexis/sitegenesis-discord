import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";

export async function handleCommandError(interaction: ChatInputCommandInteraction, error: unknown) {
    console.error("Command execution failed:", error);

    const fallbackMessage = "❌ An error occurred while executing this command.";

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: fallbackMessage,
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                content: fallbackMessage,
                flags: MessageFlags.Ephemeral
            });
        }

        return true;
    } catch (replyError) {
        console.error("Failed to send command error response:", replyError);
        return false;
    }
}
