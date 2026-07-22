import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), "database.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    username TEXT NOT NULL,
    reason TEXT NOT NULL,
    moderator TEXT NOT NULL,
    createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    userId TEXT NOT NULL,
    username TEXT NOT NULL,
    reason TEXT NOT NULL,
    moderator TEXT NOT NULL,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt INTEGER NOT NULL
);
`);

const moderationActionColumns = db.prepare("PRAGMA table_info(moderation_actions)").all() as Array<{ name: string }>;
const hasMetadataColumn = moderationActionColumns.some(column => column.name === "metadata");

if (!hasMetadataColumn) {
    db.exec("ALTER TABLE moderation_actions ADD COLUMN metadata TEXT");
}

const hasDurationColumn = moderationActionColumns.some(column => column.name === "duration");

if (!hasDurationColumn) {
    // Seconds. -1 or NULL = permanent. Read directly as action.duration by the
    // Lua moderation worker's applyBanAction, so it must stay a top-level column
    // (not nested in metadata).
    db.exec("ALTER TABLE moderation_actions ADD COLUMN duration INTEGER");
}

const bansColumns = db.prepare("PRAGMA table_info(bans)").all() as Array<{ name: string }>;
const hasBansDurationColumn = bansColumns.some(column => column.name === "duration");

if (!hasBansDurationColumn) {
    db.exec("ALTER TABLE bans ADD COLUMN duration INTEGER");
}

export default db;