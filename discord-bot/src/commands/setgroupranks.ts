import { isAuthorizedRankEditor } from "../services/rankEditAuthorization.js";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Client,
    GuildMember,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";
import { getRobloxId } from "../services/bloxlinkSync.js";
import { scheduleMemberGroupRoleSync } from "../services/groupRoleSync.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import { MAIN_GUILD_ID } from "../services/serverMsgPermissions.js";
import {
    buildModerationPayload,
    fetchAssignableGroupRoles,
    forwardModerationToBackend,
    isManagedGroupName,
    resolveRobloxGroupMemberships,
    resolveRobloxUserIdByUsername,
    type RobloxGroupMembership
} from "../services/robloxBridge.js";

const COMPONENT_TIMEOUT_MS = 120_000;
const MAX_SELECT_OPTIONS = 25;

const SOURCE_DISCORD_BUTTON_ID = "setgrouprank_source_discord";
const SOURCE_ROBLOX_BUTTON_ID = "setgrouprank_source_roblox";
const DISCORD_INPUT_MODAL_ID = "setgrouprank_discord_input";
const DISCORD_INPUT_FIELD_ID = "discord_input";
const ROBLOX_INPUT_MODAL_ID = "setgrouprank_roblox_input";
const ROBLOX_INPUT_FIELD_ID = "roblox_input";
const GROUP_SELECT_ID = "setgrouprank_group";
const SET_BUTTON_ID = "setgrouprank_set";
const RANK_SELECT_ID = "setgrouprank_rank";
const REASON_MODAL_ID = "setgrouprank_reason";
const REASON_INPUT_ID = "reason";

const ROBLOX_USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

type ResolvedTarget = {
    robloxUserId: string;
    /** Shown in prompts and stored in the moderation log. */
    label: string;
};

export const data = new SlashCommandBuilder()
    .setName("setgrouprank")
    .setDescription("Queue a Roblox group rank change for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false);

function timeoutReply() {
    return {
        content: "⌛ That step timed out. Run `/setgrouprank` again.",
        components: []
    };
}

/**
 * Finds a member in the MAIN community Discord guild (MAIN_GUILD_ID) —
 * NOT the guild the bot's other commands are restricted to — by raw
 * mention, ID, or username. Members are looked up manually here (rather
 * than a UserSelectMenu) specifically because the picker is scoped to
 * whatever guild the interaction is running in, which may not be the
 * main guild.
 */
async function findMainGuildMemberByInput(client: Client, rawInput: string): Promise<GuildMember | null> {
    const guild = client.guilds.cache.get(MAIN_GUILD_ID) ?? await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);

    if (!guild) {
        return null;
    }

    const trimmed = rawInput.trim();
    const idMatch = trimmed.match(/^<@!?(\d+)>$/) ?? (/^\d{17,20}$/.test(trimmed) ? [null, trimmed] : null);

    if (idMatch?.[1]) {
        const byId = await guild.members.fetch(idMatch[1]).catch(() => null);
        if (byId) {
            return byId;
        }
    }

    const normalized = trimmed.replace(/^@/, "").toLowerCase();

    if (normalized.length === 0) {
        return null;
    }

    const cached = guild.members.cache.find((member: GuildMember) =>
        member.user.username.toLowerCase() === normalized ||
        member.user.tag.toLowerCase() === normalized ||
        member.displayName.toLowerCase() === normalized
    );

    if (cached) {
        return cached;
    }

    const searchResults = await guild.members.fetch({ query: normalized, limit: 10 }).catch(() => null);

    if (!searchResults) {
        return null;
    }

    return (
        searchResults.find((member: GuildMember) => member.user.username.toLowerCase() === normalized) ??
        searchResults.find((member: GuildMember) => member.displayName.toLowerCase() === normalized) ??
        searchResults.first() ??
        null
    );
}

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

    /**
     * STEP 1 — Pick how the target is identified.
     *
     * "Discord User" looks up a member by manually-typed username/ID in
     * the MAIN community guild, then resolves their linked Roblox account
     * via Bloxlink. "Roblox Username" skips Discord entirely and resolves
     * a Roblox account directly by username.
     */
    const sourceButtonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(SOURCE_DISCORD_BUTTON_ID)
            .setLabel("Discord User")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(SOURCE_ROBLOX_BUTTON_ID)
            .setLabel("Roblox Username")
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
        content:
            "**Step 1/4 — Identify the target**\n" +
            "How do you want to specify who this rank change is for?",
        components: [sourceButtonsRow],
        flags: MessageFlags.Ephemeral
    });

    const promptMessage = await interaction.fetchReply();

    const sourceInteraction = await promptMessage
        .awaitMessageComponent({
            filter: componentInteraction =>
                componentInteraction.user.id === interaction.user.id &&
                (componentInteraction.customId === SOURCE_DISCORD_BUTTON_ID ||
                    componentInteraction.customId === SOURCE_ROBLOX_BUTTON_ID),
            time: COMPONENT_TIMEOUT_MS
        })
        .catch(() => null);

    if (!sourceInteraction || !sourceInteraction.isButton()) {
        await interaction.editReply(timeoutReply());
        return;
    }

    const usingDiscordSource = sourceInteraction.customId === SOURCE_DISCORD_BUTTON_ID;

    /**
     * showModal() must be the direct response to the button click — it
     * can't be preceded by deferUpdate()/update().
     */
    const inputModal = new ModalBuilder()
        .setCustomId(usingDiscordSource ? DISCORD_INPUT_MODAL_ID : ROBLOX_INPUT_MODAL_ID)
        .setTitle(usingDiscordSource ? "Discord Target" : "Roblox Target")
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(usingDiscordSource ? DISCORD_INPUT_FIELD_ID : ROBLOX_INPUT_FIELD_ID)
                    .setLabel(usingDiscordSource ? "Discord username or ID" : "Roblox username")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(37)
            )
        );

    await sourceInteraction.showModal(inputModal);

    const inputModalSubmission = await sourceInteraction
        .awaitModalSubmit({
            filter: modalInteraction =>
                modalInteraction.user.id === interaction.user.id &&
                modalInteraction.customId === (usingDiscordSource ? DISCORD_INPUT_MODAL_ID : ROBLOX_INPUT_MODAL_ID),
            time: COMPONENT_TIMEOUT_MS
        })
        .catch(() => null);

    if (!inputModalSubmission) {
        await interaction.editReply(timeoutReply());
        return;
    }

    await inputModalSubmission.deferUpdate();

    let target: ResolvedTarget;
    let targetDiscordUserId: string | null = null;

    if (usingDiscordSource) {
        const rawInput = inputModalSubmission.fields.getTextInputValue(DISCORD_INPUT_FIELD_ID).trim();

        const member = await findMainGuildMemberByInput(interaction.client, rawInput);

        if (!member) {
            await interaction.editReply({
                content: `⚠️ Could not find "${rawInput}" in the main Discord server.`,
                components: []
            });
            return;
        }

        const robloxUserId = await getRobloxId(member.id);

        if (!robloxUserId) {
            await interaction.editReply({
                content: `⚠️ ${member.user.tag} does not have a Roblox account linked via Bloxlink.`,
                components: []
            });
            return;
        }

        targetDiscordUserId = member.id;
        target = { robloxUserId, label: member.user.tag };
    } else {
        const robloxUsername = inputModalSubmission.fields.getTextInputValue(ROBLOX_INPUT_FIELD_ID).trim();

        if (!ROBLOX_USERNAME_PATTERN.test(robloxUsername)) {
            await interaction.editReply({
                content: "⚠️ Enter a valid Roblox username (3-20 letters, numbers, or underscores).",
                components: []
            });
            return;
        }

        const robloxUserId = await resolveRobloxUserIdByUsername(robloxUsername);

        if (!robloxUserId) {
            await interaction.editReply({
                content: `⚠️ Could not find a Roblox account named "${robloxUsername}".`,
                components: []
            });
            return;
        }

        target = { robloxUserId, label: `${robloxUsername} (Roblox)` };
    }

    const targetMemberships = await resolveRobloxGroupMemberships(target.robloxUserId);
    const managedMemberships = targetMemberships.filter(membership => isManagedGroupName(membership.groupName));

    if (managedMemberships.length === 0) {
        await interaction.editReply({
            content: `⚠️ ${target.label} isn't in any "Site: 45" group this bot can manage.`,
            components: []
        });
        return;
    }

    /**
     * STEP 2 — Select Group
     *
     * Only "Site: 45" groups the target belongs to are listed — i.e.
     * only groups this bot's Roblox API key actually has permission to
     * act on.
     *
     * The executor is only checked for plain membership in the chosen
     * group for now. Once HR-tier ranks per group are finalized, this is
     * where that stricter check (executor must hold an HR rank, not just
     * any membership) should be added.
     */
    const membershipByGroupId = new Map<string, RobloxGroupMembership>(
        managedMemberships.map(membership => [String(membership.groupId), membership])
    );

    const groupSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(GROUP_SELECT_ID)
            .setPlaceholder("Select the Roblox group")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                managedMemberships.slice(0, MAX_SELECT_OPTIONS).map(membership => ({
                    label: membership.groupName.slice(0, 100),
                    description: `Current rank: ${membership.roleName} (${membership.roleRank})`.slice(0, 100),
                    value: String(membership.groupId)
                }))
            )
    );

    await interaction.editReply({
        content: `**Step 2/4 — Select a group**\nTarget: ${target.label}\nWhich of their groups do you want to change?`,
        components: [groupSelectRow]
    });

    const groupInteraction = await promptMessage
        .awaitMessageComponent({
            filter: componentInteraction =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId === GROUP_SELECT_ID,
            time: COMPONENT_TIMEOUT_MS
        })
        .catch(() => null);

    if (!groupInteraction || !groupInteraction.isStringSelectMenu()) {
        await interaction.editReply(timeoutReply());
        return;
    }

    const selectedGroupId = groupInteraction.values[0];

    await groupInteraction.deferUpdate();

    const selectedMembership = selectedGroupId
        ? membershipByGroupId.get(selectedGroupId)
        : undefined;

    if (!selectedGroupId || !selectedMembership) {
        await interaction.editReply({ content: "⚠️ Invalid group selection.", components: [] });
        return;
    }

    const executorRobloxId = await getRobloxId(interaction.user.id);

    if (!executorRobloxId) {
        await interaction.editReply({
            content: "⛔ You need to verify your Roblox account with Bloxlink before using this command.",
            components: []
        });
        return;
    }

    const executorMemberships = await resolveRobloxGroupMemberships(executorRobloxId);
    const executorIsInGroup = executorMemberships.some(
        membership => String(membership.groupId) === selectedGroupId
    );

    if (!executorIsInGroup) {
        await interaction.editReply({
            content: `⛔ You're not a member of **${selectedMembership.groupName}**, so you can't manage its ranks.`,
            components: []
        });
        return;
    }

    const executorRankInGroup = executorMemberships.find(
            m => String(m.groupId) === selectedGroupId
        )?.roleRank ?? 0;

        if (!isAuthorizedRankEditor(selectedGroupId, executorRankInGroup)) {
            await interaction.editReply({
                content: `⛔ Your rank in **${selectedMembership.groupName}** doesn't have permission to edit ranks.`,
                components: []
            });
            return;
        }

        if (selectedMembership.roleRank >= executorRankInGroup) {
            await interaction.editReply({
                content: `⛔ You can't edit the rank of someone at or above your own rank in **${selectedMembership.groupName}**.`,
                components: []
            });
            return;
        }

    /**
     * STEP 3 — Select "Set"
     *
     * A confirmation button before we load the rank list, so the
     * moderator can review the target/group summary first.
     */
    const setButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(SET_BUTTON_ID)
            .setLabel("Set Rank")
            .setStyle(ButtonStyle.Primary)
    );

    await interaction.editReply({
        content:
            "**Step 3/4 — Confirm**\n" +
            `Target: ${target.label}\n` +
            `Group: ${selectedMembership.groupName}\n` +
            `Current rank: ${selectedMembership.roleName} (${selectedMembership.roleRank})\n\n` +
            "Press **Set Rank** to choose the new rank.",
        components: [setButtonRow]
    });

    const setInteraction = await promptMessage
        .awaitMessageComponent({
            filter: componentInteraction =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId === SET_BUTTON_ID,
            time: COMPONENT_TIMEOUT_MS
        })
        .catch(() => null);

    if (!setInteraction || !setInteraction.isButton()) {
        await interaction.editReply(timeoutReply());
        return;
    }

    const assignableRoles = await fetchAssignableGroupRoles(selectedGroupId);

    if (assignableRoles.length === 0) {
        await setInteraction.update({
            content: "⚠️ I couldn't load any assignable ranks for that group.",
            components: []
        });
        return;
    }

    /**
     * STEP 4 — Shows the list of ranks staff can assign in this group
     * (fetchAssignableGroupRoles filters out EXCLUDED_RANKS, i.e. the
     * Owner/"SystemGenesis" tier — see robloxBridge.ts to add more
     * excluded ranks if needed).
     */
    const rankSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(RANK_SELECT_ID)
            .setPlaceholder("Select the new rank")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                assignableRoles.slice(0, MAX_SELECT_OPTIONS).map(role => ({
                    label: `${role.name} (Rank ${role.rank})`.slice(0, 100),
                    value: String(role.id)
                }))
            )
    );

    await setInteraction.update({
        content:
            "**Step 4/4 — Select the new rank**\n" +
            `Target: ${target.label}\n` +
            `Group: ${selectedMembership.groupName}`,
        components: [rankSelectRow]
    });

    const rankInteraction = await promptMessage
        .awaitMessageComponent({
            filter: componentInteraction =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId === RANK_SELECT_ID,
            time: COMPONENT_TIMEOUT_MS
        })
        .catch(() => null);

    if (!rankInteraction || !rankInteraction.isStringSelectMenu()) {
        await interaction.editReply(timeoutReply());
        return;
    }

    const selectedRoleId = Number(rankInteraction.values[0]);
    const selectedRole = assignableRoles.find(role => role.id === selectedRoleId);

    if (!selectedRole) {
        await rankInteraction.update({ content: "⚠️ Invalid rank selection.", components: [] });
        return;
    }

    /**
     * STEP 5 — The reason.
     *
     * Collected through a modal, opened directly off rankInteraction
     * (modals must be shown as the direct response to a component
     * interaction, so this can't be deferred first).
     */
    const reasonModal = new ModalBuilder()
        .setCustomId(REASON_MODAL_ID)
        .setTitle("New Private Message")
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(REASON_INPUT_ID)
                    .setLabel("Reason for the rank change")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(500)
            )
        );

    await rankInteraction.showModal(reasonModal);

    const modalSubmission = await rankInteraction
        .awaitModalSubmit({
            filter: modalInteraction =>
                modalInteraction.user.id === interaction.user.id &&
                modalInteraction.customId === REASON_MODAL_ID,
            time: COMPONENT_TIMEOUT_MS
        })
        .catch(() => null);

    if (!modalSubmission) {
        await interaction.editReply(timeoutReply());
        return;
    }

    const reason = modalSubmission.fields.getTextInputValue(REASON_INPUT_ID).trim() || "No reason provided";

    await modalSubmission.deferUpdate();

    const payload = buildModerationPayload({
        action: "setGroupRank",
        targetUserId: target.robloxUserId,
        targetUsername: target.label,
        reason,
        moderator: interaction.user.tag,
        metadata: {
            groupId: selectedGroupId,
            roleId: selectedRole.id
        }
    });

    try {
        await forwardModerationToBackend(payload);

        let bloxlinkUpdateMessage = "";

        if (targetDiscordUserId) {
            scheduleMemberGroupRoleSync(interaction.client, MAIN_GUILD_ID, targetDiscordUserId);
            bloxlinkUpdateMessage =
                "\nBloxlink role sync scheduled after the Roblox rank change completes.";
        }

        const currentRankLabel = `${selectedMembership.groupName}: ${selectedMembership.roleName} (Rank ${selectedMembership.roleRank})`;
        const newRankLabel = `${selectedRole.name} (Role ID ${selectedRole.id})`;

        await recordModerationEvent(guild, {
            type: "setgrouprank",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: target.robloxUserId,
            targetUserTag: target.label,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: `Set role to ${newRankLabel} in ${selectedMembership.groupName}. ${reason}`,
            currentRanks: [currentRankLabel],
            newRank: newRankLabel
        });

        await interaction.editReply({
            content:
                `✅ Queued rank change for ${target.label} to **${selectedRole.name}** ` +
                `in **${selectedMembership.groupName}**.\nReason: ${reason}` +
                bloxlinkUpdateMessage,
            components: []
        });
    } catch (error) {
        console.error("Failed to queue rank change", error);
        await interaction.editReply({
            content: "⚠️ Failed to queue the rank change action.",
            components: []
        });
    }
}