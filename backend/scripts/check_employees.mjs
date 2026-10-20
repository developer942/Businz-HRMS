import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const url = 'https://hrms.businz.com';
const key = 'vps-local-rest-key';
const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };

async function getEmployees() {
  const res = await fetch(`${url}/rest/v1/employees?select=id,employee_id,first_name,last_name,email`, { headers });
  const data = await res.json();
  console.log(data);
}

getEmployees();
