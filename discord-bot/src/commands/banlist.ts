import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { fetchActiveBans } from "../services/robloxBridge.js";
import { resolveDiscordIdFromRobloxUserId } from "../services/banNotification.js";

export const data = new SlashCommandBuilder()
    .setName("banlist")
    .setDescription("List all currently active Roblox game bans")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false);

function formatRemaining(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(" ");
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
        await interaction.reply({
            content: "⚠️ This command can only be used in a server.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply();

    let activeBans;
    try {
        activeBans = await fetchActiveBans();
    } catch (error) {
        console.error("Failed to fetch active bans", error);
        await interaction.editReply({ content: "⚠️ Failed to fetch the ban list from the backend." });
        return;
    }

    if (!activeBans.length) {
        await interaction.editReply({ content: "✅ No active bans right now." });
        return;
    }

    const now = Date.now();

    const lines = await Promise.all(activeBans.map(async ban => {
        const isPermanent = ban.duration === null || ban.duration === -1;
        const banType = isPermanent ? "Permanent" : "Temporary";

        const timeRemaining = isPermanent
            ? "Never (permanent)"
            : formatRemaining(Math.max(0, (ban.createdAt + ban.duration! * 1000) - now));

        let discordUserId: string | null = null;
        try {
            discordUserId = await resolveDiscordIdFromRobloxUserId(ban.userId);
        } catch {
            discordUserId = null;
        }

        let discordTag = "Unlinked";
        if (discordUserId) {
            try {
                const discordUser = await interaction.client.users.fetch(discordUserId);
                discordTag = discordUser.tag;
            } catch {
                discordTag = "Unknown Discord account";
            }
        }

        return [
            `**${ban.username}** — Roblox ID: \`${ban.userId}\``,
            `Discord: ${discordTag}${discordUserId ? ` (\`${discordUserId}\`)` : ""}`,
            `Type: ${banType} | Time left: ${timeRemaining}`,
            `Reason: ${ban.reason}`
        ].join("\n");
    }));

    // Discord caps messages at 2000 chars — split into multiple messages if the list is long.
    const header = `📋 **Active bans (${activeBans.length})**\n\n`;
    const chunks: string[] = [];
    let current = header;

    for (const line of lines) {
        const block = `${line}\n\n`;
        if ((current + block).length > 1900) {
            chunks.push(current);
            current = block;
        } else {
            current += block;
        }
    }
    if (current.trim().length) {
        chunks.push(current);
    }

    await interaction.editReply({ content: chunks[0] });
    for (const chunk of chunks.slice(1)) {
        await interaction.followUp({ content: chunk });
    }
}