// Actions API - Persistent TODO/action items from email processing
// CRUD + status lifecycle + overdue tracking

import { Router } from 'express';
import { query, queryOne } from '../db';
import { logEvent } from '../services/auditService';
import { forwardToAllMatchingIntegrations } from '../services/forwardService';
import { logger } from '../services/logger';

const router = Router();

// GET /api/actions - List actions with filters
router.get('/', async (req, res, next) => {
  try {
    const { status, priority, type, document_type, deadline_before, search, limit = '50', offset = '0' } = req.query;

    let sql = 'SELECT * FROM actions WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let idx = 2;

    if (status) {
      const statuses = (status as string).split(',');
      const placeholders = statuses.map(() => `$${idx++}`).join(', ');
      sql += ` AND status IN (${placeholders})`;
      params.push(...statuses);
    }
    if (priority) {
      sql += ` AND priority = $${idx++}`;
      params.push(priority);
    }
    if (type) {
      if (type === 'document') {
        sql += ` AND document_type IS NOT NULL AND document_type != 'none'`;
      } else {
        sql += ` AND action_type = $${idx++}`;
        params.push(type);
      }
    }
    if (document_type) {
      sql += ` AND document_type = $${idx++}`;
      params.push(document_type);
    }
    if (deadline_before) {
      sql += ` AND deadline <= $${idx++}`;
      params.push(deadline_before);
    }
    if (search) {
      sql += ` AND (description LIKE $${idx} OR email_subject LIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    sql += ` ORDER BY
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      deadline NULLS LAST,
      created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(Math.min(parseInt(limit as string) || 50, 200));
    params.push(parseInt(offset as string) || 0);

    // Count query (same WHERE, no LIMIT/OFFSET)
    const countSql = sql.replace(/ORDER BY[\s\S]*$/, '').replace('SELECT *', 'SELECT COUNT(*) as count');
    const countParams = params.slice(0, -2); // remove limit+offset
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult[0]?.count || '0', 10);

    const rows = await query(sql, params);
    res.json({ items: rows, total });
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
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status IN ('open', 'in_progress') AND deadline < CURRENT_DATE THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_this_week
      FROM actions
      WHERE tenant_id = $1
    `, [req.tenantId]);

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
       WHERE tenant_id = $1
       AND status IN ('open', 'in_progress')
       AND deadline < CURRENT_DATE
       ORDER BY deadline ASC`,
      [req.tenantId]
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
    const { description, priority, deadline, notes, status, document_data } = req.body;

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
    if (document_data !== undefined) { updates.push(`document_data = $${idx++}`); params.push(JSON.stringify(document_data)); }
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

// PATCH /api/actions/:id/status - Quick status change + Freigabe-Workflow
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status, attachment, access_token } = req.body;
    const validStatuses = ['open', 'in_progress', 'approved', 'done', 'dismissed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    let extraSql = '';
    if (status === 'done' || status === 'approved') extraSql = ', completed_at = NOW()';
    if (status === 'dismissed') extraSql = ', dismissed_at = NOW()';

    const rows = await query(
      `UPDATE actions SET status = $1${extraSql} WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, req.params.id, req.tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const action = rows[0];

    // Freigabe-Workflow: When status = 'approved', forward to all matching integrations
    if (status === 'approved' && action.document_type && action.document_type !== 'none') {
      try {
        const forwardResults = await forwardToAllMatchingIntegrations(req.tenantId!, action, attachment, access_token);
        const successCount = forwardResults.filter(r => r.success).length;

        // Update action with forward results and set to done
        const forwardedTo = JSON.stringify(forwardResults.map(r => ({
          integration_id: r.integration_id,
          integration_name: r.integration_name,
          integration_type: r.integration_type,
          timestamp: r.timestamp,
          status: r.success ? 'success' : 'error',
          message: r.message,
          ...(r.document_id ? { document_id: r.document_id } : {}),
          ...(r.document_url ? { document_url: r.document_url } : {}),
        })));

        const finalStatus = successCount > 0 ? 'done' : 'approved';
        await query(
          `UPDATE actions SET status = $1, forwarded_to = $2 WHERE id = $3`,
          [finalStatus, forwardedTo, req.params.id]
        );

        // Re-fetch updated action
        const updated = await queryOne('SELECT * FROM actions WHERE id = $1', [req.params.id]);

        await logEvent({
          tenantId: req.tenantId!,
          userId: req.userId,
          emailId: action.email_id,
          eventType: 'action_applied',
          source: 'manual',
          metadata: {
            actionId: req.params.id,
            newStatus: finalStatus,
            forwardResults: forwardResults.map(r => ({ type: r.integration_type, success: r.success })),
          },
        });

        return res.json({
          ...updated,
          _forwardResults: forwardResults,
          _forwardSummary: `${successCount}/${forwardResults.length} Integrationen erfolgreich`,
        });
      } catch (forwardError) {
        logger.error('Freigabe forward error', { error: (forwardError as Error).message });
        // Still return the action, but note the error
        return res.json({
          ...action,
          _forwardError: (forwardError as Error).message,
        });
      }
    }

    await logEvent({
      tenantId: req.tenantId!,
      userId: req.userId,
      emailId: action.email_id,
      eventType: 'action_applied',
      source: 'manual',
      metadata: { actionId: req.params.id, newStatus: status },
    });

    res.json(action);
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
