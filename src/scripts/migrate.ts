/**
 * Migration Runner
 * Reads SQL files from src/migrations/ and executes them against the Supabase DB.
 *
 * Usage: npm run migrate
 *
 * Tracks which migrations have been run in a `_migrations` table
 * so each migration only runs once.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DB_URL = process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  console.error('❌ Missing SUPABASE_DB_URL in .env');
  console.error('');
  console.error('   Get it from: Supabase Dashboard → Settings → Database → Connection string (URI)');
  console.error('   Add to .env: SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected');

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        name TEXT PRIMARY KEY,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Get already-executed migrations
    const { rows: executed } = await client.query('SELECT name FROM public._migrations ORDER BY name');
    const executedSet = new Set(executed.map((r: any) => r.name));

    // Read migration files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('📂 No migration files found in src/migrations/');
      return;
    }

    let ranCount = 0;

    for (const file of files) {
      if (executedSet.has(file)) {
        console.log(`⏭️  ${file} — already applied`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`🚀 Running ${file}...`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO public._migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ ${file} — applied successfully`);
        ranCount++;
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`❌ ${file} — FAILED:`);
        console.error(`   ${err.message}`);
        process.exit(1);
      }
    }

    if (ranCount === 0) {
      console.log('\n✨ All migrations already up to date');
    } else {
      console.log(`\n✅ ${ranCount} migration(s) applied successfully`);
    }

  } catch (err: any) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
