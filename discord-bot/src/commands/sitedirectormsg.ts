import { createServerMessageCommand } from "./serverMessageCommandFactory.js";

const command = createServerMessageCommand({
    commandName: "sitedirectormsg",
    description: "Send a [SiteDirector] radio message to a specific Roblox server",
    radioUsername: "SiteDirector"
});

export const data = command.data;
export const execute = command.execute;
