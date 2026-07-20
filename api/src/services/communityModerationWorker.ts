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
    rank?: number;
};

type WorkerConfig = {
    enabled: boolean;
    pollIntervalMs: number;
    groupId: string;
    apiKey: string;
    setGroupRankEndpointTemplate: string;
    setGroupRankMethod: string;
};

let workerHandle: NodeJS.Timeout | null = null;

function parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

function parseBoolean(value: string | undefined) {
    if (!value) {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function buildWorkerConfig(): WorkerConfig {
    return {
        enabled: parseBoolean(process.env.COMMUNITY_MODERATION_ENABLED),
        pollIntervalMs: parsePositiveInt(process.env.COMMUNITY_MODERATION_INTERVAL_MS, 5000),
        groupId: process.env.ROBLOX_GROUP_ID ?? "",
        apiKey: process.env.ROBLOX_OPEN_CLOUD_API_KEY ?? "",
        setGroupRankEndpointTemplate: process.env.ROBLOX_SET_GROUP_RANK_ENDPOINT_TEMPLATE ?? "",
        setGroupRankMethod: process.env.ROBLOX_SET_GROUP_RANK_METHOD ?? "PATCH"
    };
}

function validateConfig(config: WorkerConfig) {
    if (!config.enabled) {
        return { ok: false as const, reason: "Community moderation worker is disabled." };
    }

    if (!config.groupId) {
        return { ok: false as const, reason: "ROBLOX_GROUP_ID is missing." };
    }

    if (!config.apiKey) {
        return { ok: false as const, reason: "ROBLOX_OPEN_CLOUD_API_KEY is missing." };
    }

    if (!config.setGroupRankEndpointTemplate) {
        return { ok: false as const, reason: "Missing endpoint template for setGroupRank." };
    }

    return { ok: true as const };
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

function buildEndpointUrl(template: string, groupId: string, userId: string) {
    return template
        .replaceAll("{groupId}", encodeURIComponent(groupId))
        .replaceAll("{userId}", encodeURIComponent(userId));
}

async function executeCommunityAction(config: WorkerConfig, row: ModerationActionRow) {
    const endpointUrl = buildEndpointUrl(config.setGroupRankEndpointTemplate, config.groupId, row.userId);
    const method = config.setGroupRankMethod.toUpperCase();
    const metadata = parseMetadata(row.metadata);
    const roleId = metadata.roleId ?? metadata.rank;

    if (!Number.isInteger(roleId)) {
        throw new Error("setGroupRank action is missing metadata.roleId");
    }

    const response = await fetch(endpointUrl, {
        method,
        headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey
        },
        body: JSON.stringify({
            groupId: config.groupId,
            userId: row.userId,
            username: row.username,
            reason: row.reason,
            moderator: row.moderator,
            roleId
        })
    });

    if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        throw new Error(`Open Cloud call failed (${response.status}): ${responseText}`);
    }
}

function markActionStatus(id: number, status: "processed" | "failed") {
    db.prepare("UPDATE moderation_actions SET status = ? WHERE id = ?").run(status, id);
}

function loadPendingCommunityActions() {
    return db
        .prepare(
            `SELECT id, action, userId, username, reason, moderator, metadata
             FROM moderation_actions
             WHERE status = 'pending' AND action = 'setGroupRank'
             ORDER BY createdAt ASC`
        )
        .all() as ModerationActionRow[];
}

async function processPendingActions(config: WorkerConfig) {
    const pending = loadPendingCommunityActions();

    for (const row of pending) {
        try {
            await executeCommunityAction(config, row);
            markActionStatus(row.id, "processed");
            console.log(`[CommunityWorker] Processed action ${row.id} (${row.action})`);
        } catch (error) {
            markActionStatus(row.id, "failed");
            console.error(`[CommunityWorker] Failed action ${row.id} (${row.action})`, error);
        }
    }
}

export function startCommunityModerationWorker() {
    const config = buildWorkerConfig();
    const validation = validateConfig(config);

    if (!validation.ok) {
        console.log(`[CommunityWorker] ${validation.reason}`);
        return;
    }

    if (workerHandle) {
        clearInterval(workerHandle);
    }

    console.log("[CommunityWorker] Started");

    workerHandle = setInterval(() => {
        processPendingActions(config).catch(error => {
            console.error("[CommunityWorker] Unexpected processing error", error);
        });
    }, config.pollIntervalMs);

    processPendingActions(config).catch(error => {
        console.error("[CommunityWorker] Initial processing error", error);
    });
}
