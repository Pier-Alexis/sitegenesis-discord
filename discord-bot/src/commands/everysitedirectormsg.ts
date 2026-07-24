import { createServerMessageCommand } from "./serverMessageCommandFactory.js";
import { SITE_DIRECTOR_PERMISSION } from "../services/serverMsgPermissions.js";

const command = createServerMessageCommand({
    commandName: "everysitedirectormsg",
    description: "Send a [SiteDirector] radio message to every Roblox server",
    radioUsername: "SiteDirector",
    permission: SITE_DIRECTOR_PERMISSION,
    broadcastAll: true
});

export const data = command.data;
export const execute = command.execute;
