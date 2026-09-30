import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { AzureOpenAI } from 'openai';

interface GenerateReplyRequest {
  emailId: string;
  subject: string;
  body: string;
  sender: string;
  senderName: string;
  tone: 'formal' | 'casual' | 'friendly' | 'assertive';
  intent: 'accept' | 'decline' | 'question' | 'info' | 'custom';
  customInstruction?: string;
  userName?: string;
}

interface GenerateReplyResponse {
  reply: string;
  subject: string;
  suggestions: string[]; // Alternative kürzere Antworten
  tokens: number;
}

const TONE_DESCRIPTIONS: Record<string, string> = {
  formal: 'Formell und professionell. Verwende "Sie" und geschäftliche Sprache.',
  casual: 'Locker aber professionell. Verwende "Sie", aber freundlichen Ton.',
  friendly: 'Freundlich und warmherzig. Verwende "Du" wenn passend.',
  assertive: 'Bestimmt und klar. Direkte Kommunikation ohne Umschweife.',
};

const INTENT_INSTRUCTIONS: Record<string, string> = {
  accept: 'Stimme der Anfrage/dem Vorschlag zu. Bestätige positiv.',
  decline: 'Lehne höflich aber bestimmt ab. Gib wenn möglich einen kurzen Grund.',
  question: 'Stelle Rückfragen um mehr Informationen zu erhalten.',
  info: 'Gib die angefragten Informationen oder bestätige den Erhalt.',
  custom: '', // Wird durch customInstruction ersetzt
};

const SYSTEM_PROMPT = `Du bist ein E-Mail-Assistent für deutschsprachige Geschäftskommunikation.
Du schreibst professionelle, natürlich klingende E-Mail-Antworten.

Wichtige Regeln:
1. Schreibe NUR den E-Mail-Body, keine Betreffzeile
2. Beginne mit einer passenden Anrede (z.B. "Sehr geehrte/r...", "Hallo...", "Liebe/r...")
3. Ende mit einer passenden Grußformel und dem Namen des Absenders
4. Halte die Antwort prägnant (max 150 Wörter)
5. Vermeide Floskeln und leere Phrasen
6. Antworte auf Deutsch

Antworte mit einem JSON-Objekt:
{
  "reply": "<Die vollständige E-Mail-Antwort>",
  "subject": "<Betreffzeile, beginnt mit 'Re: ' gefolgt vom Original-Betreff>",
  "suggestions": ["<Kurze Alternative 1, max 2 Sätze>", "<Kurze Alternative 2>", "<Kurze Alternative 3>"]
}`;

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

export async function generateReply(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('Generate-reply function processed a request.');

  try {
    const body = await request.json() as GenerateReplyRequest;

    if (!body.subject || !body.body || !body.sender) {
      return {
        status: 400,
        jsonBody: { error: 'Subject, body, and sender are required' },
      };
    }

    const client = getOpenAIClient();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini';

    const toneInstruction = TONE_DESCRIPTIONS[body.tone] || TONE_DESCRIPTIONS.formal;
    const intentInstruction = body.intent === 'custom' && body.customInstruction
      ? body.customInstruction
      : INTENT_INSTRUCTIONS[body.intent] || INTENT_INSTRUCTIONS.info;

    const userMessage = `
Schreibe eine Antwort auf folgende E-Mail:

Von: ${body.senderName} <${body.sender}>
Betreff: ${body.subject}
Inhalt:
${body.body.substring(0, 1500)}

---
Anweisungen:
- Ton: ${toneInstruction}
- Absicht: ${intentInstruction}
- Absender der Antwort: ${body.userName || 'Freundliche Grüße'}

Erstelle eine passende Antwort.`;

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    const tokens = response.usage?.total_tokens || 0;

    const replyResponse: GenerateReplyResponse = {
      reply: parsed.reply || '',
      subject: parsed.subject || `Re: ${body.subject}`,
      suggestions: parsed.suggestions || [],
      tokens,
    };

    return {
      status: 200,
      jsonBody: replyResponse,
    };
  } catch (error) {
    context.error('Reply generation error:', error);

    return {
      status: 500,
      jsonBody: {
        error: 'Reply generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

app.http('generate-reply', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: generateReply,
});
