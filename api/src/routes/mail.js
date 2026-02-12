const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth");
const { genId } = require("../utils");
const { sendEmail } = require("../services/mailgun");

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

  // Attempt to send real email (fire and forget)
  sendEmail({ from: m.email, to, subject: subject || "(no subject)", text: body, html: body_html }).catch(console.error);

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

  // Attempt to send real email (fire and forget)
  sendEmail({ from: req.mailbox.email, to: orig.from_address, subject: subj, text: body, html: body_html }).catch(console.error);

  res.status(201).json({ success: true, message: { id, from: req.mailbox.email, to: orig.from_address, subject: subj } });
});

// Delete
r.delete("/:id", (req, res) => {
  const result = db.run("DELETE FROM messages WHERE id=? AND mailbox_id=?", [req.params.id, req.mailbox.id]);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ success: true, deleted: req.params.id });
});

module.exports = r;
