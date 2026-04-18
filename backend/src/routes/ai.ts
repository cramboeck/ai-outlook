// AI Routes - Classification, Actions, Reply Generation
// Wraps Azure OpenAI calls for the Express server

import { Router } from 'express';
import { validate } from '../middleware/validate';
import { classifySchema, classifyBatchSchema, extractActionsSchema, generateReplySchema, suggestFolderSchema } from '../schemas/ai.schema';
import { getOpenAIClient, getModel, wrapSystemPrompt } from '../services/openaiClient';
import { logger } from '../services/logger';

const router = Router();

// Types
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

// Default categories
const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { name: 'Dringend', description: 'Zeitkritische Anfragen, Eskalationen, Notfälle' },
  { name: 'Aktion erforderlich', description: 'Aufgaben die Antwort oder Handlung erfordern' },
  { name: 'Zur Info', description: 'Newsletter, CC-Mails, automatische Benachrichtigungen' },
  { name: 'Meeting', description: 'Terminanfragen, Einladungen, Besprechungen' },
  { name: 'Finanzen', description: 'Rechnungen, Angebote, Bestellungen' },
  { name: 'Intern', description: 'Interne Kommunikation, Team-Updates' },
];


// Build system prompt for batch classification
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

// Build system prompt for single classification
function buildClassifySystemPrompt(categories: CategoryDefinition[]): string {
  const categoryList = categories.map(c => {
    let entry = `  - "${c.name}": ${c.description}`;
    if (c.keywords && c.keywords.length > 0) {
      entry += ` [${c.keywords.join(', ')}]`;
    }
    return entry;
  }).join('\n');

  return `# E-Mail-Klassifizierung

Analysiere die E-Mail und klassifiziere sie.

## Kategorien
${categoryList}

## Ausgabe-Format (JSON)
{
  "category": "<Kategoriename>",
  "confidence": <0.0-1.0>,
  "reasoning": "<Kurze Begründung>",
  "urgency": "<low|medium|high|critical>",
  "suggestedAction": "<Empfohlene Aktion oder null>",
  "signals": {
    "isActionRequired": <bool>,
    "hasDeadline": <bool>,
    "isAutomated": <bool>
  }
}`;
}

// Format email for prompt
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

// POST /api/classify - Single email classification
router.post('/classify', validate(classifySchema), async (req, res, next) => {
  try {
    const { subject, body, sender, context, categories } = req.body;

    const client = getOpenAIClient();
    const model = getModel();

    const cats = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    const systemPrompt = buildClassifySystemPrompt(cats);

    let userMessage = `Klassifiziere diese E-Mail:\n\n**Betreff:** ${subject || '(Kein Betreff)'}\n**Von:** ${sender || 'Unbekannt'}`;

    if (context) {
      const signals = [];
      if (!context.isDirectRecipient) signals.push('CC');
      if (context.isReply) signals.push('RE:');
      if (context.isForward) signals.push('FW:');
      if (context.hasAttachments) signals.push('Anhänge');
      if (signals.length > 0) {
        userMessage += `\n**Signale:** ${signals.join(', ')}`;
      }
    }

    userMessage += `\n**Inhalt:** ${(body || subject).substring(0, 1000)}`;

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

    const result = JSON.parse(content);
    res.json(result);
  } catch (error) {
    logger.error('Classification error', { error: (error as Error).message, tenantId: req.tenantId });
    next(error);
  }
});

// POST /api/classify-batch - Batch email classification
router.post('/classify-batch', validate(classifyBatchSchema), async (req, res, next) => {
  try {
    const { emails, categories } = req.body;
    const startTime = Date.now();

    const client = getOpenAIClient();
    const model = getModel();

    const cats = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    const systemPrompt = buildBatchSystemPrompt(cats);

    // Format emails for the prompt
    const emailsText = emails
      .map((email: EmailInput, index: number) => formatEmailForPrompt(email, index))
      .join('\n---\n');

    const userMessage = `Klassifiziere diese ${emails.length} E-Mails:\n${emailsText}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: wrapSystemPrompt(systemPrompt) },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse the response
    const parsed = JSON.parse(content);
    let results;

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

    res.json({
      results,
      totalTokens,
      processingTimeMs,
    });
  } catch (error) {
    logger.error('Batch classification error', { error: (error as Error).message, tenantId: req.tenantId });
    next(error);
  }
});

// POST /api/extract-actions - Extract actions from email
router.post('/extract-actions', validate(extractActionsSchema), async (req, res, next) => {
  try {
    const { subject, body, sender } = req.body;

    const client = getOpenAIClient();
    const model = getModel();

    const systemPrompt = `# Aufgaben-Extraktion aus E-Mail

Analysiere die E-Mail und extrahiere konkrete Aufgaben/Aktionen.

## Ausgabe-Format (JSON)
{
  "actions": [
    {
      "description": "<Was zu tun ist>",
      "priority": "<high|medium|low>",
      "deadline": "<Datum oder null>",
      "assignee": "<Wer soll es tun oder null>"
    }
  ],
  "summary": "<1-2 Sätze Zusammenfassung>"
}

Wenn keine Aktionen erkennbar sind, gib ein leeres Array zurück.`;

    const userMessage = `E-Mail:\n**Betreff:** ${subject}\n**Von:** ${sender}\n**Inhalt:** ${body.substring(0, 2000)}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: wrapSystemPrompt(systemPrompt) },
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

    const result = JSON.parse(content);
    res.json(result);
  } catch (error) {
    logger.error('Extract actions error', { error: (error as Error).message, tenantId: req.tenantId });
    next(error);
  }
});

// POST /api/generate-reply - Generate email reply
router.post('/generate-reply', validate(generateReplySchema), async (req, res, next) => {
  try {
    const { subject, body, sender, replyType, userName, additionalContext } = req.body;

    const client = getOpenAIClient();
    const model = getModel();

    const replyStyles: Record<string, string> = {
      accept: 'Zustimmend, positiv',
      decline: 'Höflich ablehnend',
      info: 'Informativ, neutral',
      question: 'Nachfragend, klärend',
      acknowledge: 'Bestätigend, kurz',
    };

    const style = replyStyles[replyType] || 'Professionell, neutral';

    const systemPrompt = `# E-Mail-Antwort generieren

Schreibe eine professionelle Antwort auf die E-Mail.

**Stil:** ${style}
**Absender:** ${userName || 'Ich'}

## Regeln
- Direkte, höfliche Sprache
- Keine überflüssigen Floskeln
- Beantworte alle Fragen/Punkte
- Deutsche Geschäftskorrespondenz

## Ausgabe-Format (JSON)
{
  "subject": "<Betreff mit RE: Präfix>",
  "body": "<HTML-formatierter Antworttext>",
  "tone": "<formal|neutral|casual>"
}`;

    let userMessage = `Original-E-Mail:\n**Betreff:** ${subject}\n**Von:** ${sender}\n**Inhalt:** ${body.substring(0, 2000)}`;

    if (additionalContext) {
      userMessage += `\n\n**Zusätzliche Anweisungen:** ${additionalContext}`;
    }

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: wrapSystemPrompt(systemPrompt) },
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

    const result = JSON.parse(content);
    res.json(result);
  } catch (error) {
    logger.error('Generate reply error', { error: (error as Error).message, tenantId: req.tenantId });
    next(error);
  }
});

// POST /api/suggest-folder - Suggest folder for email
router.post('/suggest-folder', validate(suggestFolderSchema), async (req, res, next) => {
  try {
    const { subject, body, sender, folders } = req.body;

    const client = getOpenAIClient();
    const model = getModel();

    const folderList = folders.map((f: any) => `- ${f.displayName || f.name}`).join('\n');

    const systemPrompt = `# Ordner-Vorschlag für E-Mail

Analysiere die E-Mail und schlage den passenden Ordner vor.

## Verfügbare Ordner
${folderList}

## Ausgabe-Format (JSON)
{
  "suggestedFolder": "<Ordnername>",
  "confidence": <0.0-1.0>,
  "reasoning": "<Kurze Begründung>"
}`;

    const userMessage = `E-Mail:\n**Betreff:** ${subject}\n**Von:** ${sender}\n**Inhalt:** ${(body || subject).substring(0, 500)}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: wrapSystemPrompt(systemPrompt) },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);
    res.json(result);
  } catch (error) {
    logger.error('Suggest folder error', { error: (error as Error).message, tenantId: req.tenantId });
    next(error);
  }
});

export default router;
