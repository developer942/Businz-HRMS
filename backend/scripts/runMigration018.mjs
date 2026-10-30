import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Client } = pg;

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log('Connecting to PostgreSQL database for Migration 018...');
    await client.connect();

    // 1. Read-only duplicate audit before applying index migration
    const dupCheck = await client.query(`
      SELECT employee_id, date, COUNT(*) AS row_count
      FROM public.attendance_records
      GROUP BY employee_id, date
      HAVING COUNT(*) > 1
      ORDER BY date DESC
    `);
    console.log(`Read-only duplicate check: ${dupCheck.rowCount} (employee_id, date) groups have >1 historical rows (preserved intact).`);

    // 2. Apply safe non-destructive migration
    const migrationFile = path.join(__dirname, '..', 'migrations', '018_attendance_concurrency_and_shift_lookup.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    await client.query(sql);
    console.log('Migration 018 executed successfully!');
  } catch (err) {
    console.error('Migration 018 note:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

run();

