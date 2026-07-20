import db from "../database/database.js";

type ModerationActionRow = {
    id: number;
    action: "setGroupRank";
    userId: string;
    username: string;
    reason: string;
    moderator: string;
    metadata: string | null;
};

type ActionMetadata = {
    roleId?: number;
};

type WorkerConfig = {
    enabled: boolean;
    pollIntervalMs: number;
    groupId: string;
    apiKey: string;
};

type RobloxMembership = {
    path?: string;
    user?: string;
    role?: string;
};

type RobloxMembershipResponse = {
    groupMemberships?: RobloxMembership[];
    nextPageToken?: string;
};

type RobloxRole = {
    path?: string;
    id?: string;
    displayName?: string;
};

type RobloxRolesResponse = {
    groupRoles?: RobloxRole[];
    nextPageToken?: string;
};

const ROBLOX_OPEN_CLOUD_BASE = "https://apis.roblox.com/cloud/v2";

let workerHandle: NodeJS.Timeout | null = null;

function parsePositiveInt(
    value: string | undefined,
    fallback: number
): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

function parseBoolean(value: string | undefined): boolean {
    if (!value) {
        return false;
    }

    const normalized = value.trim().toLowerCase();

    return (
        normalized === "1" ||
        normalized === "true" ||
        normalized === "yes" ||
        normalized === "on"
    );
}

function buildWorkerConfig(): WorkerConfig {
    return {
        enabled: parseBoolean(
            process.env.COMMUNITY_MODERATION_ENABLED
        ),
        pollIntervalMs: parsePositiveInt(
            process.env.COMMUNITY_MODERATION_INTERVAL_MS,
            5000
        ),
        groupId: process.env.ROBLOX_GROUP_ID ?? "",
        apiKey: process.env.ROBLOX_OPEN_CLOUD_API_KEY ?? ""
    };
}

function validateConfig(config: WorkerConfig) {
    if (!config.enabled) {
        return {
            ok: false as const,
            reason: "Community moderation worker is disabled."
        };
    }

    if (!config.groupId) {
        return {
            ok: false as const,
            reason: "ROBLOX_GROUP_ID is missing."
        };
    }

    if (!config.apiKey) {
        return {
            ok: false as const,
            reason: "ROBLOX_OPEN_CLOUD_API_KEY is missing."
        };
    }

    return {
        ok: true as const
    };
}

function parseMetadata(raw: string | null): ActionMetadata {
    if (!raw) {
        return {};
    }

    try {
        const decoded = JSON.parse(raw) as ActionMetadata;

        if (!decoded || typeof decoded !== "object") {
            return {};
        }

        return decoded;
    } catch {
        return {};
    }
}

/**
 * Make a request to Roblox Open Cloud.
 */
async function robloxRequest<T>(
    config: WorkerConfig,
    url: string,
    options: RequestInit = {}
): Promise<T> {
    const response = await fetch(url, {
        ...options,
        headers: {
            "x-api-key": config.apiKey,
            ...(options.body
                ? {
                    "Content-Type": "application/json"
                }
                : {}),
            ...(options.headers ?? {})
        }
    });

    const responseText = await response.text().catch(() => "");

    if (!response.ok) {
        throw new Error(
            `Open Cloud call failed (${response.status}): ${responseText}`
        );
    }

    if (!responseText) {
        return {} as T;
    }

    try {
        return JSON.parse(responseText) as T;
    } catch {
        return {} as T;
    }
}

/**
 * Finds the membership ID of a Roblox user inside the configured group.
 *
 * Roblox Open Cloud group membership resources use:
 *
 * groups/{groupId}/memberships/{membershipId}
 *
 * The membershipId is NOT the same thing as the Roblox userId.
 */
async function resolveMembershipId(
    config: WorkerConfig,
    userId: string
): Promise<string> {
    let pageToken: string | undefined;

    do {
        const params = new URLSearchParams({
            maxPageSize: "100"
        });

        if (pageToken) {
            params.set("pageToken", pageToken);
        }

        const url =
            `${ROBLOX_OPEN_CLOUD_BASE}/groups/` +
            `${config.groupId}/memberships?${params.toString()}`;

        const payload = await robloxRequest<RobloxMembershipResponse>(
            config,
            url
        );

        const memberships = payload.groupMemberships ?? [];

        for (const membership of memberships) {
            if (!membership.user) {
                continue;
            }

            /**
             * Expected format:
             *
             * users/123456789
             */
            const membershipUserId =
                membership.user.split("/").pop();

            if (membershipUserId === userId) {
                if (!membership.path) {
                    throw new Error(
                        `Membership found for user ${userId}, but membership path is missing.`
                    );
                }

                const membershipId =
                    membership.path.split("/").pop();

                if (!membershipId) {
                    throw new Error(
                        `Could not extract membershipId from path: ${membership.path}`
                    );
                }

                return membershipId;
            }
        }

        pageToken = payload.nextPageToken;
    } while (pageToken);

    throw new Error(
        `User ${userId} is not a member of group ${config.groupId}.`
    );
}

/**
 * Checks that a Roblox group role actually exists.
 *
 * This prevents the API from returning:
 *
 * 404 NOT_FOUND
 * "The role was not found."
 */
async function validateRole(
    config: WorkerConfig,
    roleId: number
): Promise<string> {
    let pageToken: string | undefined;

    do {
        const params = new URLSearchParams({
            maxPageSize: "100"
        });

        if (pageToken) {
            params.set("pageToken", pageToken);
        }

        const url =
            `${ROBLOX_OPEN_CLOUD_BASE}/groups/` +
            `${config.groupId}/roles?${params.toString()}`;

        const payload = await robloxRequest<RobloxRolesResponse>(
            config,
            url
        );

        const roles = payload.groupRoles ?? [];

        for (const role of roles) {
            const roleIdFromPath =
                role.path?.split("/").pop();

            const roleIdFromResponse =
                role.id?.toString();

            if (
                roleIdFromPath === roleId.toString() ||
                roleIdFromResponse === roleId.toString()
            ) {
                if (!role.path) {
                    throw new Error(
                        `Role ${roleId} exists but its resource path is missing.`
                    );
                }

                return role.path;
            }
        }

        pageToken = payload.nextPageToken;
    } while (pageToken);

    throw new Error(
        `Roblox group role ${roleId} was not found in group ${config.groupId}.`
    );
}

async function executeCommunityAction(
    config: WorkerConfig,
    row: ModerationActionRow
) {
    const metadata = parseMetadata(row.metadata);

    /**
     * IMPORTANT:
     *
     * roleId MUST be the numerical Roblox Group Role ID.
     *
     * Do not put the rank number here.
     * Do not put the role name here.
     *
     * Example:
     *
     * {
     *     "roleId": 123456789
     * }
     */
    const roleId = metadata.roleId;

    if (
        roleId === undefined ||
        !Number.isInteger(roleId) ||
        roleId <= 0
    ) {
        throw new Error(
            `setGroupRank action ${row.id} is missing a valid metadata.roleId. ` +
            `Expected a positive Roblox Group Role ID.`
        );
    }

    console.log(
        `[CommunityWorker] Processing action ${row.id}: ` +
        `user=${row.username} (${row.userId}), ` +
        `group=${config.groupId}, roleId=${roleId}`
    );

    /**
     * Step 1:
     * Find the internal Open Cloud membership ID.
     */
    const membershipId = await resolveMembershipId(
        config,
        row.userId
    );

    console.log(
        `[CommunityWorker] Resolved membershipId=${membershipId} ` +
        `for Roblox user ${row.userId}`
    );

    /**
     * Step 2:
     * Verify that the requested role exists.
     */
    const rolePath = await validateRole(
        config,
        roleId
    );

    console.log(
        `[CommunityWorker] Validated role ${roleId}: ${rolePath}`
    );

    /**
     * Step 3:
     * Change the member's group role.
     */
    const membershipPath =
        `${ROBLOX_OPEN_CLOUD_BASE}/groups/` +
        `${config.groupId}/memberships/${encodeURIComponent(membershipId)}`;

    const patchAttempts = [
        {
            url: `${membershipPath}?updateMask=role`,
            body: {
                role: rolePath
            }
        },
        {
            url: membershipPath,
            body: {
                role: rolePath
            }
        },
        {
            url: `${membershipPath}?updateMask=role`,
            body: {
                role: {
                    path: rolePath
                }
            }
        },
        {
            url: membershipPath,
            body: {
                role: {
                    path: rolePath
                }
            }
        }
    ] as const;

    let lastPatchError: unknown;

    for (const attempt of patchAttempts) {
        try {
            await robloxRequest(
                config,
                attempt.url,
                {
                    method: "PATCH",
                    body: JSON.stringify(attempt.body)
                }
            );

            lastPatchError = null;
            break;
        } catch (error) {
            lastPatchError = error;
        }
    }

    if (lastPatchError) {
        throw lastPatchError;
    }

    console.log(
        `[CommunityWorker] Successfully changed ${row.username} ` +
        `(${row.userId}) to role ${roleId} in group ${config.groupId}`
    );
}

function markActionStatus(
    id: number,
    status: "processed" | "failed"
) {
    db.prepare(
        "UPDATE moderation_actions SET status = ? WHERE id = ?"
    ).run(status, id);
}

function loadPendingCommunityActions() {
    return db
        .prepare(
            `SELECT
                id,
                action,
                userId,
                username,
                reason,
                moderator,
                metadata
             FROM moderation_actions
             WHERE status = 'pending'
               AND action = 'setGroupRank'
             ORDER BY createdAt ASC`
        )
        .all() as ModerationActionRow[];
}

async function processPendingActions(
    config: WorkerConfig
) {
    const pending = loadPendingCommunityActions();

    if (pending.length === 0) {
        return;
    }

    console.log(
        `[CommunityWorker] Found ${pending.length} pending action(s).`
    );

    for (const row of pending) {
        try {
            await executeCommunityAction(
                config,
                row
            );

            markActionStatus(
                row.id,
                "processed"
            );

            console.log(
                `[CommunityWorker] Processed action ` +
                `${row.id} (${row.action})`
            );
        } catch (error) {
            markActionStatus(
                row.id,
                "failed"
            );

            console.error(
                `[CommunityWorker] Failed action ` +
                `${row.id} (${row.action})`,
                error
            );
        }
    }
}

export function startCommunityModerationWorker() {
    const config = buildWorkerConfig();

    const validation = validateConfig(config);

    if (!validation.ok) {
        console.log(
            `[CommunityWorker] ${validation.reason}`
        );

        return;
    }

    if (workerHandle) {
        clearInterval(workerHandle);
    }

    console.log(
        `[CommunityWorker] Started ` +
        `(group=${config.groupId}, interval=${config.pollIntervalMs}ms)`
    );

    workerHandle = setInterval(() => {
        processPendingActions(config).catch(
            error => {
                console.error(
                    "[CommunityWorker] Unexpected processing error",
                    error
                );
            }
        );
    }, config.pollIntervalMs);

    processPendingActions(config).catch(
        error => {
            console.error(
                "[CommunityWorker] Initial processing error",
                error
            );
        }
    );
}
