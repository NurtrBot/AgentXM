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
