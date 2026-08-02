import test from "node:test";
import assert from "node:assert/strict";

import {
    PermissionFlagsBits,
    PermissionsBitField
} from "discord.js";
import type { OverwriteData } from "discord.js";

import {
    buildServerCategoryPermissionOverwrites,
    FULL_PERM_ROLE_IDS,
    VIEW_AND_SEND_ROLE_ID,
    VIEW_ONLY_ROLE_ID
} from "./serverCategoryPermissions.js";

const EVERYONE_ROLE_ID = "everyone-role";

function findOverwrite(overwrites: readonly OverwriteData[], id: string) {
    const overwrite = overwrites.find(entry => entry.id === id);
    assert.ok(overwrite, `expected an overwrite for ${id}`);
    return overwrite;
}

function hasFlag(overwrite: OverwriteData) {
    const allowed = new PermissionsBitField(overwrite.allow);
    const denied = new PermissionsBitField(overwrite.deny);
    return { allowed, denied };
}

test("everyone cannot view server categories", () => {
    const overwrites = buildServerCategoryPermissionOverwrites(EVERYONE_ROLE_ID);

    const everyone = findOverwrite(overwrites, EVERYONE_ROLE_ID);
    const { allowed, denied } = hasFlag(everyone);

    assert.ok(denied.has(PermissionFlagsBits.ViewChannel));
    assert.ok(!allowed.has(PermissionFlagsBits.ViewChannel));
});

test("view-only role can view but cannot send, post or react", () => {
    const overwrites = buildServerCategoryPermissionOverwrites(EVERYONE_ROLE_ID);

    const viewOnly = findOverwrite(overwrites, VIEW_ONLY_ROLE_ID);
    const { allowed, denied } = hasFlag(viewOnly);

    assert.ok(allowed.has(PermissionFlagsBits.ViewChannel));
    assert.ok(allowed.has(PermissionFlagsBits.ReadMessageHistory));

    assert.ok(denied.has(PermissionFlagsBits.SendMessages));
    assert.ok(denied.has(PermissionFlagsBits.SendMessagesInThreads));
    assert.ok(denied.has(PermissionFlagsBits.CreatePublicThreads));
    assert.ok(denied.has(PermissionFlagsBits.CreatePrivateThreads));
    assert.ok(denied.has(PermissionFlagsBits.AddReactions));
});

test("view-and-send role can view and send messages but cannot post", () => {
    const overwrites = buildServerCategoryPermissionOverwrites(EVERYONE_ROLE_ID);

    const viewAndSend = findOverwrite(overwrites, VIEW_AND_SEND_ROLE_ID);
    const { allowed, denied } = hasFlag(viewAndSend);

    assert.ok(allowed.has(PermissionFlagsBits.ViewChannel));
    assert.ok(allowed.has(PermissionFlagsBits.ReadMessageHistory));
    assert.ok(allowed.has(PermissionFlagsBits.SendMessages));
    assert.ok(allowed.has(PermissionFlagsBits.SendMessagesInThreads));

    assert.ok(denied.has(PermissionFlagsBits.CreatePublicThreads));
    assert.ok(denied.has(PermissionFlagsBits.CreatePrivateThreads));
    assert.ok(denied.has(PermissionFlagsBits.AddReactions));
});

test("full-permission roles are granted every permission", () => {
    const overwrites = buildServerCategoryPermissionOverwrites(EVERYONE_ROLE_ID);

    for (const roleId of FULL_PERM_ROLE_IDS) {
        const role = findOverwrite(overwrites, roleId);
        const { allowed, denied } = hasFlag(role);

        assert.ok(allowed.has(PermissionFlagsBits.Administrator));
        assert.ok(!denied.has(PermissionFlagsBits.ViewChannel));
    }
});

test("overwrites cover @everyone, both limited roles and every full-perm role", () => {
    const overwrites = buildServerCategoryPermissionOverwrites(EVERYONE_ROLE_ID);

    const ids = overwrites.map(entry => entry.id).sort();
    const expected = [
        EVERYONE_ROLE_ID,
        VIEW_ONLY_ROLE_ID,
        VIEW_AND_SEND_ROLE_ID,
        ...FULL_PERM_ROLE_IDS
    ].sort();

    assert.deepEqual(ids, expected);
});
