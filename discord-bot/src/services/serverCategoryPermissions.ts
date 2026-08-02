import {
    CategoryChannel,
    PermissionFlagsBits
} from "discord.js";
import type { OverwriteData } from "discord.js";

/**
 * Role permissions applied to every auto-created Roblox server category
 * (and, for pre-existing categories, to their child channels).
 *
 * - VIEW_ONLY_ROLE_ID: may view the category/channels but cannot post,
 *   send messages, add reactions, etc.
 * - VIEW_AND_SEND_ROLE_ID: may view and send messages, but may not
 *   create posts.
 * - FULL_PERM_ROLE_IDS: have every permission.
 * - @everyone: cannot see anything inside server categories.
 */
export const VIEW_ONLY_ROLE_ID = "1533268380851634388";
export const VIEW_AND_SEND_ROLE_ID = "1533267928613650643";
export const FULL_PERM_ROLE_IDS = [
    "1533267834136953096",
    "1533267729174233239"
];

const VIEW_ONLY_ALLOWED_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory
];

const VIEW_AND_SEND_ALLOWED_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads
];

/**
 * Every permission that can be meaningfully used inside a channel.
 * Anything not explicitly allowed for the restricted roles is denied,
 * so the two limited roles get exactly what they are granted and no more.
 */
const CHANNEL_PERMISSIONS: readonly bigint[] = [
    PermissionFlagsBits.CreateInstantInvite,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.PrioritySpeaker,
    PermissionFlagsBits.Stream,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendTTSMessages,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.UseExternalEmojis,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.MuteMembers,
    PermissionFlagsBits.DeafenMembers,
    PermissionFlagsBits.MoveMembers,
    PermissionFlagsBits.UseVAD,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ManageGuildExpressions,
    PermissionFlagsBits.UseApplicationCommands,
    PermissionFlagsBits.RequestToSpeak,
    PermissionFlagsBits.ManageEvents,
    PermissionFlagsBits.ManageThreads,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.UseExternalStickers,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.UseEmbeddedActivities,
    PermissionFlagsBits.UseSoundboard,
    PermissionFlagsBits.UseExternalSounds,
    PermissionFlagsBits.SendVoiceMessages
];

function denyAllExcept(allowedPermissions: readonly bigint[]): bigint[] {
    const allowedSet = new Set(allowedPermissions);

    return CHANNEL_PERMISSIONS.filter(
        permission => !allowedSet.has(permission)
    );
}

const VIEW_ONLY_DENIED_PERMISSIONS = denyAllExcept(
    VIEW_ONLY_ALLOWED_PERMISSIONS
);

const VIEW_AND_SEND_DENIED_PERMISSIONS = denyAllExcept(
    VIEW_AND_SEND_ALLOWED_PERMISSIONS
);

/**
 * Build the permission overwrites that should be applied to a Roblox
 * server category.
 */
export function buildServerCategoryPermissionOverwrites(
    everyoneRoleId: string
): OverwriteData[] {
    return [
        {
            id: everyoneRoleId,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: VIEW_ONLY_ROLE_ID,
            allow: [...VIEW_ONLY_ALLOWED_PERMISSIONS],
            deny: [...VIEW_ONLY_DENIED_PERMISSIONS]
        },
        {
            id: VIEW_AND_SEND_ROLE_ID,
            allow: [...VIEW_AND_SEND_ALLOWED_PERMISSIONS],
            deny: [...VIEW_AND_SEND_DENIED_PERMISSIONS]
        },
        ...FULL_PERM_ROLE_IDS.map(roleId => ({
            id: roleId,
            allow: [PermissionFlagsBits.Administrator]
        }))
    ];
}

/**
 * True when the category already has the configured permission layout
 * (detected by checking that @everyone cannot view the category).
 */
export function hasServerCategoryPermissions(
    category: CategoryChannel
): boolean {
    const everyoneRoleId = category.guild.roles.everyone.id;

    const everyoneOverwrite =
        category.permissionOverwrites.cache.get(everyoneRoleId);

    return (
        everyoneOverwrite?.deny.has(
            PermissionFlagsBits.ViewChannel
        ) ?? false
    );
}

/**
 * Apply the configured permission overwrites to a category.
 */
export async function applyServerCategoryPermissions(
    category: CategoryChannel
): Promise<void> {
    const everyoneRoleId = category.guild.roles.everyone.id;

    await category.permissionOverwrites.set(
        buildServerCategoryPermissionOverwrites(everyoneRoleId),
        "Apply configured server category role permissions"
    );
}

/**
 * Apply the configured permission overwrites to a category only if they
 * are not already present. Uses only the channel cache to decide, so it
 * is cheap to call repeatedly.
 */
export async function ensureServerCategoryPermissions(
    category: CategoryChannel
): Promise<void> {
    if (hasServerCategoryPermissions(category)) {
        return;
    }

    await applyServerCategoryPermissions(category);

    console.log(
        `Applied server category permissions to "${category.name}" (${category.id})`
    );
}
