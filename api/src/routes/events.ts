import { Router } from "express";

const router = Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        console.log("Roblox event received:", event);

        if (!event || typeof event !== "object") {
            return res.status(400).json({ success: false, message: "Invalid payload" });
        }

        const { type, username } = event as { type?: string; username?: string };
        const allowedTypes = new Set(["playerJoin", "playerLeave"]);

        if (!type || !allowedTypes.has(type) || !username) {
            return res.status(400).json({ success: false, message: "Invalid or missing fields: type and username required" });
        }

        const response = await fetch("http://127.0.0.1:4000/events", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.API_KEY || ""
            },
            body: JSON.stringify(event)
        });

        const result = await response.json();

        res.json({
            success: true,
            discord: result
        });

    } catch (error) {
        console.error("Error sending event to Discord:", error);

        res.status(500).json({
            success: false,
            message: "Failed to send event to Discord"
        });
    }
});

export default router;

