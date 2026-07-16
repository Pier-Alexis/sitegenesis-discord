import * as ban from "./ban.js";
import * as mute from "./mute.js";
import * as unban from "./unban.js";
import * as unmute from "./unmute.js";

export const commandModules = [ban, unban, mute, unmute] as const;

export const commandData = commandModules.map(command => command.data.toJSON());
