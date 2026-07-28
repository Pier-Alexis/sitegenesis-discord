import { createServerMessageCommand } from "./serverMessageCommandFactory.js";
import { ANY_SERVER_MSG_PERMISSION } from "../services/serverMsgPermissions.js";

const command = createServerMessageCommand({
    commandName: "everyservermsg",
    description: "Send a [SystemGenesis] radio message to every Roblox server",
    radioUsername: "SystemGenesis",
    permission: ANY_SERVER_MSG_PERMISSION,
    broadcastAll: true
});

export const data = command.data;
export const execute = command.execute;
