import { REST, Routes } from "discord.js";
import { config } from "./config.js";

import { data as ping } from "./commands/ping.js";
import { data as testlog } from "./commands/testlog.ts";
import { data as testevent } from "./commands/testevent.js";

const commands = [
    ping.toJSON(),
    testlog.toJSON(),
    testevent.toJSON()
];

const rest = new REST({
    version: "10"
}).setToken(config.token);

async function deploy() {
    try {
        console.log("Deploying commands...");

        await rest.put(
            Routes.applicationGuildCommands(
                config.clientId,
                config.guildId
            ),
            {
                body: commands
            }
        );

        console.log("Commands deployed!");
    } catch (error) {
        console.error(error);
    }
}

deploy();