import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const url = 'https://hrms.businz.com';
const key = 'vps-local-rest-key';

async function auditAll() {
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };

  // 1. Check all company settings
  console.log('--- 1. AUDITING COMPANY_SETTINGS ---');
  try {
    const res = await fetch(`${url}/rest/v1/company_settings?select=setting_key,created_at,updated_at`, { headers });
    if (res.ok) {
      const keys = await res.json();
      console.log('Total setting keys:', keys.length);
      for (const k of keys) {
        console.log(`Setting Key: ${k.setting_key}`);
      }
    }
  } catch (e) {
    console.error('Error fetching settings keys:', e);
  }

  // 2. Check various tables via PostgREST
  const tables = [
    'employees',
    'shift_requests',
    'shifts',
    'leaves',
    'leave_requests',
    'attendance_records',
    'attendance_regularizations',
    'tasks',
    'task_assignments',
    'expenses',
    'expense_claims',
    'salary_advances',
    'field_works',
    'field_assignments',
    'travel_history'
  ];

  console.log('\n--- 2. AUDITING DATABASE TABLES ---');
  for (const table of tables) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?select=count`, {
        headers: { ...headers, 'Prefer': 'count=exact' }
      });
      const countHeader = res.headers.get('content-range');
      if (res.ok) {
        console.log(`Table [${table}]: EXISTS, count/range = ${countHeader}`);
      } else {
        console.log(`Table [${table}]: HTTP ${res.status} (${res.statusText})`);
      }
    } catch (e) {
      console.log(`Table [${table}]: Fetch error - ${e.message}`);
    }
  }
}

auditAll();
