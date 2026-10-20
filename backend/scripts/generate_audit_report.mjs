import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const url = 'https://hrms.businz.com';
const key = 'vps-local-rest-key';
const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };

async function auditReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    modules: {}
  };

  // 1. Shift Requests
  try {
    const res = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.shift_requests_vps_data&select=*`, { headers });
    if (res.ok) {
      const data = await res.json();
      const list = data[0]?.setting_val || [];
      const groups = {};
      for (const r of list) {
        const k = `${r.employeeId || r.employeeName}_${r.requestedDate}`;
        groups[k] = groups[k] || [];
        groups[k].push(r);
      }
      const duplicateGroups = Object.entries(groups)
        .filter(([k, arr]) => arr.length > 1)
        .map(([k, arr]) => ({
          key: k,
          count: arr.length,
          employeeId: arr[0].employeeId,
          employeeName: arr[0].employeeName,
          requestedDate: arr[0].requestedDate,
          records: arr.map(x => ({ id: x.id, status: x.status, shift: x.requestedShift, createdAt: x.createdAt, reason: x.reason }))
        }));

      report.modules.shiftRequests = {
        totalRecords: list.length,
        duplicateGroupsCount: duplicateGroups.length,
        duplicateRecordsTotal: duplicateGroups.reduce((acc, g) => acc + g.count, 0),
        duplicateGroups
      };
    }
  } catch (e) {
    report.modules.shiftRequests = { error: e.message };
  }

  // 2. Leave Requests (table & setting)
  try {
    const resTable = await fetch(`${url}/rest/v1/leave_requests?select=*`, { headers });
    const tableData = resTable.ok ? await resTable.json() : [];
    const groups = {};
    for (const r of tableData) {
      const k = `${r.employee_id}_${r.start_date}_${r.end_date}`;
      groups[k] = groups[k] || [];
      groups[k].push(r);
    }
    const duplicateGroups = Object.entries(groups)
      .filter(([k, arr]) => arr.length > 1)
      .map(([k, arr]) => ({
        key: k,
        count: arr.length,
        employeeId: arr[0].employee_id,
        startDate: arr[0].start_date,
        endDate: arr[0].end_date,
        records: arr.map(x => ({ id: x.id, status: x.status, reason: x.reason, createdAt: x.created_at }))
      }));

    report.modules.leaveRequestsTable = {
      totalRecords: tableData.length,
      duplicateGroupsCount: duplicateGroups.length,
      duplicateRecordsTotal: duplicateGroups.reduce((acc, g) => acc + g.count, 0),
      duplicateGroups
    };
  } catch (e) {
    report.modules.leaveRequestsTable = { error: e.message };
  }

  // 3. Loans / Advances
  try {
    const resSetting = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.loan_records_data&select=*`, { headers });
    const data = resSetting.ok ? await resSetting.json() : [];
    const list = data[0]?.setting_val || [];
    const groups = {};
    for (const r of list) {
      const k = `${r.employeeId || r.employeeName}_${r.requestDate || r.disbursementDate}_${r.loanType || r.type}`;
      groups[k] = groups[k] || [];
      groups[k].push(r);
    }
    const duplicateGroups = Object.entries(groups)
      .filter(([k, arr]) => arr.length > 1)
      .map(([k, arr]) => ({
        key: k,
        count: arr.length,
        employeeId: arr[0].employeeId,
        date: arr[0].requestDate || arr[0].disbursementDate,
        records: arr.map(x => ({ id: x.id, status: x.status, amount: x.amount || x.principalAmount, createdAt: x.createdAt }))
      }));

    report.modules.loansAndAdvances = {
      totalRecords: list.length,
      duplicateGroupsCount: duplicateGroups.length,
      duplicateRecordsTotal: duplicateGroups.reduce((acc, g) => acc + g.count, 0),
      duplicateGroups
    };
  } catch (e) {
    report.modules.loansAndAdvances = { error: e.message };
  }

  // 4. Attendance Regularizations / Missed Punches
  try {
    const res = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.master_attendance_policies_data&select=*`, { headers });
    // check attendance_records table or attendance_records_data
    const resAtt = await fetch(`${url}/rest/v1/company_settings?setting_key=eq.attendance_records_data&select=*`, { headers });
    const attList = resAtt.ok ? (await resAtt.json())[0]?.setting_val || [] : [];
    report.modules.attendanceRecords = {
      totalRecords: attList.length
    };
  } catch (e) {
    report.modules.attendanceRecords = { error: e.message };
  }

  fs.writeFileSync(path.resolve(__dirname, '../../scratch/audit_report.json'), JSON.stringify(report, null, 2));
  console.log('Report saved to scratch/audit_report.json');
}

auditReport();
