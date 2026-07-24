import {
	Client,
	Guild,
	GuildMember,
} from "discord.js";

const BLOXLINK_API_BASE = "https://api.blox.link/v4/public";

const BLOXLINK_API_KEY = process.env.BLOXLINK_API_KEY;
const BLOXLINK_GUILD_ID = process.env.BLOXLINK_GUILD_ID;

const SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Delay between each user.
// Avoid sending too many requests simultaneously.
const REQUEST_DELAY = 250;

let syncRunning = false;
let syncInterval: NodeJS.Timeout | null = null;

interface BloxlinkRobloxResponse {
	robloxID?: string;
}

interface BloxlinkUpdateResponse {
	addedRoles?: string[];
	removedRoles?: string[];
	nickname?: string;
}

interface SyncStats {
	total: number;
	processed: number;
	verified: number;
	notVerified: number;
	updated: number;
	failed: number;
}

/**
 * Validates the Bloxlink configuration.
 */
function validateConfig(): void {
	if (!BLOXLINK_API_KEY) {
		throw new Error(
			"[Bloxlink sync] BLOXLINK_API_KEY is not configured."
		);
	}

	if (!BLOXLINK_GUILD_ID) {
		throw new Error(
			"[Bloxlink sync] BLOXLINK_GUILD_ID is not configured."
		);
	}
}

/**
 * Makes a request to the Bloxlink API.
 */
async function bloxlinkRequest<T>(
	url: string,
	options: RequestInit = {}
): Promise<{
	ok: boolean;
	status: number;
	data?: T;
}> {
	if (!BLOXLINK_API_KEY) {
		throw new Error(
			"[Bloxlink sync] BLOXLINK_API_KEY is not configured."
		);
	}

	const response = await fetch(url, {
		...options,
		headers: {
			Authorization: BLOXLINK_API_KEY,
			"Content-Type": "application/json",
			...(options.headers ?? {}),
		},
	});

	let data: T | undefined;

	try {
		data = await response.json() as T;
	} catch {
		// Certain responses may not contain JSON.
	}

	return {
		ok: response.ok,
		status: response.status,
		...(data !== undefined && { data }),
	};
}

/**
 * Returns the Roblox User ID linked to a Discord user.
 *
 * 200:
 * {
 *   "robloxID": "123456789"
 * }
 *
 * 404:
 * No linked Roblox account.
 */
export async function getRobloxId(
	discordUserId: string
): Promise<string | null> {
	validateConfig();

	const url =
		`${BLOXLINK_API_BASE}/guilds/` +
		`${BLOXLINK_GUILD_ID}/discord-to-roblox/` +
		`${discordUserId}`;

	try {
		const result =
			await bloxlinkRequest<BloxlinkRobloxResponse>(url);

		if (result.status === 404) {
			return null;
		}

		if (!result.ok) {
			console.error(
				`[Bloxlink sync] Failed Roblox lookup for ` +
				`${discordUserId}: HTTP ${result.status}`,
				result.data
			);

			return null;
		}

		if (!result.data?.robloxID) {
			return null;
		}

		return result.data.robloxID;
	} catch (error) {
		console.error(
			`[Bloxlink sync] Request error for ${discordUserId}:`,
			error
		);

		return null;
	}
}

/**
 * Forces Bloxlink to update a user.
 *
 * This is equivalent to running /verify for the user.
 */
export async function updateBloxlinkUser(
	discordUserId: string
): Promise<BloxlinkUpdateResponse | null> {
	validateConfig();

	const url =
		`${BLOXLINK_API_BASE}/guilds/` +
		`${BLOXLINK_GUILD_ID}/update-user/` +
		`${discordUserId}`;

	try {
		const result =
			await bloxlinkRequest<BloxlinkUpdateResponse>(
				url,
				{
					method: "POST",
				}
			);

		if (result.status === 404) {
			console.warn(
				`[Bloxlink sync] User ${discordUserId} ` +
				`could not be updated.`
			);

			return null;
		}

		if (!result.ok) {
			console.error(
				`[Bloxlink sync] Failed update for ` +
				`${discordUserId}: HTTP ${result.status}`,
				result.data
			);

			return null;
		}

		return result.data ?? {};
	} catch (error) {
		console.error(
			`[Bloxlink sync] Update request failed for ` +
			`${discordUserId}:`,
			error
		);

		return null;
	}
}

/**
 * Waits for a certain number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Synchronizes a single Discord member.
 */
async function syncMember(
	member: GuildMember,
	stats: SyncStats
): Promise<void> {
	stats.processed++;

	const discordUserId = member.id;

	console.log(
		`[Bloxlink sync] Checking ${member.user.tag} ` +
		`(${discordUserId})`
	);

	/*
	 * Étape 1:
	 * Vérifie si l'utilisateur possède un compte Roblox lié.
	 */
	const robloxId = await getRobloxId(discordUserId);

	if (!robloxId) {
		stats.notVerified++;

		console.log(
			`[Bloxlink sync] ${member.user.tag} ` +
			`is not linked to Roblox.`
		);

		return;
	}

	stats.verified++;

	console.log(
		`[Bloxlink sync] ${member.user.tag} -> ` +
		`Roblox ID ${robloxId}`
	);

	/*
	 * Étape 2:
	 * Force la mise à jour Bloxlink.
	 *
	 * Cela permet à Bloxlink de recalculer les rôles
	 * et le nickname selon sa configuration.
	 */
	const update = await updateBloxlinkUser(discordUserId);

	if (!update) {
		stats.failed++;
		return;
	}

	stats.updated++;

	const addedRoles = update.addedRoles ?? [];
	const removedRoles = update.removedRoles ?? [];

	console.log(
		`[Bloxlink sync] Updated ${member.user.tag} | ` +
		`Added: ${addedRoles.length} | ` +
		`Removed: ${removedRoles.length} | ` +
		`Nickname: ${update.nickname ?? "unchanged"}`
	);
}

/**
 * Synchronizes all human members of the server.
 */
export async function syncBloxlinkGuild(
	guild: Guild
): Promise<SyncStats | null> {
	if (syncRunning) {
		console.warn(
			"[Bloxlink sync] A synchronization is already running. Skipping."
		);

		return null;
	}

	syncRunning = true;

	const stats: SyncStats = {
		total: 0,
		processed: 0,
		verified: 0,
		notVerified: 0,
		updated: 0,
		failed: 0,
	};

	try {
		validateConfig();

		console.log(
			`[Bloxlink sync] Starting sync for guild ` +
			`${guild.id} (${guild.name})`
		);

		/*
		 * Fetch all members.
		 *
		 * IMPORTANT:
		 * The bot must have the GuildMembers intent.
		 */
		const members = await guild.members.fetch();

		const humanMembers = members.filter(
			(member) => !member.user.bot
		);

		stats.total = humanMembers.size;

		console.log(
			`[Bloxlink sync] Found ${humanMembers.size} human members`
		);

		for (const member of humanMembers.values()) {
			try {
				await syncMember(member, stats);
			} catch (error) {
				stats.failed++;

				console.error(
					`[Bloxlink sync] Unexpected error for ` +
					`${member.id}:`,
					error
				);
			}

			/*
			 * Small delay before the next member.
			 */
			await sleep(REQUEST_DELAY);
		}

		console.log(
			`[Bloxlink sync] Finished sync | ` +
			`Total: ${stats.total} | ` +
			`Processed: ${stats.processed} | ` +
			`Verified: ${stats.verified} | ` +
			`Not verified: ${stats.notVerified} | ` +
			`Updated: ${stats.updated} | ` +
			`Failed: ${stats.failed}`
		);

		return stats;
	} catch (error) {
		console.error(
			"[Bloxlink sync] Guild synchronization failed:",
			error
		);

		return null;
	} finally {
		syncRunning = false;
	}
}

/**
 * Démarre la synchronisation automatique.
 *
 * Une synchronisation est effectuée immédiatement,
 * puis toutes les 10 minutes.
 */
export function startBloxlinkAutoSync(
	client: Client
): void {
	if (syncInterval) {
		console.warn(
			"[Bloxlink sync] Auto-sync is already running."
		);

		return;
	}

	validateConfig();

	console.log(
		`[Bloxlink sync] Auto-sync enabled. ` +
		`Interval: ${SYNC_INTERVAL / 60000} minutes`
	);

	/*
	 * First synchronization immediately
	 * after the bot starts.
	 */
	void runBloxlinkSync(client);

	/*
	 * Then every 10 minutes.
	 */
	syncInterval = setInterval(() => {
		void runBloxlinkSync(client);
	}, SYNC_INTERVAL);
}

/**
 * Stops the auto-sync.
 */
export function stopBloxlinkAutoSync(): void {
	if (!syncInterval) {
		return;
	}

	clearInterval(syncInterval);
	syncInterval = null;

	console.log(
		"[Bloxlink sync] Auto-sync stopped."
	);
}

/**
 * Runs a synchronization on the configured server.
 */
async function runBloxlinkSync(
	client: Client
): Promise<void> {
	if (!BLOXLINK_GUILD_ID) {
		return;
	}

	const guild = await client.guilds.fetch(
		BLOXLINK_GUILD_ID
	);

	if (!guild) {
		console.error(
			`[Bloxlink sync] Guild ${BLOXLINK_GUILD_ID} not found.`
		);

		return;
	}

	await syncBloxlinkGuild(guild);
}