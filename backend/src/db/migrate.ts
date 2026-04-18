// Database Migration Runner
// Runs numbered .sql files from migrations/ in order, tracking applied migrations

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import pool, { query } from './index';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<string[]> {
  const rows = await query<{ name: string }>('SELECT name FROM _migrations ORDER BY id');
  return rows.map(r => r.name);
}

async function runMigrations() {
  console.log('🔄 Running database migrations...');

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.includes(file)) {
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`  ▸ Applying ${file}...`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      count++;
      console.log(`  ✓ ${file} applied`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${file} FAILED:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  if (count === 0) {
    console.log('✅ Database is up to date');
  } else {
    console.log(`✅ Applied ${count} migration(s)`);
  }

  await pool.end();
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
