import { Router } from "express";
import db from "../database/database.js";

const router = Router();

async function resolveRobloxUserIdByUsername(username: string) {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            usernames: [username],
            excludeBannedUsers: false
        })
    });

    if (!response.ok) {
        throw new Error(`Roblox username lookup failed (${response.status})`);
    }

    const payload = await response.json() as {
        data?: Array<{
            id?: number;
        }>;
    };

    const id = payload.data?.[0]?.id;
    if (!id) {
        return null;
    }

    return String(id);
}

router.post("/ban", (req, res) => {

    const {
        userId,
        username,
        reason,
        moderator
    } = req.body;


    db.prepare(`
        INSERT INTO bans
        (userId, username, reason, moderator, createdAt)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        userId,
        username,
        reason,
        moderator,
        Date.now()
    );


    res.json({
        success: true,
        message: "Player banned"
    });
});

router.post("/roblox/moderation", async (req, res) => {
    const { action, userId, username, reason, moderator, metadata } = req.body;

    if (!action || !username || !moderator) {
        res.status(400).json({ success: false, message: "Missing moderation fields" });
        return;
    }

    const allowedActions = new Set([
        "ban",
        "unban",
        "mute",
        "unmute",
        "warn",
        "setGroupRank",
        "kick"
    ]);

    if (!allowedActions.has(action)) {
        res.status(400).json({ success: false, message: "Unsupported moderation action" });
        return;
    }

    if (metadata !== undefined && (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))) {
        res.status(400).json({ success: false, message: "Invalid metadata payload" });
        return;
    }

    let resolvedUserId = typeof userId === "string" ? userId.trim() : "";

    if (action === "setGroupRank" || action === "kick") {
        if (!/^\d+$/.test(resolvedUserId)) {
            try {
                const lookedUpUserId = await resolveRobloxUserIdByUsername(username);

                if (!lookedUpUserId) {
                    res.status(404).json({ success: false, message: "Roblox username not found" });
                    return;
                }

                resolvedUserId = lookedUpUserId;
            } catch (error) {
                console.error("Failed to resolve Roblox username", error);
                res.status(502).json({ success: false, message: "Failed to resolve Roblox username" });
                return;
            }
        }
    } else if (!/^\d+$/.test(resolvedUserId)) {
        res.status(400).json({ success: false, message: "userId must be numeric for this action" });
        return;
    }

    if (action === "ban") {
        db.prepare(`
            INSERT INTO bans
            (userId, username, reason, moderator, createdAt)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            resolvedUserId,
            username,
            reason ?? "No reason provided",
            moderator,
            Date.now()
        );
    }

    db.prepare(`
        INSERT INTO moderation_actions
        (action, userId, username, reason, moderator, metadata, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        action,
        resolvedUserId,
        username,
        reason ?? "No reason provided",
        moderator,
        metadata ? JSON.stringify(metadata) : null,
        "pending",
        Date.now()
    );

    res.json({
        success: true,
        message: `Roblox moderation action received: ${action}`
    });
});

router.get("/roblox/moderation/pending", (req, res) => {
    const pendingRows = db.prepare(
        "SELECT * FROM moderation_actions WHERE status = 'pending' ORDER BY createdAt DESC"
    ).all();

    const pending = pendingRows.map((row: any) => {
        if (!row.metadata || typeof row.metadata !== "string") {
            return row;
        }

        try {
            return {
                ...row,
                metadata: JSON.parse(row.metadata)
            };
        } catch {
            return {
                ...row,
                metadata: null
            };
        }
    });

    res.json(pending);
});

router.post("/roblox/moderation/:id/processed", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).json({ success: false, message: "Invalid moderation action id" });
        return;
    }

    const result = db.prepare(
        "UPDATE moderation_actions SET status = 'processed' WHERE id = ?"
    ).run(id);

    if (result.changes === 0) {
        res.status(404).json({ success: false, message: "Moderation action not found" });
        return;
    }

    res.json({ success: true, message: "Moderation action marked as processed" });
});

router.get("/roblox/moderation/failed", (req, res) => {
    const failedRows = db.prepare(
        "SELECT * FROM moderation_actions WHERE status = 'failed' ORDER BY createdAt DESC"
    ).all();

    const failed = failedRows.map((row: any) => {
        if (!row.metadata || typeof row.metadata !== "string") {
            return row;
        }

        try {
            return {
                ...row,
                metadata: JSON.parse(row.metadata)
            };
        } catch {
            return {
                ...row,
                metadata: null
            };
        }
    });

    res.json(failed);
});

router.post("/roblox/moderation/:id/retry", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).json({ success: false, message: "Invalid moderation action id" });
        return;
    }

    const result = db.prepare(
        "UPDATE moderation_actions SET status = 'pending' WHERE id = ? AND status = 'failed'"
    ).run(id);

    if (result.changes === 0) {
        res.status(404).json({ success: false, message: "Failed moderation action not found" });
        return;
    }

    res.json({ success: true, message: "Moderation action moved back to pending" });
});

router.get("/bans", (req, res) => {

    const bans = db.prepare(
        "SELECT * FROM bans"
    ).all();


    res.json(bans);

});


export default router;
