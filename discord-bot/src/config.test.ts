import test from "node:test";
import assert from "node:assert/strict";

import { isDiscordTokenConfigured } from "./config.js";

test("accepts a non-placeholder Discord bot token", () => {
    assert.equal(isDiscordTokenConfigured("MTA5NTQ3OTQ4NjQ0NDU4NjE2NA.GsW2Q2.abc123"), true);
});

test("rejects placeholder and empty Discord bot tokens", () => {
    assert.equal(isDiscordTokenConfigured(""), false);
    assert.equal(isDiscordTokenConfigured("change-me"), false);
    assert.equal(isDiscordTokenConfigured("your-discord-bot-token"), false);
});
