/**
 * roverAutoSync.ts
 *
 * Periodically re-triggers RoVer's role sync ("Update Roles") for every
 * member of ONE specific guild — the one that's NOT your bot's main server.
 *
 * How it works:
 *  - Every 10 minutes, fetch the member list of TARGET_GUILD_ID.
 *  - For each member, call RoVer's server-owner Web API to force a
 *    re-verify/role-sync (same effect as them clicking RoVer's
 *    "Update Roles" button, or the old `!update @user` command).
 *  - Requests are spaced out to avoid hammering RoVer's rate limits.
 *
 * Requirements:
 *  - discord.js client with the GuildMembers intent enabled
 *    (and "Server Members Intent" turned on in the Discord Developer Portal).
 *  - A RoVer server API key/token for TARGET_GUILD_ID.
 *    Get this from: RoVer dashboard -> Manage Servers -> [your guild] -> Web API.
 *    That page will show you the *current* exact endpoint + payload shape for
 *    your account/plan — paste it into ROVER_UPDATE_ENDPOINT / the fetch call
 *    below. I've left it as a placeholder rather than guessing, since RoVer's
 *    API has changed versions before (the old verify.eryn.io API is deprecated).
 */

import { Client, Guild } from "discord.js";
import "dotenv/config";

const TARGET_GUILD_ID = "1515795950218510468";
const ROVER_API_KEY = process.env.ROVER_API_KEY!; // from RoVer dashboard, Web API section
const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DELAY_BETWEEN_REQUESTS_MS = 1000; // spread out calls; tune to RoVer's stated rate limit

// TODO: replace with the exact endpoint shown on guild's RoVer Web API page.
// It will look something like:
//   https://registry.rover.link/api/guilds/{guildId}/discord-to-roblox/{discordId}
// possibly with a different verb/path for "force update" vs "lookup" — the
// dashboard page will tell you which one re-triggers role sync.
const ROVER_UPDATE_ENDPOINT = (guildId: string, discordUserId: string) =>
  `https://REPLACE-WITH-YOUR-DASHBOARD-ENDPOINT/${guildId}/${discordUserId}`;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function roverUpdateUser(guildId: string, discordUserId: string): Promise<void> {
  const res = await fetch(ROVER_UPDATE_ENDPOINT(guildId, discordUserId), {
    method: "POST", // confirm verb (POST/PATCH) from the dashboard docs
    headers: {
      Authorization: `Bearer ${ROVER_API_KEY}`, // confirm header format from dashboard docs
      "Content-Type": "application/json",
    },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "5");
    console.warn(`[RoVer sync] rate limited, backing off ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    return roverUpdateUser(guildId, discordUserId); // retry once backed off
  }

  if (!res.ok) {
    console.error(
      `[RoVer sync] failed for ${discordUserId}: ${res.status} ${await res.text()}`
    );
    return;
  }
}

async function syncGuild(guild: Guild): Promise<void> {
  console.log(`[RoVer sync] starting sync for guild ${guild.id} (${guild.name})`);

  // Requires the GuildMembers privileged intent to be enabled.
  const members = await guild.members.fetch();
  const humanMembers = members.filter((m) => !m.user.bot);

  let count = 0;
  for (const [, member] of humanMembers) {
    try {
      await roverUpdateUser(guild.id, member.id);
      count++;
    } catch (err) {
      console.error(`[RoVer sync] error updating ${member.id}:`, err);
    }
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log(`[RoVer sync] finished — processed ${count} members`);
}

/**
 * Call this once after bot logs in, passing the existing discord.js client.
 */
export function startRoverAutoSync(client: Client): void {
  const runOnce = async () => {
    try {
      const guild =
        client.guilds.cache.get(TARGET_GUILD_ID) ??
        (await client.guilds.fetch(TARGET_GUILD_ID));
      await syncGuild(guild);
    } catch (err) {
      console.error("[RoVer sync] top-level error:", err);
    }
  };

  // Run once shortly after startup, then every 10 minutes.
  setTimeout(runOnce, 15_000);
  setInterval(runOnce, SYNC_INTERVAL_MS);
}