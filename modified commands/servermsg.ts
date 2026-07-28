import { createServerMessageCommand } from "./serverMessageCommandFactory.js";
import { ANY_SERVER_MSG_PERMISSION } from "../services/serverMsgPermissions.js";

const command = createServerMessageCommand({
    commandName: "servermsg",
    description: "Send a [SystemGenesis] radio message to a specific Roblox server",
    radioUsername: "SystemGenesis",
    permission: ANY_SERVER_MSG_PERMISSION
});

export const data = command.data;
export const execute = command.execute;
