# AgentMX — AI Agent Email Integration Guide

> **Read this file to give your AI agent full email capabilities.**
> One install command. One API. Send, receive, and manage email programmatically.

---

## AI Agent Quick Start (Non-Interactive)

**Base URL:** `https://agentxm-production.up.railway.app`

```
1. POST /v1/mailbox/create  →  body: {"handle":"mybot","bot_name":"My Bot","password":"secret123"}
   → Save api_key from response

2. All requests use header:  x-api-key: YOUR_API_KEY

3. GET  /v1/mail/inbox?unread=true      →  Check for new emails
4. GET  /v1/mail/:id                     →  Read a message (body_text, body_html)
5. POST /v1/mail/send                    →  body: {"to":"x@y.com","subject":"Hi","body":"..."}
6. POST /v1/mail/:id/reply              →  body: {"body":"reply text"}
7. DELETE /v1/mail/:id                   →  Delete a message
8. GET  /v1/mailbox/status               →  Inbox/sent/unread counts
```

**Email domain:** `@agentmx.dev` — Your agent's address is `handle@agentmx.dev`

---

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/NurtrBot/AgentXM/main/install.sh | bash
```

This installs the `agentmx` CLI tool globally.

---

## Step 1: Create Your Agent's Mailbox

Run this command and follow the prompts:

```bash
agentmx init
```

You will be asked for:
- **Email handle** — your agent's address becomes `handle@agentmx.dev`
- **Bot name** — display name for your agent
- **Password** — minimum 6 characters

After setup, your config is saved to `.agentmx/config.json` in the current directory.

### Programmatic Setup (Non-Interactive)

If you need to create a mailbox via API without the interactive CLI:

```bash
curl -X POST https://agentxm-production.up.railway.app/v1/mailbox/create \
  -H "Content-Type: application/json" \
  -d '{"handle": "myagent", "bot_name": "My AI Agent", "password": "secure123"}'
```

**Response:**
```json
{
  "success": true,
  "mailbox": {
    "id": "unique-id",
    "email": "myagent@agentmx.dev",
    "bot_name": "My AI Agent",
    "api_key": "your-api-key-here"
  }
}
```

Save the `api_key` — you need it for all authenticated requests.

---

## Step 2: CLI Commands Reference

All commands are available after running `agentmx init`.

| Command | Description |
|---------|-------------|
| `agentmx init` | Create a new agent mailbox |
| `agentmx inbox` | View received emails |
| `agentmx send` | Compose and send an email |
| `agentmx read <#>` | Read a specific message by number |
| `agentmx sent` | View sent emails |
| `agentmx watch` | Watch inbox in real-time (polls every 5s) |
| `agentmx watch -i 3` | Watch with custom interval (3 seconds) |
| `agentmx status` | View mailbox stats |
| `agentmx config` | Show current configuration |

---

## Step 3: REST API Reference

Base URL: `https://agentxm-production.up.railway.app`

All authenticated endpoints require the header:
```
x-api-key: YOUR_API_KEY
```

### Send Email

```bash
curl -X POST https://agentxm-production.up.railway.app/v1/mail/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "to": "recipient@example.com",
    "subject": "Hello from my AI agent",
    "body": "This email was sent by an AI agent using AgentMX."
  }'
```

### Check Inbox

```bash
curl https://agentxm-production.up.railway.app/v1/mail/inbox \
  -H "x-api-key: YOUR_API_KEY"
```

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-id",
      "from_address": "sender@example.com",
      "to_address": "myagent@agentmx.dev",
      "subject": "Hello",
      "is_read": 0,
      "created_at": "2026-02-12 22:00:00"
    }
  ],
  "total": 1
}
```

### Check Inbox (Unread Only)

```bash
curl "https://agentxm-production.up.railway.app/v1/mail/inbox?unread=true" \
  -H "x-api-key: YOUR_API_KEY"
```

### Read a Message

```bash
curl https://agentxm-production.up.railway.app/v1/mail/MESSAGE_ID \
  -H "x-api-key: YOUR_API_KEY"
```

**Response:**
```json
{
  "message": {
    "id": "msg-id",
    "from_address": "sender@example.com",
    "to_address": "myagent@agentmx.dev",
    "subject": "Hello",
    "body_text": "The full email body text",
    "body_html": "<p>The full email body HTML</p>",
    "direction": "inbound",
    "is_read": 1,
    "created_at": "2026-02-12 22:00:00"
  }
}
```

### Reply to a Message

```bash
curl -X POST https://agentxm-production.up.railway.app/v1/mail/MESSAGE_ID/reply \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "body": "Thanks for your email! This is an automated reply from my AI agent."
  }'
```

### View Sent Messages

```bash
curl https://agentxm-production.up.railway.app/v1/mail/sent \
  -H "x-api-key: YOUR_API_KEY"
```

### Delete a Message

```bash
curl -X DELETE https://agentxm-production.up.railway.app/v1/mail/MESSAGE_ID \
  -H "x-api-key: YOUR_API_KEY"
```

### Mailbox Status

```bash
curl https://agentxm-production.up.railway.app/v1/mailbox/status \
  -H "x-api-key: YOUR_API_KEY"
```

**Response:**
```json
{
  "email": "myagent@agentmx.dev",
  "bot_name": "My AI Agent",
  "created_at": "2026-02-12 21:00:00",
  "stats": {
    "inbox": 5,
    "sent": 3,
    "unread": 2
  }
}
```

### Check Handle Availability

```bash
curl https://agentxm-production.up.railway.app/v1/mailbox/check/desired-handle
```

### Login (Retrieve API Key)

```bash
curl -X POST https://agentxm-production.up.railway.app/v1/mailbox/login \
  -H "Content-Type: application/json" \
  -d '{"email": "myagent@agentmx.dev", "password": "secure123"}'
```

---

## Agent Workflow Example

Here's how an AI agent should use AgentMX in practice:

### 1. Setup (One-time)
```bash
# Install
curl -fsSL https://raw.githubusercontent.com/NurtrBot/AgentXM/main/install.sh | bash

# Create mailbox via API
curl -s -X POST https://agentxm-production.up.railway.app/v1/mailbox/create \
  -H "Content-Type: application/json" \
  -d '{"handle": "jarvis", "bot_name": "Jarvis AI", "password": "mypassword123"}' \
  | jq .
```

### 2. Check for New Email (Polling Loop)
```bash
# Get unread messages
UNREAD=$(curl -s "https://agentxm-production.up.railway.app/v1/mail/inbox?unread=true" \
  -H "x-api-key: YOUR_API_KEY")

echo "$UNREAD" | jq '.messages[] | {from: .from_address, subject: .subject}'
```

### 3. Read and Process Email
```bash
# Read specific message
MSG=$(curl -s https://agentxm-production.up.railway.app/v1/mail/MSG_ID \
  -H "x-api-key: YOUR_API_KEY")

echo "$MSG" | jq '.message.body_text'
```

### 4. Send Reply
```bash
# Reply to the message
curl -s -X POST https://agentxm-production.up.railway.app/v1/mail/MSG_ID/reply \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"body": "I received your email and have processed your request."}'
```

### 5. Send a New Email
```bash
curl -s -X POST https://agentxm-production.up.railway.app/v1/mail/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "to": "anyone@example.com",
    "subject": "Report Generated",
    "body": "Here is your daily report..."
  }'
```

---

## Node.js SDK Usage

If your agent runs on Node.js, you can use the SDK directly:

```javascript
const AgentMX = require("agentmx/src/client");

const agent = new AgentMX({
  apiKey: "YOUR_API_KEY",
  endpoint: "https://agentxm-production.up.railway.app"
});

// Send email
await agent.send({
  to: "user@example.com",
  subject: "Hello",
  body: "Sent from my AI agent"
});

// Check inbox
const { messages } = await agent.inbox({ unread: true });
for (const msg of messages) {
  console.log(`From: ${msg.from_address} — ${msg.subject}`);
}

// Read a message
const { message } = await agent.read(messages[0].id);
console.log(message.body_text);

// Reply
await agent.reply(messages[0].id, { body: "Got your message!" });

// Delete
await agent.deleteMessage(messages[0].id);

// Status
const status = await agent.status();
console.log(`${status.stats.unread} unread messages`);
```

---

## Config File Location

After `agentmx init`, your config is saved at:
```
.agentmx/config.json
```

Contents:
```json
{
  "email": "yourhandle@agentmx.dev",
  "apiKey": "your-api-key",
  "botName": "Your Bot Name",
  "endpoint": "https://agentxm-production.up.railway.app",
  "mailboxId": "unique-id"
}
```

Your agent can read this file to get the API key and endpoint.

---

## Health Check

Verify the API is online:
```bash
curl https://agentxm-production.up.railway.app/health
# → {"status":"ok"}
```

---

## Summary

| What | How |
|------|-----|
| Install | `curl -fsSL https://raw.githubusercontent.com/NurtrBot/AgentXM/main/install.sh \| bash` |
| Create mailbox | `agentmx init` or POST `/v1/mailbox/create` |
| Send email | `agentmx send` or POST `/v1/mail/send` |
| Check inbox | `agentmx inbox` or GET `/v1/mail/inbox` |
| Read message | `agentmx read <#>` or GET `/v1/mail/:id` |
| Reply | POST `/v1/mail/:id/reply` |
| Watch live | `agentmx watch` |
| Auth header | `x-api-key: YOUR_API_KEY` |
| Email domain | `@agentmx.dev` |
