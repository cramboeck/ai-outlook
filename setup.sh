#!/bin/bash

# MailSort - Lokale Entwicklungsumgebung Setup
# =============================================

set -e

echo "=========================================="
echo "  MailSort - Setup Lokale Entwicklung"
echo "=========================================="
echo ""

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Prüfe Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js nicht gefunden! Bitte installiere Node.js 20+${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}Warnung: Node.js Version $NODE_VERSION gefunden. Empfohlen: 20+${NC}"
fi

echo -e "${GREEN}Node.js $(node -v) gefunden${NC}"
echo ""

# Frontend Setup
echo "----------------------------------------"
echo "1. Frontend Setup"
echo "----------------------------------------"

cd frontend

if [ ! -d "node_modules" ]; then
    echo "Installiere Frontend Dependencies..."
    npm install
else
    echo -e "${GREEN}Frontend Dependencies bereits installiert${NC}"
fi

# Frontend .env erstellen
if [ ! -f ".env" ]; then
    echo ""
    echo -e "${YELLOW}Frontend .env Konfiguration:${NC}"
    echo ""

    read -p "MSAL Client ID (aus Azure Entra ID): " MSAL_CLIENT_ID
    read -p "MSAL Tenant ID (aus Azure Entra ID): " MSAL_TENANT_ID

    cat > .env << EOF
VITE_MSAL_CLIENT_ID=$MSAL_CLIENT_ID
VITE_MSAL_TENANT_ID=$MSAL_TENANT_ID
VITE_API_URL=http://localhost:7071/api
EOF

    echo -e "${GREEN}.env erstellt${NC}"
else
    echo -e "${GREEN}Frontend .env existiert bereits${NC}"
fi

cd ..

# Backend Setup
echo ""
echo "----------------------------------------"
echo "2. Backend Setup"
echo "----------------------------------------"

cd backend

if [ ! -d "node_modules" ]; then
    echo "Installiere Backend Dependencies..."
    npm install
else
    echo -e "${GREEN}Backend Dependencies bereits installiert${NC}"
fi

# Backend local.settings.json erstellen
if [ ! -f "local.settings.json" ]; then
    echo ""
    echo -e "${YELLOW}Backend Azure OpenAI Konfiguration:${NC}"
    echo ""

    read -p "Azure OpenAI Endpoint (z.B. https://xxx.openai.azure.com/): " OPENAI_ENDPOINT
    read -p "Azure OpenAI API Key: " OPENAI_KEY
    read -p "Model Deployment Name [gpt-4.1-mini]: " OPENAI_DEPLOYMENT
    OPENAI_DEPLOYMENT=${OPENAI_DEPLOYMENT:-gpt-4.1-mini}

    cat > local.settings.json << EOF
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_OPENAI_ENDPOINT": "$OPENAI_ENDPOINT",
    "AZURE_OPENAI_API_KEY": "$OPENAI_KEY",
    "AZURE_OPENAI_DEPLOYMENT": "$OPENAI_DEPLOYMENT"
  },
  "Host": {
    "CORS": "*",
    "CORSCredentials": false
  }
}
EOF

    echo -e "${GREEN}local.settings.json erstellt${NC}"
else
    echo -e "${GREEN}Backend local.settings.json existiert bereits${NC}"
fi

# Backend bauen
echo ""
echo "Baue Backend TypeScript..."
npm run build

cd ..

echo ""
echo "=========================================="
echo -e "${GREEN}  Setup abgeschlossen!${NC}"
echo "=========================================="
echo ""
echo "Starte die Entwicklungsumgebung:"
echo ""
echo "  Terminal 1 (Frontend):"
echo "    cd frontend && npm run dev"
echo ""
echo "  Terminal 2 (Backend):"
echo "    cd backend && func start"
echo ""
echo "  Oder mit dem Start-Script:"
echo "    ./start.sh"
echo ""
echo "Öffne dann: http://localhost:5173"
echo ""
