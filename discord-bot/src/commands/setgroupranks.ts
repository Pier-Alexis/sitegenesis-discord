import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder
} from "discord.js";
import { getRobloxId } from "../services/bloxlinkSync.js";
import { recordModerationEvent } from "../services/moderationLog.js";
import {
    buildModerationPayload,
    fetchAssignableGroupRoles,
    forwardModerationToBackend,
    resolveRobloxGroupMemberships,
    type RobloxGroupMembership
} from "../services/robloxBridge.js";

const COMPONENT_TIMEOUT_MS = 120_000;
const MAX_SELECT_OPTIONS = 25;

const USER_SELECT_ID = "setgrouprank_user";
const GROUP_SELECT_ID = "setgrouprank_group";
const SET_BUTTON_ID = "setgrouprank_set";
const RANK_SELECT_ID = "setgrouprank_rank";
const REASON_MODAL_ID = "setgrouprank_reason";
const REASON_INPUT_ID = "reason";

export const data = new SlashCommandBuilder()
    .setName("setgrouprank")
    .setDescription("Queue a Roblox group rank change for a linked member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false);

function timeoutReply() {
    return {
        content: "⌛ That step timed out. Run `/setgrouprank` again.",
        components: []
    };
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
     * STEP 1 — Select User
     *
     * Lets the moderator pick any Discord member instead of typing a
     * Roblox username. We resolve their linked Roblox account and pull
     * every group they're actually in, so step 2 only ever lists real
     * memberships.
     */
    const userSelectRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId(USER_SELECT_ID)
            .setPlaceholder("Select the Discord member to rank")
            .setMinValues(1)
            .setMaxValues(1)
    );

    await interaction.reply({
        content: "**Step 1/4 — Select a user**\nWho do you want to change the Roblox group rank of?",
        components: [userSelectRow],
        flags: MessageFlags.Ephemeral
    });

    const promptMessage = await interaction.fetchReply();

    const userInteraction = await promptMessage
        .awaitMessageComponent({
            filter: componentInteraction =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId === USER_SELECT_ID,
            time: COMPONENT_TIMEOUT_MS
        })
        .catch(() => null);

    if (!userInteraction || !userInteraction.isUserSelectMenu()) {
        await interaction.editReply(timeoutReply());
        return;
    }

    const targetUser = userInteraction.users.first();

    if (!targetUser) {
        await userInteraction.update({ content: "⚠️ No user was selected.", components: [] });
        return;
    }

    await userInteraction.deferUpdate();

    const targetRobloxId = await getRobloxId(targetUser.id);

    if (!targetRobloxId) {
        await interaction.editReply({
            content: `⚠️ ${targetUser.tag} does not have a Roblox account linked via Bloxlink.`,
            components: []
        });
        return;
    }

    const targetMemberships = await resolveRobloxGroupMemberships(targetRobloxId);

    if (targetMemberships.length === 0) {
        await interaction.editReply({
            content: `⚠️ ${targetUser.tag}'s linked Roblox account isn't a member of any group I can see.`,
            components: []
        });
        return;
    }

    /**
     * STEP 2 — Select Group
     *
     * Only groups the target actually belongs to are listed, and each
     * option shows their current rank in that group.
     *
     * The executor is only checked for plain membership in the chosen
     * group for now. Once HR-tier ranks per group are finalized, this is
     * where that stricter check (executor must hold an HR rank, not just
     * any membership) should be added.
     */
    const membershipByGroupId = new Map<string, RobloxGroupMembership>(
        targetMemberships.map(membership => [String(membership.groupId), membership])
    );

    const groupSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(GROUP_SELECT_ID)
            .setPlaceholder("Select the Roblox group")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                targetMemberships.slice(0, MAX_SELECT_OPTIONS).map(membership => ({
                    label: membership.groupName.slice(0, 100),
                    description: `Current rank: ${membership.roleName} (${membership.roleRank})`.slice(0, 100),
                    value: String(membership.groupId)
                }))
            )
    );

    await interaction.editReply({
        content: `**Step 2/4 — Select a group**\nTarget: ${targetUser.tag}\nWhich of their groups do you want to change?`,
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
            `Target: ${targetUser.tag}\n` +
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
     * STEP 4 — Shows all the ranks in the group below the Owner /
     * "SystemGenesis" tier (fetchAssignableGroupRoles already excludes
     * rank 255, so that seat can never show up here).
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
            `Target: ${targetUser.tag}\n` +
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
        targetUserId: targetRobloxId,
        targetUsername: targetUser.username,
        reason,
        moderator: interaction.user.tag,
        metadata: {
            groupId: selectedGroupId,
            roleId: selectedRole.id
        }
    });

    try {
        await forwardModerationToBackend(payload);

        const currentRankLabel = `${selectedMembership.groupName}: ${selectedMembership.roleName} (Rank ${selectedMembership.roleRank})`;
        const newRankLabel = `${selectedRole.name} (Role ID ${selectedRole.id})`;

        await recordModerationEvent(guild, {
            type: "setgrouprank",
            guildId: guild.id,
            guildName: guild.name,
            targetUserId: targetRobloxId,
            targetUserTag: `${targetUser.tag} (${targetRobloxId})`,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: `Set role to ${newRankLabel} in ${selectedMembership.groupName}. ${reason}`,
            currentRanks: [currentRankLabel],
            newRank: newRankLabel
        });

        await interaction.editReply({
            content:
                `✅ Queued rank change for ${targetUser.tag} to **${selectedRole.name}** ` +
                `in **${selectedMembership.groupName}**.\nReason: ${reason}`,
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