// Action Extraction Service
// Wraps OpenAI calls for extracting tasks/actions from emails
// Used by both /api/extract-actions route and processing pipeline

import { logger } from './logger';
import { getOpenAIClient, getModel, wrapSystemPrompt } from './openaiClient';
import type { AIActionExtractor, ExtractedAction } from '../engine/processingPipeline';
import type { EmailForProcessing } from '../engine/ruleEngine';

const SYSTEM_PROMPT = `# Aufgaben-Extraktion aus E-Mail

Analysiere die E-Mail und extrahiere konkrete Aufgaben/Aktionen.

## Ausgabe-Format (JSON)
{
  "actions": [
    {
      "description": "<Was zu tun ist>",
      "priority": "<high|medium|low>",
      "type": "<response|task|decision|meeting|payment|document>",
      "deadline": "<ISO-Datum oder null>"
    }
  ],
  "summary": "<1-2 Saetze Zusammenfassung>"
}

## Typ-Definitionen
- response: Antwort erforderlich
- task: Aufgabe ausfuehren
- decision: Entscheidung treffen
- meeting: Termin wahrnehmen/planen
- payment: Zahlung veranlassen
- document: Dokument bearbeiten/weiterleiten

Wenn keine Aktionen erkennbar sind, gib ein leeres Array zurueck.`;

/**
 * Extract actions from a single email using AI.
 */
export async function extractActions(
  subject: string,
  body: string,
  sender: string
): Promise<{
  actions: ExtractedAction[];
  summary: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
  processingTimeMs: number;
}> {
  const startTime = Date.now();
  const client = getOpenAIClient();
  const model = getModel();

  try {
    const userMessage = `E-Mail:\n**Betreff:** ${subject}\n**Von:** ${sender}\n**Inhalt:** ${(body || subject).substring(0, 2000)}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: wrapSystemPrompt(SYSTEM_PROMPT) },
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
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      actions: parsed.actions || [],
      summary: parsed.summary || '',
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      model,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Action extraction service error', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Create an AIActionExtractor adapter for the processing pipeline.
 */
export function createActionExtractor(): AIActionExtractor {
  return {
    async extract(email: EmailForProcessing) {
      const result = await extractActions(
        email.subject,
        email.body || email.bodyPreview,
        email.senderEmail
      );
      return {
        actions: result.actions,
        usage: result.usage,
        model: result.model,
        processingTimeMs: result.processingTimeMs,
      };
    },
  };
}
