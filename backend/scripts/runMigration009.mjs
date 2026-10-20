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
    connectionTimeoutMillis: 5000
  });

  try {
    console.log('Connecting to PostgreSQL database...');
    await client.connect();
    console.log('Connected!');

    const migrationFile = path.join(__dirname, '..', 'migrations', '009_customer_data_whatsapp.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('Executing migration 009...');
    await client.query(sql);
    console.log('Migration 009 executed successfully!');

    // Verify tables exist
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('customer_contacts', 'customer_consent_records', 'whatsapp_templates', 'whatsapp_messages');
    `);
    console.log('Verified tables in DB:', res.rows.map(r => r.table_name));

    await client.end();
  } catch (err) {
    console.error('Migration error (fallback will operate in in-memory mode if DB is remote-restricted):', err.message);
    if (client) await client.end().catch(() => {});
  }
}

run();
