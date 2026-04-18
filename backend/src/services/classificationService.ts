// Classification Service
// Wraps OpenAI calls for email classification
// Used by both /api/classify route and processing pipeline

import { logger } from './logger';
import { getOpenAIClient, getModel, wrapSystemPrompt } from './openaiClient';
import type { AIClassifier, ClassificationResult } from '../engine/processingPipeline';
import type { EmailForProcessing } from '../engine/ruleEngine';

// Default categories (shared with ai.ts)
const DEFAULT_CATEGORIES = [
  { name: 'Dringend', description: 'Zeitkritische Anfragen, Eskalationen, Notfaelle' },
  { name: 'Aktion erforderlich', description: 'Aufgaben die Antwort oder Handlung erfordern' },
  { name: 'Zur Info', description: 'Newsletter, CC-Mails, automatische Benachrichtigungen' },
  { name: 'Meeting', description: 'Terminanfragen, Einladungen, Besprechungen' },
  { name: 'Finanzen', description: 'Rechnungen, Angebote, Bestellungen' },
  { name: 'Intern', description: 'Interne Kommunikation, Team-Updates' },
];

function buildSystemPrompt(categories: Array<{ name: string; description: string }>): string {
  const categoryList = categories.map(c => `  - "${c.name}": ${c.description}`).join('\n');

  return `# E-Mail-Klassifizierung

Analysiere die E-Mail und klassifiziere sie.

## Kategorien
${categoryList}

## Ausgabe-Format (JSON)
{
  "category": "<Kategoriename>",
  "confidence": <0.0-1.0>,
  "reasoning": "<Kurze Begruendung>",
  "urgency": "<low|medium|high|critical>",
  "signals": {
    "isActionRequired": <bool>,
    "hasDeadline": <bool>,
    "isAutomated": <bool>
  }
}`;
}

/**
 * Classify a single email using AI.
 * Can be called directly or used through the AIClassifier interface.
 */
export async function classifyEmail(
  subject: string,
  body: string,
  sender: string,
  categories?: Array<{ name: string; description: string }>
): Promise<{
  result: ClassificationResult;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
  processingTimeMs: number;
}> {
  const startTime = Date.now();
  const client = getOpenAIClient();
  const model = getModel();
  const cats = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  try {
    const systemPrompt = buildSystemPrompt(cats);
    const userMessage = `Klassifiziere diese E-Mail:\n\n**Betreff:** ${subject || '(Kein Betreff)'}\n**Von:** ${sender || 'Unbekannt'}\n**Inhalt:** ${(body || subject).substring(0, 1000)}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: wrapSystemPrompt(systemPrompt) },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content) as ClassificationResult;
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      result: parsed,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      model,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Classification service error', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Create an AIClassifier adapter for the processing pipeline.
 */
export function createClassifier(): AIClassifier {
  return {
    async classify(email: EmailForProcessing, categories?) {
      return classifyEmail(
        email.subject,
        email.body || email.bodyPreview,
        email.senderEmail,
        categories
      );
    },
  };
}
