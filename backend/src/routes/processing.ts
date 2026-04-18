// Processing API - Main entry point for email processing pipeline
// Combines rules + AI classification + action extraction + document detection

import { Router } from 'express';
import { processEmail, processEmailBatch } from '../engine/processingPipeline';
import type { EmailForProcessing } from '../engine/ruleEngine';
import { logger } from '../services/logger';

const router = Router();

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

    const result = await processEmail(
      req.tenantId!,
      req.userId!,
      emailForProcessing,
      options || {},
      // AI services will be injected when implemented
      {}
    );

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

    const results = await processEmailBatch(
      req.tenantId!,
      req.userId!,
      emailsForProcessing,
      options || {},
      {}
    );

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
      {}
    );

    res.json({ results, count: results.length, dryRun: true });
  } catch (error) {
    logger.error('Dry run error', { error: (error as Error).message });
    next(error);
  }
});

export default router;
