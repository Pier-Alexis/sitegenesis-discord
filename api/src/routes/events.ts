import { Router } from "express";

const router = Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        console.log("Roblox event received:", event);

        if (!event || typeof event !== "object") {
            return res.status(400).json({
                success: false,
                message: "Invalid payload"
            });
        }

        const {
            type,
            username,
            userId,
            serverId,
            serverName,
            message
        } = event as {
            type?: string;
            username?: string;
            userId?: number | string;
            serverId?: string;
            serverName?: string;
            message?: string;
        };

        const allowedTypes = new Set([
            "playerJoin",
            "playerLeave",
            "serverCreated",
            "teamChanged",
            "playerChat"
        ]);

        if (!type || !allowedTypes.has(type)) {
            return res.status(400).json({
                success: false,
                message: "Invalid event type"
            });
        }

        // Validate player events
        if (
            (type === "playerJoin" || type === "playerLeave" || type === "playerChat") &&
            (!username || !userId || !serverId || !serverName)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid player event: username, userId, serverId and serverName required"
            });
        }

        if (
            type === "playerChat" &&
            (typeof message !== "string" || message.length === 0)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid playerChat event: message required"
            });
        }

        // Validate server creation
        if (
            type === "serverCreated" &&
            (!serverId || !serverName)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid serverCreated event: serverId and serverName required"
            });
        }

        console.log(`Forwarding ${type} event to Discord bot...`);

        const response = await fetch("http://127.0.0.1:4000/events", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.API_KEY || ""
            },
            body: JSON.stringify(event)
        });

        const result = await response.json();

        console.log(
            `Discord bot responded with status ${response.status}:`,
            result
        );

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                message: "Discord bot rejected the event",
                discord: result
            });
        }

        return res.json({
            success: true,
            discord: result
        });

    } catch (error) {
        console.error("Error sending event to Discord:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to send event to Discord"
        });
    }
});

export default router;