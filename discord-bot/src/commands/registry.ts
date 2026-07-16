import * as ban from "./ban.js";
import * as modlogs from "./modlogs.js";
import * as mute from "./mute.js";
import * as softban from "./softban.js";
import * as unban from "./unban.js";
import * as unmute from "./unmute.js";
import * as warn from "./warn.js";

export const commandModules = [ban, unban, mute, unmute, softban, warn, modlogs] as const;

export const commandData = commandModules.map(command => command.data.toJSON());
