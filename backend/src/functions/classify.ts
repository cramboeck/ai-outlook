import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { AzureOpenAI } from 'openai';

interface ClassifyRequest {
  subject: string;
  body: string;
  sender: string;
  receivedDateTime: string;
  importance: string;
}

interface ClassifyResponse {
  category: string;
  confidence: number;
  reasoning: string;
  suggestedAction?: string;
}

const SYSTEM_PROMPT = `Du bist ein E-Mail-Klassifizierungs-Assistent für ein deutschsprachiges Unternehmen.
Analysiere die E-Mail und ordne sie GENAU EINER der folgenden Kategorien zu:

- "Dringend": Zeitkritische Anfragen, Eskalationen, Notfälle, ASAP
- "Aktion erforderlich": Aufgaben die eine Antwort oder Handlung erfordern
- "Zur Info": Newsletter, CC-Mails, automatische Benachrichtigungen, FYI
- "Meeting": Terminanfragen, Einladungen, Besprechungen, Calls
- "Finanzen": Rechnungen, Angebote, Bestellungen, Buchhaltung
- "Intern": Interne Kommunikation, Team-Updates, HR

Antworte NUR mit einem JSON-Objekt:
{
  "category": "<Kategoriename>",
  "confidence": <0.0-1.0>,
  "reasoning": "<Kurze Begründung auf Deutsch, max 50 Wörter>",
  "suggestedAction": "<Optional: Empfohlene nächste Aktion>"
}

Regeln:
1. Wähle die EINE passendste Kategorie basierend auf dem Hauptzweck
2. Bei Unsicherheit, wähle nach Priorität: Dringend > Aktion > Meeting > Finanzen > Intern > Info
3. Automatische System-Mails und Newsletter sind "Zur Info"
4. E-Mails die explizit eine Antwort fordern sind "Aktion erforderlich"
5. Confidence: <0.5 = unsicher, >0.8 = sehr sicher
6. suggestedAction nur bei "Dringend" oder "Aktion erforderlich" angeben`;

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

    const userMessage = `
Betreff: ${body.subject || '(Kein Betreff)'}
Von: ${body.sender || 'Unbekannt'}
Wichtigkeit: ${body.importance || 'normal'}
Empfangen: ${body.receivedDateTime || 'Unbekannt'}

Inhalt:
${body.body || body.subject}
`.trim();

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 200,
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
