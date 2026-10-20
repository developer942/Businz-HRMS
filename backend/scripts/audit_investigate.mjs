import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Connected to DB:', process.env.DATABASE_URL?.split('@')[1]);
    
    // Check shift_requests table
    try {
      const res1 = await client.query('SELECT count(*) FROM public.shift_requests');
      console.log('shift_requests table count:', res1.rows[0]);
      const resRows = await client.query('SELECT * FROM public.shift_requests LIMIT 5');
      console.log('shift_requests table rows:', resRows.rows);
    } catch (e) {
      console.log('shift_requests table query error:', e.message);
    }

    // Check company_settings for shift_requests_vps_data
    try {
      const res2 = await client.query("SELECT setting_key, setting_val FROM public.company_settings WHERE setting_key LIKE '%shift%'");
      console.log('company_settings shift keys found:');
      for (const r of res2.rows) {
        const isArr = Array.isArray(r.setting_val);
        console.log(`Key: ${r.setting_key}, isArray: ${isArr}, count: ${isArr ? r.setting_val.length : typeof r.setting_val}`);
        if (isArr) {
          console.log('Sample rows:', JSON.stringify(r.setting_val.slice(0, 3), null, 2));
        }
      }
    } catch (e) {
      console.log('company_settings query error:', e.message);
    }

    // Check other request tables
    const tables = [
      'leave_requests', 'leaves', 'tasks', 'expenses', 'expense_claims', 
      'salary_advances', 'attendance_regularizations', 'field_works', 'field_assignments'
    ];
    for (const t of tables) {
      try {
        const c = await client.query(`SELECT count(*) FROM public.${t}`);
        console.log(`Table ${t} count:`, c.rows[0].count);
      } catch (e) {
        // console.log(`Table ${t} does not exist:`, e.message);
      }
    }

    // Check all setting keys
    const settingsKeys = await client.query('SELECT setting_key FROM public.company_settings ORDER BY setting_key');
    console.log('All company_settings keys:', settingsKeys.rows.map(r => r.setting_key));

    // List all public tables
    const tableList = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('All public tables:', tableList.rows.map(r => r.table_name).join(', '));

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
