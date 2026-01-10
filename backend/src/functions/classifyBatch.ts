import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { AzureOpenAI } from 'openai';

interface CategoryDefinition {
  name: string;
  description: string;
  keywords?: string[];
}

interface EmailContext {
  isReply: boolean;
  isForward: boolean;
  isDirectRecipient: boolean;
  ccCount: number;
  senderDomain: string;
  hasAttachments: boolean;
}

interface EmailInput {
  id: string;
  subject: string;
  body: string;
  sender: string;
  context?: EmailContext;
}

interface BatchClassifyRequest {
  emails: EmailInput[];
  categories?: CategoryDefinition[];
}

interface ClassificationResult {
  id: string;
  category: string;
  confidence: number;
  reasoning: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  signals: {
    isActionRequired: boolean;
    hasDeadline: boolean;
    isAutomated: boolean;
  };
}

interface BatchClassifyResponse {
  results: ClassificationResult[];
  totalTokens: number;
  processingTimeMs: number;
}

const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { name: 'Dringend', description: 'Zeitkritische Anfragen, Eskalationen, Notfälle' },
  { name: 'Aktion erforderlich', description: 'Aufgaben die Antwort oder Handlung erfordern' },
  { name: 'Zur Info', description: 'Newsletter, CC-Mails, automatische Benachrichtigungen' },
  { name: 'Meeting', description: 'Terminanfragen, Einladungen, Besprechungen' },
  { name: 'Finanzen', description: 'Rechnungen, Angebote, Bestellungen' },
  { name: 'Intern', description: 'Interne Kommunikation, Team-Updates' },
];

function buildBatchSystemPrompt(categories: CategoryDefinition[]): string {
  const categoryList = categories.map(c => {
    let entry = `  - "${c.name}": ${c.description}`;
    if (c.keywords && c.keywords.length > 0) {
      entry += ` [${c.keywords.join(', ')}]`;
    }
    return entry;
  }).join('\n');

  return `# E-Mail-Batch-Klassifizierung

Du erhältst mehrere E-Mails und klassifizierst jede einzeln.

## Kategorien
${categoryList}

## Schnell-Analyse pro E-Mail
1. **Absender**: noreply/newsletter@ → Automatisiert | normale Adresse → Prüfen
2. **Betreff**: RE:/AW: → Antwort | FW:/WG: → Weiterleitung | DRINGEND/ASAP → Kritisch
3. **Kontext**: Nur CC + viele Empfänger → Info | Direkter Empfänger → Prüfen
4. **Inhalt**: Frage/Bitte → Aktion | Nur Info → Info | Deadline → Dringend

## WICHTIG: Nicht als "Dringend" klassifizieren
- Newsletter mit Marketing-Dringlichkeit ("Letzte Chance!")
- Automatische System-Benachrichtigungen
- CC-Mails ohne direkte Ansprache

## Ausgabe-Format
{
  "results": [
    {
      "id": "<email-id>",
      "category": "<Kategoriename>",
      "confidence": <0.0-1.0>,
      "reasoning": "<10-15 Wörter>",
      "urgency": "<low|medium|high|critical>",
      "signals": {
        "isActionRequired": <bool>,
        "hasDeadline": <bool>,
        "isAutomated": <bool>
      }
    }
  ]
}

## Urgency
- critical: Heute reagieren
- high: Innerhalb 24h
- medium: Diese Woche
- low: Keine Eile`;
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

function formatEmailForPrompt(email: EmailInput, index: number): string {
  const ctx = email.context;

  let text = `
### E-Mail ${index + 1} (ID: ${email.id})
**Betreff:** ${email.subject || '(Kein Betreff)'}
**Von:** ${email.sender || 'Unbekannt'}`;

  if (ctx) {
    const signals = [];
    if (!ctx.isDirectRecipient) signals.push('CC');
    if (ctx.isReply) signals.push('RE:');
    if (ctx.isForward) signals.push('FW:');
    if (ctx.hasAttachments) signals.push('Anhänge');
    if (ctx.ccCount > 3) signals.push(`${ctx.ccCount} CC`);

    if (signals.length > 0) {
      text += `\n**Signale:** ${signals.join(', ')}`;
    }
  }

  text += `\n**Inhalt:** ${(email.body || email.subject).substring(0, 400)}`;

  return text;
}

export async function classifyBatch(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('Classify-batch function processed a request.');

  const startTime = Date.now();

  try {
    const body = await request.json() as BatchClassifyRequest;

    if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
      return {
        status: 400,
        jsonBody: { error: 'Emails array is required and must not be empty' },
      };
    }

    if (body.emails.length > 20) {
      return {
        status: 400,
        jsonBody: { error: 'Maximum 20 emails per batch request' },
      };
    }

    const client = getOpenAIClient();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini';

    const categories = body.categories && body.categories.length > 0
      ? body.categories
      : DEFAULT_CATEGORIES;

    const systemPrompt = buildBatchSystemPrompt(categories);

    // Format emails for the prompt
    const emailsText = body.emails
      .map((email, index) => formatEmailForPrompt(email, index))
      .join('\n---\n');

    const userMessage = `Klassifiziere diese ${body.emails.length} E-Mails:\n${emailsText}`;

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse the response
    let results: ClassificationResult[];
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      results = parsed;
    } else if (parsed.results && Array.isArray(parsed.results)) {
      results = parsed.results;
    } else if (parsed.classifications && Array.isArray(parsed.classifications)) {
      results = parsed.classifications;
    } else {
      throw new Error('Unexpected response format from OpenAI');
    }

    const processingTimeMs = Date.now() - startTime;
    const totalTokens = response.usage?.total_tokens || 0;

    const batchResponse: BatchClassifyResponse = {
      results,
      totalTokens,
      processingTimeMs,
    };

    return {
      status: 200,
      jsonBody: batchResponse,
    };
  } catch (error) {
    context.error('Batch classification error:', error);

    return {
      status: 500,
      jsonBody: {
        error: 'Batch classification failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

app.http('classify-batch', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: classifyBatch,
});
