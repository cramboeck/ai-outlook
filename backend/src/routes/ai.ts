// AI Routes - Classification, Actions, Reply Generation
// Wraps Azure OpenAI calls for the Express server

import { Router } from 'express';
import OpenAI from 'openai';

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

// Get OpenAI client (supports both Azure OpenAI and OpenAI)
function getOpenAIClient(): OpenAI {
  // Check for Azure OpenAI first
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini'}`,
      defaultQuery: { 'api-version': '2024-08-01-preview' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
    });
  }

  // Fall back to regular OpenAI
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  throw new Error('No OpenAI configuration found. Set OPENAI_API_KEY or AZURE_OPENAI_* variables.');
}

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
router.post('/classify', async (req, res, next) => {
  try {
    const { subject, body, sender, context, categories } = req.body;

    if (!subject && !body) {
      return res.status(400).json({ error: 'Subject or body is required' });
    }

    const client = getOpenAIClient();
    const model = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);
    res.json(result);
  } catch (error) {
    console.error('Classification error:', error);
    next(error);
  }
});

// POST /api/classify-batch - Batch email classification
router.post('/classify-batch', async (req, res, next) => {
  try {
    const { emails, categories } = req.body;
    const startTime = Date.now();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Emails array is required and must not be empty' });
    }

    if (emails.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 emails per batch request' });
    }

    const client = getOpenAIClient();
    const model = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
    console.error('Batch classification error:', error);
    next(error);
  }
});

// POST /api/extract-actions - Extract actions from email
router.post('/extract-actions', async (req, res, next) => {
  try {
    const { subject, body, sender } = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Body is required' });
    }

    const client = getOpenAIClient();
    const model = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);
    res.json(result);
  } catch (error) {
    console.error('Extract actions error:', error);
    next(error);
  }
});

// POST /api/generate-reply - Generate email reply
router.post('/generate-reply', async (req, res, next) => {
  try {
    const { subject, body, sender, replyType, userName, additionalContext } = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Body is required' });
    }

    const client = getOpenAIClient();
    const model = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);
    res.json(result);
  } catch (error) {
    console.error('Generate reply error:', error);
    next(error);
  }
});

// POST /api/suggest-folder - Suggest folder for email
router.post('/suggest-folder', async (req, res, next) => {
  try {
    const { subject, body, sender, folders } = req.body;

    if (!folders || !Array.isArray(folders)) {
      return res.status(400).json({ error: 'Folders array is required' });
    }

    const client = getOpenAIClient();
    const model = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);
    res.json(result);
  } catch (error) {
    console.error('Suggest folder error:', error);
    next(error);
  }
});

export default router;
