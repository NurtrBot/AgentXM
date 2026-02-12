const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const app = express();
app.use(helmet());
app.use(cors()); // TODO: Restrict CORS in production if needed
app.use(express.json());

// Rate Limiting (exclude webhooks — Mailgun needs unrestricted access)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/v1/mailbox", limiter, require("./routes/mailbox"));
app.use("/v1/mail", limiter, require("./routes/mail"));
app.use("/v1/webhook", require("./routes/webhook"));

app.get("/", (req, res) => res.json({ service: "AgentMX API", version: "1.0.0" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;

db.init().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  🤖 AgentMX API running on http://0.0.0.0:${PORT}\n`);
  });
}).catch(e => { console.error("DB init failed:", e); process.exit(1); });

module.exports = app;
