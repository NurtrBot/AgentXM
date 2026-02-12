#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════════
#  AgentMX Installer — Email for AI Agents
#  One command: curl -fsSL https://raw.githubusercontent.com/NurtrBot/AgentXM/main/install.sh | bash
# ═══════════════════════════════════════════════════════════════════

REPO_URL="https://github.com/NurtrBot/AgentXM.git"
INSTALL_DIR="$HOME/agentmx"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        🤖 AgentMX Installer              ║"
echo "  ║     Email for AI Agents — v1.0.0         ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── Prerequisites ────────────────────────────────────────────────
if ! command -v git &> /dev/null; then
    echo "  ❌ git is not installed."
    exit 1
fi

# Load nvm if available (curl | bash doesn't source shell profiles)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! command -v npm &> /dev/null; then
    echo "  ❌ npm is not installed. Please install Node.js (https://nodejs.org)"
    exit 1
fi

echo "  ✓ git found"
echo "  ✓ npm found ($(npm --version))"
echo ""

# ── Clone or Update ─────────────────────────────────────────────
if [ -d "$INSTALL_DIR" ]; then
    echo "  ⚙️  Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull --quiet
else
    echo "  📦 Downloading AgentMX..."
    git clone --quiet "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ── Install Dependencies ────────────────────────────────────────
echo "  📥 Installing dependencies..."
cd api && npm install --silent 2>/dev/null && cd ..
cd cli && npm install --silent 2>/dev/null

# ── Link CLI Globally ────────────────────────────────────────────
echo "  🔗 Linking agentmx command..."
if [ "$(id -u)" -ne 0 ] && [ ! -w "$(npm config get prefix)/bin" ]; then
    sudo npm link --force --silent 2>/dev/null
else
    npm link --force --silent 2>/dev/null
fi

# ── Copy Agent Guide to Project Root ─────────────────────────────
echo "  📄 Agent integration guide ready"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        ✅ Installation Complete!          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Quick Start:"
echo "  ─────────────────────────────────────────────"
echo "  1. Set up your mailbox:"
echo "     agentmx init"
echo ""
echo "  2. Watch for incoming emails:"
echo "     agentmx watch"
echo ""
echo "  3. Send an email:"
echo "     agentmx send"
echo ""
echo "  📖 AI Agent Integration Guide:"
echo "     cat $INSTALL_DIR/AGENT_GUIDE.md"
echo ""
echo "  ─────────────────────────────────────────────"
echo ""
