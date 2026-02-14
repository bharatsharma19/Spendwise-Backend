import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

dotenv.config();

// Try to get DATABASE_URL from process.env directly if not in env.config yet
const DATABASE_URL = process.env.DATABASE_URL;

async function applyMigrations() {
  if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL is not defined in .env');
    console.error('Please add your Postgres connection string to .env:');
    console.error(
      'DATABASE_URL="postgres://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"'
    );
    process.exit(1);
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  });

  try {
    await client.connect();
    console.log('✅ Connected to Database');

    const migrationsDir = path.join(__dirname, '../../supabase/migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (file.endsWith('.sql')) {
        console.log(`Running migration: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        try {
          await client.query(sql);
          console.log(`  - Success`);
        } catch (err: any) {
          // Ignore "already exists" errors for idempotency if strictly needed,
          // but our SQL files use "CREATE OR REPLACE" or "IF NOT EXISTS" mostly.
          // However, some might fail if we are strictly validating.
          // Let's log warning but continue if it's a "relation already exists" error,
          // OR fail if it's critical.
          // Ideally we should have a migrations table to track this, but for now we brute force apply.
          console.warn(`  ! Warning running ${file}: ${err.message}`);
        }
      }
    }

    console.log('✅ All migrations applied (or attempted).');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await client.end();
  }
}

applyMigrations();
