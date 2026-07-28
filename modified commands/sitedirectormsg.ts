import { createServerMessageCommand } from "./serverMessageCommandFactory.js";
import { SITE_DIRECTOR_PERMISSION } from "../services/serverMsgPermissions.js";

const command = createServerMessageCommand({
    commandName: "sitedirectormsg",
    description: "Send a [SiteDirector] radio message to a specific Roblox server",
    radioUsername: "SiteDirector",
    permission: SITE_DIRECTOR_PERMISSION
});

export const data = command.data;
export const execute = command.execute;
