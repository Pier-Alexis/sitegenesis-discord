import test from "node:test";
import assert from "node:assert/strict";

import { buildModerationPayload, buildPlayerSearchSummary, formatPlayerListEntry } from "./robloxBridge.js";

test("buildModerationPayload includes the action, target, and moderator details", () => {
    const payload = buildModerationPayload({
        action: "ban",
        targetUserId: "123",
        targetUsername: "PlayerOne",
        reason: "Trolling",
        moderator: "ModUser"
    });

    assert.deepEqual(payload, {
        action: "ban",
        userId: "123",
        username: "PlayerOne",
        reason: "Trolling",
        moderator: "ModUser"
    });
});

test("formatPlayerListEntry formats a player into the requested display pattern", () => {
    const entry = formatPlayerListEntry({
        username: "Genesis",
        displayName: "System",
        userId: "42",
        team: "Alpha"
    });

    assert.equal(entry, "Genesis (System) (42) (Alpha)");
});

test("buildPlayerSearchSummary includes every requested player detail", () => {
    const summary = buildPlayerSearchSummary({
        username: "Genesis",
        displayName: "System",
        userId: "42",
        groups: ["Admin", "Tester"],
        team: "Alpha"
    });

    assert.match(summary, /Username: Genesis/);
    assert.match(summary, /Display Name: System/);
    assert.match(summary, /Roblox User ID: 42/);
    assert.match(summary, /Groups: Admin, Tester/);
    assert.match(summary, /Current Team: Alpha/);
});
