// Email Templates API Routes

import { Router } from 'express';
import { query, queryOne } from '../db';
import { getOrCreateTenant, getOrCreateUser } from '../services/tenantService';

const router = Router();

interface EmailTemplate {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string;
  subject: string | null;
  body: string;
  variables: string[];
  category: string | null;
  use_count: number;
  created_at: Date;
  updated_at: Date;
}

// GET /api/templates - Get all templates for user
router.get('/', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);

    // Get user's templates and tenant-wide templates
    const templates = await query<EmailTemplate>(
      `SELECT * FROM email_templates
       WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)
       ORDER BY use_count DESC, name`,
      [tenant.id, user.id]
    );

    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

// GET /api/templates/:id - Get single template
router.get('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);

    const template = await queryOne<EmailTemplate>(
      `SELECT * FROM email_templates
       WHERE tenant_id = $1 AND id = $2 AND (user_id = $3 OR user_id IS NULL)`,
      [tenant.id, req.params.id, user.id]
    );

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error) {
    next(error);
  }
});

// POST /api/templates - Create new template
router.post('/', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);
    const { name, subject, body, variables, category, shared } = req.body;

    if (!name || !body) {
      return res.status(400).json({ error: 'Name and body are required' });
    }

    const result = await query<EmailTemplate>(
      `INSERT INTO email_templates (tenant_id, user_id, name, subject, body, variables, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenant.id,
        shared ? null : user.id,
        name,
        subject || null,
        body,
        variables || [],
        category || null,
      ]
    );

    res.status(201).json({ template: result[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/templates/:id - Update template
router.patch('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);
    const { name, subject, body, variables, category } = req.body;

    const updates: string[] = [];
    const values: any[] = [tenant.id, req.params.id, user.id];
    let paramIndex = 4;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (subject !== undefined) {
      updates.push(`subject = $${paramIndex++}`);
      values.push(subject);
    }
    if (body !== undefined) {
      updates.push(`body = $${paramIndex++}`);
      values.push(body);
    }
    if (variables !== undefined) {
      updates.push(`variables = $${paramIndex++}`);
      values.push(variables);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const result = await query<EmailTemplate>(
      `UPDATE email_templates SET ${updates.join(', ')}
       WHERE tenant_id = $1 AND id = $2 AND (user_id = $3 OR user_id IS NULL)
       RETURNING *`,
      values
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template: result[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/templates/:id - Delete template
router.delete('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);

    const result = await query(
      `DELETE FROM email_templates
       WHERE tenant_id = $1 AND id = $2 AND (user_id = $3 OR user_id IS NULL)
       RETURNING id`,
      [tenant.id, req.params.id, user.id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/templates/:id/use - Record template usage
router.post('/:id/use', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);

    const result = await query<EmailTemplate>(
      `UPDATE email_templates
       SET use_count = use_count + 1
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenant.id, req.params.id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template: result[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
