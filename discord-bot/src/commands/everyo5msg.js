import { createServerMessageCommand } from "./serverMessageCommandFactory.js";
import { O5_COUNCIL_PERMISSION } from "../services/serverMsgPermissions.js";
const command = createServerMessageCommand({
    commandName: "everyo5msg",
    description: "Send an [O5 Council] radio message to every Roblox server",
    radioUsername: "O5 Council",
    permission: O5_COUNCIL_PERMISSION,
    broadcastAll: true
});
export const data = command.data;
export const execute = command.execute;
