// Rules API Routes

import { Router } from 'express';
import { query, queryOne } from '../db';
import { getOrCreateTenant } from '../services/tenantService';

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

export default router;
