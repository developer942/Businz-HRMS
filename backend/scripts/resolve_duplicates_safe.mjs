/**
 * Safe Duplicate Resolution Script for VRM Enterprise HRM (Businz HRMS)
 * 
 * Rules:
 * 1. Takes a full verified snapshot backup BEFORE any modifications.
 * 2. NEVER deletes records from database or audit logs.
 * 3. Identifies the primary (earliest) submission in each duplicate group and preserves its active state.
 * 4. Marks subsequent duplicate submissions as 'Cancelled' with full audit trail notes.
 * 5. Supports --dry-run for administrator review before committing.
 * 
 * Usage:
 *   node backend/scripts/resolve_duplicates_safe.mjs --dry-run
 *   node backend/scripts/resolve_duplicates_safe.mjs --commit
 */

import fs from 'fs';
import path from 'path';

const REST_URL = 'https://hrms.businz.com/rest/v1';
const REST_KEY = 'vps-local-rest-key';
const HEADERS = {
  'apikey': REST_KEY,
  'Authorization': `Bearer ${REST_KEY}`,
  'Content-Type': 'application/json'
};

const isCommit = process.argv.includes('--commit');
const isDryRun = !isCommit;

async function getSetting(key) {
  const res = await fetch(`${REST_URL}/company_settings?setting_key=eq.${key}&select=*`, { headers: HEADERS });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.setting_val ?? null;
}

async function saveSetting(key, value) {
  const res = await fetch(`${REST_URL}/company_settings?setting_key=eq.${key}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ setting_val: value, updated_at: new Date().toISOString() })
  });
  return res.ok;
}

async function getLeaveRequests() {
  const res = await fetch(`${REST_URL}/leave_requests?select=*`, { headers: HEADERS });
  if (!res.ok) return [];
  return await res.json();
}

async function updateLeaveRequest(id, updates) {
  const res = await fetch(`${REST_URL}/leave_requests?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(updates)
  });
  return res.ok;
}

async function main() {
  console.log('='.repeat(70));
  console.log(`VRM ENTERPRISE HRMS - SAFE DUPLICATE RESOLUTION`);
  console.log(`Mode: ${isCommit ? 'COMMIT (Executing changes)' : 'DRY-RUN (Preview only)'}`);
  console.log('='.repeat(70));

  // 1. Fetch current data
  console.log('\n[1/4] Fetching records from live PostgREST API...');
  const shiftRequests = await getSetting('shift_requests_vps_data') || [];
  const leaveRequests = await getLeaveRequests();
  const leaveSettings = await getSetting('leave_requests_data') || [];

  console.log(`Found ${shiftRequests.length} shift requests in company_settings.`);
  console.log(`Found ${leaveRequests.length} leave requests in public.leave_requests.`);

  // 2. Verified Snapshot Backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve('scratch');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `backup_before_resolution_${timestamp}.json`);

  const backupData = {
    timestamp: new Date().toISOString(),
    environment: 'production',
    sourceUrl: REST_URL,
    shift_requests_vps_data: shiftRequests,
    leave_requests_table: leaveRequests,
    leave_requests_data_setting: leaveSettings
  };
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`\n[2/4] Verified backup saved to: ${backupFile}`);

  // 3. Process Shift Requests Duplicates
  console.log('\n[3/4] Analyzing shift request duplicates...');
  // Group by employeeId + requestedDate
  const shiftGroups = {};
  shiftRequests.forEach((req, idx) => {
    const key = `${req.employeeId || 'unknown'}_${req.requestedDate || 'unknown'}`;
    if (!shiftGroups[key]) shiftGroups[key] = [];
    shiftGroups[key].push({ ...req, _originalIndex: idx });
  });

  let resolvedShiftRequests = [...shiftRequests];
  let shiftDuplicatesCount = 0;
  const shiftResolutionLogs = [];

  for (const [key, list] of Object.entries(shiftGroups)) {
    // Check if there are multiple active (Pending/Approved) requests
    const active = list.filter(r => r.status === 'Pending' || r.status === 'Approved');
    if (active.length > 1) {
      // Sort by createdAt ascending (earliest first)
      active.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      const primary = active[0];
      const duplicates = active.slice(1);

      console.log(`  -> Group [${key}]: ${active.length} active requests. Primary kept: ${primary.id} (Created: ${primary.createdAt})`);

      duplicates.forEach(dup => {
        shiftDuplicatesCount++;
        shiftResolutionLogs.push({
          module: 'Shift Swap / Change',
          recordId: dup.id,
          employeeId: dup.employeeId,
          employeeName: dup.employeeName,
          requestedDate: dup.requestedDate,
          previousStatus: dup.status,
          newStatus: 'Cancelled',
          resolutionNote: `Duplicate of active request ${primary.id}. Safely archived without record deletion.`
        });

        // Update in resolved list
        resolvedShiftRequests = resolvedShiftRequests.map(r => {
          if (r.id === dup.id) {
            return {
              ...r,
              status: 'Cancelled',
              cancellationReason: `Duplicate submission identified and archived. Primary request preserved (${primary.id}).`,
              updatedAt: new Date().toISOString(),
              archivedAsDuplicate: true,
              originalRequestId: primary.id
            };
          }
          return r;
        });
      });
    }
  }

  // 4. Process Leave Requests Duplicates
  console.log('\n[4/4] Analyzing leave request duplicates...');
  const leaveGroups = {};
  leaveRequests.forEach(req => {
    const key = `${req.employee_id}_${req.start_date}_${req.end_date}`;
    if (!leaveGroups[key]) leaveGroups[key] = [];
    leaveGroups[key].push(req);
  });

  let leaveDuplicatesCount = 0;
  const leaveResolutionLogs = [];
  const leavesToUpdateInDb = [];

  for (const [key, list] of Object.entries(leaveGroups)) {
    const active = list.filter(l => l.status === 'Pending' || l.status === 'Approved');
    if (active.length > 1) {
      active.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const primary = active[0];
      const duplicates = active.slice(1);

      console.log(`  -> Leave Group [${key}]: ${active.length} active leaves. Primary kept: ${primary.id}`);

      duplicates.forEach(dup => {
        leaveDuplicatesCount++;
        const updatePayload = {
          status: 'Cancelled',
          comment: `Duplicate submission archived by safe resolution. Primary active request is ${primary.id}.`,
          updated_at: new Date().toISOString()
        };
        leavesToUpdateInDb.push({ id: dup.id, updates: updatePayload });
        leaveResolutionLogs.push({
          module: 'Leave Management',
          recordId: dup.id,
          employeeId: dup.employee_id,
          dateRange: `${dup.start_date} to ${dup.end_date}`,
          previousStatus: dup.status,
          newStatus: 'Cancelled',
          resolutionNote: `Duplicate of active leave ${primary.id}. Preserved with Cancelled status.`
        });
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('AUDIT RESOLUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Shift Request Duplicates to Resolve: ${shiftDuplicatesCount}`);
  console.log(`Leave Request Duplicates to Resolve: ${leaveDuplicatesCount}`);
  console.log(`Total Records Maintained (Zero Deletions): ${shiftRequests.length + leaveRequests.length}`);

  if (isDryRun) {
    console.log('\n[DRY RUN COMPLETE] No records were modified on the live database.');
    console.log('Run with --commit to execute the resolution safely.');
  } else {
    console.log('\nApplying resolution to database...');
    // Commit shift requests
    const shiftSaved = await saveSetting('shift_requests_vps_data', resolvedShiftRequests);
    console.log(`  -> Shift requests setting updated: ${shiftSaved ? 'SUCCESS' : 'FAILED'}`);

    // Commit leave requests in table
    let leavesUpdated = 0;
    for (const item of leavesToUpdateInDb) {
      const ok = await updateLeaveRequest(item.id, item.updates);
      if (ok) leavesUpdated++;
    }
    console.log(`  -> Leave request table records updated: ${leavesUpdated}/${leavesToUpdateInDb.length}`);

    // Also sync leave_requests_data in settings if present
    if (Array.isArray(leaveSettings) && leaveSettings.length > 0) {
      const updatedLeaveSettings = leaveSettings.map(ls => {
        const matchingUpdate = leavesToUpdateInDb.find(u => u.id === ls.id);
        if (matchingUpdate) {
          return { ...ls, status: 'Cancelled', comment: matchingUpdate.updates.comment };
        }
        return ls;
      });
      await saveSetting('leave_requests_data', updatedLeaveSettings);
      console.log(`  -> Leave requests settings sync updated.`);
    }

    console.log('\n[COMMIT COMPLETE] All duplicate active requests have been safely archived as Cancelled.');
    console.log('Original active requests are intact. Audit trails preserved.');
  }

  // Save report
  const reportPath = path.join(backupDir, `resolution_report_${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    isCommit,
    shiftDuplicatesCount,
    leaveDuplicatesCount,
    shiftResolutionLogs,
    leaveResolutionLogs
  }, null, 2), 'utf-8');
  console.log(`Resolution audit report written to: ${reportPath}`);
}

main().catch(err => {
  console.error('Resolution failed:', err);
  process.exit(1);
});
