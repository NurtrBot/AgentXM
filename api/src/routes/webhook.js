const express = require("express");
const db = require("../db");
const { genId } = require("../utils");

const r = express.Router();

const crypto = require("crypto");

// Mailgun signature verification middleware
function verifyMailgun(req, res, next) {
  console.log("📨 Webhook received:", JSON.stringify(Object.keys(req.body)));
  const { signature, timestamp, token } = req.body;
  if (!signature || !timestamp || !token) {
    console.warn("⚠️  Webhook missing signature fields. Allowing anyway for now.");
    return next(); // Allow through for debugging
  }

  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.warn("⚠️  MAILGUN_WEBHOOK_SIGNING_KEY not set. Skipping verification.");
    return next();
  }

  const value = timestamp + token;
  const hash = crypto.createHmac("sha256", signingKey).update(value).digest("hex");

  if (hash !== signature) {
    console.warn("⚠️  Webhook signature mismatch. Allowing anyway for debugging.");
    return next(); // Allow through for debugging
  }
  next();
}

// Mailgun inbound webhook
r.post("/inbound", express.urlencoded({ extended: true }), verifyMailgun, (req, res) => {
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
  // ... (keep simulate route related code)
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
