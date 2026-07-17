import Database from "better-sqlite3";

const db = new Database("database.sqlite");

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
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt INTEGER NOT NULL
);
`);

export default db;
