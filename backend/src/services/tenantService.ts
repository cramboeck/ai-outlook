// Tenant Service
// Manages tenant (organization) data

import { query, queryOne } from '../db';
import { v4 as uuid } from 'uuid';

export interface Tenant {
  id: string;
  azure_tenant_id: string;
  name: string | null;
  plan: string;
  settings: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  tenant_id: string;
  azure_user_id: string;
  email: string;
  name: string | null;
  role: string;
  preferences: Record<string, any>;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Get or create tenant
export const getOrCreateTenant = async (
  azureTenantId: string,
  name?: string
): Promise<Tenant> => {
  // Try to find existing tenant
  let tenant = await queryOne<Tenant>(
    'SELECT * FROM tenants WHERE azure_tenant_id = $1',
    [azureTenantId]
  );

  if (!tenant) {
    // Create new tenant
    const result = await query<Tenant>(
      `INSERT INTO tenants (azure_tenant_id, name, plan, settings)
       VALUES ($1, $2, 'free', '{}')
       RETURNING *`,
      [azureTenantId, name || null]
    );
    tenant = result[0];
    console.log(`✅ Created new tenant: ${azureTenantId}`);
  }

  return tenant;
};

// Get tenant by Azure ID
export const getTenantByAzureId = async (
  azureTenantId: string
): Promise<Tenant | null> => {
  return queryOne<Tenant>(
    'SELECT * FROM tenants WHERE azure_tenant_id = $1',
    [azureTenantId]
  );
};

// Update tenant settings
export const updateTenantSettings = async (
  azureTenantId: string,
  settings: Record<string, any>
): Promise<Tenant | null> => {
  const result = await query<Tenant>(
    `UPDATE tenants
     SET settings = settings || $2
     WHERE azure_tenant_id = $1
     RETURNING *`,
    [azureTenantId, JSON.stringify(settings)]
  );
  return result[0] || null;
};

// Get or create user
export const getOrCreateUser = async (
  tenantId: string,
  azureUserId: string,
  email: string,
  name?: string
): Promise<User> => {
  // Try to find existing user
  let user = await queryOne<User>(
    'SELECT * FROM users WHERE tenant_id = $1 AND azure_user_id = $2',
    [tenantId, azureUserId]
  );

  if (!user) {
    // Create new user
    const result = await query<User>(
      `INSERT INTO users (tenant_id, azure_user_id, email, name, role, preferences)
       VALUES ($1, $2, $3, $4, 'user', '{}')
       RETURNING *`,
      [tenantId, azureUserId, email, name || null]
    );
    user = result[0];
    console.log(`✅ Created new user: ${email}`);
  } else {
    // Update last login
    await query(
      `UPDATE users SET last_login_at = NOW(), name = COALESCE($3, name)
       WHERE tenant_id = $1 AND azure_user_id = $2`,
      [tenantId, azureUserId, name]
    );
  }

  return user;
};

// Get user by ID
export const getUserById = async (
  tenantId: string,
  userId: string
): Promise<User | null> => {
  return queryOne<User>(
    'SELECT * FROM users WHERE tenant_id = $1 AND id = $2',
    [tenantId, userId]
  );
};

// Update user preferences
export const updateUserPreferences = async (
  tenantId: string,
  userId: string,
  preferences: Record<string, any>
): Promise<User | null> => {
  const result = await query<User>(
    `UPDATE users
     SET preferences = preferences || $3
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, userId, JSON.stringify(preferences)]
  );
  return result[0] || null;
};

// Get all users in tenant (admin only)
export const getTenantUsers = async (tenantId: string): Promise<User[]> => {
  return query<User>(
    'SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at',
    [tenantId]
  );
};
