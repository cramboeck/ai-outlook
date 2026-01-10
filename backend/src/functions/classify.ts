import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { AzureOpenAI } from 'openai';

interface CategoryDefinition {
  name: string;
  description: string;
  keywords?: string[];
}

interface ClassifyRequest {
  subject: string;
  body: string;
  sender: string;
  receivedDateTime: string;
  importance: string;
  categories?: CategoryDefinition[]; // Custom categories from frontend
}

interface ClassifyResponse {
  category: string;
  confidence: number;
  reasoning: string;
  suggestedAction?: string;
}

const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { name: 'Dringend', description: 'Zeitkritische Anfragen, Eskalationen, Notfälle, ASAP' },
  { name: 'Aktion erforderlich', description: 'Aufgaben die eine Antwort oder Handlung erfordern' },
  { name: 'Zur Info', description: 'Newsletter, CC-Mails, automatische Benachrichtigungen, FYI' },
  { name: 'Meeting', description: 'Terminanfragen, Einladungen, Besprechungen, Calls' },
  { name: 'Finanzen', description: 'Rechnungen, Angebote, Bestellungen, Buchhaltung' },
  { name: 'Intern', description: 'Interne Kommunikation, Team-Updates, HR' },
];

function buildSystemPrompt(categories: CategoryDefinition[]): string {
  const categoryList = categories.map(c => {
    let entry = `- "${c.name}": ${c.description}`;
    if (c.keywords && c.keywords.length > 0) {
      entry += ` (Keywords: ${c.keywords.join(', ')})`;
    }
    return entry;
  }).join('\n');

  const categoryNames = categories.map(c => c.name);
  const priorityOrder = categoryNames.slice(0, Math.min(6, categoryNames.length)).join(' > ');

  return `Du bist ein E-Mail-Klassifizierungs-Assistent für ein deutschsprachiges Unternehmen.
Analysiere die E-Mail und ordne sie GENAU EINER der folgenden Kategorien zu:

${categoryList}

Antworte NUR mit einem JSON-Objekt:
{
  "category": "<Kategoriename>",
  "confidence": <0.0-1.0>,
  "reasoning": "<Kurze Begründung auf Deutsch, max 50 Wörter>",
  "suggestedAction": "<Optional: Empfohlene nächste Aktion>"
}

Regeln:
1. Wähle die EINE passendste Kategorie basierend auf dem Hauptzweck
2. Bei Unsicherheit, wähle nach Priorität: ${priorityOrder}
3. Automatische System-Mails und Newsletter gehören zu Info-Kategorien
4. E-Mails die explizit eine Antwort fordern gehören zu Aktions-Kategorien
5. Confidence: <0.5 = unsicher, >0.8 = sehr sicher
6. suggestedAction nur bei dringenden oder aktionsrelevanten Kategorien angeben`;
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

    const systemPrompt = buildSystemPrompt(categories);

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
        { role: 'system', content: systemPrompt },
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
