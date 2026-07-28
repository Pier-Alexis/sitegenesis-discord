import { createServerMessageCommand } from "./serverMessageCommandFactory.js";
import { O5_COUNCIL_PERMISSION } from "../services/serverMsgPermissions.js";

const command = createServerMessageCommand({
    commandName: "o5msg",
    description: "Send an [O5 Council] radio message to a specific Roblox server",
    radioUsername: "O5 Council",
    permission: O5_COUNCIL_PERMISSION
});

export const data = command.data;
export const execute = command.execute;
