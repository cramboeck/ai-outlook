import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { AzureOpenAI } from 'openai';

interface EmailInput {
  id: string;
  subject: string;
  body: string;
  sender: string;
  receivedDateTime: string;
}

interface ExtractActionsRequest {
  emails: EmailInput[];
}

interface ExtractedAction {
  emailId: string;
  action: string;
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
  type: 'response' | 'task' | 'decision' | 'meeting' | 'payment';
}

interface ExtractActionsResponse {
  actions: ExtractedAction[];
  totalTokens: number;
  processingTimeMs: number;
}

const SYSTEM_PROMPT = `Du bist ein intelligenter Assistent, der Aufgaben und Aktionen aus E-Mails extrahiert.

Analysiere jede E-Mail und extrahiere konkrete Handlungsaufforderungen.

Erkenne folgende Typen:
- "response": Antwort oder Rückmeldung erwartet
- "task": Konkrete Aufgabe zu erledigen
- "decision": Entscheidung erforderlich
- "meeting": Termin bestätigen/ablehnen
- "payment": Zahlung/Rechnung bearbeiten

Antworte NUR mit einem JSON-Objekt:
{
  "actions": [
    {
      "emailId": "<email-id>",
      "action": "<Kurze Beschreibung der Aktion, max 50 Zeichen>",
      "deadline": "<YYYY-MM-DD falls erkennbar, sonst null>",
      "priority": "<high/medium/low>",
      "type": "<response/task/decision/meeting/payment>"
    }
  ]
}

Regeln:
1. Nur E-Mails mit echten Handlungsaufforderungen aufnehmen
2. Newsletter, automatische Benachrichtigungen, CC-Mails ignorieren
3. Deadline aus Text erkennen ("bis Freitag", "innerhalb 3 Tage")
4. Priorität basierend auf Dringlichkeit und Kontext`;

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

export async function extractActions(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('Extract-actions function processed a request.');

  const startTime = Date.now();

  try {
    const body = await request.json() as ExtractActionsRequest;

    if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
      return {
        status: 400,
        jsonBody: { error: 'Emails array is required and must not be empty' },
      };
    }

    if (body.emails.length > 20) {
      return {
        status: 400,
        jsonBody: { error: 'Maximum 20 emails per request' },
      };
    }

    const client = getOpenAIClient();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini';

    // Format emails for the prompt
    const emailsText = body.emails
      .map((email, index) => `
E-Mail ${index + 1} (ID: ${email.id}):
Betreff: ${email.subject || '(Kein Betreff)'}
Von: ${email.sender || 'Unbekannt'}
Datum: ${email.receivedDateTime || 'Unbekannt'}
Inhalt: ${(email.body || email.subject).substring(0, 800)}
---`)
      .join('\n');

    const userMessage = `Extrahiere Aktionen aus den folgenden ${body.emails.length} E-Mails:\n\n${emailsText}`;

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    const actions: ExtractedAction[] = parsed.actions || [];

    const processingTimeMs = Date.now() - startTime;
    const totalTokens = response.usage?.total_tokens || 0;

    const extractResponse: ExtractActionsResponse = {
      actions,
      totalTokens,
      processingTimeMs,
    };

    return {
      status: 200,
      jsonBody: extractResponse,
    };
  } catch (error) {
    context.error('Action extraction error:', error);

    return {
      status: 500,
      jsonBody: {
        error: 'Action extraction failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

app.http('extract-actions', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: extractActions,
});
