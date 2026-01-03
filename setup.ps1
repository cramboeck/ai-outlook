# MailSort - Setup fuer Windows
# ==============================

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  MailSort - Setup Lokale Entwicklung" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Pruefe Node.js
try {
    $nodeVersion = node -v
    Write-Host "Node.js $nodeVersion gefunden" -ForegroundColor Green
} catch {
    Write-Host "Node.js nicht gefunden! Bitte installiere Node.js 20+" -ForegroundColor Red
    exit 1
}

# Frontend Setup
Write-Host ""
Write-Host "----------------------------------------"
Write-Host "1. Frontend Setup"
Write-Host "----------------------------------------"

Set-Location frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "Installiere Frontend Dependencies..."
    npm install
} else {
    Write-Host "Frontend Dependencies bereits installiert" -ForegroundColor Green
}

# Frontend .env erstellen
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "Frontend .env Konfiguration:" -ForegroundColor Yellow
    Write-Host ""

    $clientId = Read-Host "MSAL Client ID (aus Azure Entra ID)"
    $tenantId = Read-Host "MSAL Tenant ID (aus Azure Entra ID)"

    @"
VITE_MSAL_CLIENT_ID=$clientId
VITE_MSAL_TENANT_ID=$tenantId
VITE_API_URL=http://localhost:7071/api
"@ | Out-File -FilePath ".env" -Encoding UTF8

    Write-Host ".env erstellt" -ForegroundColor Green
} else {
    Write-Host "Frontend .env existiert bereits" -ForegroundColor Green
}

Set-Location ..

# Backend Setup
Write-Host ""
Write-Host "----------------------------------------"
Write-Host "2. Backend Setup"
Write-Host "----------------------------------------"

Set-Location backend

if (-not (Test-Path "node_modules")) {
    Write-Host "Installiere Backend Dependencies..."
    npm install
} else {
    Write-Host "Backend Dependencies bereits installiert" -ForegroundColor Green
}

# Backend local.settings.json erstellen
if (-not (Test-Path "local.settings.json")) {
    Write-Host ""
    Write-Host "Backend Azure OpenAI Konfiguration:" -ForegroundColor Yellow
    Write-Host ""

    $endpoint = Read-Host "Azure OpenAI Endpoint (z.B. https://xxx.openai.azure.com/)"
    $apiKey = Read-Host "Azure OpenAI API Key"
    $deployment = Read-Host "Model Deployment Name (Enter fuer gpt-4.1-mini)"
    if ([string]::IsNullOrWhiteSpace($deployment)) { $deployment = "gpt-4.1-mini" }

    @"
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_OPENAI_ENDPOINT": "$endpoint",
    "AZURE_OPENAI_API_KEY": "$apiKey",
    "AZURE_OPENAI_DEPLOYMENT": "$deployment"
  },
  "Host": {
    "CORS": "*",
    "CORSCredentials": false
  }
}
"@ | Out-File -FilePath "local.settings.json" -Encoding UTF8

    Write-Host "local.settings.json erstellt" -ForegroundColor Green
} else {
    Write-Host "Backend local.settings.json existiert bereits" -ForegroundColor Green
}

# Backend bauen
Write-Host ""
Write-Host "Baue Backend TypeScript..."
npm run build

Set-Location ..

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Setup abgeschlossen!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Starte die Entwicklungsumgebung:"
Write-Host ""
Write-Host "  Terminal 1 (Frontend):"
Write-Host "    cd frontend; npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Terminal 2 (Backend):"
Write-Host "    cd backend; func start" -ForegroundColor Cyan
Write-Host ""
Write-Host "Oeffne dann: http://localhost:5173"
Write-Host ""
