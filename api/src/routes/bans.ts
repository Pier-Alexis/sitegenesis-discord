import { Router } from "express";
import db from "../database/database.js";

const router = Router();

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

router.post("/roblox/moderation", (req, res) => {
    const { action, userId, username, reason, moderator } = req.body;

    if (!action || !userId || !username || !moderator) {
        res.status(400).json({ success: false, message: "Missing moderation fields" });
        return;
    }

    db.prepare(`
        INSERT INTO bans
        (userId, username, reason, moderator, createdAt)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        userId,
        username,
        reason ?? "No reason provided",
        moderator,
        Date.now()
    );

    db.prepare(`
        INSERT INTO moderation_actions
        (action, userId, username, reason, moderator, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        action,
        userId,
        username,
        reason ?? "No reason provided",
        moderator,
        "pending",
        Date.now()
    );

    res.json({
        success: true,
        message: `Roblox moderation action received: ${action}`
    });
});

router.get("/roblox/moderation/pending", (req, res) => {
    const pending = db.prepare(
        "SELECT * FROM moderation_actions WHERE status = 'pending' ORDER BY createdAt DESC"
    ).all();

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

router.get("/bans", (req, res) => {

    const bans = db.prepare(
        "SELECT * FROM bans"
    ).all();


    res.json(bans);

});


export default router;
