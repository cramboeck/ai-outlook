// Database Connection Layer
// Supports: PostgreSQL (production) and SQLite (local dev fallback)
// Automatically falls back to SQLite when PostgreSQL is unavailable

import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// ---------------------------------------------------------------------------
// SQLite fallback (for local development without Docker/PostgreSQL)
// ---------------------------------------------------------------------------

let sqliteDb: any = null;
let usingSqlite = false;

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', '..', 'data', 'postpilot-dev.db');

    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');

    // Initialize schema
    initSqliteSchema(sqliteDb);

    console.log(`📦 SQLite database: ${dbPath}`);
    return sqliteDb;
  } catch (err) {
    console.error('❌ Failed to initialize SQLite:', err);
    throw err;
  }
}

function initSqliteSchema(db: any) {
  // Use dedicated SQLite schema file instead of adapting PostgreSQL migrations
  const schemaPath = path.join(__dirname, 'sqlite-schema.sql');
  if (fs.existsSync(schemaPath)) {
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(sql);
    console.log('✅ SQLite schema initialized');
  } else {
    console.error('❌ SQLite schema file not found:', schemaPath);
  }
}

function adaptPgToSqlite(sql: string): string {
  return sql
    // Remove IF NOT EXISTS issues
    .replace(/CREATE INDEX IF NOT EXISTS/gi, 'CREATE INDEX IF NOT EXISTS')
    // UUID default
    .replace(/gen_random_uuid\(\)/gi, "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))")
    // SERIAL/BIGSERIAL -> INTEGER
    .replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/BIGSERIAL/gi, 'INTEGER')
    // JSONB -> TEXT
    .replace(/JSONB/gi, 'TEXT')
    .replace(/::jsonb/gi, '')
    .replace(/::text/gi, '')
    // TIMESTAMP -> TEXT
    .replace(/TIMESTAMP WITH TIME ZONE/gi, 'TEXT')
    .replace(/TIMESTAMPTZ/gi, 'TEXT')
    .replace(/TIMESTAMP/gi, 'TEXT')
    // NOW() -> datetime
    .replace(/NOW\(\)/gi, "datetime('now')")
    .replace(/CURRENT_TIMESTAMP/gi, "datetime('now')")
    // Boolean
    .replace(/ BOOLEAN/gi, ' INTEGER')
    // NUMERIC -> REAL
    .replace(/NUMERIC\(\d+,\s*\d+\)/gi, 'REAL')
    // Remove PostgreSQL-specific
    .replace(/COMMENT ON .*?;/gi, '')
    .replace(/CREATE EXTENSION.*?;/gi, '')
    .replace(/ALTER TABLE.*?OWNER.*?;/gi, '')
    // ON CONFLICT for unique constraints
    .replace(/ON CONFLICT \(.*?\) DO NOTHING/gi, 'OR IGNORE');
}

// Convert SQLite rows to match pg result format
function sqliteQuery(text: string, params?: any[]): any[] {
  const db = getSqliteDb();

  // Adapt PostgreSQL parameter placeholders ($1, $2) to SQLite (?, ?)
  let sqliteText = text;
  let sqliteParams = params || [];

  // Replace $N placeholders with ?
  sqliteText = sqliteText.replace(/\$(\d+)/g, '?');

  // Handle ILIKE -> LIKE (SQLite is case-insensitive by default for ASCII)
  sqliteText = sqliteText.replace(/ILIKE/gi, 'LIKE');

  // Handle PostgreSQL boolean literals -> SQLite integer (1/0)
  sqliteText = sqliteText.replace(/\b= true\b/gi, '= 1');
  sqliteText = sqliteText.replace(/\b= false\b/gi, '= 0');
  sqliteText = sqliteText.replace(/\bIS true\b/gi, '= 1');
  sqliteText = sqliteText.replace(/\bIS false\b/gi, '= 0');

  // Handle PostgreSQL-style casting
  sqliteText = sqliteText.replace(/::text/gi, '');
  sqliteText = sqliteText.replace(/::jsonb/gi, '');
  sqliteText = sqliteText.replace(/::integer/gi, '');

  // Handle COALESCE with jsonb
  sqliteText = sqliteText.replace(/COALESCE\(([^,]+),\s*'\[\]'::jsonb\)/gi, 'COALESCE($1, \'[]\')');

  // Handle jsonb concat operator ||
  sqliteText = sqliteText.replace(/\|\|/g, '||');

  const trimmed = sqliteText.trim().toUpperCase();

  try {
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
      const stmt = db.prepare(sqliteText);
      return stmt.all(...sqliteParams);
    } else if (trimmed.includes('RETURNING')) {
      // SQLite doesn't support RETURNING, so we handle it
      const returningMatch = sqliteText.match(/RETURNING\s+(.*?)$/i);
      const baseQuery = sqliteText.replace(/\s*RETURNING\s+.*$/i, '');

      const stmt = db.prepare(baseQuery);
      const result = stmt.run(...sqliteParams);

      if (returningMatch) {
        // For INSERT, get the last inserted row
        if (trimmed.startsWith('INSERT')) {
          const tableName = baseQuery.match(/INTO\s+(\w+)/i)?.[1];
          if (tableName) {
            const row = db.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`).get(result.lastInsertRowid);
            return row ? [row] : [];
          }
        }
        // For UPDATE/DELETE, return affected count
        if (trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) {
          const tableName = trimmed.startsWith('UPDATE')
            ? baseQuery.match(/UPDATE\s+(\w+)/i)?.[1]
            : baseQuery.match(/FROM\s+(\w+)/i)?.[1];
          // Try to get the updated/deleted row by re-querying
          // For simple cases, extract WHERE clause
          const whereMatch = baseQuery.match(/WHERE\s+(.*?)$/i);
          if (tableName && whereMatch) {
            const selectSql = `SELECT * FROM ${tableName} WHERE ${whereMatch[1]}`;
            try {
              const rows = db.prepare(selectSql).all(...sqliteParams.slice(-2)); // rough heuristic
              return rows;
            } catch {
              return [{ id: 'unknown', changes: result.changes }];
            }
          }
          return [{ changes: result.changes }];
        }
      }

      return [{ id: result.lastInsertRowid, changes: result.changes }];
    } else {
      const stmt = db.prepare(sqliteText);
      const result = stmt.run(...sqliteParams);
      return [{ changes: result.changes }];
    }
  } catch (err: any) {
    // More helpful error for debugging
    console.error(`❌ SQLite query error: ${err.message}`);
    console.error(`   Query: ${sqliteText.substring(0, 120)}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// PostgreSQL connection
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgres://postpilot:postpilot_dev_123@localhost:5432/postpilot',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
});

// ---------------------------------------------------------------------------
// Auto-detect database on first query
// ---------------------------------------------------------------------------

let dbDetected = false;

async function detectDatabase() {
  if (dbDetected) return;
  dbDetected = true;

  // If DATABASE_URL is explicitly set to sqlite, use SQLite
  if (process.env.DATABASE_URL === 'sqlite') {
    usingSqlite = true;
    getSqliteDb();
    return;
  }

  // Try PostgreSQL first (with retry)
  let pgConnected = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('📦 PostgreSQL connected');
      usingSqlite = false;
      pgConnected = true;
      break;
    } catch (err) {
      if (attempt < 3) {
        console.log(`⏳ PostgreSQL Verbindungsversuch ${attempt}/3 fehlgeschlagen, retry in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  if (!pgConnected) {
    // If DATABASE_URL is explicitly configured, warn loudly about fallback
    if (process.env.DATABASE_URL && process.env.DATABASE_URL !== 'sqlite') {
      console.error('');
      console.error('🚨🚨🚨 WARNUNG: PostgreSQL nicht erreichbar aber DATABASE_URL ist konfiguriert! 🚨🚨🚨');
      console.error(`🚨 Konfigurierte URL: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
      console.error('🚨 Fallback auf SQLite – Daten sind NICHT synchron mit PostgreSQL!');
      console.error('🚨 Bitte PostgreSQL starten und Backend neustarten.');
      console.error('');
    }
    console.log('⚠️  PostgreSQL nicht erreichbar - verwende SQLite als Fallback');
    usingSqlite = true;
    getSqliteDb();
  }
}

// Trigger detection immediately
detectDatabase();

// ---------------------------------------------------------------------------
// Public API (same interface regardless of backend)
// ---------------------------------------------------------------------------

export const query = async <T = any>(
  text: string,
  params?: any[]
): Promise<T[]> => {
  await detectDatabase();

  if (usingSqlite) {
    return sqliteQuery(text, params) as T[];
  }

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

export const queryOne = async <T = any>(
  text: string,
  params?: any[]
): Promise<T | null> => {
  const rows = await query<T>(text, params);
  return rows[0] || null;
};

export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  if (usingSqlite) {
    // SQLite transaction via synchronous API
    const db = getSqliteDb();
    const transaction = db.transaction(() => {
      // For SQLite, we pass a mock client that uses the db directly
      return callback({
        query: async (text: string, params?: any[]) => ({
          rows: sqliteQuery(text, params),
        }),
        release: () => {},
      } as any);
    });
    return transaction();
  }

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

export const checkHealth = async (): Promise<boolean> => {
  try {
    if (usingSqlite) {
      getSqliteDb().prepare('SELECT 1').get();
      return true;
    }
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

export const closePool = async (): Promise<void> => {
  if (usingSqlite && sqliteDb) {
    sqliteDb.close();
    console.log('📦 SQLite database closed');
  } else {
    await pool.end();
    console.log('📦 Database pool closed');
  }
};

// Export for informational purposes
export const isDatabaseSqlite = () => usingSqlite;

export default pool;
