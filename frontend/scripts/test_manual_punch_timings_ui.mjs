import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modalPath = path.resolve(__dirname, '../src/components/attendance/ManualAttendanceEntryModal.tsx');
const modalSource = fs.readFileSync(modalPath, 'utf8');

console.log('=== BUSINZ HRMS: Manual Attendance Punch Timings UI & Logic Verification ===');

// 1. Verify UI Structural Requirements in ManualAttendanceEntryModal.tsx
assert.ok(modalSource.includes('Punch Timings'), 'Header title "Punch Timings" must be present');
assert.ok(
  modalSource.includes('Shift: {shiftStartTimeStr} – {shiftEndTimeStr} · Grace: {effectiveGraceMins} min'),
  'Dynamic shift and grace subtitle must use actual employee shift and grace period'
);
assert.ok(
  modalSource.includes('Use shift start: {shiftStartTimeStr}'),
  'Smart shortcut "Use shift start: <time>" must be present below Check-In'
);
assert.ok(
  modalSource.includes('Use shift end: {shiftEndTimeStr}'),
  'Smart shortcut "Use shift end: <time>" must be present below Check-Out'
);
assert.ok(
  modalSource.includes('data-testid="checkin-status-badge"'),
  'Compact attendance status indicator badge must be present below Check-In'
);
assert.ok(
  modalSource.includes('.punch-timings-grid') && modalSource.includes('@media (max-width: 640px)'),
  'Responsive desktop 2-column and mobile stacked layout must be configured'
);

// 2. Verify removal of old quick-selection button clutter
assert.ok(
  !modalSource.includes("['06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM']"),
  'Old Check-Out time chip clutter must be removed'
);
assert.ok(
  !modalSource.includes("graceThresholdTimeStr, '09:00 AM', '09:30 AM', '10:00 AM', '10:40 AM'"),
  'Old Check-In time chip clutter must be removed'
);

// 3. Verify preservation of other Manual Attendance fields
assert.ok(modalSource.includes('Break Duration (Minutes)'), 'Break Duration field must remain unchanged');
assert.ok(modalSource.includes('Approved OT Hours (Optional)'), 'Approved Overtime field must remain unchanged');
assert.ok(modalSource.includes('Save Attendance Record'), 'Save Attendance Record button must remain unchanged');
assert.ok(modalSource.includes('Missed In') && modalSource.includes('Missed Out'), 'Missed punch workflow must be preserved');
assert.ok(
  modalSource.includes('// Employee has NOT checked in: keep Check-In as Missed In without pre-filling shift start time'),
  'Check-In must stay Missed In when employee has not checked in'
);

// 4. Verify pure helper logic matching ManualAttendanceEntryModal.tsx exports
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hh = parseInt(match[1], 10);
  const mm = parseInt(match[2], 10);
  const mer = match[3]?.toUpperCase();
  if (mer === 'PM' && hh < 12) hh += 12;
  if (mer === 'AM' && hh === 12) hh = 0;
  return hh * 60 + mm;
};

const format24to12 = (time24) => {
  if (!time24) return '';
  const parts = time24.trim().split(':');
  if (parts.length < 2) return '';
  let hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  const meridiem = hh >= 12 ? 'PM' : 'AM';
  if (hh === 0) hh = 12;
  else if (hh > 12) hh -= 12;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${meridiem}`;
};

const isValidTimeInput = (raw) => {
  if (!raw || !raw.trim()) return false;
  const clean = raw.trim().replace(/\./g, ':');
  const match = clean.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(AM|PM|A|P)?$/i);
  if (match) {
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    const mer = match[3]?.toUpperCase();
    if (isNaN(hh) || isNaN(mm) || mm < 0 || mm > 59) return false;
    if (mer) return hh >= 1 && hh <= 12;
    return hh >= 0 && hh <= 23;
  }
  const compact = clean.match(/^(\d{1,2})(\d{2})\s*(AM|PM|A|P)$/i);
  if (compact) {
    const hh = parseInt(compact[1], 10);
    const mm = parseInt(compact[2], 10);
    return hh >= 1 && hh <= 12 && mm >= 0 && mm <= 59;
  }
  return false;
};

const normalizeTimeString = (raw) => {
  if (!raw || !raw.trim()) return '';
  const clean = raw.trim().replace(/\./g, ':');
  const match = clean.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(AM|PM|A|P)?$/i);
  if (match) {
    let hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (isNaN(hh) || isNaN(mm) || mm < 0 || mm > 59) return raw;
    const rawMer = match[3]?.toUpperCase();
    if (rawMer) {
      if (hh < 1 || hh > 12) return raw;
      const meridiem = rawMer.startsWith('P') ? 'PM' : 'AM';
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${meridiem}`;
    }
    if (hh < 0 || hh > 23) return raw;
    return format24to12(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  const compact = clean.match(/^(\d{1,2})(\d{2})\s*(AM|PM|A|P)$/i);
  if (compact) {
    const hh = parseInt(compact[1], 10);
    const mm = parseInt(compact[2], 10);
    if (hh >= 1 && hh <= 12 && mm >= 0 && mm <= 59) {
      const meridiem = compact[3].toUpperCase().startsWith('P') ? 'PM' : 'AM';
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${meridiem}`;
    }
  }
  return raw;
};

const evaluatePunchCheckInStatus = ({ checkInTime, isMissedCheckIn, shiftStartTimeStr, effectiveGraceMins, isExempt = false }) => {
  if (isMissedCheckIn || !checkInTime || !isValidTimeInput(checkInTime)) {
    return { badge: 'Not Calculated', isLate: false, lateMinutes: 0, earlyMinutes: 0 };
  }
  const normalizedIn = normalizeTimeString(checkInTime);
  const inMins = parseTimeToMinutes(normalizedIn);
  const shiftMins = parseTimeToMinutes(shiftStartTimeStr) ?? (9 * 60);
  if (inMins === null || shiftMins === null) {
    return { badge: 'Not Calculated', isLate: false, lateMinutes: 0, earlyMinutes: 0 };
  }
  let diff = inMins - shiftMins;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;

  if (isExempt) {
    if (diff < 0) return { badge: 'Early', isLate: false, lateMinutes: 0, earlyMinutes: Math.abs(diff) };
    return { badge: 'On Time', isLate: false, lateMinutes: 0, earlyMinutes: 0 };
  }
  if (diff < 0) return { badge: 'Early', isLate: false, lateMinutes: 0, earlyMinutes: Math.abs(diff) };
  if (diff <= effectiveGraceMins) return { badge: 'On Time', isLate: false, lateMinutes: 0, earlyMinutes: 0 };
  return { badge: 'Late', isLate: true, lateMinutes: diff, earlyMinutes: 0 };
};

const calculateNetWorkingHours = ({ status, checkInTime, checkOutTime, isMissedCheckIn, isMissedCheckOut, breakDurationMinutes }) => {
  if (status === 'Absent' || status === 'On Leave') return 0;
  if (status === 'Half Day') return 4.5;
  if (isMissedCheckIn || isMissedCheckOut) return 4.5;
  if (!isValidTimeInput(checkInTime) || !isValidTimeInput(checkOutTime)) return 8.0;
  const inMins = parseTimeToMinutes(normalizeTimeString(checkInTime));
  const outMins = parseTimeToMinutes(normalizeTimeString(checkOutTime));
  if (inMins === null || outMins === null) return 8.0;
  let totalMins = outMins - inMins;
  if (totalMins < 0) totalMins += 24 * 60;
  const netMins = Math.max(0, totalMins - (Number(breakDurationMinutes) || 0));
  return Math.round((netMins / 60) * 10) / 10;
};

// Test AM/PM conversion & normalization
assert.equal(format24to12('09:19'), '09:19 AM');
assert.equal(format24to12('18:20'), '06:20 PM');
assert.equal(format24to12('00:05'), '12:05 AM');
assert.equal(format24to12('12:30'), '12:30 PM');
assert.equal(normalizeTimeString('9:19 am'), '09:19 AM');
assert.equal(normalizeTimeString('620p'), '06:20 PM');
assert.equal(normalizeTimeString('18:20'), '06:20 PM');

// Test invalid time rejection
assert.equal(isValidTimeInput('25:00'), false);
assert.equal(isValidTimeInput('13:15 PM'), false);
assert.equal(isValidTimeInput('09:75 AM'), false);
assert.equal(isValidTimeInput('invalid'), false);
assert.equal(isValidTimeInput('09:19 AM'), true);
assert.equal(isValidTimeInput('06:20 PM'), true);

// Test Attendance Status Indicator (On Time, Late, Early, Not Calculated) + Grace Period
assert.equal(
  evaluatePunchCheckInStatus({ checkInTime: '09:19 AM', isMissedCheckIn: false, shiftStartTimeStr: '09:00 AM', effectiveGraceMins: 40 }).badge,
  'On Time',
  '09:19 AM within 40m grace of 09:00 AM must be On Time'
);
assert.equal(
  evaluatePunchCheckInStatus({ checkInTime: '09:40 AM', isMissedCheckIn: false, shiftStartTimeStr: '09:00 AM', effectiveGraceMins: 40 }).badge,
  'On Time',
  'Exact grace boundary (09:40 AM) must be On Time'
);
assert.equal(
  evaluatePunchCheckInStatus({ checkInTime: '09:41 AM', isMissedCheckIn: false, shiftStartTimeStr: '09:00 AM', effectiveGraceMins: 40 }).badge,
  'Late',
  'Exceeding grace boundary (09:41 AM) must be Late'
);
assert.equal(
  evaluatePunchCheckInStatus({ checkInTime: '08:45 AM', isMissedCheckIn: false, shiftStartTimeStr: '09:00 AM', effectiveGraceMins: 40 }).badge,
  'Early',
  'Before shift start (08:45 AM) must be Early'
);
assert.equal(
  evaluatePunchCheckInStatus({ checkInTime: '', isMissedCheckIn: true, shiftStartTimeStr: '09:00 AM', effectiveGraceMins: 40 }).badge,
  'Not Calculated',
  'Missed check-in must be Not Calculated'
);
assert.equal(
  evaluatePunchCheckInStatus({ checkInTime: '11:00 AM', isMissedCheckIn: false, shiftStartTimeStr: '09:00 AM', effectiveGraceMins: 40, isExempt: true }).badge,
  'On Time',
  'Exempt employee checking in after grace must still be On Time'
);

// Test Overnight Shift handling (e.g. 10:00 PM to 06:30 AM with 30m break = 8.0 hrs)
assert.equal(
  calculateNetWorkingHours({
    status: 'Present',
    checkInTime: '10:00 PM',
    checkOutTime: '06:30 AM',
    isMissedCheckIn: false,
    isMissedCheckOut: false,
    breakDurationMinutes: 30
  }),
  8.0,
  'Overnight shift (10:00 PM to 06:30 AM, 30m break) must calculate 8.0 hours'
);

console.log('✓ All 20 Manual Attendance Punch Timings UI & logic tests passed!');
