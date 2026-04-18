// Processing API - Main entry point for email processing pipeline
// Combines rules + AI classification + action extraction + document detection
// Persists results to DB and triggers auto-forwarding

import { Router } from 'express';
import { processEmail, processEmailBatch } from '../engine/processingPipeline';
import type { EmailForProcessing } from '../engine/ruleEngine';
import type { ProcessingResult } from '../engine/processingPipeline';
import { createClassifier } from '../services/classificationService';
import { createActionExtractor } from '../services/actionExtractionService';
import { createDocumentDetector } from '../services/documentDetectorAdapter';
import { forwardToIntegration, evaluateForwardRules } from '../services/forwardService';
import { isAIConfigured, getOpenAIClient, getModel } from '../services/openaiClient';
import { query } from '../db';
import { logEvent } from '../services/auditService';
import { logger } from '../services/logger';

const router = Router();

// Build AI services - only if OpenAI/Ollama is configured
function getAIServices() {
  if (!isAIConfigured()) {
    logger.warn('No AI configuration found - AI services disabled. Set OPENAI_API_KEY + OPENAI_BASE_URL for Ollama.');
    return {};
  }

  return {
    classifier: createClassifier(),
    actionExtractor: createActionExtractor(),
    documentDetector: createDocumentDetector(),
  };
}

/**
 * Persist processing results to the actions table.
 */
async function persistResults(
  tenantId: string,
  userId: string,
  email: EmailForProcessing,
  result: ProcessingResult
): Promise<void> {
  try {
    // 1. Persist extracted actions
    for (const action of result.actions) {
      await query(
        `INSERT INTO actions (tenant_id, user_id, email_id, email_subject, email_sender, description, action_type, priority, status, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', 'ai')`,
        [
          tenantId,
          userId,
          email.id,
          email.subject,
          email.senderEmail,
          action.description,
          action.type || 'task',
          action.priority || 'medium',
        ]
      );
    }

    // 2. Persist detected document as action
    if (result.document) {
      const docDescription = buildDocumentDescription(result.document);
      const rows = await query(
        `INSERT INTO actions (tenant_id, user_id, email_id, email_subject, email_sender, description, action_type, priority, status, source, document_type, document_data)
         VALUES ($1, $2, $3, $4, $5, $6, 'document', 'medium', 'open', 'ai', $7, $8)
         RETURNING id`,
        [
          tenantId,
          userId,
          email.id,
          email.subject,
          email.senderEmail,
          docDescription,
          result.document.type,
          JSON.stringify(result.document.extractedData || {}),
        ]
      );

      const actionId = rows[0]?.id;

      // 3. Auto-forward if matching rules exist
      if (actionId) {
        await checkAutoForward(tenantId, actionId, result.document.type, email, result.document.extractedData);
      }
    }
  } catch (error) {
    logger.error('Failed to persist processing results', {
      emailId: email.id,
      tenantId,
      error: (error as Error).message,
    });
    // Don't throw - persistence failure shouldn't break the pipeline response
  }
}

/**
 * Build a human-readable description for a detected document.
 */
function buildDocumentDescription(document: ProcessingResult['document']): string {
  if (!document) return 'Dokument erkannt';

  const typeLabels: Record<string, string> = {
    invoice: 'Rechnung',
    order: 'Bestellung',
    contract: 'Vertrag',
    receipt: 'Quittung',
  };

  const parts = [typeLabels[document.type] || 'Dokument'];

  if (document.extractedData?.vendor) {
    parts.push(`von ${document.extractedData.vendor}`);
  }
  if (document.extractedData?.amount) {
    const currency = document.extractedData.currency || 'EUR';
    parts.push(`- ${document.extractedData.amount} ${currency}`);
  }
  if (document.extractedData?.invoiceNumber) {
    parts.push(`(Nr. ${document.extractedData.invoiceNumber})`);
  }

  return parts.join(' ');
}

/**
 * Check auto-forward rules and forward document to matching integrations.
 */
async function checkAutoForward(
  tenantId: string,
  actionId: string,
  documentType: string,
  email: EmailForProcessing,
  documentData: any
): Promise<void> {
  try {
    const integrations = await query(
      `SELECT * FROM integrations WHERE tenant_id = $1 AND enabled = true`,
      [tenantId]
    );

    for (const integration of integrations) {
      const shouldForward = evaluateForwardRules(integration.auto_forward_rules, documentType, documentData);

      if (shouldForward) {
        logger.info('Auto-forwarding document', {
          actionId,
          documentType,
          integrationId: integration.id,
          integrationName: integration.name,
        });

        // Use shared forwardService for all integration types
        try {
          const forwardResult = await forwardToIntegration(integration, {
            email_id: email.id,
            email_subject: email.subject,
            document_data: documentData,
            action_id: actionId,
          });

          if (forwardResult.success) {
            const forwardEntry = JSON.stringify([{
              integration_id: integration.id,
              integration_name: integration.name,
              integration_type: integration.type,
              timestamp: new Date().toISOString(),
              status: 'success',
            }]);

            await query(
              `UPDATE actions SET forwarded_to = $1 WHERE id = $2`,
              [forwardEntry, actionId]
            );

            await logEvent({
              tenantId,
              emailId: email.id,
              emailSubject: email.subject,
              eventType: 'document_forwarded',
              source: 'system',
              metadata: {
                actionId,
                documentType,
                integrationId: integration.id,
                integrationName: integration.name,
              },
            });
          } else {
            logger.error('Auto-forward failed', {
              integrationId: integration.id,
              message: forwardResult.message,
            });
          }
        } catch (err) {
          logger.error('Auto-forward error', {
            integrationId: integration.id,
            error: (err as Error).message,
          });
        }
      }
    }
  } catch (error) {
    logger.error('Check auto-forward error', {
      tenantId,
      error: (error as Error).message,
    });
  }
}

// POST /api/process-email - Process single email through the pipeline
router.post('/process-email', async (req, res, next) => {
  try {
    const { email, options } = req.body;

    if (!email || !email.id) {
      return res.status(400).json({ error: 'Email with id is required' });
    }

    const emailForProcessing: EmailForProcessing = {
      id: email.id,
      subject: email.subject || '',
      bodyPreview: email.bodyPreview || '',
      body: email.body || '',
      senderEmail: email.sender || email.senderEmail || '',
      senderDomain: (email.sender || email.senderEmail || '').split('@')[1]?.toLowerCase() || '',
      importance: email.importance || 'normal',
      hasAttachments: email.hasAttachments || false,
      isDirectRecipient: email.isDirectRecipient ?? true,
      ccCount: email.ccCount || 0,
      isReply: /^(re:|aw:)/i.test((email.subject || '').trim()),
      isForward: /^(fw:|wg:)/i.test((email.subject || '').trim()),
      categories: email.categories || [],
      receivedDateTime: email.receivedDateTime,
    };

    const services = getAIServices();

    const result = await processEmail(
      req.tenantId!,
      req.userId!,
      emailForProcessing,
      options || {},
      services
    );

    // Persist results to DB (non-blocking for the response)
    if (!result.dryRun) {
      await persistResults(req.tenantId!, req.userId!, emailForProcessing, result);
    }

    res.json(result);
  } catch (error) {
    logger.error('Process email error', { error: (error as Error).message });
    next(error);
  }
});

// POST /api/process-batch - Process multiple emails
router.post('/process-batch', async (req, res, next) => {
  try {
    const { emails, options } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Emails array is required' });
    }

    if (emails.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 emails per batch' });
    }

    const emailsForProcessing: EmailForProcessing[] = emails.map((email: any) => ({
      id: email.id,
      subject: email.subject || '',
      bodyPreview: email.bodyPreview || '',
      body: email.body || '',
      senderEmail: email.sender || email.senderEmail || '',
      senderDomain: (email.sender || email.senderEmail || '').split('@')[1]?.toLowerCase() || '',
      importance: email.importance || 'normal',
      hasAttachments: email.hasAttachments || false,
      isDirectRecipient: email.isDirectRecipient ?? true,
      ccCount: email.ccCount || 0,
      isReply: /^(re:|aw:)/i.test((email.subject || '').trim()),
      isForward: /^(fw:|wg:)/i.test((email.subject || '').trim()),
      categories: email.categories || [],
      receivedDateTime: email.receivedDateTime,
    }));

    const services = getAIServices();

    const results = await processEmailBatch(
      req.tenantId!,
      req.userId!,
      emailsForProcessing,
      options || {},
      services
    );

    // Persist results
    if (!options?.dryRun) {
      for (let i = 0; i < results.length; i++) {
        await persistResults(req.tenantId!, req.userId!, emailsForProcessing[i], results[i]);
      }
    }

    res.json({ results, count: results.length });
  } catch (error) {
    logger.error('Process batch error', { error: (error as Error).message });
    next(error);
  }
});

// POST /api/process-dry-run - Test rules against email without executing
router.post('/process-dry-run', async (req, res, next) => {
  try {
    const { email, emails } = req.body;

    const target = email ? [email] : (emails || []);
    if (target.length === 0) {
      return res.status(400).json({ error: 'Email or emails array is required' });
    }

    const emailsForProcessing: EmailForProcessing[] = target.map((e: any) => ({
      id: e.id || 'dry-run',
      subject: e.subject || '',
      bodyPreview: e.bodyPreview || '',
      body: e.body || '',
      senderEmail: e.sender || e.senderEmail || '',
      senderDomain: (e.sender || e.senderEmail || '').split('@')[1]?.toLowerCase() || '',
      importance: e.importance || 'normal',
      hasAttachments: e.hasAttachments || false,
      isDirectRecipient: e.isDirectRecipient ?? true,
      ccCount: e.ccCount || 0,
      isReply: /^(re:|aw:)/i.test((e.subject || '').trim()),
      isForward: /^(fw:|wg:)/i.test((e.subject || '').trim()),
      categories: e.categories || [],
    }));

    const results = await processEmailBatch(
      req.tenantId!,
      req.userId!,
      emailsForProcessing,
      { dryRun: true, skipActionExtraction: true },
      {} // No AI services for dry run
    );

    res.json({ results, count: results.length, dryRun: true });
  } catch (error) {
    logger.error('Dry run error', { error: (error as Error).message });
    next(error);
  }
});

// POST /api/process-extract-document - Extract structured data from a PDF/document via AI
// Used by the Document Detail Panel: user clicks "KI-Analyse" → AI extracts fields → user reviews
router.post('/extract-document', async (req, res, next) => {
  try {
    const { attachment, email_subject, email_sender, existing_data } = req.body;

    if (!isAIConfigured()) {
      return res.status(503).json({ error: 'AI nicht konfiguriert. Bitte OPENAI_BASE_URL und OPENAI_API_KEY setzen.' });
    }

    const client = getOpenAIClient();
    const model = getModel();

    // Build content from PDF text or email metadata
    let documentContent = '';

    if (attachment?.contentBytes) {
      // Decode base64 PDF and extract text
      const buffer = Buffer.from(attachment.contentBytes, 'base64');
      const contentType = attachment.contentType || 'application/pdf';

      if (contentType.includes('pdf')) {
        // Simple PDF text extraction: try to extract readable text from PDF buffer
        // PDFs contain text streams - extract what we can
        const pdfText = extractTextFromPDF(buffer);
        documentContent = pdfText || `[PDF: ${attachment.name}, ${buffer.length} Bytes - Text konnte nicht extrahiert werden]`;
      } else {
        // For text-based files, decode directly
        documentContent = buffer.toString('utf-8').substring(0, 5000);
      }
    }

    if (!documentContent || documentContent.length < 20) {
      // Fallback: use email subject/sender as context
      documentContent = `Betreff: ${email_subject || 'Unbekannt'}\nAbsender: ${email_sender || 'Unbekannt'}`;
      if (existing_data) {
        documentContent += `\nBereits extrahierte Daten: ${JSON.stringify(existing_data)}`;
      }
    }

    const systemPrompt = `# Dokumenten-Datenextraktion

Du bist ein Buchhalter/Dokumentenanalyst. Extrahiere strukturierte Daten aus dem Dokument.

## Ausgabe-Format (JSON)
{
  "type": "<invoice|order|contract|receipt|none>",
  "vendor": "<Lieferant/Firma oder null>",
  "amount": <Bruttobetrag als Zahl oder null>,
  "netAmount": <Nettobetrag als Zahl oder null>,
  "taxRate": <USt-Satz als Zahl (z.B. 19, 7, 0) oder null>,
  "taxAmount": <USt-Betrag als Zahl oder null>,
  "currency": "<EUR|USD|CHF|etc. oder null>",
  "invoiceNumber": "<Rechnungsnummer oder null>",
  "orderNumber": "<Bestellnummer oder null>",
  "date": "<Rechnungs-/Belegdatum als YYYY-MM-DD oder null>",
  "dueDate": "<Faelligkeitsdatum als YYYY-MM-DD oder null>",
  "iban": "<IBAN oder null>",
  "bic": "<BIC oder null>",
  "items": [{"description": "<Beschreibung>", "quantity": <Menge>, "unitPrice": <Einzelpreis>, "total": <Gesamt>}],
  "notes": "<Sonstige relevante Informationen>"
}

## Regeln
- Betraege immer als Zahl (z.B. 119.00, nicht "119,00 EUR")
- USt-Satz als ganzzahligen Prozentsatz (19, 7, 0)
- Datumsangaben als ISO-Format (YYYY-MM-DD)
- Bei Unklarheiten: null setzen statt raten
- IBAN/BIC nur wenn klar erkennbar`;

    const userMessage = `Analysiere folgendes Dokument und extrahiere alle relevanten Felder:

**Dateiname:** ${attachment?.name || 'unbekannt'}
**E-Mail Betreff:** ${email_subject || 'unbekannt'}
**Absender:** ${email_sender || 'unbekannt'}

**Dokumentinhalt:**
${documentContent.substring(0, 4000)}`;

    const startTime = Date.now();

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'Keine AI-Antwort erhalten' });
    }

    const extracted = JSON.parse(content);
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    logger.info('Document data extracted via AI', {
      model,
      type: extracted.type,
      vendor: extracted.vendor,
      amount: extracted.amount,
      processingTimeMs: Date.now() - startTime,
    });

    res.json({
      extracted,
      model,
      usage,
      processingTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('Extract document error', { error: (error as Error).message });
    next(error);
  }
});

/**
 * Simple PDF text extraction - extracts readable text content from PDF buffer.
 * Works by finding text streams between BT/ET markers and decoding them.
 */
function extractTextFromPDF(buffer: Buffer): string {
  const text: string[] = [];

  try {
    // Convert to string and look for text content
    const raw = buffer.toString('latin1');

    // Method 1: Extract text between parentheses in BT/ET blocks (simple PDF text)
    const btEtRegex = /BT\s([\s\S]*?)ET/g;
    let match;
    while ((match = btEtRegex.exec(raw)) !== null) {
      const block = match[1];
      // Extract text in parentheses: (Hello World) Tj
      const textRegex = /\(([^)]*)\)\s*T[jJ]/g;
      let textMatch;
      while ((textMatch = textRegex.exec(block)) !== null) {
        const decoded = textMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (decoded.trim()) text.push(decoded);
      }
    }

    // Method 2: Look for stream content that might be readable text
    if (text.length === 0) {
      // Try to find readable ASCII sequences
      const readable = raw.match(/[\x20-\x7E\xC0-\xFF]{10,}/g) || [];
      for (const chunk of readable) {
        if (!/^[%\/\[\]<>{}]+$/.test(chunk) && !/^[0-9 .]+$/.test(chunk)) {
          text.push(chunk);
        }
      }
    }
  } catch (err) {
    // PDF parsing is best-effort
  }

  return text.join(' ').substring(0, 5000);
}

export default router;
