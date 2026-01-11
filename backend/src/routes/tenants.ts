// Tenants API Routes

import { Router } from 'express';
import {
  getOrCreateTenant,
  getOrCreateUser,
  updateTenantSettings,
  updateUserPreferences,
  getTenantUsers,
} from '../services/tenantService';

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

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        settings: tenant.settings,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferences: user.preferences,
      },
    });
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
