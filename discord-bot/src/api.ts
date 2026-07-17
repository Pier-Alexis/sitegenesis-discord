import express from "express";
import { Client, TextChannel } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

export function startApi(client: Client) {
    app.post("/events", async (req, res) => {
        try {
            const apiKey = req.header("x-api-key");

            if (apiKey !== process.env.API_KEY) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized"
                });
            }

            const event = req.body;

            console.log("Received an event:", event);

            const channel = await client.channels.fetch("1527713143227416718");

            if (!channel || !channel.isTextBased()) {
                return res.status(500).json({
                    success: false,
                    message: "Discord channel not found."
                });
            }

            await (channel as TextChannel).send(
                `**${event.username}** joined the Roblox server`
            );

            res.json({
                success: true
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: "Internal Server Error"
            });
        }
    });

    app.listen(4000, "0.0.0.0", () => {
        console.log("Discord API listening on port 4000");
    });
}
