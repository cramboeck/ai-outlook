// Copilot Routes — on-demand Context-Aware Draft generation and fetch.
//
//   GET  /api/copilot/drafts/:emailId       → latest draft for an email (if any)
//   POST /api/copilot/draft                 → generate a fresh draft on-demand
//                                             (used by UI "Regenerate" button)

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { logger } from '../services/logger';
import { validate } from '../middleware/validate';
import { generateContextAwareDraft } from '../services/copilotService';
import { extractBearerToken, isOboConfigured } from '../services/authService';
import { logEvent } from '../services/auditService';

const router = Router();

// --- GET /api/copilot/drafts/:emailId -------------------------------------

router.get('/drafts/:emailId', async (req, res, next) => {
  try {
    const draft = await queryOne<{
      id: string;
      email_id: string;
      email_subject: string | null;
      source: string;
      draft_text: string;
      citations: unknown;
      processing_time_ms: number | null;
      metadata: unknown;
      created_at: Date;
    }>(
      `SELECT id, email_id, email_subject, source, draft_text, citations,
              processing_time_ms, metadata, created_at
       FROM email_drafts
       WHERE tenant_id = $1 AND email_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.tenantId, req.params.emailId]
    );

    if (!draft) {
      return res.status(404).json({ error: 'No draft found for this email' });
    }

    res.json(draft);
  } catch (error) {
    next(error);
  }
});

// --- POST /api/copilot/draft ---------------------------------------------

const generateDraftSchema = z.object({
  emailId: z.string().min(1).max(512),
  emailSubject: z.string().max(1000),
  emailBody: z.string().max(50_000),
  emailSender: z.string().max(500),
  instruction: z.string().max(500).optional(),
  userName: z.string().max(200).optional(),
});

router.post('/draft', validate(generateDraftSchema), async (req, res, next) => {
  try {
    if (!isOboConfigured()) {
      return res.status(503).json({
        error: 'OBO flow not configured. Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET.',
        reason: 'obo_not_configured',
      });
    }

    // Feature-flag gate
    const tenant = await queryOne<{ has_copilot_license: boolean }>(
      'SELECT has_copilot_license FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    if (!tenant || !tenant.has_copilot_license) {
      return res.status(403).json({
        error: 'This tenant does not have a Copilot license configured in MailSort.',
        reason: 'no_copilot_license',
      });
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    const body = req.body as z.infer<typeof generateDraftSchema>;

    const outcome = await generateContextAwareDraft({
      emailSubject: body.emailSubject,
      emailBody: body.emailBody,
      emailSender: body.emailSender,
      userAccessToken: token,
      instruction: body.instruction,
      userName: body.userName,
    });

    if (outcome.status === 'unavailable') {
      return res.status(outcome.httpStatus).json({
        error: `Copilot draft unavailable: ${outcome.reason}`,
        reason: outcome.reason,
      });
    }

    // Persist as a new row (so regenerate keeps a short history)
    const inserted = await query<{ id: string }>(
      `INSERT INTO email_drafts (
         tenant_id, user_id, email_id, email_subject, source, draft_text,
         citations, processing_time_ms, metadata
       ) VALUES (
         $1, $2, $3, $4, 'copilot_rag', $5,
         $6::jsonb, $7, $8::jsonb
       )
       RETURNING id`,
      [
        req.tenantId,
        req.userId,
        body.emailId,
        body.emailSubject,
        outcome.draft.draftText,
        JSON.stringify(outcome.draft.citations),
        outcome.draft.processingTimeMs,
        JSON.stringify({
          model: outcome.draft.model,
          retrievalHitCount: outcome.draft.retrievalHitCount,
          source: 'manual_request',
        }),
      ]
    );

    await logEvent({
      tenantId: req.tenantId!,
      userId: req.userId,
      emailId: body.emailId,
      emailSubject: body.emailSubject,
      eventType: 'copilot_draft_generated',
      source: 'manual',
      model: outcome.draft.model,
      tokensPrompt: outcome.draft.usage.prompt_tokens,
      tokensCompletion: outcome.draft.usage.completion_tokens,
      tokensTotal: outcome.draft.usage.total_tokens,
      processingTimeMs: outcome.draft.processingTimeMs,
      metadata: {
        retrievalHitCount: outcome.draft.retrievalHitCount,
        citationCount: outcome.draft.citations.length,
      },
    });

    res.json({
      id: inserted[0]?.id,
      draft_text: outcome.draft.draftText,
      citations: outcome.draft.citations,
      model: outcome.draft.model,
      retrievalHitCount: outcome.draft.retrievalHitCount,
      processingTimeMs: outcome.draft.processingTimeMs,
    });
  } catch (error) {
    logger.error('Copilot draft on-demand error', {
      error: (error as Error).message,
    });
    next(error);
  }
});

export default router;
