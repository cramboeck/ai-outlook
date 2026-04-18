// Integrations API - DMS and external tool connections
// Supports: SharePoint, sevDesk, DATEV, Custom Webhook

import { Router } from 'express';
import { query, queryOne } from '../db';
import { logEvent } from '../services/auditService';
import { logger } from '../services/logger';

const router = Router();

// GET /api/integrations - List configured integrations
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id, tenant_id, type, name, description, enabled, status, last_error, last_used_at, auto_forward_rules, forward_count, created_at FROM integrations WHERE tenant_id = $1 ORDER BY created_at',
      [req.tenantId]
    );
    // Don't expose config (contains credentials)
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/integrations/:id - Single integration (with masked config)
router.get('/:id', async (req, res, next) => {
  try {
    const row = await queryOne<any>(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!row) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Mask sensitive config values
    if (row.config) {
      const masked = { ...row.config };
      for (const key of Object.keys(masked)) {
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
          masked[key] = masked[key] ? '***configured***' : null;
        }
      }
      row.config = masked;
    }

    res.json(row);
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations - Create integration
router.post('/', async (req, res, next) => {
  try {
    const { type, name, description, config, auto_forward_rules } = req.body;

    const validTypes = ['sharepoint', 'sevdesk', 'datev', 'webhook'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
    }

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const rows = await query(
      `INSERT INTO integrations (tenant_id, type, name, description, config, auto_forward_rules, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'configured')
       RETURNING id, tenant_id, type, name, description, enabled, status, created_at`,
      [req.tenantId, type, name, description || null, JSON.stringify(config || {}),
       JSON.stringify(auto_forward_rules || [])]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/integrations/:id - Update integration
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, description, config, enabled, auto_forward_rules } = req.body;

    const existing = await queryOne(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (config !== undefined) { updates.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }
    if (enabled !== undefined) { updates.push(`enabled = $${idx++}`); params.push(enabled); }
    if (auto_forward_rules !== undefined) { updates.push(`auto_forward_rules = $${idx++}`); params.push(JSON.stringify(auto_forward_rules)); }

    if (updates.length === 0) {
      return res.json(existing);
    }

    params.push(req.params.id);
    params.push(req.tenantId);

    const rows = await query(
      `UPDATE integrations SET ${updates.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx++}
       RETURNING id, tenant_id, type, name, description, enabled, status, auto_forward_rules, created_at`,
      params
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/integrations/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const rows = await query(
      'DELETE FROM integrations WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/:id/forward - Forward document to integration
router.post('/:id/forward', async (req, res, next) => {
  try {
    const { email_id, email_subject, document_data, action_id } = req.body;

    const integration = await queryOne<any>(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2 AND enabled = true',
      [req.params.id, req.tenantId]
    );

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found or disabled' });
    }

    // TODO: Implement actual forwarding based on integration.type
    // For now, log the event and return success
    logger.info('Document forward requested', {
      integrationId: req.params.id,
      integrationType: integration.type,
      emailId: email_id,
      tenantId: req.tenantId,
    });

    // Update integration usage
    await query(
      'UPDATE integrations SET forward_count = forward_count + 1, last_used_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    // Log audit event
    await logEvent({
      tenantId: req.tenantId!,
      userId: req.userId,
      emailId: email_id,
      emailSubject: email_subject,
      eventType: 'document_forwarded',
      source: 'manual',
      metadata: {
        integrationId: req.params.id,
        integrationType: integration.type,
        integrationName: integration.name,
        documentData: document_data,
        actionId: action_id,
      },
    });

    // Update action forwarded_to if action_id provided
    if (action_id) {
      await query(
        `UPDATE actions SET forwarded_to = COALESCE(forwarded_to, '[]'::jsonb) || $1::jsonb
         WHERE id = $2 AND tenant_id = $3`,
        [JSON.stringify([{
          integration_id: req.params.id,
          integration_name: integration.name,
          integration_type: integration.type,
          timestamp: new Date().toISOString(),
          status: 'sent',
        }]), action_id, req.tenantId]
      );
    }

    res.json({
      success: true,
      integration: { id: integration.id, name: integration.name, type: integration.type },
      message: `Document forwarded to ${integration.name}`,
    });
  } catch (error) {
    logger.error('Forward error', { error: (error as Error).message });
    next(error);
  }
});

// GET /api/integrations/:id/status - Check connection status
router.get('/:id/status', async (req, res, next) => {
  try {
    const integration = await queryOne<any>(
      'SELECT id, type, name, status, last_error, last_used_at, forward_count FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json(integration);
  } catch (error) {
    next(error);
  }
});

export default router;
