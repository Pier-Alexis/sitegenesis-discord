import test from "node:test";
import assert from "node:assert/strict";

import { buildModerationPayload } from "./robloxBridge.js";

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
