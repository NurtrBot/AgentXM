#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Command } = require("commander");
const AgentMX = require("./client");

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
const CONF_DIR = ".agentmx";
const CONF_FILE = "config.json";
const DOMAIN = "agentmx.dev";

function confPath() { return path.join(process.cwd(), CONF_DIR, CONF_FILE); }
function hasConf() { return fs.existsSync(confPath()); }

function loadConf() {
  if (!hasConf()) {
    console.log(c.red("\n  No AgentMX config found."));
    console.log(c.dim("  Run: npx agentmx init\n"));
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
  return new AgentMX({ apiKey: conf.apiKey, endpoint: conf.endpoint, email: conf.email, botName: conf.botName });
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
  console.log("\n" + c.bold("  🤖 AgentMX — Email for AI Agents"));
  console.log("  " + LINE + "\n");

  if (hasConf()) {
    const existing = JSON.parse(fs.readFileSync(confPath(), "utf8"));
    console.log(c.yellow(`  Already configured: ${existing.email}`));
    const ow = await ask("  Overwrite? (y/N): ");
    if (ow.toLowerCase() !== "y") { console.log(c.dim("\n  Keeping existing config.\n")); return; }
    console.log("");
  }

  const endpoint = opts.endpoint || process.env.AGENTMAIL_ENDPOINT || "https://agentxm-production.up.railway.app";

  // 1. Handle
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

  // 2. Bot name
  const defaultName = handle.charAt(0).toUpperCase() + handle.slice(1) + " Bot";
  let botName = await ask(`  Bot name ${c.dim(`(${defaultName})`)}: `);
  botName = botName.trim() || defaultName;

  // 3. Password
  let password;
  while (true) {
    password = await askPassword("  Owner password: ");
    if (password.length < 6) { console.log(c.red("  Must be at least 6 characters")); continue; }
    const confirm = await askPassword("  Confirm password: ");
    if (password !== confirm) { console.log(c.red("  Passwords don't match")); continue; }
    break;
  }

  // 4. Create
  console.log(c.dim(`\n  Connecting to ${endpoint}...`));
  console.log(c.dim("  Creating mailbox..."));
  try {
    const client = new AgentMX({ endpoint });
    const result = await client.createMailbox(handle, botName, password);
    const mb = result.mailbox;

    saveConf({ email: mb.email, apiKey: mb.api_key, botName: mb.bot_name, endpoint, mailboxId: mb.id });

    // Auto-add to .gitignore
    const gi = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gi) && !fs.readFileSync(gi, "utf8").includes(".agentmx"))
      fs.appendFileSync(gi, "\n.agentmx/\n");

    console.log("\n" + c.green("  ✅ Mailbox created successfully!"));
    console.log("  " + LINE);
    console.log(`  📧 Email:    ${c.cyan(mb.email)}`);
    console.log(`  🤖 Bot:      ${mb.bot_name}`);
    console.log(`  🔑 Config:   ${c.dim(confPath())}`);
    console.log("\n" + c.yellow(`  📬 ACTION: Send a test email to ${c.bold(mb.email)} right now!`));
    console.log("\n" + c.bold("  🚀 Recommended next commands:"));
    console.log(`     ${c.green("agentmx inbox")}      Check for new messages`);
    console.log(`     ${c.green("agentmx send")}       Send an email`);
    console.log(`     ${c.green("agentmx status")}     View mailbox stats`);
    console.log("");
  } catch (e) {
    if (e.message.includes("ECONNREFUSED")) {
      console.log(c.red(`\n  ✖ Could not connect to API at ${endpoint}`));
      console.log(c.dim("    Make sure the API server is running in another terminal:"));
      console.log(c.dim("    cd agentmail/api && npm start\n"));
    } else {
      console.log(c.red(`\n  ✖ ${e.message}\n`));
    }
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
    console.log(c.dim(`  ${total} messages | agentmx read <#> to open\n`));
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
    console.log("\n" + c.bold("  🤖 AgentMX Status"));
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
  if (!hasConf()) { console.log(c.red("\n  No config. Run: npx agentmx init\n")); return; }
  const conf = loadConf();
  console.log("\n" + c.bold("  AgentMX Config"));
  console.log("  " + LINE);
  console.log(`  Path:      ${confPath()}`);
  console.log(`  Email:     ${conf.email}`);
  console.log(`  Bot:       ${conf.botName}`);
  console.log(`  Endpoint:  ${conf.endpoint}`);
  console.log(`  API Key:   ${conf.apiKey.slice(0, 16)}...`);
  console.log("");
}

async function cmdWatch(opts) {
  const client = getClient();
  const conf = loadConf();
  const interval = (opts.interval || 5) * 1000;
  let seenIds = new Set();
  let firstRun = true;

  console.log("\n" + c.bold(`  👁️  Watching — ${c.cyan(conf.email)}`));
  console.log("  " + LINE);
  console.log(c.dim(`  Checking every ${interval / 1000}s • Press Ctrl+C to stop\n`));

  async function poll() {
    try {
      const { messages, total } = await client.inbox({ limit: 25 });

      if (firstRun) {
        // On first run, seed seen IDs so we only notify on NEW emails
        messages.forEach((m) => seenIds.add(m.id));
        const unread = messages.filter((m) => !m.is_read).length;
        console.log(c.dim(`  📬 ${total} messages in inbox (${unread} unread)`));
        if (unread > 0) {
          console.log("");
          messages.filter((m) => !m.is_read).forEach((m) => {
            console.log(`  ${c.blue("●")} ${pad(trunc(m.from_address, 25), 25)} │ ${c.bold(trunc(m.subject, 35))} │ ${c.dim(fmtDate(m.created_at))}`);
          });
        }
        console.log("\n" + c.dim("  Waiting for new emails...\n"));
        firstRun = false;
        return;
      }

      // Check for new messages
      const newMsgs = messages.filter((m) => !seenIds.has(m.id));
      if (newMsgs.length > 0) {
        newMsgs.forEach((m) => {
          seenIds.add(m.id);
          const time = fmtDate(m.created_at);
          console.log(c.green(`  ┌─ 📨 NEW EMAIL ─────────────────────────────────────`));
          console.log(c.green(`  │`) + ` From:    ${c.bold(m.from_address)}`);
          console.log(c.green(`  │`) + ` Subject: ${c.bold(m.subject)}`);
          console.log(c.green(`  │`) + ` Time:    ${c.dim(time)}`);
          console.log(c.green(`  └────────────────────────────────────────────────────`));
          console.log(c.dim(`  agentmx read ${m.id.slice(0, 8)} to open\n`));
          // Bell sound for notification
          process.stdout.write("\x07");
        });
      }
    } catch (e) {
      console.log(c.red(`  ⚠ Connection error: ${e.message}`));
    }
  }

  // Initial poll
  await poll();

  // Keep polling
  const timer = setInterval(poll, interval);
  process.on("SIGINT", () => {
    clearInterval(timer);
    console.log(c.dim("\n  Stopped watching.\n"));
    process.exit(0);
  });
}

// ─── Program ─────────────────────────────────────────────────────
const prog = new Command();
prog.name("agentmx").description("Email for AI agents.").version("1.0.0");
prog.command("init").description("Set up a new agent mailbox").option("-e, --endpoint <url>", "API URL").action(cmdInit);
prog.command("inbox").description("View inbox").action(cmdInbox);
prog.command("sent").description("View sent mail").action(cmdSent);
prog.command("read <index>").description("Read message by # or ID").action(cmdRead);
prog.command("send").description("Compose and send").action(cmdSend);
prog.command("watch").description("Watch inbox for new emails in real-time").option("-i, --interval <seconds>", "Poll interval in seconds", "5").action(cmdWatch);
prog.command("status").description("Mailbox info and stats").action(cmdStatus);
prog.command("config").description("Show config").action(cmdConfig);
prog.parse(process.argv);
