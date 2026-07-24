import { createServerMessageCommand } from "./serverMessageCommandFactory.js";
import { ADMIN_ONLY_PERMISSION } from "../services/serverMsgPermissions.js";
const command = createServerMessageCommand({
    commandName: "everyadminmsg",
    description: "Send a [The Administrator] radio message to every Roblox server",
    radioUsername: "The Administrator",
    permission: ADMIN_ONLY_PERMISSION,
    broadcastAll: true
});
export const data = command.data;
export const execute = command.execute;
