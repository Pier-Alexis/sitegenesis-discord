import { Client, Guild, GuildMember, Role } from "discord.js";
import { getRobloxId } from "./bloxlinkSync.js";
import { resolveRobloxGroupMemberships, type RobloxGroupMembership } from "./robloxBridge.js";

/**
 * Every Roblox group this system manages Discord roles for. Add or
 * remove a group here and everything else (role creation, per-user
 * sync, the verify button) picks it up automatically — nothing else
 * in this file needs to change.
 *
 * shortCode is used as the Discord role name prefix, e.g.
 * "MTF | Captain". Keep these short: Discord role names cap at 100
 * characters total and buildRoleName() truncates to fit.
 */
export type ManagedGroup = {
    groupId: string;
    groupName: string;
    shortCode: string;
    color: number;
};

export const MANAGED_GROUPS: readonly ManagedGroup[] = [
    { groupId: "165095337", groupName: "Site: 45 Development Den", shortCode: "DEV", color: 0x99aab5 },
    { groupId: "664516669", groupName: "Site 45: Chaos Insurgency", shortCode: "CI", color: 0x992d22 },
    { groupId: "273713479", groupName: "Site 45: Internal Affairs Department", shortCode: "IAD", color: 0x9b59b6 },
    { groupId: "605982482", groupName: "Site 45: Medical Department", shortCode: "MD", color: 0x2ecc71 },
    { groupId: "574906909", groupName: "Site 45: Mobile Task Force Department", shortCode: "MTF", color: 0x3498db },
    { groupId: "746728849", groupName: "Site 45: Scientific Department", shortCode: "SCI", color: 0x1abc9c },
    { groupId: "225026228", groupName: "Site 45: Security Department", shortCode: "SD", color: 0xe74c3c }
];

/** Custom ID for the persistent "Verify" button posted by /setupverify. */
export const VERIFY_BUTTON_ID = "site45_group_verify";

const MANAGED_GROUP_BY_ID = new Map(MANAGED_GROUPS.map(group => [group.groupId, group]));

function buildRoleName(shortCode: string, robloxRoleName: string): string {
    return `${shortCode} | ${robloxRoleName}`.slice(0, 100);
}

/**
 * True if a Discord role name looks like one this system owns (i.e.
 * starts with "<shortCode> | " for one of MANAGED_GROUPS). Used to
 * find stale roles to strip during sync — a role that doesn't match
 * this pattern is never touched, so unrelated server roles are safe.
 */
function isManagedRoleName(name: string): boolean {
    return MANAGED_GROUPS.some(group => name.startsWith(`${group.shortCode} | `));
}

/** guildId:roleName -> Role, so repeated syncs don't re-scan guild.roles every time. */
const roleCache = new Map<string, Role>();

/**
 * Finds (or creates) the Discord role for a given group + current
 * Roblox role name. Safe to call repeatedly — cached per guild, and
 * re-checks guild.roles.cache before creating a duplicate.
 */
async function ensureManagedRole(guild: Guild, group: ManagedGroup, robloxRoleName: string): Promise<Role> {
    const roleName = buildRoleName(group.shortCode, robloxRoleName);
    const cacheKey = `${guild.id}:${roleName}`;

    const cached = roleCache.get(cacheKey);
    if (cached && guild.roles.cache.has(cached.id)) {
        return cached;
    }

    const existing = guild.roles.cache.find((role: Role) => role.name === roleName);

    if (existing) {
        roleCache.set(cacheKey, existing);
        return existing;
    }

    const created = await guild.roles.create({
        name: roleName,
        color: group.color,
        mentionable: false,
        hoist: false,
        reason: `Auto-created by group role sync for ${group.groupName}`
    });

    roleCache.set(cacheKey, created);
    return created;
}

export type GroupSyncResult = {
    linked: boolean;
    robloxUserId?: string;
    assigned: { groupName: string; roleName: string }[];
    removedRoleNames: string[];
};

/**
 * Resolves a member's Roblox account (via Bloxlink), checks their rank
 * in every MANAGED_GROUPS group they belong to, creates any missing
 * Discord roles, and reconciles the member's roles to match:
 *
 * - Adds the correct "<shortCode> | <rank>" role for every managed
 *   group the member currently belongs to.
 * - Removes any "<shortCode> | ..." role the member holds that no
 *   longer matches their current rank/membership — promotions,
 *   demotions, and leaving a group are all handled by re-running this.
 * - Never touches a role that doesn't match the managed naming
 *   pattern, so it can't interfere with unrelated server roles.
 */
export async function syncMemberGroupRoles(member: GuildMember): Promise<GroupSyncResult> {
    const robloxUserId = await getRobloxId(member.id);

    if (!robloxUserId) {
        return { linked: false, assigned: [], removedRoleNames: [] };
    }

    const memberships = await resolveRobloxGroupMemberships(robloxUserId);

    const managedMemberships = memberships.filter(
        (membership: RobloxGroupMembership) => MANAGED_GROUP_BY_ID.has(String(membership.groupId))
    );

    const desiredRoles: Role[] = [];
    const assigned: { groupName: string; roleName: string }[] = [];

    for (const membership of managedMemberships) {
        const group = MANAGED_GROUP_BY_ID.get(String(membership.groupId));

        if (!group) {
            continue;
        }

        const role = await ensureManagedRole(member.guild, group, membership.roleName);
        desiredRoles.push(role);
        assigned.push({ groupName: group.groupName, roleName: role.name });
    }

    const desiredRoleIds = new Set(desiredRoles.map((role: Role) => role.id));
    const currentManagedRoles = member.roles.cache.filter((role: Role) => isManagedRoleName(role.name));

    const rolesToAdd = desiredRoles.filter((role: Role) => !member.roles.cache.has(role.id));
    const rolesToRemove = currentManagedRoles.filter((role: Role) => !desiredRoleIds.has(role.id));

    if (rolesToAdd.length) {
        await member.roles.add(rolesToAdd, "Group role sync: rank/membership match");
    }

    if (rolesToRemove.size) {
        await member.roles.remove(rolesToRemove, "Group role sync: no longer holds this rank/membership");
    }

    return {
        linked: true,
        robloxUserId,
        assigned,
        removedRoleNames: rolesToRemove.map((role: Role) => role.name)
    };
}

const RANK_ROLE_SYNC_DELAY_MS = 15 * 1000;
const RANK_ROLE_SYNC_RETRY_DELAY_MS = 10 * 1000;
const RANK_ROLE_SYNC_ATTEMPTS = 3;

/** Reconcile the member's Site:45 Discord roles after a queued Roblox change. */
export function scheduleMemberGroupRoleSync(
    client: Client,
    guildId: string,
    discordUserId: string
): void {
    setTimeout(() => {
        void (async () => {
            for (let attempt = 1; attempt <= RANK_ROLE_SYNC_ATTEMPTS; attempt++) {
                try {
                    const guild = await client.guilds.fetch(guildId);
                    const member = await guild.members.fetch(discordUserId);
                    const result = await syncMemberGroupRoles(member);

                    if (result.linked) {
                        console.log(
                            `[Group role sync] Updated ${discordUserId} ` +
                            `after rank change on attempt ${attempt}`
                        );
                        return;
                    }
                } catch (error) {
                    console.error(
                        `[Group role sync] Rank-change sync attempt ${attempt} failed ` +
                        `for ${discordUserId}:`,
                        error
                    );
                }

                if (attempt < RANK_ROLE_SYNC_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, RANK_ROLE_SYNC_RETRY_DELAY_MS));
                }
            }

            console.warn(
                `[Group role sync] Rank-change sync failed after ` +
                `${RANK_ROLE_SYNC_ATTEMPTS} attempts for ${discordUserId}`
            );
        })();
    }, RANK_ROLE_SYNC_DELAY_MS);
}