import { createServerMessageCommand } from "./serverMessageCommandFactory.js";

const command = createServerMessageCommand({
    commandName: "o5msg",
    description: "Send an [O5 Council] radio message to a specific Roblox server",
    radioUsername: "O5 Council"
});

export const data = command.data;
export const execute = command.execute;
