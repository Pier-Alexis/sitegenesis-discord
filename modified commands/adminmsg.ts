import { createServerMessageCommand } from "./serverMessageCommandFactory.js";
import { ADMIN_ONLY_PERMISSION } from "../services/serverMsgPermissions.js";

const command = createServerMessageCommand({
    commandName: "adminmsg",
    description: "Send a [The Administrator] radio message to a specific Roblox server",
    radioUsername: "The Administrator",
    permission: ADMIN_ONLY_PERMISSION
});

export const data = command.data;
export const execute = command.execute;
