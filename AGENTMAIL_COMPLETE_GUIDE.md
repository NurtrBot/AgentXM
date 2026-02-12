# AgentMail — Complete Build & Setup Guide

> One command to give any AI agent its own email. No OAuth. No Google Workspace. No token refresh.

---

## Project Structure

```
agentmail/
├── api/                        # API Server (Express + SQLite)
│   ├── package.json
│   ├── data/                   # SQLite database (auto-created)
│   │   └── agentmail.db
│   └── src/
│       ├── index.js            # Server entry point
│       ├── db/
│       │   └── index.js        # Database init + query helpers
│       ├── middleware/
│       │   └── auth.js         # API key authentication
│       ├── routes/
│       │   ├── mailbox.js      # Create, status, login, check handle
│       │   ├── mail.js         # Inbox, sent, read, send, reply, delete
│       │   └── webhook.js      # Mailgun inbound + dev simulator
│       └── utils/
│           └── index.js        # ID gen, API key gen, handle validation
│
└── cli/                        # CLI + SDK (npm package)
    ├── package.json
    └── src/
        ├── cli.js              # Terminal commands (init, inbox, sent, read, send, status, config)
        ├── client.js           # HTTP client (used by both CLI and SDK)
        └── sdk.js              # Public SDK entry point
```

---

## Part 1: API Server

### Quick Start (Local Dev)

```bash
cd agentmail/api
npm install
node src/index.js
# 🤖 AgentMail API running on http://localhost:3001
```

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/mailbox/create` | None | Create a new agent mailbox |
| GET | `/v1/mailbox/check/:handle` | None | Check if handle is available |
| GET | `/v1/mailbox/status` | API Key | Get mailbox stats |
| POST | `/v1/mailbox/login` | None | Owner login (email + password) |
| GET | `/v1/mail/inbox` | API Key | List inbox messages |
| GET | `/v1/mail/sent` | API Key | List sent messages |
| GET | `/v1/mail/:id` | API Key | Read a specific message |
| POST | `/v1/mail/send` | API Key | Send an email |
| POST | `/v1/mail/:id/reply` | API Key | Reply to a message |
| DELETE | `/v1/mail/:id` | API Key | Delete a message |
| POST | `/v1/webhook/inbound` | Mailgun Sig | Receive inbound email (Mailgun webhook) |
| POST | `/v1/webhook/simulate` | None (dev) | Simulate inbound email for testing |

**Authentication:** Include API key as `x-api-key` header, `Authorization: Bearer <key>`, or `?apiKey=<key>` query param.

---

### File: `api/package.json`

```json
{
  "name": "agentmail-api",
  "version": "1.0.0",
  "description": "AgentMail API Server",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "node test.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "sql.js": "^1.10.3",
    "bcryptjs": "^2.4.3",
    "uuid": "^9.0.0",
    "cors": "^2.8.5"
  }
}
```

### File: `api/src/index.js`

```javascript
const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/v1/mailbox", require("./routes/mailbox"));
app.use("/v1/mail", require("./routes/mail"));
app.use("/v1/webhook", require("./routes/webhook"));

app.get("/", (req, res) => res.json({ service: "AgentMail API", version: "1.0.0" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  🤖 AgentMail API running on http://localhost:${PORT}\n`);
  });
}).catch(e => { console.error("DB init failed:", e); process.exit(1); });

module.exports = app;
```

### File: `api/src/db/index.js`

```javascript
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.resolve(__dirname, "../../data/agentmail.db");
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
```

### File: `api/src/utils/index.js`

```javascript
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const DOMAIN = "agentmail.dev";

function genId() { return uuidv4(); }

function genApiKey() {
  return "am_live_" + crypto.randomBytes(24).toString("base64url");
}

function okHandle(h) {
  if (!h || typeof h !== "string") return "Handle is required";
  const c = h.toLowerCase().trim();
  if (c.length < 3) return "Handle must be at least 3 characters";
  if (c.length > 30) return "Handle must be 30 characters or less";
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(c) && c.length > 2)
    return "Only lowercase letters, numbers, dots, hyphens, underscores";
  const reserved = ["admin","support","help","info","contact","mail","postmaster",
    "abuse","noreply","no-reply","root","webmaster","security","system","test","api","www"];
  if (reserved.includes(c)) return "That handle is reserved";
  return null; // null = valid
}

module.exports = { genId, genApiKey, okHandle, DOMAIN };
```

### File: `api/src/middleware/auth.js`

```javascript
const db = require("../db");

function auth(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.apiKey ||
    (req.headers.authorization || "").replace("Bearer ", "");
  if (!key) return res.status(401).json({ error: "Missing API key" });

  const mailbox = db.one("SELECT * FROM mailboxes WHERE api_key = ?", [key]);
  if (!mailbox) return res.status(401).json({ error: "Invalid API key" });

  req.mailbox = mailbox;
  next();
}

module.exports = auth;
```

### File: `api/src/routes/mailbox.js`

```javascript
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const auth = require("../middleware/auth");
const { genId, genApiKey, okHandle, DOMAIN } = require("../utils");

const r = express.Router();

// Create mailbox
r.post("/create", async (req, res) => {
  try {
    const { handle, bot_name, password } = req.body;
    const err = okHandle(handle);
    if (err) return res.status(400).json({ error: err });
    if (!bot_name || !bot_name.trim()) return res.status(400).json({ error: "Bot name required" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be 6+ chars" });

    const h = handle.toLowerCase().trim();
    const email = `${h}@${DOMAIN}`;

    if (db.one("SELECT id FROM mailboxes WHERE handle=?", [h]))
      return res.status(409).json({ error: `${email} is already taken.` });

    const id = genId(), apiKey = genApiKey();
    const hash = await bcrypt.hash(password, 12);

    db.run("INSERT INTO mailboxes (id,handle,bot_name,email,password_hash,api_key) VALUES (?,?,?,?,?,?)",
      [id, h, bot_name.trim(), email, hash, apiKey]);

    res.status(201).json({ success: true, mailbox: { id, email, bot_name: bot_name.trim(), api_key: apiKey } });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to create mailbox" }); }
});

// Status
r.get("/status", auth, (req, res) => {
  const m = req.mailbox;
  const inbox = db.one("SELECT COUNT(*) as c FROM messages WHERE mailbox_id=? AND direction='inbound'", [m.id]);
  const sent = db.one("SELECT COUNT(*) as c FROM messages WHERE mailbox_id=? AND direction='outbound'", [m.id]);
  const unread = db.one("SELECT COUNT(*) as c FROM messages WHERE mailbox_id=? AND direction='inbound' AND is_read=0", [m.id]);
  res.json({ email: m.email, bot_name: m.bot_name, created_at: m.created_at,
    stats: { inbox: inbox.c, sent: sent.c, unread: unread.c } });
});

// Owner login
r.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const m = db.one("SELECT * FROM mailboxes WHERE email=?", [email]);
    if (!m) return res.status(401).json({ error: "Invalid credentials" });
    if (!(await bcrypt.compare(password, m.password_hash))) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ success: true, mailbox: { id: m.id, email: m.email, bot_name: m.bot_name, api_key: m.api_key } });
  } catch (e) { console.error(e); res.status(500).json({ error: "Login failed" }); }
});

// Check availability
r.get("/check/:handle", (req, res) => {
  const err = okHandle(req.params.handle);
  if (err) return res.status(400).json({ available: false, error: err });
  const h = req.params.handle.toLowerCase().trim();
  const taken = db.one("SELECT id FROM mailboxes WHERE handle=?", [h]);
  res.json({ handle: h, email: `${h}@${DOMAIN}`, available: !taken });
});

module.exports = r;
```

### File: `api/src/routes/mail.js`

```javascript
const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth");
const { genId } = require("../utils");

const r = express.Router();
r.use(auth);

// Inbox
r.get("/inbox", (req, res) => {
  const { limit = 50, offset = 0, unread } = req.query;
  let sql = "SELECT id,from_address,to_address,subject,is_read,created_at FROM messages WHERE mailbox_id=? AND direction='inbound'";
  const p = [req.mailbox.id];
  if (unread === "true") sql += " AND is_read=0";
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  p.push(+limit, +offset);
  const msgs = db.all(sql, p);
  const total = db.one("SELECT COUNT(*) as c FROM messages WHERE mailbox_id=? AND direction='inbound'", [req.mailbox.id]);
  res.json({ messages: msgs, total: total.c });
});

// Sent
r.get("/sent", (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const msgs = db.all(
    "SELECT id,from_address,to_address,subject,created_at FROM messages WHERE mailbox_id=? AND direction='outbound' ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [req.mailbox.id, +limit, +offset]
  );
  const total = db.one("SELECT COUNT(*) as c FROM messages WHERE mailbox_id=? AND direction='outbound'", [req.mailbox.id]);
  res.json({ messages: msgs, total: total.c });
});

// Read single message
r.get("/:id", (req, res) => {
  const msg = db.one("SELECT * FROM messages WHERE id=? AND mailbox_id=?", [req.params.id, req.mailbox.id]);
  if (!msg) return res.status(404).json({ error: "Not found" });
  if (msg.direction === "inbound" && !msg.is_read) {
    db.run("UPDATE messages SET is_read=1 WHERE id=?", [msg.id]);
    msg.is_read = 1;
  }
  res.json({ message: msg });
});

// Send
r.post("/send", (req, res) => {
  const { to, subject, body, body_html } = req.body;
  if (!to) return res.status(400).json({ error: "Recipient (to) required" });
  const id = genId(), m = req.mailbox;
  db.run("INSERT INTO messages (id,mailbox_id,direction,from_address,to_address,subject,body_text,body_html) VALUES (?,?,'outbound',?,?,?,?,?)",
    [id, m.id, m.email, to, subject || "(no subject)", body || "", body_html || ""]);
  res.status(201).json({ success: true, message: { id, from: m.email, to, subject: subject || "(no subject)" } });
});

// Reply
r.post("/:id/reply", (req, res) => {
  const { body, body_html } = req.body;
  const orig = db.one("SELECT * FROM messages WHERE id=? AND mailbox_id=?", [req.params.id, req.mailbox.id]);
  if (!orig) return res.status(404).json({ error: "Original not found" });
  const id = genId();
  const subj = orig.subject.startsWith("Re: ") ? orig.subject : `Re: ${orig.subject}`;
  db.run("INSERT INTO messages (id,mailbox_id,direction,from_address,to_address,subject,body_text,body_html) VALUES (?,?,'outbound',?,?,?,?,?)",
    [id, req.mailbox.id, req.mailbox.email, orig.from_address, subj, body || "", body_html || ""]);
  res.status(201).json({ success: true, message: { id, from: req.mailbox.email, to: orig.from_address, subject: subj } });
});

// Delete
r.delete("/:id", (req, res) => {
  const result = db.run("DELETE FROM messages WHERE id=? AND mailbox_id=?", [req.params.id, req.mailbox.id]);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ success: true, deleted: req.params.id });
});

module.exports = r;
```

### File: `api/src/routes/webhook.js`

```javascript
const express = require("express");
const db = require("../db");
const { genId } = require("../utils");

const r = express.Router();

// Mailgun inbound webhook
r.post("/inbound", express.urlencoded({ extended: true }), (req, res) => {
  try {
    const { sender, from, recipient, subject,
      "body-plain": bodyPlain, "body-html": bodyHtml, "stripped-text": stripped } = req.body;
    const fromAddr = sender || from || "";
    const toAddr = recipient || "";
    const handle = toAddr.split("@")[0]?.toLowerCase();
    if (!handle) return res.status(200).json({ status: "skipped" });

    const mailbox = db.one("SELECT * FROM mailboxes WHERE handle=?", [handle]);
    if (!mailbox) return res.status(200).json({ status: "skipped" });

    const id = genId();
    db.run("INSERT INTO messages (id,mailbox_id,direction,from_address,to_address,subject,body_text,body_html) VALUES (?,?,'inbound',?,?,?,?,?)",
      [id, mailbox.id, fromAddr, toAddr, subject || "(no subject)", stripped || bodyPlain || "", bodyHtml || ""]);
    console.log(`📬 ${fromAddr} → ${toAddr}`);
    res.status(200).json({ status: "stored", id });
  } catch (e) {
    console.error("Webhook error:", e);
    res.status(200).json({ status: "error" });
  }
});

// Dev-only: simulate inbound email
r.post("/simulate", (req, res) => {
  const { from, to, subject, body } = req.body;
  if (!from || !to) return res.status(400).json({ error: "from and to required" });
  const handle = to.split("@")[0]?.toLowerCase();
  const mailbox = db.one("SELECT * FROM mailboxes WHERE handle=?", [handle]);
  if (!mailbox) return res.status(404).json({ error: `No mailbox for ${to}` });
  const id = genId();
  db.run("INSERT INTO messages (id,mailbox_id,direction,from_address,to_address,subject,body_text,body_html) VALUES (?,?,'inbound',?,?,?,?,'')",
    [id, mailbox.id, from, to, subject || "(no subject)", body || ""]);
  res.status(201).json({ success: true, id });
});

module.exports = r;
```

---

## Part 2: CLI + SDK

### File: `cli/package.json`

```json
{
  "name": "agentmail",
  "version": "1.0.0",
  "description": "Email for AI agents. One command setup.",
  "main": "src/sdk.js",
  "bin": { "agentmail": "./src/cli.js" },
  "keywords": ["ai","agent","email","bot","claude","llm"],
  "license": "MIT",
  "dependencies": {
    "commander": "^12.0.0"
  }
}
```

### File: `cli/src/sdk.js`

```javascript
module.exports = require("./client");
```

### File: `cli/src/client.js`

```javascript
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const CONFIG_DIR = ".agentmail";
const CONFIG_FILE = "config.json";

class AgentMail {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || null;
    this.endpoint = opts.endpoint || "https://api.agentmail.dev";
    this.email = opts.email || null;
    this.botName = opts.botName || null;
  }

  static fromConfig(dir) {
    const file = path.join(dir || process.cwd(), CONFIG_DIR, CONFIG_FILE);
    if (!fs.existsSync(file))
      throw new Error(`No config at ${file}. Run: npx agentmail init`);
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    return new AgentMail({ apiKey: c.apiKey, endpoint: c.endpoint, email: c.email, botName: c.botName });
  }

  _req(method, urlPath, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.endpoint);
      const lib = url.protocol === "https:" ? https : http;
      const opts = {
        hostname: url.hostname, port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search, method,
        headers: { "Content-Type": "application/json", "User-Agent": "agentmail/1.0" },
      };
      if (this.apiKey) opts.headers["x-api-key"] = this.apiKey;

      const req = lib.request(opts, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(d);
            res.statusCode >= 400 ? reject(new Error(j.error || `HTTP ${res.statusCode}`)) : resolve(j);
          } catch { reject(new Error(`Bad response: ${d.slice(0, 200)}`)); }
        });
      });
      req.on("error", reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // Mailbox
  createMailbox(handle, botName, password) {
    return this._req("POST", "/v1/mailbox/create", { handle, bot_name: botName, password });
  }
  checkHandle(handle) { return this._req("GET", `/v1/mailbox/check/${handle}`); }
  status() { return this._req("GET", "/v1/mailbox/status"); }

  // Mail
  inbox(opts = {}) {
    const p = new URLSearchParams();
    if (opts.limit) p.set("limit", opts.limit);
    if (opts.unread) p.set("unread", "true");
    return this._req("GET", `/v1/mail/inbox${p.toString() ? "?" + p : ""}`);
  }
  sent(opts = {}) {
    const p = new URLSearchParams();
    if (opts.limit) p.set("limit", opts.limit);
    return this._req("GET", `/v1/mail/sent${p.toString() ? "?" + p : ""}`);
  }
  read(id) { return this._req("GET", `/v1/mail/${id}`); }
  send({ to, subject, body, bodyHtml }) {
    return this._req("POST", "/v1/mail/send", { to, subject, body, body_html: bodyHtml });
  }
  reply(id, { body, bodyHtml }) {
    return this._req("POST", `/v1/mail/${id}/reply`, { body, body_html: bodyHtml });
  }
  deleteMessage(id) { return this._req("DELETE", `/v1/mail/${id}`); }
}

module.exports = AgentMail;
```

### File: `cli/src/cli.js`

```javascript
#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Command } = require("commander");
const AgentMail = require("./client");

// ─── ANSI helpers ────────────────────────────────────────────────
const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
};
const LINE = c.dim("─".repeat(65));

// ─── Config ──────────────────────────────────────────────────────
const CONF_DIR = ".agentmail";
const CONF_FILE = "config.json";
const DOMAIN = "agentmail.dev";

function confPath() { return path.join(process.cwd(), CONF_DIR, CONF_FILE); }
function hasConf() { return fs.existsSync(confPath()); }

function loadConf() {
  if (!hasConf()) {
    console.log(c.red("\n  No AgentMail config found."));
    console.log(c.dim("  Run: npx agentmail init\n"));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(confPath(), "utf8"));
}

function saveConf(data) {
  const dir = path.join(process.cwd(), CONF_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, CONF_FILE), JSON.stringify(data, null, 2));
}

function getClient() {
  const conf = loadConf();
  return new AgentMail({ apiKey: conf.apiKey, endpoint: conf.endpoint, email: conf.email, botName: conf.botName });
}

// ─── Prompt helpers ──────────────────────────────────────────────
function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

function askPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    const chars = [];
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(chars.join(""));
      } else if (ch === "\u007F" || ch === "\b") {
        if (chars.length > 0) { chars.pop(); process.stdout.write("\b \b"); }
      } else if (ch === "\u0003") {
        process.exit(0);
      } else {
        chars.push(ch);
        process.stdout.write("•");
      }
    };
    process.stdin.on("data", onData);
  });
}

// ─── Formatters ──────────────────────────────────────────────────
function fmtDate(s) {
  const d = new Date(s + (s.includes("Z") || s.includes("+") ? "" : "Z"));
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function trunc(s, n) { return !s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s; }

function pad(s, n) {
  const clean = s.replace(/\x1b\[[0-9;]*m/g, "");
  return s + " ".repeat(Math.max(0, n - clean.length));
}

function table(headers, rows, widths) {
  const sep = widths.map((w) => "─".repeat(w)).join("─┬─");
  console.log("  " + c.dim(sep));
  console.log("  " + headers.map((h, i) => pad(c.dim(h), widths[i])).join(" │ "));
  console.log("  " + c.dim(sep));
  rows.forEach((row) => {
    console.log("  " + row.map((cell, i) => pad(cell, widths[i])).join(" │ "));
  });
  console.log("  " + c.dim(sep));
}

// ─── Commands ────────────────────────────────────────────────────

async function cmdInit(opts) {
  console.log("\n" + c.bold("  🤖 AgentMail — Email for AI Agents"));
  console.log("  " + LINE + "\n");

  if (hasConf()) {
    const existing = JSON.parse(fs.readFileSync(confPath(), "utf8"));
    console.log(c.yellow(`  Already configured: ${existing.email}`));
    const ow = await ask("  Overwrite? (y/N): ");
    if (ow.toLowerCase() !== "y") { console.log(c.dim("\n  Keeping existing config.\n")); return; }
    console.log("");
  }

  const endpoint = opts.endpoint || process.env.AGENTMAIL_ENDPOINT || "http://localhost:3001";

  let handle;
  while (true) {
    handle = await ask(`  Desired email handle ${c.dim(`@${DOMAIN}`)}: `);
    handle = handle.toLowerCase().trim();
    if (handle.length < 3) { console.log(c.red("  Must be at least 3 characters")); continue; }
    if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(handle) && handle.length > 2) {
      console.log(c.red("  Only lowercase letters, numbers, dots, hyphens, underscores")); continue;
    }
    break;
  }

  const defaultName = handle.charAt(0).toUpperCase() + handle.slice(1) + " Bot";
  let botName = await ask(`  Bot name ${c.dim(`(${defaultName})`)}: `);
  botName = botName.trim() || defaultName;

  let password;
  while (true) {
    password = await askPassword("  Owner password: ");
    if (password.length < 6) { console.log(c.red("  Must be at least 6 characters")); continue; }
    const confirm = await askPassword("  Confirm password: ");
    if (password !== confirm) { console.log(c.red("  Passwords don't match")); continue; }
    break;
  }

  console.log(c.dim("\n  Creating mailbox..."));
  try {
    const client = new AgentMail({ endpoint });
    const result = await client.createMailbox(handle, botName, password);
    const mb = result.mailbox;

    saveConf({ email: mb.email, apiKey: mb.api_key, botName: mb.bot_name, endpoint, mailboxId: mb.id });

    const gi = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gi) && !fs.readFileSync(gi, "utf8").includes(".agentmail"))
      fs.appendFileSync(gi, "\n.agentmail/\n");

    console.log("\n" + c.green("  ✅ You're all set!"));
    console.log("  " + LINE);
    console.log(`  📧 Email:    ${c.cyan(mb.email)}`);
    console.log(`  🤖 Bot:      ${mb.bot_name}`);
    console.log(`  🔑 Config:   ${c.dim(confPath())}`);
    console.log("\n" + c.yellow(`  📬 Send a test email to ${c.bold(mb.email)} to confirm!\n`));
  } catch (e) {
    console.log(c.red(`\n  ✖ ${e.message}\n`));
    process.exit(1);
  }
}

async function cmdInbox() {
  const client = getClient();
  const conf = loadConf();
  try {
    const { messages, total } = await client.inbox({ limit: 25 });
    console.log("\n" + c.bold(`  📬 Inbox — ${c.cyan(conf.email)}`));
    if (messages.length === 0) {
      console.log(c.dim(`\n  No messages yet. Send an email to ${conf.email} to get started.\n`));
      return;
    }
    const rows = messages.map((m, i) => [
      c.dim(String(i + 1)),
      trunc(m.from_address, 25),
      m.is_read ? trunc(m.subject, 30) : c.bold(trunc(m.subject, 30)),
      fmtDate(m.created_at),
      m.is_read ? " " : c.blue("●"),
    ]);
    table(["#", "From", "Subject", "Date", ""], rows, [3, 25, 30, 16, 2]);
    console.log(c.dim(`  ${total} messages | agentmail read <#> to open\n`));
  } catch (e) { console.log(c.red(`\n  ✖ ${e.message}\n`)); }
}

async function cmdSent() {
  const client = getClient();
  const conf = loadConf();
  try {
    const { messages, total } = await client.sent({ limit: 25 });
    console.log("\n" + c.bold(`  📤 Sent — ${c.cyan(conf.email)}`));
    if (messages.length === 0) { console.log(c.dim("\n  No sent messages yet.\n")); return; }
    const rows = messages.map((m, i) => [
      c.dim(String(i + 1)), trunc(m.to_address, 25), trunc(m.subject, 33), fmtDate(m.created_at),
    ]);
    table(["#", "To", "Subject", "Date"], rows, [3, 25, 33, 16]);
    console.log(c.dim(`  ${total} sent messages\n`));
  } catch (e) { console.log(c.red(`\n  ✖ ${e.message}\n`)); }
}

async function cmdRead(indexOrId) {
  const client = getClient();
  let msgId = indexOrId;
  if (/^\d+$/.test(indexOrId)) {
    const idx = parseInt(indexOrId) - 1;
    const { messages } = await client.inbox({ limit: 50 });
    if (idx < 0 || idx >= messages.length) { console.log(c.red(`\n  Message #${indexOrId} not found.\n`)); return; }
    msgId = messages[idx].id;
  }
  try {
    const { message: msg } = await client.read(msgId);
    console.log(`\n  ${LINE}`);
    console.log(`  ${c.dim("From:")}     ${msg.from_address}`);
    console.log(`  ${c.dim("To:")}       ${msg.to_address}`);
    console.log(`  ${c.dim("Date:")}     ${fmtDate(msg.created_at)}`);
    console.log(`  ${c.dim("Subject:")}  ${c.bold(msg.subject)}`);
    console.log(`  ${LINE}\n`);
    (msg.body_text || msg.body_html || "(empty)").split("\n").forEach((l) => console.log(`  ${l}`));
    console.log(`\n  ${LINE}`);
    console.log(c.dim(`  ID: ${msg.id}\n`));
  } catch (e) { console.log(c.red(`\n  ✖ ${e.message}\n`)); }
}

async function cmdSend() {
  const client = getClient();
  const conf = loadConf();
  console.log("\n" + c.bold(`  ✏️  Compose — from ${c.cyan(conf.email)}`) + "\n");
  const to = await ask("  To: ");
  if (!to || !to.includes("@")) { console.log(c.red("  Invalid email\n")); return; }
  const subject = await ask("  Subject: ");
  const body = await ask("  Body: ");
  try {
    await client.send({ to: to.trim(), subject: subject || "(no subject)", body });
    console.log(c.green(`\n  ✅ Sent to ${to.trim()}\n`));
  } catch (e) { console.log(c.red(`\n  ✖ ${e.message}\n`)); }
}

async function cmdStatus() {
  const client = getClient();
  const conf = loadConf();
  try {
    const s = await client.status();
    console.log("\n" + c.bold("  🤖 AgentMail Status"));
    console.log("  " + LINE);
    console.log(`  📧 Email:     ${c.cyan(s.email)}`);
    console.log(`  🤖 Bot:       ${s.bot_name}`);
    console.log(`  📅 Created:   ${fmtDate(s.created_at)}`);
    console.log(`  📬 Inbox:     ${s.stats.inbox} messages`);
    console.log(`  🆕 Unread:    ${s.stats.unread > 0 ? c.blue(s.stats.unread) : 0}`);
    console.log(`  📤 Sent:      ${s.stats.sent} messages`);
    console.log("  " + LINE);
    console.log(c.dim(`  Config: ${confPath()}`));
    console.log(c.dim(`  API:    ${conf.endpoint}\n`));
  } catch (e) { console.log(c.red(`\n  ✖ ${e.message}\n`)); }
}

async function cmdConfig() {
  if (!hasConf()) { console.log(c.red("\n  No config. Run: npx agentmail init\n")); return; }
  const conf = loadConf();
  console.log("\n" + c.bold("  AgentMail Config"));
  console.log("  " + LINE);
  console.log(`  Path:      ${confPath()}`);
  console.log(`  Email:     ${conf.email}`);
  console.log(`  Bot:       ${conf.botName}`);
  console.log(`  Endpoint:  ${conf.endpoint}`);
  console.log(`  API Key:   ${conf.apiKey.slice(0, 16)}...`);
  console.log("");
}

// ─── Program ─────────────────────────────────────────────────────
const prog = new Command();
prog.name("agentmail").description("Email for AI agents.").version("1.0.0");
prog.command("init").description("Set up a new agent mailbox").option("-e, --endpoint <url>", "API URL").action(cmdInit);
prog.command("inbox").description("View inbox").action(cmdInbox);
prog.command("sent").description("View sent mail").action(cmdSent);
prog.command("read <index>").description("Read message by # or ID").action(cmdRead);
prog.command("send").description("Compose and send").action(cmdSend);
prog.command("status").description("Mailbox info and stats").action(cmdStatus);
prog.command("config").description("Show config").action(cmdConfig);
prog.parse(process.argv);
```

---

## Part 3: Deployment Commands

### Deploy the API to DigitalOcean

```bash
# 1. Create a $6/mo droplet (Ubuntu 24.04)
# 2. SSH in and run:

sudo apt update && sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx

# 3. Clone your repo
git clone https://github.com/youruser/agentmail.git
cd agentmail/api
npm install

# 4. Create a systemd service
sudo tee /etc/systemd/system/agentmail.service << 'EOF'
[Unit]
Description=AgentMail API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/agentmail/api
ExecStart=/usr/bin/node src/index.js
Restart=always
Environment=PORT=3001
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable agentmail
sudo systemctl start agentmail

# 5. Nginx reverse proxy
sudo tee /etc/nginx/sites-available/agentmail << 'EOF'
server {
    listen 80;
    server_name api.agentmail.dev;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/agentmail /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. SSL
sudo certbot --nginx -d api.agentmail.dev
```

### Domain DNS Setup

```
# Point your domain to your droplet IP

# A Record
api.agentmail.dev  →  YOUR_DROPLET_IP

# MX Record (for Mailgun inbound)
agentmail.dev      →  mxa.mailgun.org  (priority 10)
agentmail.dev      →  mxb.mailgun.org  (priority 10)

# SPF (TXT record on agentmail.dev)
v=spf1 include:mailgun.org ~all

# DKIM (TXT record — Mailgun provides the value)
# DMARC (TXT record on _dmarc.agentmail.dev)
v=DMARC1; p=none;
```

### Mailgun Inbound Webhook

```
# In Mailgun dashboard:
# Routes → Create Route
#   Expression type: catch_all()
#   Action: forward("https://api.agentmail.dev/v1/webhook/inbound")
#   Action: stop()
```

### Publish the CLI to npm

```bash
cd agentmail/cli
npm login
npm publish
# Users can now run: npx agentmail init
```

---

## Part 4: SDK Usage (What Agents Import)

### JavaScript / Node.js

```javascript
const AgentMail = require("agentmail");

// Option 1: Load from config file (written by CLI)
const mail = AgentMail.fromConfig();

// Option 2: Direct initialization
const mail = new AgentMail({
  apiKey: "am_live_abc123...",
  endpoint: "https://api.agentmail.dev"
});

// Send email
await mail.send({
  to: "zack@gmail.com",
  subject: "Daily Report",
  body: "Revenue up 12%, churn down 3%."
});

// Check inbox
const { messages } = await mail.inbox();
const { messages: unread } = await mail.inbox({ unread: true });

// Read a message
const { message } = await mail.read(messages[0].id);
console.log(message.from_address, message.subject, message.body_text);

// Reply
await mail.reply(messages[0].id, { body: "Got it, thanks!" });

// Delete
await mail.deleteMessage(messages[0].id);

// Check status
const status = await mail.status();
console.log(status.stats); // { inbox: 5, sent: 3, unread: 2 }
```

### CLI Commands Reference

```bash
npx agentmail init              # Set up a new agent mailbox
npx agentmail inbox             # View inbox table
npx agentmail sent              # View sent mail table
npx agentmail read <#>          # Read message by inbox number
npx agentmail read <uuid>       # Read message by ID
npx agentmail send              # Interactive compose & send
npx agentmail status            # Show mailbox info & stats
npx agentmail config            # Show current config
```

### Config File (`.agentmail/config.json`)

Written automatically by `npx agentmail init`. The agent reads this — no password needed.

```json
{
  "email": "researchbot@agentmail.dev",
  "apiKey": "am_live_T-8O88qpL0WAHVmNY4Bcc354DMEFYaov",
  "botName": "Research Assistant",
  "endpoint": "https://api.agentmail.dev",
  "mailboxId": "1cca1093-fd38-44cd-b5d2-c4eafe5d0bc9"
}
```

> **Important:** Add `.agentmail/` to your `.gitignore`. The CLI does this automatically if a `.gitignore` exists.

---

## Test Results (All Passed)

```
✅ CREATE MAILBOX     → researchbot@agentmail.dev created, API key returned
✅ SIMULATE INBOUND   → 2 emails received from zack@gmail.com and sarah@startup.io
✅ SEND OUTBOUND      → Email sent to zack@gmail.com
✅ INBOX              → 2 messages listed with subject, sender, read status
✅ SENT               → 1 sent message listed
✅ STATUS             → inbox: 2, sent: 1, unread: 2
✅ OWNER LOGIN        → Password auth returns API key for web portal
✅ READ MESSAGE       → Full message body returned, marked as read
✅ REPLY              → Reply sent with "Re:" prefix
✅ CHECK HANDLE       → "researchbot" taken, "available-name" available
```
