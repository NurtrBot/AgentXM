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
