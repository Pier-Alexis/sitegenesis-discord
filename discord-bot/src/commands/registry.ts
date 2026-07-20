import * as ban from "./ban.js";
import * as caseCommand from "./case.js";
import * as modlogs from "./modlogs.js";
import * as mute from "./mute.js";
import * as playersearch from "./playersearch.js";
import * as softban from "./softban.js";
import * as unban from "./unban.js";
import * as unmute from "./unmute.js";
import * as warn from "./warn.js";
import * as setgrouprank from "./setgrouprank.js";

export const commandModules = [
	ban,
	unban,
	mute,
	unmute,
	softban,
	warn,
	modlogs,
	caseCommand,
	playersearch,
	setgrouprank
] as const;

export const commandData = commandModules.map(command => command.data.toJSON());
