// Rules API Routes

import { Router } from 'express';
import { query, queryOne } from '../db';
import { getOrCreateTenant } from '../services/tenantService';
import { evaluateRules, loadTenantRules } from '../engine/ruleEngine';
import type { EmailForProcessing, Rule as EngineRule, RuleAction } from '../engine/ruleEngine';
import { logger } from '../services/logger';

const router = Router();

interface Rule {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  stop_processing: boolean;
  criteria: Record<string, any>;
  actions: any[];
  trigger_count: number;
  last_triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// GET /api/rules - Get all rules for tenant
router.get('/', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const rules = await query<Rule>(
      'SELECT * FROM rules WHERE tenant_id = $1 ORDER BY priority, created_at',
      [tenant.id]
    );
    res.json({ rules });
  } catch (error) {
    next(error);
  }
});

// GET /api/rules/:id - Get single rule
router.get('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const rule = await queryOne<Rule>(
      'SELECT * FROM rules WHERE tenant_id = $1 AND id = $2',
      [tenant.id, req.params.id]
    );
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json({ rule });
  } catch (error) {
    next(error);
  }
});

// POST /api/rules - Create new rule
router.post('/', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const { name, description, enabled, priority, stop_processing, criteria, actions } = req.body;

    if (!name || !criteria || !actions) {
      return res.status(400).json({ error: 'Name, criteria, and actions are required' });
    }

    const result = await query<Rule>(
      `INSERT INTO rules (tenant_id, name, description, enabled, priority, stop_processing, criteria, actions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenant.id,
        name,
        description || null,
        enabled ?? true,
        priority ?? 100,
        stop_processing ?? false,
        JSON.stringify(criteria),
        JSON.stringify(actions),
      ]
    );

    res.status(201).json({ rule: result[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/rules/:id - Update rule
router.patch('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const { name, description, enabled, priority, stop_processing, criteria, actions } = req.body;

    const updates: string[] = [];
    const values: any[] = [tenant.id, req.params.id];
    let paramIndex = 3;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(enabled);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (stop_processing !== undefined) {
      updates.push(`stop_processing = $${paramIndex++}`);
      values.push(stop_processing);
    }
    if (criteria !== undefined) {
      updates.push(`criteria = $${paramIndex++}`);
      values.push(JSON.stringify(criteria));
    }
    if (actions !== undefined) {
      updates.push(`actions = $${paramIndex++}`);
      values.push(JSON.stringify(actions));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const result = await query<Rule>(
      `UPDATE rules SET ${updates.join(', ')}
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      values
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ rule: result[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/rules/:id - Delete rule
router.delete('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const result = await query(
      'DELETE FROM rules WHERE tenant_id = $1 AND id = $2 RETURNING id',
      [tenant.id, req.params.id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/rules/:id/trigger - Record rule trigger
router.post('/:id/trigger', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const result = await query<Rule>(
      `UPDATE rules
       SET trigger_count = trigger_count + 1, last_triggered_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenant.id, req.params.id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ rule: result[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/rules/reorder - Reorder rules
router.put('/reorder', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const { ruleIds } = req.body;

    if (!Array.isArray(ruleIds)) {
      return res.status(400).json({ error: 'ruleIds array required' });
    }

    // Update priority based on array order
    for (let i = 0; i < ruleIds.length; i++) {
      await query(
        'UPDATE rules SET priority = $3 WHERE tenant_id = $1 AND id = $2',
        [tenant.id, ruleIds[i], (i + 1) * 10]
      );
    }

    const rules = await query<Rule>(
      'SELECT * FROM rules WHERE tenant_id = $1 ORDER BY priority',
      [tenant.id]
    );

    res.json({ rules });
  } catch (error) {
    next(error);
  }
});

// POST /api/rules/evaluate-batch
// Retroactive rule application: the frontend ships a batch of emails
// (already fetched via Graph) and gets back which rules matched each one
// + the action list to execute. The actual execution (move/delete/
// categorize) happens client-side because only the browser has a valid
// Graph token. Optional rule_id filter lets "Jetzt anwenden" buttons
// target a single rule instead of the full active set.
router.post('/evaluate-batch', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const ruleId = typeof req.body?.rule_id === 'string' ? req.body.rule_id : undefined;
    const raw: unknown = req.body?.emails;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.json({ evaluations: [] });
    }
    if (raw.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 emails per batch' });
    }

    // Load either every active rule or just one, depending on the caller.
    let rules: EngineRule[];
    if (ruleId) {
      const one = await queryOne<EngineRule>(
        'SELECT * FROM rules WHERE id = $1 AND tenant_id = $2 AND enabled = true',
        [ruleId, tenant.id]
      );
      rules = one ? [one] : [];
    } else {
      rules = await loadTenantRules(tenant.id);
    }

    // Normalise criteria/actions shape (pg returns JSONB as objects in most
    // setups but as strings on some).
    for (const r of rules) {
      if (typeof r.criteria === 'string') r.criteria = JSON.parse(r.criteria as unknown as string);
      if (typeof r.actions === 'string') r.actions = JSON.parse(r.actions as unknown as string);
    }

    const evaluations: Array<{
      email_id: string;
      matches: Array<{
        rule_id: string;
        rule_name: string;
        matched_criteria: string[];
        actions: RuleAction[];
      }>;
    }> = [];

    for (const email of raw as Array<Record<string, unknown>>) {
      const e: EmailForProcessing = {
        id: String(email.id ?? ''),
        subject: String(email.subject ?? ''),
        bodyPreview: String(email.bodyPreview ?? ''),
        body: String(email.body ?? ''),
        senderEmail: String(email.sender ?? email.senderEmail ?? ''),
        senderDomain: String(email.sender ?? email.senderEmail ?? '').split('@')[1]?.toLowerCase() ?? '',
        importance: String(email.importance ?? 'normal'),
        hasAttachments: Boolean(email.hasAttachments),
        isDirectRecipient: email.isDirectRecipient == null ? true : Boolean(email.isDirectRecipient),
        ccCount: Number(email.ccCount ?? 0),
        isReply: /^(re:|aw:)/i.test(String(email.subject ?? '').trim()),
        isForward: /^(fw:|wg:)/i.test(String(email.subject ?? '').trim()),
        categories: Array.isArray(email.categories) ? (email.categories as string[]) : [],
        receivedDateTime: email.receivedDateTime as string | undefined,
      };

      if (!e.id) continue;
      const matches = await evaluateRules(tenant.id, e, rules);
      if (matches.length > 0) {
        evaluations.push({
          email_id: e.id,
          matches: matches.map(m => ({
            rule_id: m.rule.id,
            rule_name: m.rule.name,
            matched_criteria: m.matchedCriteria,
            actions: m.rule.actions,
          })),
        });
      }
    }

    logger.info('Rule evaluate-batch', {
      tenantId: tenant.id,
      ruleId,
      inputCount: raw.length,
      matchedCount: evaluations.length,
    });

    res.json({ evaluations });
  } catch (error) {
    next(error);
  }
});

export default router;
