import { EmbedBuilder, TextChannel } from "discord.js";

export async function sendGameEvent(
    channel: TextChannel,
    event: string,
    player: string
) {

    const embed = new EmbedBuilder()
        .setTitle("🎮 Roblox Event")
        .addFields(
            {
                name: "Event",
                value: event
            },
            {
                name: "Player",
                value: player
            }
        )
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    });
}