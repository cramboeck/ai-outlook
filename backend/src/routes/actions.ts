// Actions API - Persistent TODO/action items from email processing
// CRUD + status lifecycle + overdue tracking

import { Router } from 'express';
import { query, queryOne } from '../db';
import { logEvent } from '../services/auditService';
import { logger } from '../services/logger';

const router = Router();

// GET /api/actions - List actions with filters
router.get('/', async (req, res, next) => {
  try {
    const { status, priority, type, deadline_before, limit = '50', offset = '0' } = req.query;

    let sql = 'SELECT * FROM actions WHERE tenant_id = $1 AND user_id = $2';
    const params: any[] = [req.tenantId, req.userId];
    let idx = 3;

    if (status) {
      const statuses = (status as string).split(',');
      sql += ` AND status = ANY($${idx++})`;
      params.push(statuses);
    }
    if (priority) {
      sql += ` AND priority = $${idx++}`;
      params.push(priority);
    }
    if (type) {
      sql += ` AND action_type = $${idx++}`;
      params.push(type);
    }
    if (deadline_before) {
      sql += ` AND deadline <= $${idx++}`;
      params.push(deadline_before);
    }

    sql += ` ORDER BY
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      deadline NULLS LAST,
      created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(Math.min(parseInt(limit as string) || 50, 200));
    params.push(parseInt(offset as string) || 0);

    const rows = await query(sql, params);
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/actions/summary - Dashboard counts
router.get('/summary', async (req, res, next) => {
  try {
    const summary = await queryOne<{
      open: string;
      in_progress: string;
      overdue: string;
      done_this_week: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND deadline < CURRENT_DATE) as overdue,
        COUNT(*) FILTER (WHERE status = 'done' AND completed_at >= NOW() - INTERVAL '7 days') as done_this_week
      FROM actions
      WHERE tenant_id = $1 AND user_id = $2
    `, [req.tenantId, req.userId]);

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// GET /api/actions/overdue - Actions past deadline
router.get('/overdue', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM actions
       WHERE tenant_id = $1 AND user_id = $2
       AND status IN ('open', 'in_progress')
       AND deadline < CURRENT_DATE
       ORDER BY deadline ASC`,
      [req.tenantId, req.userId]
    );
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/actions/:id - Single action
router.get('/:id', async (req, res, next) => {
  try {
    const action = await queryOne(
      'SELECT * FROM actions WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }
    res.json(action);
  } catch (error) {
    next(error);
  }
});

// POST /api/actions - Create manual action
router.post('/', async (req, res, next) => {
  try {
    const { description, action_type, priority, deadline, email_id, email_subject, email_sender, notes } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const rows = await query(
      `INSERT INTO actions (tenant_id, user_id, description, action_type, priority, deadline,
        email_id, email_subject, email_sender, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual')
       RETURNING *`,
      [req.tenantId, req.userId, description, action_type || 'task', priority || 'medium',
       deadline || null, email_id || null, email_subject || null, email_sender || null, notes || null]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/actions/:id - Update action
router.patch('/:id', async (req, res, next) => {
  try {
    const { description, priority, deadline, notes, status } = req.body;

    const existing = await queryOne<any>(
      'SELECT * FROM actions WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (priority !== undefined) { updates.push(`priority = $${idx++}`); params.push(priority); }
    if (deadline !== undefined) { updates.push(`deadline = $${idx++}`); params.push(deadline || null); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
    if (status !== undefined) {
      updates.push(`status = $${idx++}`);
      params.push(status);
      if (status === 'done') { updates.push(`completed_at = NOW()`); }
      if (status === 'dismissed') { updates.push(`dismissed_at = NOW()`); }
    }

    if (updates.length === 0) {
      return res.json(existing);
    }

    params.push(req.params.id);
    params.push(req.tenantId);

    const rows = await query(
      `UPDATE actions SET ${updates.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx++} RETURNING *`,
      params
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/actions/:id/status - Quick status change
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'in_progress', 'done', 'dismissed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    let extraSql = '';
    if (status === 'done') extraSql = ', completed_at = NOW()';
    if (status === 'dismissed') extraSql = ', dismissed_at = NOW()';

    const rows = await query(
      `UPDATE actions SET status = $1${extraSql} WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, req.params.id, req.tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }

    await logEvent({
      tenantId: req.tenantId!,
      userId: req.userId,
      emailId: rows[0].email_id,
      eventType: 'action_applied',
      source: 'manual',
      metadata: { actionId: req.params.id, newStatus: status },
    });

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/actions/:id - Soft delete (dismiss)
router.delete('/:id', async (req, res, next) => {
  try {
    const rows = await query(
      `UPDATE actions SET status = 'dismissed', dismissed_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
