import { Router } from "express";
import db from "../database/database.js";

const router = Router();

router.post("/cases", (req, res) => {
    const { moderator, targetUserId, targetUsername, reason, type } = req.body;

    if (!moderator || !targetUserId || !targetUsername || !reason) {
        res.status(400).json({ success: false, message: "Missing case fields" });
        return;
    }

    db.prepare(`
        INSERT INTO moderation_actions
        (action, userId, username, reason, moderator, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        type ?? "warning",
        targetUserId,
        targetUsername,
        reason,
        moderator,
        "pending",
        Date.now()
    );

    res.json({ success: true, message: "Case recorded" });
});

export default router;
