import * as ban from "./ban.js";
import * as caseCommand from "./case.js";
import * as kick from "./kick.js";
import * as modlogs from "./modlogs.js";
import * as mute from "./mute.js";
import * as ping from "./ping.js";
import * as playersearch from "./playersearch.js";
import * as softban from "./softban.js";
import * as unban from "./unban.js";
import * as unsetgrouprank from "./unsetgrouprank.js";
import * as unmute from "./unmute.js";
import * as warn from "./warn.js";
import * as setgrouprank from "./setgroupranks.js";

export const commandModules = [
	ban,
	kick,
	unban,
	mute,
	unmute,
	softban,
	warn,
	ping,
	modlogs,
	caseCommand,
	playersearch,
	setgrouprank,
	unsetgrouprank
] as const;

export const commandData = commandModules.map(command => command.data.toJSON());
