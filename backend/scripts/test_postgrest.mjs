import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const url = 'https://hrms.businz.com';
const key = 'vps-local-rest-key';

async function testRest() {
  console.log('Testing PostgREST at:', url);
  try {
    const res = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.shift_requests_vps_data&select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Status:', res.status, res.statusText);
    if (res.ok) {
      const data = await res.json();
      console.log('Data returned length:', data.length);
      if (data.length > 0) {
        const val = data[0].setting_val;
        console.log('setting_val isArray:', Array.isArray(val), 'length:', val?.length);
        if (Array.isArray(val)) {
          console.log('Sample rows (first 3):', JSON.stringify(val.slice(0, 3), null, 2));
          // Look for Pavithra G / VRM-016
          const pavi = val.filter(r => r.employeeId === 'VRM-016' || (r.employeeName && r.employeeName.includes('Pavithra')));
          console.log(`Pavithra requests count: ${pavi.length}`);
          console.log('Pavithra requests:', JSON.stringify(pavi, null, 2));
        }
      }
    } else {
      const text = await res.text();
      console.log('Error body:', text);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testRest();
