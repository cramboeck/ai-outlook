// Database Connection
// Works with: Local PostgreSQL, Hetzner, Azure Database for PostgreSQL

import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Connection pool - reused across requests
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgres://postpilot:postpilot_dev_123@localhost:5432/postpilot',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // SSL for production (Azure, Hetzner with SSL)
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('📦 Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Database error:', err);
});

// Query helper with automatic client release
export const query = async <T = any>(
  text: string,
  params?: any[]
): Promise<T[]> => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`📊 Query (${duration}ms):`, text.substring(0, 80));
    }
    return result.rows as T[];
  } catch (error) {
    console.error('❌ Query error:', error);
    throw error;
  }
};

// Single row query
export const queryOne = async <T = any>(
  text: string,
  params?: any[]
): Promise<T | null> => {
  const rows = await query<T>(text, params);
  return rows[0] || null;
};

// Transaction helper
export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Health check
export const checkHealth = async (): Promise<boolean> => {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

// Close pool (for graceful shutdown)
export const closePool = async (): Promise<void> => {
  await pool.end();
  console.log('📦 Database pool closed');
};

export default pool;
