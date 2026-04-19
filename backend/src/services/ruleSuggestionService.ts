// Rule Suggestion Service
// Given a representative email, asks the LLM to propose a set of toggleable
// criteria + actions that would match similar emails going forward.
// The frontend shows the suggestions as checkboxes; the user picks what to
// keep and we POST a plain rule to /api/rules.

import { getOpenAIClient, getModel, wrapSystemPrompt } from './openaiClient';
import { logger } from './logger';

export type SuggestedCriterionField =
  | 'fromContains'
  | 'fromExact'
  | 'fromDomain'
  | 'subjectContains'
  | 'subjectStartsWith'
  | 'bodyContains'
  | 'hasAttachments'
  | 'importance';

export interface SuggestedCriterion {
  field: SuggestedCriterionField;
  value: string | boolean;
  description: string;
  /** Whether we recommend this be enabled by default in the modal. */
  enabled: boolean;
}

export type SuggestedActionType =
  | 'categorize'
  | 'move'
  | 'markRead'
  | 'flag';

export interface SuggestedAction {
  type: SuggestedActionType;
  value: string;
  description: string;
  enabled: boolean;
}

export interface RuleSuggestion {
  suggestedName: string;
  suggestedDescription: string;
  suggestedPriority: number;
  suggestedStopProcessing: boolean;
  criteria: SuggestedCriterion[];
  actions: SuggestedAction[];
  reasoning: string;
}

export interface SuggestRuleInput {
  subject: string;
  body: string;
  sender: string;
  hasAttachments: boolean;
  importance?: 'high' | 'normal' | 'low';
  /** Tenant-defined category names so the LLM suggests a valid one. */
  availableCategories?: string[];
}

export interface SuggestRuleResult {
  suggestion: RuleSuggestion;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
  processingTimeMs: number;
}

const SYSTEM_PROMPT = `# Smart-Rule-Vorschlag fuer E-Mails

Du bekommst eine einzelne E-Mail und sollst daraus **Regel-Kriterien** und **Aktionen** vorschlagen, mit denen aehnliche E-Mails zukuenftig automatisch verarbeitet werden koennen.

## Ziel
Generalisiere klug: finde die aussagekraeftigsten, wiederverwendbaren Muster. Liefer lieber 3 praezise Kriterien mit hoher Trefferrate als 10 zu enge Matches, die nur diese eine Mail erwischen.

## Verfuegbare Kriterien-Felder
- **fromContains**: Partial-Match auf Sender-Adresse oder -Name (z.B. "noreply")
- **fromExact**: Exakter Sender (nur sinnvoll bei einmaligen Absendern wie "support@bestimmteLieferant.de")
- **fromDomain**: Domain des Senders (z.B. "github.com")
- **subjectContains**: Substring im Betreff (z.B. "[GitHub]", "Rechnung", "Bestellbestätigung")
- **subjectStartsWith**: Praefix im Betreff (z.B. "Re:" oder "[ALERT]")
- **bodyContains**: Substring im E-Mail-Body — nur bei sehr charakteristischen Formulierungen setzen
- **hasAttachments**: boolean, nur setzen wenn die Mail einen Anhang hat und das relevant ist
- **importance**: "high" | "normal" | "low"

## Verfuegbare Aktionen
- **categorize**: Kategorie zuweisen (value = Kategoriename aus der Liste unten)
- **move**: In Ordner verschieben (value = Ordnername)
- **markRead**: Als gelesen markieren
- **flag**: Mit Follow-up-Flag markieren

## Heuristiken
- Domain > ContainsSubject > BodyContains (in dieser Reihenfolge bevorzugen).
- Wenn die Domain generisch ist (gmail.com, outlook.com), nimm stattdessen fromContains.
- Bei Newsletters / Rechnungen / Bestellungen: nimm 2-3 Kriterien die zusammen eindeutig sind.
- Setze "enabled": true fuer Kriterien mit hoher Wiederverwendungs-Wahrscheinlichkeit, false fuer sehr spezifische (z.B. bodyContains).
- Name der Regel: kurz, sprechend, max 50 Zeichen (z.B. "GitHub-Benachrichtigungen").
- suggestedPriority: 100 = Standard. Kritische Rules (Dringend, Rechnung) niedriger (50), generische Newsletter-Rules hoeher (200).
- suggestedStopProcessing: nur true wenn die Regel alles noetige erledigt und weitere Rules die Mail nicht mehr anfassen sollen.

## Ausgabe-Format (JSON)
{
  "suggestedName": "<Kurzer Name>",
  "suggestedDescription": "<1-2 Saetze was die Regel tut>",
  "suggestedPriority": <int>,
  "suggestedStopProcessing": <bool>,
  "reasoning": "<Kurze Begruendung warum diese Kriterien>",
  "criteria": [
    { "field": "fromDomain", "value": "github.com", "description": "Sender-Domain", "enabled": true },
    { "field": "subjectContains", "value": "[GitHub]", "description": "Standard-Praefix in GitHub-Benachrichtigungen", "enabled": true }
  ],
  "actions": [
    { "type": "categorize", "value": "Zur Info", "description": "Als Info-Mail einsortieren", "enabled": true }
  ]
}

Antworte NUR mit gueltigem JSON, keine Erklaerungen davor/danach.`;

export async function suggestRuleFromEmail(
  input: SuggestRuleInput
): Promise<SuggestRuleResult> {
  const startTime = Date.now();
  const client = getOpenAIClient();
  const model = getModel();

  const categoriesHint = input.availableCategories && input.availableCategories.length > 0
    ? `\n## Verfuegbare Kategorien (nur diese Werte fuer 'categorize' verwenden)\n${input.availableCategories.map(c => `- ${c}`).join('\n')}`
    : '';

  const userMessage = `Analysiere diese E-Mail und schlage eine Regel vor:

**Betreff:** ${input.subject || '(Kein Betreff)'}
**Von:** ${input.sender || 'unbekannt'}
**Anhaenge:** ${input.hasAttachments ? 'Ja' : 'Nein'}
**Wichtigkeit:** ${input.importance || 'normal'}

**Inhalt (gekuerzt):**
${(input.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500)}
${categoriesHint}`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: wrapSystemPrompt(SYSTEM_PROMPT) },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content) as RuleSuggestion;
    sanitizeSuggestion(parsed, input);

    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      suggestion: parsed,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      model,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Rule suggestion error', { error: (error as Error).message });
    throw error;
  }
}

const VALID_CRITERIA_FIELDS: SuggestedCriterionField[] = [
  'fromContains', 'fromExact', 'fromDomain', 'subjectContains',
  'subjectStartsWith', 'bodyContains', 'hasAttachments', 'importance',
];
const VALID_ACTION_TYPES: SuggestedActionType[] = [
  'categorize', 'move', 'markRead', 'flag',
];

/**
 * Defensive sanitisation: the LLM sometimes returns extra / misspelled fields
 * or invalid action types. Drop anything unknown so the frontend never
 * receives an unusable suggestion.
 */
function sanitizeSuggestion(s: RuleSuggestion, input: SuggestRuleInput): void {
  s.suggestedName = (s.suggestedName ?? '').slice(0, 100) || 'Neue Regel';
  s.suggestedDescription = (s.suggestedDescription ?? '').slice(0, 500);
  s.suggestedPriority = typeof s.suggestedPriority === 'number' ? s.suggestedPriority : 100;
  s.suggestedStopProcessing = !!s.suggestedStopProcessing;
  s.reasoning = (s.reasoning ?? '').slice(0, 500);

  s.criteria = (Array.isArray(s.criteria) ? s.criteria : [])
    .filter(c => c && VALID_CRITERIA_FIELDS.includes(c.field))
    .filter(c => !(c.field === 'hasAttachments' && !input.hasAttachments)) // don't suggest hasAttachments=false
    .map(c => ({
      field: c.field,
      value: c.field === 'hasAttachments' ? true : String(c.value ?? '').slice(0, 500),
      description: (c.description ?? '').slice(0, 300),
      enabled: c.enabled !== false,
    }))
    .slice(0, 8);

  s.actions = (Array.isArray(s.actions) ? s.actions : [])
    .filter(a => a && VALID_ACTION_TYPES.includes(a.type))
    .map(a => ({
      type: a.type,
      value: String(a.value ?? '').slice(0, 200),
      description: (a.description ?? '').slice(0, 300),
      enabled: a.enabled !== false,
    }))
    .slice(0, 4);
}
