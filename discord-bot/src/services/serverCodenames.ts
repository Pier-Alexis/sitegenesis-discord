import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// discord-bot/src/services/serverCodenames.ts -> discord-bot/data/server-codenames.json
const DATA_FILE = path.join(__dirname, "..", "..", "data", "server-codenames.json");

const ARCHIVE_PREFIX = "(ARCHIVE) ";

const ADJECTIVES = [
    "Fading", "Silent", "Crimson", "Shadow", "Iron", "Shattered", "Hollow",
    "Ashen", "Phantom", "Obsidian", "Static", "Frozen", "Quiet", "Fractured", "Kinetic"
] as const;

const NOUNS = [
    "Rifle", "Aegis", "Perimeter", "Sentinel", "Protocol", "Horizon", "Echo",
    "Lattice", "Citadel", "Cascade", "Vector", "Outpost", "Relay", "Bulwark", "Matrix"
] as const;

const GREEK_LETTERS = [
    "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta",
    "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho",
    "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"
] as const;

type CodenameStore = Record<string, string>; // serverId -> codename

let cache: CodenameStore | null = null;

function loadStore(): CodenameStore {
    if (cache) {
        return cache;
    }

    try {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        cache = JSON.parse(raw) as CodenameStore;
    } catch {
        cache = {};
    }

    return cache;
}

function saveStore(store: CodenameStore) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
    cache = store;
}

function generateUniqueCodename(alreadyUsed: Set<string>): string {
    const combos: string[] = [];

    for (const adjective of ADJECTIVES) {
        for (const noun of NOUNS) {
            for (const letter of GREEK_LETTERS) {
                combos.push(`${adjective} ${noun} ${letter}`);
            }
        }
    }

    // Shuffle so codenames don't get handed out in a predictable order.
    for (let i = combos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combos[i], combos[j]] = [combos[j], combos[i]];
    }

    const available = combos.find(name => !alreadyUsed.has(name));

    if (!available) {
        throw new Error(
            "No more unique server codenames available (all 5,400 combinations are in use)."
        );
    }

    return available;
}

/**
 * Returns the codename for a serverId, generating and persisting one on first use.
 * Always returns the same codename for the same serverId afterwards.
 */
export function getCodenameForServerId(serverId: string): string {
    const store = loadStore();

    const existing = store[serverId];
    if (existing) {
        return existing;
    }

    const alreadyUsed = new Set(Object.values(store));
    const codename = generateUniqueCodename(alreadyUsed);

    store[serverId] = codename;
    saveStore(store);

    return codename;
}

/** Reverse lookup: codename -> serverId. Returns null if unknown. */
export function getServerIdForCodename(codename: string): string | null {
    const store = loadStore();

    for (const [serverId, name] of Object.entries(store)) {
        if (name === codename) {
            return serverId;
        }
    }

    return null;
}

/** The exact string that should be used as the category name. */
export function buildCategoryDisplayName(serverId: string, isArchived = false): string {
    const codename = getCodenameForServerId(serverId);
    return isArchived ? `${ARCHIVE_PREFIX}${codename}` : codename;
}

/**
 * Given a Discord category name, resolves it back to a real serverId using the
 * persisted mapping (NOT by parsing the string, since the string no longer
 * contains the real id).
 */
export function resolveServerIdFromCategoryName(
    categoryName: string
): { serverId: string; isArchived: boolean } | null {
    const isArchived = categoryName.startsWith(ARCHIVE_PREFIX);
    const codename = (isArchived ? categoryName.slice(ARCHIVE_PREFIX.length) : categoryName).trim();

    const serverId = getServerIdForCodename(codename);

    if (!serverId) {
        return null;
    }

    return { serverId, isArchived };
}

/** All known servers, for building select menus. */
export function listServerDirectory(): Array<{ serverId: string; codename: string }> {
    const store = loadStore();
    return Object.entries(store).map(([serverId, codename]) => ({ serverId, codename }));
}