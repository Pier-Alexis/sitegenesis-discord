import { Router } from "express";
import db from "../database/database";

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


router.get("/bans", (req, res) => {

    const bans = db.prepare(
        "SELECT * FROM bans"
    ).all();


    res.json(bans);

});


export default router;
