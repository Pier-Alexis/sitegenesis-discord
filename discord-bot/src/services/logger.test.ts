import test from "node:test";
import assert from "node:assert/strict";

import {
    buildChannelChatContent,
    buildServerUserChatContent,
    isPlayerLeftEmbedTitle,
    shouldArchiveServerFromLastEmbedTitles
} from "./logger.js";

test("buildChannelChatContent includes username and id", () => {
    assert.equal(
        buildChannelChatContent("Genesis", "42", "hello world"),
        "Genesis (42): hello world"
    );
});

test("buildChannelChatContent prefixes radio channel name when provided", () => {
    assert.equal(
        buildChannelChatContent("Genesis", "42", "radio check", "GlobalRadio"),
        "[GlobalRadio] Genesis (42): radio check"
    );
});

test("buildServerUserChatContent returns plain-text format for player chat", () => {
    assert.equal(
        buildServerUserChatContent("Genesis", "hello everyone"),
        "💬 Genesis: hello everyone"
    );
});

test("isPlayerLeftEmbedTitle accepts both left title variants", () => {
    assert.equal(isPlayerLeftEmbedTitle("📝 Player Left"), true);
    assert.equal(isPlayerLeftEmbedTitle("📝 Player Leaved"), true);
});

test("shouldArchiveServerFromLastEmbedTitles requires at least one thread", () => {
    assert.equal(shouldArchiveServerFromLastEmbedTitles([]), false);
});

test("shouldArchiveServerFromLastEmbedTitles archives only when every latest embed is a leave event", () => {
    assert.equal(
        shouldArchiveServerFromLastEmbedTitles([
            "📝 Player Left",
            "📝 Player Leaved"
        ]),
        true
    );

    assert.equal(
        shouldArchiveServerFromLastEmbedTitles([
            "📝 Player Left",
            "📝 Team Changed"
        ]),
        false
    );
});