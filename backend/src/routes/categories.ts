// Categories API Routes

import { Router } from 'express';
import { query, queryOne } from '../db';
import { getOrCreateTenant } from '../services/tenantService';

const router = Router();

interface Category {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string;
  emoji: string;
  keywords: string[];
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

// GET /api/categories - Get all categories for tenant
router.get('/', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const categories = await query<Category>(
      'SELECT * FROM categories WHERE tenant_id = $1 ORDER BY sort_order, name',
      [tenant.id]
    );
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

// POST /api/categories - Create new category
router.post('/', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const { name, description, color, emoji, keywords, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await query<Category>(
      `INSERT INTO categories (tenant_id, name, description, color, emoji, keywords, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenant.id,
        name,
        description || null,
        color || 'preset0',
        emoji || '📧',
        keywords || [],
        sort_order ?? 0,
      ]
    );

    res.status(201).json({ category: result[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Category with this name already exists' });
    }
    next(error);
  }
});

// PATCH /api/categories/:id - Update category
router.patch('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const { name, description, color, emoji, keywords, sort_order } = req.body;

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
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(color);
    }
    if (emoji !== undefined) {
      updates.push(`emoji = $${paramIndex++}`);
      values.push(emoji);
    }
    if (keywords !== undefined) {
      updates.push(`keywords = $${paramIndex++}`);
      values.push(keywords);
    }
    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(sort_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const result = await query<Category>(
      `UPDATE categories SET ${updates.join(', ')}
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      values
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ category: result[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Category with this name already exists' });
    }
    next(error);
  }
});

// DELETE /api/categories/:id - Delete category
router.delete('/:id', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const result = await query(
      'DELETE FROM categories WHERE tenant_id = $1 AND id = $2 RETURNING id',
      [tenant.id, req.params.id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/categories/bulk - Create or update multiple categories
router.post('/bulk', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const { categories } = req.body;

    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'Categories array required' });
    }

    const results: Category[] = [];

    for (const cat of categories) {
      // Upsert: update if exists, insert if not
      const result = await query<Category>(
        `INSERT INTO categories (tenant_id, name, description, color, emoji, keywords, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, name) DO UPDATE SET
           description = EXCLUDED.description,
           color = EXCLUDED.color,
           emoji = EXCLUDED.emoji,
           keywords = EXCLUDED.keywords,
           sort_order = EXCLUDED.sort_order
         RETURNING *`,
        [
          tenant.id,
          cat.name,
          cat.description || null,
          cat.color || 'preset0',
          cat.emoji || '📧',
          cat.keywords || [],
          cat.sort_order ?? 0,
        ]
      );
      results.push(result[0]);
    }

    res.json({ categories: results });
  } catch (error) {
    next(error);
  }
});

export default router;
