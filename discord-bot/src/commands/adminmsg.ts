import { createServerMessageCommand } from "./serverMessageCommandFactory.js";

const command = createServerMessageCommand({
    commandName: "adminmsg",
    description: "Send a [The Administrator] radio message to a specific Roblox server",
    radioUsername: "The Administrator"
});

export const data = command.data;
export const execute = command.execute;
