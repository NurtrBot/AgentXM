const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const DOMAIN = process.env.MAILGUN_DOMAIN || "agentmx.dev";

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
  const reserved = ["admin", "support", "help", "info", "contact", "mail", "postmaster",
    "abuse", "noreply", "no-reply", "root", "webmaster", "security", "system", "test", "api", "www"];
  if (reserved.includes(c)) return "That handle is reserved";
  return null; // null = valid
}

module.exports = { genId, genApiKey, okHandle, DOMAIN };
