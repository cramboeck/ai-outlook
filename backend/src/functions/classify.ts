import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { AzureOpenAI } from 'openai';

interface CategoryDefinition {
  name: string;
  description: string;
  keywords?: string[];
}

interface EmailContext {
  isReply: boolean;           // RE: / AW: detected
  isForward: boolean;         // FW: / WG: detected
  isDirectRecipient: boolean; // User is in TO, not just CC
  ccCount: number;            // Number of CC recipients
  senderDomain: string;       // Domain of sender
  hasAttachments: boolean;
  attachmentTypes?: string[]; // File extensions
}

interface ClassifyRequest {
  subject: string;
  body: string;
  sender: string;
  receivedDateTime: string;
  importance: string;
  categories?: CategoryDefinition[];
  context?: EmailContext;     // Enhanced context signals
}

interface ClassifyResponse {
  category: string;
  confidence: number;
  reasoning: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction?: string;
  signals: {
    isActionRequired: boolean;
    hasDeadline: boolean;
    isAutomated: boolean;
  };
}

const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { name: 'Dringend', description: 'Zeitkritische Anfragen, Eskalationen, Notfälle, ASAP' },
  { name: 'Aktion erforderlich', description: 'Aufgaben die eine Antwort oder Handlung erfordern' },
  { name: 'Zur Info', description: 'Newsletter, CC-Mails, automatische Benachrichtigungen, FYI' },
  { name: 'Meeting', description: 'Terminanfragen, Einladungen, Besprechungen, Calls' },
  { name: 'Finanzen', description: 'Rechnungen, Angebote, Bestellungen, Buchhaltung' },
  { name: 'Intern', description: 'Interne Kommunikation, Team-Updates, HR' },
];

function buildEnhancedSystemPrompt(categories: CategoryDefinition[]): string {
  const categoryList = categories.map(c => {
    let entry = `  - "${c.name}": ${c.description}`;
    if (c.keywords && c.keywords.length > 0) {
      entry += ` [Keywords: ${c.keywords.join(', ')}]`;
    }
    return entry;
  }).join('\n');

  return `# E-Mail-Klassifizierungs-Experte

Du bist ein präziser E-Mail-Klassifizierungs-Assistent für ein deutschsprachiges Unternehmen.

## Verfügbare Kategorien
${categoryList}

## Analyse-Schritte (denke systematisch)

### Schritt 1: Absender analysieren
- Externe Domain → wahrscheinlich Kunde/Partner
- Interne Domain → Kollege/Team
- noreply@, notifications@, newsletter@ → Automatisiert

### Schritt 2: Betreff-Signale erkennen
- "DRINGEND", "URGENT", "ASAP", "!!!" → Hohe Dringlichkeit
- "RE:", "AW:" → Antwort in laufender Konversation
- "FW:", "WG:" → Weiterleitung (oft zur Info)
- "Rechnung", "Invoice", "Angebot" → Finanzen
- "Einladung", "Meeting", "Termin" → Meeting
- "Newsletter", "Update", "Digest" → Info

### Schritt 3: Inhalt bewerten
- Direkte Frage an mich → Aktion erforderlich
- Deadline/Frist genannt → Dringend
- "Bitte um Rückmeldung/Freigabe" → Aktion erforderlich
- Nur zur Kenntnisnahme → Info
- Ich bin nur in CC → wahrscheinlich Info

### Schritt 4: Kontext-Signale nutzen
- isDirectRecipient=false + ccCount>3 → Massen-CC, meist Info
- hasAttachments + .pdf/.xlsx → könnte Rechnung/Dokument sein
- importance=high + isDirectRecipient → ernst nehmen

## Negativ-Beispiele (NICHT als Dringend klassifizieren)
- Newsletter mit "Letzte Chance!" → Info, nicht Dringend
- Automatische Erinnerungen → Info
- Marketing-Mails mit künstlicher Dringlichkeit → Info
- CC-Mails ohne direkte Ansprache → Info

## Ausgabe-Format (nur JSON, keine Erklärung davor/danach)
{
  "category": "<Exakter Kategoriename>",
  "confidence": <0.0-1.0>,
  "reasoning": "<Kurze Begründung, max 30 Wörter>",
  "urgency": "<low|medium|high|critical>",
  "suggestedAction": "<Konkrete nächste Aktion oder null>",
  "signals": {
    "isActionRequired": <true|false>,
    "hasDeadline": <true|false>,
    "isAutomated": <true|false>
  }
}

## Urgency-Level
- critical: Sofortige Reaktion nötig (heute)
- high: Innerhalb 24h bearbeiten
- medium: Diese Woche bearbeiten
- low: Keine zeitliche Dringlichkeit`;
}

function getOpenAIClient(): AzureOpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error('Azure OpenAI configuration missing');
  }

  return new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion: '2024-08-01-preview',
  });
}

function buildUserMessage(body: ClassifyRequest): string {
  const ctx = body.context;

  let message = `## E-Mail zur Klassifizierung

**Betreff:** ${body.subject || '(Kein Betreff)'}
**Von:** ${body.sender || 'Unbekannt'}
**Wichtigkeit:** ${body.importance || 'normal'}
**Empfangen:** ${body.receivedDateTime || 'Unbekannt'}`;

  // Add context signals if available
  if (ctx) {
    message += `\n
**Kontext-Signale:**
- Direkter Empfänger: ${ctx.isDirectRecipient ? 'Ja' : 'Nein (CC)'}
- Antwort (RE:): ${ctx.isReply ? 'Ja' : 'Nein'}
- Weiterleitung (FW:): ${ctx.isForward ? 'Ja' : 'Nein'}
- CC-Empfänger: ${ctx.ccCount}
- Absender-Domain: ${ctx.senderDomain || 'unbekannt'}
- Anhänge: ${ctx.hasAttachments ? 'Ja' : 'Nein'}${ctx.attachmentTypes?.length ? ` (${ctx.attachmentTypes.join(', ')})` : ''}`;
  }

  message += `\n
**Inhalt:**
${body.body || body.subject}`;

  return message;
}

export async function classify(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('Classify function processed a request.');

  try {
    const body = await request.json() as ClassifyRequest;

    if (!body.subject && !body.body) {
      return {
        status: 400,
        jsonBody: { error: 'Subject or body is required' },
      };
    }

    const client = getOpenAIClient();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini';

    // Use custom categories if provided, otherwise use defaults
    const categories = body.categories && body.categories.length > 0
      ? body.categories
      : DEFAULT_CATEGORIES;

    const systemPrompt = buildEnhancedSystemPrompt(categories);
    const userMessage = buildUserMessage(body);

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2, // Lower for more consistent results
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result: ClassifyResponse = JSON.parse(content);

    return {
      status: 200,
      jsonBody: result,
    };
  } catch (error) {
    context.error('Classification error:', error);

    return {
      status: 500,
      jsonBody: {
        error: 'Classification failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

app.http('classify', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: classify,
});
