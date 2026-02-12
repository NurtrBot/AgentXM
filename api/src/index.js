const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
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
