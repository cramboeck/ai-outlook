// Search Macros API Routes

import { Router } from 'express';
import { query, queryOne } from '../db';
import { getOrCreateTenant, getOrCreateUser } from '../services/tenantService';

const router = Router();

interface SearchMacro {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  icon: string;
  criteria: Record<string, any>;
  use_count: number;
  last_used_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// GET /api/macros - Get all macros for user
router.get('/', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);

    // Get user's macros and tenant-wide macros (where user_id is null)
    const macros = await query<SearchMacro>(
      `SELECT * FROM search_macros
       WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)
       ORDER BY use_count DESC, created_at`,
      [tenant.id, user.id]
    );

    res.json({ macros });
  } catch (error) {
    next(error);
  }
});

// POST /api/macros - Create new macro
router.post('/', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);
    const { name, description, icon, criteria, shared } = req.body;

    if (!name || !criteria) {
      return res.status(400).json({ error: 'Name and criteria are required' });
    }

    const result = await query<SearchMacro>(
      `INSERT INTO search_macros (tenant_id, user_id, name, description, icon, criteria)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        tenant.id,
        shared ? null : user.id, // null = shared with all users in tenant
        name,
        description || null,
        icon || '🔍',
        JSON.stringify(criteria),
      ]
    );

    res.status(201).json({ macro: result[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/macros/:id - Update macro
router.patch('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);
    const { name, description, icon, criteria } = req.body;

    const updates: string[] = [];
    const values: any[] = [tenant.id, req.params.id, user.id];
    let paramIndex = 4;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(icon);
    }
    if (criteria !== undefined) {
      updates.push(`criteria = $${paramIndex++}`);
      values.push(JSON.stringify(criteria));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const result = await query<SearchMacro>(
      `UPDATE search_macros SET ${updates.join(', ')}
       WHERE tenant_id = $1 AND id = $2 AND (user_id = $3 OR user_id IS NULL)
       RETURNING *`,
      values
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Macro not found' });
    }

    res.json({ macro: result[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/macros/:id - Delete macro
router.delete('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);

    const result = await query(
      `DELETE FROM search_macros
       WHERE tenant_id = $1 AND id = $2 AND (user_id = $3 OR user_id IS NULL)
       RETURNING id`,
      [tenant.id, req.params.id, user.id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Macro not found' });
    }

    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/macros/:id/use - Record macro usage
router.post('/:id/use', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);

    const result = await query<SearchMacro>(
      `UPDATE search_macros
       SET use_count = use_count + 1, last_used_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenant.id, req.params.id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Macro not found' });
    }

    res.json({ macro: result[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
