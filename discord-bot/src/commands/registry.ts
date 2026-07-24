import * as ban from "./ban.js";
import * as caseCommand from "./case.js";
import * as kick from "./kick.js";
import * as modlogs from "./modlogs.js";
import * as mute from "./mute.js";
import * as ping from "./ping.js";
import * as playersearch from "./playersearch.js";
import * as purgecategories from "./purgecategories.js";
import * as softban from "./softban.js";
import * as unban from "./unban.js";
import * as unsetgrouprank from "./unsetgrouprank.js";
import * as unmute from "./unmute.js";
import * as warn from "./warn.js";
import * as setgrouprank from "./setgroupranks.js";
import * as gameban from "./gameban.js";
import * as gameunban from "./gameunban.js";
import * as servermsg from "./servermsg.js";
import * as sitedirectormsg from "./sitedirectormsg.js";
import * as o5msg from "./o5msg.js";
import * as adminmsg from "./adminmsg.js";

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
	purgecategories,
	setgrouprank,
	unsetgrouprank,
	gameban,
	gameunban,
	servermsg,
	sitedirectormsg,
	o5msg,
	adminmsg
] as const;

export const commandData = commandModules.flatMap((command, index) => {
	if (!command.data) {
		console.warn(`Skipping command module at index ${index} because it does not export data.`);
		return [];
	}

	return [command.data.toJSON()];
});