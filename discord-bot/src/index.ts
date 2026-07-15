import {
    Client,
    GatewayIntentBits,
    Collection
} from "discord.js";

import { config } from "./config.js";

import * as ping from "./commands/ping.js";
import * as testlog from "./commands/testlog.js";


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});


type Command = {
    data: { name: string };
    execute: (interaction: any) => Promise<unknown>;
};

const commands = new Collection<string, Command>();

commands.set(ping.data.name, ping as Command);
commands.set(testlog.data.name, testlog as Command);


client.once("clientReady", () => {
    console.log(`Logged in as ${client.user?.tag}`);

    client.user?.setActivity("Site Genesis Development");
});


client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand())
        return;

    const command = commands.get(interaction.commandName);

    if (!command)
        return;

    try {
        await command.execute(interaction);
    }
    catch(error) {
        console.error(error);
        await interaction.reply("❌ Error executing command.");
    }

});


client.login(config.token);