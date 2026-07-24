/**
 * roverAutoSync.ts
 *
 * Force RoVer to update roles and nickname for every human member
 * of the target Discord guild.
 *
 * RoVer API:
 * POST /guilds/:guildId/update/:userId
 *
 * This endpoint behaves as if the user ran /verify themselves.
 *
 * IMPORTANT:
 * The API key requires RoVer Update API access.
 */

import { Client, Guild } from "discord.js";
import "dotenv/config";

const TARGET_GUILD_ID = "1515795950218510468";

const ROVER_API_KEY = process.env.ROVER_API_KEY;

const SYNC_INTERVAL_MS = 10 * 60 * 1000;

// RoVer API allows 5 requests per 10 seconds per API key.
// 1 second between requests keeps us safely below that limit.
const DELAY_BETWEEN_REQUESTS_MS = 2_000;

const ROVER_API_BASE = "https://registry.rover.link/api";

if (!ROVER_API_KEY) {
  throw new Error(
    "[RoVer sync] ROVER_API_KEY is not configured in the environment."
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUpdateEndpoint(
  guildId: string,
  discordUserId: string
): string {
  return `${ROVER_API_BASE}/guilds/${guildId}/update/${discordUserId}`;
}

async function roverUpdateUser(
  guildId: string,
  discordUserId: string
): Promise<boolean> {
  const endpoint = getUpdateEndpoint(guildId, discordUserId);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ROVER_API_KEY}`,
    },
  });

  // RoVer / Cloudflare rate limit
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = Number(retryAfterHeader ?? "10");

    console.warn(
      `[RoVer sync] Rate limited. Waiting ${retryAfter}s before retrying ${discordUserId}.`
    );

    await sleep(retryAfter * 1000);

    return roverUpdateUser(guildId, discordUserId);
  }

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.text();

    if (contentType.includes("application/json")) {
      try {
        const error = JSON.parse(body);

        console.error(
          `[RoVer sync] Failed for ${discordUserId}:`,
          {
            status: res.status,
            errorCode: error.errorCode,
            message: error.message,
            detail: error.detail,
            context: error.context,
          }
        );
      } catch {
        console.error(
          `[RoVer sync] Failed for ${discordUserId}: ${res.status} ${body}`
        );
      }
    } else {
      console.error(
        `[RoVer sync] Failed for ${discordUserId}: ${res.status} ${body}`
      );
    }

    return false;
  }

  const data = await res.json();

  console.log(
    `[RoVer sync] Updated ${discordUserId}`,
    {
      addedRoles: data.addedRoles?.length ?? 0,
      removedRoles: data.removedRoles?.length ?? 0,
      failedRoles: data.failedRoles?.length ?? 0,
      canManageRoles: data.actions?.canManageRoles,
      canManageNicknames: data.actions?.canManageNicknames,
    }
  );

  return true;
}

async function syncGuild(guild: Guild): Promise<void> {
  console.log(
    `[RoVer sync] Starting sync for guild ${guild.id} (${guild.name})`
  );

  const members = await guild.members.fetch();

  const humanMembers = members.filter(
    (member) => !member.user.bot
  );

  console.log(
    `[RoVer sync] Found ${humanMembers.size} human members`
  );

  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const [, member] of humanMembers) {
    processed++;

    try {
      const success = await roverUpdateUser(
        guild.id,
        member.id
      );

      if (success) {
        successful++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;

      console.error(
        `[RoVer sync] Error updating ${member.id}:`,
        err
      );
    }

    // Respect RoVer's API rate limit.
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log(
    `[RoVer sync] Finished — processed ${processed} members, ${successful} successful, ${failed} failed`
  );
}

/**
 * Starts the automatic RoVer role synchronization.
 *
 * Runs:
 * - once 15 seconds after startup
 * - then every 10 minutes
 */
export function startRoverAutoSync(client: Client): void {
  const runOnce = async (): Promise<void> => {
    try {
      const guild =
        client.guilds.cache.get(TARGET_GUILD_ID) ??
        (await client.guilds.fetch(TARGET_GUILD_ID));

      await syncGuild(guild);
    } catch (err) {
      console.error(
        "[RoVer sync] Top-level error:",
        err
      );
    }
  };

  // Initial synchronization after startup.
  setTimeout(runOnce, 15_000);

  // Synchronize every 10 minutes.
  setInterval(runOnce, SYNC_INTERVAL_MS);
}