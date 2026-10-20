import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const url = 'https://hrms.businz.com';
const key = 'vps-local-rest-key';
const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };

async function inspectAllModules() {
  console.log('=== AUDITING EXISTING RECORDS ACROSS MODULES ===\n');

  // 1. Shift Requests
  try {
    const res = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.shift_requests_vps_data&select=*`, { headers });
    if (res.ok) {
      const data = await res.json();
      const list = data[0]?.setting_val || [];
      console.log(`[Shift Requests] Total in DB setting: ${list.length}`);
      
      // Analyze duplicates by employeeId + requestedDate
      const groups = {};
      for (const r of list) {
        const k = `${r.employeeId || r.employeeName}_${r.requestedDate}_${r.status}`;
        groups[k] = groups[k] || [];
        groups[k].push(r);
      }
      const duplicateGroups = Object.entries(groups).filter(([k, arr]) => arr.length > 1);
      console.log(`[Shift Requests] Duplicate groups (same emp, date, status): ${duplicateGroups.length}`);
      for (const [k, arr] of duplicateGroups) {
        console.log(`  Group ${k}: ${arr.length} records. IDs: ${arr.map(x => x.id).join(', ')}`);
      }
    }
  } catch (e) {
    console.error('Error auditing shift requests:', e);
  }

  // 2. Leave Requests (both table and setting)
  try {
    const resTable = await fetch(`${url}/rest/v1/leave_requests?select=*`, { headers });
    if (resTable.ok) {
      const tableData = await resTable.json();
      console.log(`\n[Leave Requests Table] Total records: ${tableData.length}`);
      const groups = {};
      for (const r of tableData) {
        const k = `${r.employee_id}_${r.start_date}_${r.end_date}_${r.status}`;
        groups[k] = groups[k] || [];
        groups[k].push(r);
      }
      const dups = Object.entries(groups).filter(([k, arr]) => arr.length > 1);
      console.log(`[Leave Requests Table] Duplicates: ${dups.length}`);
      for (const [k, arr] of dups) {
        console.log(`  Group ${k}: ${arr.length} records. IDs: ${arr.map(x => x.id).join(', ')}`);
      }
    }

    const resSetting = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.leave_requests_data&select=*`, { headers });
    if (resSetting.ok) {
      const data = await resSetting.json();
      const list = data[0]?.setting_val || [];
      console.log(`[Leave Requests Setting] Total records: ${list.length}`);
      const groups = {};
      for (const r of list) {
        const k = `${r.employeeId || r.employeeName}_${r.startDate}_${r.endDate}_${r.status}`;
        groups[k] = groups[k] || [];
        groups[k].push(r);
      }
      const dups = Object.entries(groups).filter(([k, arr]) => arr.length > 1);
      console.log(`[Leave Requests Setting] Duplicates: ${dups.length}`);
      for (const [k, arr] of dups) {
        console.log(`  Group ${k}: ${arr.length} records. IDs: ${arr.map(x => x.id).join(', ')}`);
      }
    }
  } catch (e) {
    console.error('Error auditing leave requests:', e);
  }

  // 3. Expenses (table & setting)
  try {
    const resTable = await fetch(`${url}/rest/v1/expenses?select=*`, { headers });
    if (resTable.ok) {
      const tableData = await resTable.json();
      console.log(`\n[Expenses Table] Total records: ${tableData.length}`);
      console.log(tableData);
    }
    const resSetting = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.expenses_data&select=*`, { headers });
    if (resSetting.ok) {
      const data = await resSetting.json();
      const list = data[0]?.setting_val || [];
      console.log(`[Expenses Setting] Total records: ${list.length}`);
      const groups = {};
      for (const r of list) {
        const k = `${r.employeeId || r.employeeName}_${r.date}_${r.amount}_${r.category}`;
        groups[k] = groups[k] || [];
        groups[k].push(r);
      }
      const dups = Object.entries(groups).filter(([k, arr]) => arr.length > 1);
      console.log(`[Expenses Setting] Duplicate expenses: ${dups.length}`);
    }
  } catch (e) {
    console.error('Error auditing expenses:', e);
  }

  // 4. Loans / Salary Advances (loan_records_data)
  try {
    const resSetting = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.loan_records_data&select=*`, { headers });
    if (resSetting.ok) {
      const data = await resSetting.json();
      const list = data[0]?.setting_val || [];
      console.log(`\n[Loans / Advances Setting] Total records: ${list.length}`);
      const groups = {};
      for (const r of list) {
        const k = `${r.employeeId || r.employeeName}_${r.requestDate || r.disbursementDate}_${r.loanType}_${r.status}`;
        groups[k] = groups[k] || [];
        groups[k].push(r);
      }
      const dups = Object.entries(groups).filter(([k, arr]) => arr.length > 1);
      console.log(`[Loans / Advances Setting] Duplicates: ${dups.length}`);
    }
  } catch (e) {
    console.error('Error auditing loans:', e);
  }

  // 5. Field Assignments
  try {
    const resSetting = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.field_assignments_data&select=*`, { headers });
    if (resSetting.ok) {
      const data = await resSetting.json();
      const list = data[0]?.setting_val || [];
      console.log(`\n[Field Assignments Setting] Total records: ${list.length}`);
      const groups = {};
      for (const r of list) {
        const k = `${r.employeeId || r.employeeName}_${r.startDate || r.assignmentDate}_${r.status}`;
        groups[k] = groups[k] || [];
        groups[k].push(r);
      }
      const dups = Object.entries(groups).filter(([k, arr]) => arr.length > 1);
      console.log(`[Field Assignments Setting] Duplicates: ${dups.length}`);
      for (const [k, arr] of dups) {
        console.log(`  Group ${k}: ${arr.length} records. IDs: ${arr.map(x => x.id).join(', ')}`);
      }
    }
  } catch (e) {
    console.error('Error auditing field assignments:', e);
  }

  // 6. Tasks
  try {
    const resTable = await fetch(`${url}/rest/v1/tasks?select=*`, { headers });
    if (resTable.ok) {
      const list = await resTable.json();
      console.log(`\n[Tasks Table] Total records: ${list.length}`);
    }
  } catch (e) {
    console.error('Error auditing tasks table:', e);
  }
}

inspectAllModules();
