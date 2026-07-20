import test from "node:test";
import assert from "node:assert/strict";

import {
    isPlayerLeftEmbedTitle,
    shouldArchiveServerFromLastEmbedTitles
} from "./logger.js";

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