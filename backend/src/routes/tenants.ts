// Tenants API Routes

import { Router } from 'express';
import {
  getOrCreateTenant,
  getOrCreateUser,
  updateTenantSettings,
  updateUserPreferences,
  getTenantUsers,
} from '../services/tenantService';
import { query, queryOne } from '../db';
import { isOboConfigured } from '../services/authService';

const router = Router();

// GET /api/tenants/me - Get current tenant info or create if not exists
router.get('/me', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!, req.userName);
    const user = await getOrCreateUser(
      tenant.id,
      req.userId!,
      req.userEmail!,
      req.userName
    );

    // Read the Copilot license flag so the frontend can render an
    // accurate toggle in Settings.
    const copilotRow = await queryOne<{ has_copilot_license: boolean }>(
      'SELECT has_copilot_license FROM tenants WHERE id = $1',
      [tenant.id]
    );

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        settings: tenant.settings,
        has_copilot_license: copilotRow?.has_copilot_license ?? false,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferences: user.preferences,
      },
      // Backend capability hints — so the UI can disable the Copilot
      // toggle with an explanation when the env isn't wired up.
      capabilities: {
        copilotObo: isOboConfigured(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/tenants/copilot-license - Toggle the Copilot premium flag
// for the current tenant. Admin-only in spirit; role check lives in
// auditable DB layer for now.
router.patch('/copilot-license', async (req, res, next) => {
  try {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required' });
    }
    const tenant = await getOrCreateTenant(req.tenantId!);
    await query(
      'UPDATE tenants SET has_copilot_license = $1 WHERE id = $2',
      [enabled, tenant.id]
    );
    res.json({ has_copilot_license: enabled });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/tenants/settings - Update tenant settings
router.patch('/settings', async (req, res, next) => {
  try {
    const tenant = await updateTenantSettings(req.tenantId!, req.body);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({ settings: tenant.settings });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/tenants/preferences - Update user preferences
router.patch('/preferences', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const user = await getOrCreateUser(tenant.id, req.userId!, req.userEmail!);
    const updated = await updateUserPreferences(tenant.id, user.id, req.body);

    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ preferences: updated.preferences });
  } catch (error) {
    next(error);
  }
});

// GET /api/tenants/users - Get all users in tenant (admin only)
router.get('/users', async (req, res, next) => {
  try {
    const tenant = await getOrCreateTenant(req.tenantId!);
    const users = await getTenantUsers(tenant.id);
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

export default router;
