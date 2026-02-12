const FormData = require("form-data");
const Mailgun = require("mailgun.js");

const API_KEY = process.env.MAILGUN_API_KEY;
const DOMAIN = process.env.MAILGUN_DOMAIN;

let client = null;

if (API_KEY) {
  const mailgun = new Mailgun(FormData);
  client = mailgun.client({ username: "api", key: API_KEY });
  console.log("🔫 Mailgun enabled");
} else {
  console.log("⚠️  Mailgun disabled (missing MAILGUN_API_KEY)");
}

async function sendEmail({ from, to, subject, text, html }) {
  if (!client) {
    console.log(`[DEV] Would send email to ${to}: ${subject}`);
    return;
  }
  if (!DOMAIN) throw new Error("Missing MAILGUN_DOMAIN env var");

  try {
    await client.messages.create(DOMAIN, { from, to, subject, text, html });
    console.log(`✅ Sent email to ${to}`);
  } catch (e) {
    console.error("❌ Failed to send email:", e);
    throw e;
  }
}

module.exports = { sendEmail };
