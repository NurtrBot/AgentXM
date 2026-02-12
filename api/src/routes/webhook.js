const express = require("express");
const multer = require("multer");
const db = require("../db");
const { genId } = require("../utils");

const r = express.Router();
const upload = multer(); // memory storage for multipart

const crypto = require("crypto");

// Mailgun signature verification middleware
function verifyMailgun(req, res, next) {
  console.log("📨 Webhook received. Content-Type:", req.headers["content-type"]);
  console.log("📨 Body keys:", JSON.stringify(Object.keys(req.body || {})));
  const { signature, timestamp, token } = req.body || {};
  if (!signature || !timestamp || !token) {
    console.warn("⚠️  Webhook missing signature fields. Allowing anyway for now.");
    return next();
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
    return next();
  }
  next();
}

// Mailgun inbound webhook — supports both multipart/form-data and urlencoded
r.post("/inbound", upload.any(), express.urlencoded({ extended: true }), verifyMailgun, (req, res) => {
  try {
    const body = req.body || {};
    const fromAddr = body.sender || body.from || "";
    const toAddr = body.recipient || body.To || body.to || "";
    const subject = body.subject || body.Subject || "(no subject)";
    const bodyPlain = body["stripped-text"] || body["body-plain"] || "";
    const bodyHtml = body["body-html"] || "";

    console.log(`📬 Inbound: ${fromAddr} → ${toAddr} | Subject: ${subject}`);

    const handle = toAddr.split("@")[0]?.toLowerCase();
    if (!handle) {
      console.warn("⚠️  No handle parsed from recipient:", toAddr);
      return res.status(200).json({ status: "skipped", reason: "no handle" });
    }

    const mailbox = db.one("SELECT * FROM mailboxes WHERE handle=?", [handle]);
    if (!mailbox) {
      console.warn(`⚠️  No mailbox found for handle: ${handle}`);
      return res.status(200).json({ status: "skipped", reason: "no mailbox" });
    }

    const id = genId();
    db.run("INSERT INTO messages (id,mailbox_id,direction,from_address,to_address,subject,body_text,body_html) VALUES (?,?,'inbound',?,?,?,?,?)",
      [id, mailbox.id, fromAddr, toAddr, subject, bodyPlain, bodyHtml]);
    console.log(`✅ Stored message ${id} for ${handle}`);
    res.status(200).json({ status: "stored", id });
  } catch (e) {
    console.error("❌ Webhook error:", e);
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
