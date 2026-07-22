import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getModerationEvents, type ModerationEventType } from "../services/moderationLog.js";

const actionChoices = [
    { name: "Ban", value: "ban" },
    { name: "Unban", value: "unban" },
    { name: "Mute", value: "mute" },
    { name: "Unmute", value: "unmute" },
    { name: "Warnings", value: "warning" },
    { name: "Softbans", value: "softban" },
    { name: "Set Group Rank", value: "setgrouprank" },
    { name: "Remove Group Rank", value: "unsetgrouprank" }
] as const;

export const data = new SlashCommandBuilder()
    .setName("modlogs")
    .setDescription("View moderation events for a specific user")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The user whose moderation history you want to inspect")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("type")
            .setDescription("The moderation action to inspect")
            .setRequired(true)
            .addChoices(...actionChoices)
    );

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

    const targetUser = interaction.options.getUser("user", true);
    const type = interaction.options.getString("type", true) as ModerationEventType;

    const events = await getModerationEvents(guild, type, targetUser);
    const userEvents = events.filter(event => event.targetUserId === targetUser.id);

    if (!userEvents.length) {
        await interaction.reply({
            content: `No ${type} events found for ${targetUser.tag} in this server yet.`
        });
        return;
    }

    const lines = userEvents.map(event => {
        const timestamp = new Date(event.createdAt).toLocaleString();
        return `• ${timestamp} — ${event.targetUserTag} | by ${event.moderatorTag} | ${event.reason}`;
    });

    await interaction.reply({
        content: `📋 ${type} history for ${targetUser.tag} in ${guild.name}:\n${lines.join("\n")}`
    });
}