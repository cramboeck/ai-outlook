# MailSort - KI E-Mail Kategorisierung für Microsoft 365

MailSort ist eine SaaS Web-App die Microsoft 365 E-Mails automatisch mit KI kategorisiert. User melden sich mit ihrem Microsoft-Account an, die App liest E-Mails via Graph API, klassifiziert sie mit Azure OpenAI und setzt die Kategorien direkt in Outlook.

## Features

- Microsoft Login (MSAL)
- Dashboard mit Statistik-Karten
- E-Mail Liste laden (unkategorisierte zuerst)
- Einzelne E-Mail mit KI kategorisieren
- Batch-Kategorisierung (mehrere auf einmal)
- Kategorien via Graph API in Outlook setzen
- Responsive Design (Mobile-friendly)

## Kategorien

| Name | Farbe | Emoji | Beschreibung |
|------|-------|-------|--------------|
| Dringend | Rot | 🔴 | Zeitkritisch, Eskalationen, ASAP |
| Aktion erforderlich | Orange | 🟡 | Braucht Antwort oder Handlung |
| Zur Info | Grün | 🟢 | Newsletter, CC, FYI, automatische Mails |
| Meeting | Blau | 🔵 | Termine, Einladungen, Besprechungen |
| Finanzen | Lila | 🟣 | Rechnungen, Angebote, Bestellungen |
| Intern | Grau | ⚫ | Interne Kommunikation |

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS v4
- @azure/msal-react für Microsoft Authentication
- @microsoft/microsoft-graph-client für Graph API
- @tanstack/react-query für Data Fetching & Caching
- lucide-react für Icons
- react-router-dom für Routing

### Backend
- Azure Functions v4 (Node.js, TypeScript)
- OpenAI SDK für Azure OpenAI

## Projektstruktur

```
mailsort/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── email/
│   │   │   ├── classification/
│   │   │   ├── dashboard/
│   │   │   └── auth/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── config/
│   │   └── types/
│   └── package.json
├── backend/
│   ├── src/
│   │   └── functions/
│   │       ├── classify.ts
│   │       └── classifyBatch.ts
│   └── package.json
└── README.md
```

## Setup

### Voraussetzungen

1. Node.js 20+
2. Azure Functions Core Tools (für Backend lokal)
3. Azure Entra ID App Registration
4. Azure OpenAI Ressource

### Frontend Setup

```bash
cd frontend
cp .env.example .env
# Edit .env with your values
npm install
npm run dev
```

### Backend Setup

```bash
cd backend
cp local.settings.json.example local.settings.json
# Edit local.settings.json with your Azure OpenAI credentials
npm install
npm run start
```

### Environment Variables

#### Frontend (.env)
```
VITE_MSAL_CLIENT_ID=<your-app-client-id>
VITE_MSAL_TENANT_ID=<your-tenant-id>
VITE_API_URL=http://localhost:7071/api
```

#### Backend (local.settings.json)
```json
{
  "Values": {
    "AZURE_OPENAI_ENDPOINT": "https://your-openai.openai.azure.com/",
    "AZURE_OPENAI_API_KEY": "your-key",
    "AZURE_OPENAI_DEPLOYMENT": "gpt-4o-mini"
  }
}
```

## Entra ID App Registration

1. Erstellen Sie eine neue App Registration in Azure Portal
2. Redirect URI: `http://localhost:5173` (SPA)
3. API Permissions (Delegated):
   - User.Read
   - Mail.ReadWrite
   - MailboxSettings.ReadWrite

## API Endpoints

### POST /api/classify
Klassifiziert eine einzelne E-Mail.

### POST /api/classify-batch
Klassifiziert mehrere E-Mails (max 20 pro Request).

## Lizenz

Proprietary - Ramböck IT
