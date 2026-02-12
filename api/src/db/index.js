const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_DIR = process.env.RAILWAY_ENVIRONMENT
  ? "/tmp"
  : path.resolve(__dirname, "../../data");
const DB_PATH = path.join(DB_DIR, "agentmx.db");
let db = null;

async function init() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run("PRAGMA foreign_keys = ON");
  db.run(`CREATE TABLE IF NOT EXISTS mailboxes (
    id TEXT PRIMARY KEY, handle TEXT UNIQUE NOT NULL, bot_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    from_address TEXT NOT NULL, to_address TEXT NOT NULL,
    subject TEXT DEFAULT '', body_text TEXT DEFAULT '', body_html TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_mb_key ON mailboxes(api_key)");
  db.run("CREATE INDEX IF NOT EXISTS idx_mb_handle ON mailboxes(handle)");
  db.run("CREATE INDEX IF NOT EXISTS idx_msg_mb ON messages(mailbox_id, direction)");
  save();
  return db;
}

function save() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function one(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
  return { changes: db.getRowsModified() };
}

module.exports = { init, all, one, run };
