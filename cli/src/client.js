const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const CONFIG_DIR = ".agentmail";
const CONFIG_FILE = "config.json";

class AgentMail {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || null;
    this.endpoint = opts.endpoint || "https://api.agentmail.dev";
    this.email = opts.email || null;
    this.botName = opts.botName || null;
  }

  static fromConfig(dir) {
    const file = path.join(dir || process.cwd(), CONFIG_DIR, CONFIG_FILE);
    if (!fs.existsSync(file))
      throw new Error(`No config at ${file}. Run: npx agentmail init`);
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    return new AgentMail({ apiKey: c.apiKey, endpoint: c.endpoint, email: c.email, botName: c.botName });
  }

  _req(method, urlPath, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.endpoint);
      const lib = url.protocol === "https:" ? https : http;
      const opts = {
        hostname: url.hostname, port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search, method,
        headers: { "Content-Type": "application/json", "User-Agent": "agentmail/1.0" },
      };
      if (this.apiKey) opts.headers["x-api-key"] = this.apiKey;

      const req = lib.request(opts, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(d);
            res.statusCode >= 400 ? reject(new Error(j.error || `HTTP ${res.statusCode}`)) : resolve(j);
          } catch { reject(new Error(`Bad response: ${d.slice(0, 200)}`)); }
        });
      });
      req.on("error", reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // Mailbox
  createMailbox(handle, botName, password) {
    return this._req("POST", "/v1/mailbox/create", { handle, bot_name: botName, password });
  }
  checkHandle(handle) { return this._req("GET", `/v1/mailbox/check/${handle}`); }
  status() { return this._req("GET", "/v1/mailbox/status"); }

  // Mail
  inbox(opts = {}) {
    const p = new URLSearchParams();
    if (opts.limit) p.set("limit", opts.limit);
    if (opts.unread) p.set("unread", "true");
    return this._req("GET", `/v1/mail/inbox${p.toString() ? "?" + p : ""}`);
  }
  sent(opts = {}) {
    const p = new URLSearchParams();
    if (opts.limit) p.set("limit", opts.limit);
    return this._req("GET", `/v1/mail/sent${p.toString() ? "?" + p : ""}`);
  }
  read(id) { return this._req("GET", `/v1/mail/${id}`); }
  send({ to, subject, body, bodyHtml }) {
    return this._req("POST", "/v1/mail/send", { to, subject, body, body_html: bodyHtml });
  }
  reply(id, { body, bodyHtml }) {
    return this._req("POST", `/v1/mail/${id}/reply`, { body, body_html: bodyHtml });
  }
  deleteMessage(id) { return this._req("DELETE", `/v1/mail/${id}`); }
}

module.exports = AgentMail;
