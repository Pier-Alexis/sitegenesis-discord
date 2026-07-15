import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ChannelType,
    TextChannel
} from "discord.js";

import { sendGameEvent } from "../services/logger.js";


export const data = new SlashCommandBuilder()
    .setName("testevent")
    .setDescription("Send a fake Roblox event");


export async function execute(
    interaction: ChatInputCommandInteraction
) {

    const channel =
        interaction.guild?.channels.cache.find(
            c => c.name === "game-events"
        );


    if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply(
            "❌ #game-events not found"
        );
        return;
    }


    await sendGameEvent(
        channel as TextChannel,
        "Player Joined",
        "TestPlayer"
    );


    await interaction.reply(
        "✅ Event sent"
    );
}