#!/bin/bash
set -e

# Configuration
# TODO: Replace with your actual repository URL
REPO_URL="https://github.com/NurtrBot/AgentXM.git" 
INSTALL_DIR="$HOME/agentmx"

echo "⬇️  Cloning AgentMX..."

# Check prerequisites
if ! command -v git &> /dev/null; then
    echo "❌ Error: git is not installed."
    exit 1
fi
if ! command -v npm &> /dev /null; then
    echo "❌ Error: npm is not installed. Please install Node.js."
    exit 1
fi

# Clone or update repository
if [ -d "$INSTALL_DIR" ]; then
    echo "⚠️  Directory $INSTALL_DIR already exists. Updating..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "📦 Cloning into $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install API dependencies
echo "📥 Installing API dependencies..."
cd api
npm install
cd ..

# Install CLI dependencies
echo "📥 Installing CLI dependencies..."
cd cli
npm install
# Link CLI globally so 'agentmx' works anywhere
echo "🔗 Linking CLI command..."
try_link() {
  if [ "$(id -u)" -ne 0 ] && [ ! -w "$(npm config get prefix)/bin" ]; then
    echo "sudo required for global link..."
    sudo npm link --force
  else
    npm link --force
  fi
}
try_link

echo ""
echo "✅ Installation complete!"
echo "------------------------------------------------"
echo "1. Start the API server in a new terminal:"
echo "   cd $INSTALL_DIR/api && npm start"
echo ""
echo "2. Initialize your mailbox:"
echo "   agentmx init"
  # AgentMX Installer
echo "------------------------------------------------"
