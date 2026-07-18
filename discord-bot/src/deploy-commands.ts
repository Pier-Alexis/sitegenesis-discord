import { REST, Routes } from "discord.js";
import { config, isDiscordTokenConfigured } from "./config.js";
import { commandData } from "./commands/registry.js";

if (!isDiscordTokenConfigured(config.token)) {
    console.error("Discord bot token is missing or invalid. Set TOKEN in your .env file to a real bot token.");
    process.exit(1);
}

const rest = new REST({
    version: "10"
}).setToken(config.token);

async function deploy() {
    try {
        console.log("Deploying commands...");

        const deployGuildOnly = process.env.DEPLOY_GUILD_ONLY === "true";

        if (deployGuildOnly && config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(
                    config.clientId,
                    config.guildId
                ),
                {
                    body: commandData
                }
            );

            console.log(`Commands deployed to guild ${config.guildId}`);
        } else {
            await rest.put(
                Routes.applicationCommands(config.clientId),
                {
                    body: commandData
                }
            );

            console.log("Commands deployed globally!");
        }
    } catch (error) {
        console.error(error);
    }
}

deploy();