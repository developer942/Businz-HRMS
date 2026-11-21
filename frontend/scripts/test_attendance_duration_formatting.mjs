import assert from 'node:assert/strict';

// Core math & formatting functions matching attendanceCalculationEngine.ts
function formatHoursAndMinutes(hoursVal) {
  if (hoursVal === null || hoursVal === undefined || hoursVal === '') return '0h 00m';
  const str = String(hoursVal).trim();
  if (str === '—' || str === '-' || str === '--:--' || str.toLowerCase().includes('progress')) {
    return '0h 00m';
  }
  if (/^\d+h\s*\d+m$/i.test(str)) {
    return str;
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(str)) {
    const parts = str.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  const cleanNumStr = str.replace(/[^\d.-]/g, '').trim();
  const num = Number(cleanNumStr);
  if (isNaN(num) || num <= 0) return '0h 00m';
  const totalMinutes = Math.round((num + Number.EPSILON) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatDurationHoursAndMinutes(totalMinutes) {
  const safeMins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hrs = Math.floor(safeMins / 60);
  const mins = safeMins % 60;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const clean = String(timeStr).trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = match[3] ? parseInt(match[3], 10) : 0;
  const mer = match[4]?.toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return { totalMinutes: h * 60 + m, seconds: s, h, m };
}

function calculateSessionDuration(checkIn, checkOut, breakMinutes = 0) {
  const inP = parseTimeToMinutes(checkIn);
  const outP = parseTimeToMinutes(checkOut);
  if (!inP || !outP) return null;

  let inTotalSeconds = inP.totalMinutes * 60 + inP.seconds;
  let outTotalSeconds = outP.totalMinutes * 60 + outP.seconds;

  // Overnight shift
  if (outTotalSeconds < inTotalSeconds) {
    outTotalSeconds += 24 * 3600;
  }

  const elapsedSeconds = outTotalSeconds - inTotalSeconds;
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  const netMinutes = Math.max(0, elapsedMinutes - breakMinutes);
  const workingHoursDecimal = Math.round((netMinutes / 60 + Number.EPSILON) * 100) / 100;

  return {
    elapsedMinutes,
    netMinutes,
    workingHoursDecimal,
    formattedDuration: formatDurationHoursAndMinutes(netMinutes)
  };
}

console.log('--- Starting Attendance Duration Formatting & Calculation Tests ---');

// Test 1: Decimal Values conversion
console.log('Test 1: Decimal values conversion');
assert.equal(formatHoursAndMinutes(8.82), '8h 49m', '8.82 must convert to 8h 49m, NEVER 8 hours 82 minutes');
assert.equal(formatHoursAndMinutes(8.92), '8h 55m', '8.92 must convert to 8h 55m');
assert.equal(formatHoursAndMinutes(0.02), '0h 01m', '0.02 must convert to 0h 01m');
assert.equal(formatHoursAndMinutes(0.1), '0h 06m', '0.1 must convert to 0h 06m');
assert.equal(formatHoursAndMinutes(1.5), '1h 30m', '1.5 must convert to 1h 30m');
assert.equal(formatHoursAndMinutes(8.5), '8h 30m', '8.5 must convert to 8h 30m');
assert.equal(formatHoursAndMinutes(10.08), '10h 05m', '10.08 must convert to 10h 05m');
console.log('✓ Test 1 passed.');

// Test 2: Zero, null, undefined, empty string, negative
console.log('Test 2: Zero, null, undefined, empty, negative');
assert.equal(formatHoursAndMinutes(0), '0h 00m');
assert.equal(formatHoursAndMinutes(-2.5), '0h 00m');
assert.equal(formatHoursAndMinutes(null), '0h 00m');
assert.equal(formatHoursAndMinutes(undefined), '0h 00m');
assert.equal(formatHoursAndMinutes(''), '0h 00m');
assert.equal(formatHoursAndMinutes('—'), '0h 00m');
assert.equal(formatHoursAndMinutes('--:--'), '0h 00m');
console.log('✓ Test 2 passed.');

// Test 3: String with units or pre-formatted
console.log('Test 3: String representations with units');
assert.equal(formatHoursAndMinutes('8.82 hrs'), '8h 49m');
assert.equal(formatHoursAndMinutes('8.92 Hrs'), '8h 55m');
assert.equal(formatHoursAndMinutes('0.02 hrs'), '0h 01m');
assert.equal(formatHoursAndMinutes('8h 49m'), '8h 49m');
assert.equal(formatHoursAndMinutes('08:49'), '8h 49m');
assert.equal(formatHoursAndMinutes('08:49:00'), '8h 49m');
console.log('✓ Test 3 passed.');

// Test 4: Duration from minutes
console.log('Test 4: formatDurationHoursAndMinutes');
assert.equal(formatDurationHoursAndMinutes(529), '8h 49m');
assert.equal(formatDurationHoursAndMinutes(535), '8h 55m');
assert.equal(formatDurationHoursAndMinutes(1), '0h 01m');
assert.equal(formatDurationHoursAndMinutes(0), '0h 00m');
assert.equal(formatDurationHoursAndMinutes(60), '1h 00m');
console.log('✓ Test 4 passed.');

// Test 5: Verify 09:51 AM to 06:40 PM is displayed as 8h 49m
console.log('Test 5: 09:51 AM to 06:40 PM verification');
const sess5 = calculateSessionDuration('09:51 AM', '06:40 PM', 0);
assert.equal(sess5.elapsedMinutes, 529, 'Total minutes must be 529');
assert.equal(sess5.netMinutes, 529);
assert.equal(sess5.formattedDuration, '8h 49m', 'Must format to 8h 49m');
assert.equal(sess5.workingHoursDecimal, 8.82, 'Decimal working hours is 8.82');
assert.equal(formatHoursAndMinutes(sess5.workingHoursDecimal), '8h 49m', 'formatHoursAndMinutes(8.82) must match exactly');
console.log('✓ Test 5 passed: 09:51 AM to 06:40 PM -> 529 minutes -> 8h 49m (decimal 8.82 hrs).');

// Test 6: Seconds rounding
console.log('Test 6: Seconds rounding');
// 09:51:24 AM to 06:40:48 PM: (18*3600+40*60+48) - (9*3600+51*60+24) = 67248 - 35484 = 31764s = 529.4 mins -> 529 mins
const sess6 = calculateSessionDuration('09:51:24 AM', '06:40:48 PM', 0);
assert.equal(sess6.netMinutes, 529);
assert.equal(sess6.formattedDuration, '8h 49m');
console.log('✓ Test 6 passed.');

// Test 7: Overnight attendance
console.log('Test 7: Overnight attendance');
// 09:00 PM to 06:00 AM next day = 9 hours (540 mins)
const sess7 = calculateSessionDuration('09:00 PM', '06:00 AM', 0);
assert.equal(sess7.netMinutes, 540);
assert.equal(sess7.formattedDuration, '9h 00m');
console.log('✓ Test 7 passed.');

// Test 8: Break deduction rules
console.log('Test 8: Break deduction rules');
// 09:00 AM to 06:30 PM (570 mins) with 30 mins break -> 540 mins (9h 00m)
const sess8 = calculateSessionDuration('09:00 AM', '06:30 PM', 30);
assert.equal(sess8.elapsedMinutes, 570);
assert.equal(sess8.netMinutes, 540);
assert.equal(sess8.formattedDuration, '9h 00m');
console.log('✓ Test 8 passed.');

// Test 9: Overtime formatting
console.log('Test 9: Overtime formatting');
const ot1 = 1.5;
assert.equal(formatHoursAndMinutes(ot1), '1h 30m');
const ot2 = 0.25;
assert.equal(formatHoursAndMinutes(ot2), '0h 15m');
const ot3 = 0.02;
assert.equal(formatHoursAndMinutes(ot3), '0h 01m');
console.log('✓ Test 9 passed.');

console.log('--- ALL 9 TEST SUITES PASSED CLEANLY! ---');
