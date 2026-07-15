import { EmbedBuilder } from "discord.js";

export async function sendLog(channel:any, title:string, message:string) {

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(message)
        .setTimestamp();

    await channel.send({
        embeds:[embed]
    });
}