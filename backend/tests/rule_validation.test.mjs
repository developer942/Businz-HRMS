/**
 * Comprehensive Automated Test Suite for Date Validation & Duplicate Prevention
 * Enforces Rule 1 through Rule 6 of VRM Enterprise HRM Specification
 */

import {
  COMPANY_TIMEZONE,
  getTodayKolkata,
  getKolkataDateString,
  validateRequestDate,
  validateDateRange,
  rangesOverlap,
  isActiveRequestStatus,
  PAST_DATE_ERROR_MESSAGE,
  DUPLICATE_REQUEST_ERROR_MESSAGE,
  INVALID_DATE_RANGE_ORDER_MESSAGE,
  checkDuplicateShiftRequest,
  checkDuplicateLeaveRequest,
  checkDuplicateAdvanceRequest,
  checkDuplicateFieldAssignment
} from '../src/utils/requestValidation.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

console.log('='.repeat(70));
console.log('BUSINZ HRMS - RULE 1 TO RULE 6 AUTOMATED VERIFICATION SUITE');
console.log('='.repeat(70));

const today = getTodayKolkata();
// Compute yesterday and tomorrow relative to Asia/Kolkata
const [y, m, d] = today.split('-').map(Number);
const todayDate = new Date(Date.UTC(y, m - 1, d));

const yesterdayDate = new Date(todayDate);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterday = yesterdayDate.toISOString().split('T')[0];

const tomorrowDate = new Date(todayDate);
tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
const tomorrow = tomorrowDate.toISOString().split('T')[0];

console.log(`\nContext Reference Dates (Asia/Kolkata):`);
console.log(`  Yesterday: ${yesterday}`);
console.log(`  Today:     ${today}`);
console.log(`  Tomorrow:  ${tomorrow}`);

// -----------------------------------------------------------------------------
// Scenario 1: Yesterday's date REJECT
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 1: Rule 1 Past Date Validation ---');
{
  const res = validateRequestDate(yesterday);
  assert(res.isValid === false, "Yesterday's date must be REJECTED");
  assert(res.error === PAST_DATE_ERROR_MESSAGE, `Error message must match exactly: "${PAST_DATE_ERROR_MESSAGE}"`);
}

// -----------------------------------------------------------------------------
// Scenario 2: Today's date ACCEPT
// -----------------------------------------------------------------------------
{
  const res = validateRequestDate(today);
  assert(res.isValid === true, "Today's date must be ACCEPTED");
  assert(!res.error, "Today's date should have no error");
}

// -----------------------------------------------------------------------------
// Scenario 3: Tomorrow's date ACCEPT
// -----------------------------------------------------------------------------
{
  const res = validateRequestDate(tomorrow);
  assert(res.isValid === true, "Tomorrow's date must be ACCEPTED");
  assert(!res.error, "Tomorrow's date should have no error");
}

// -----------------------------------------------------------------------------
// Scenario 4: Date Range Validation (Order & Past date checks)
// -----------------------------------------------------------------------------
{
  // Inverted order: end < start
  const resInverted = validateDateRange(tomorrow, today);
  assert(resInverted.isValid === false, "End date earlier than start date must be REJECTED");
  assert(resInverted.error === INVALID_DATE_RANGE_ORDER_MESSAGE, "Inverted order error message matches");

  // Start in past
  const resPastStart = validateDateRange(yesterday, tomorrow);
  assert(resPastStart.isValid === false, "Date range with past start date must be REJECTED");
  assert(resPastStart.error === PAST_DATE_ERROR_MESSAGE, "Past start date error message matches");

  // Valid future range
  const resValid = validateDateRange(today, tomorrow);
  assert(resValid.isValid === true, "Valid range (today -> tomorrow) must be ACCEPTED");
}

// -----------------------------------------------------------------------------
// Scenario 5: Shift Requests Duplicate Prevention (Pending & Approved)
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 2: Rule 2 & 3 Shift Swap / Change Prevention ---');
{
  const existingShiftRequests = [
    {
      id: 'SR-001',
      employeeId: 'VRM-016',
      requestedDate: today,
      status: 'Pending',
      requestedShift: 'Morning 2'
    },
    {
      id: 'SR-002',
      employeeId: 'VRM-017',
      requestedDate: tomorrow,
      status: 'Approved',
      requestedShift: 'Night Shift'
    },
    {
      id: 'SR-003',
      employeeId: 'VRM-018',
      requestedDate: tomorrow,
      status: 'Cancelled',
      requestedShift: 'Morning 1'
    }
  ];

  // First valid request for new employee
  const resFirst = checkDuplicateShiftRequest(existingShiftRequests, 'VRM-099', today);
  assert(resFirst.hasDuplicate === false, "First valid request for new employee must be ACCEPTED");

  // Duplicate pending request for VRM-016 on today
  const resDupPending = checkDuplicateShiftRequest(existingShiftRequests, 'VRM-016', today);
  assert(resDupPending.hasDuplicate === true, "Duplicate pending shift request must be REJECTED");
  assert(resDupPending.error === DUPLICATE_REQUEST_ERROR_MESSAGE, `Error message must match: "${DUPLICATE_REQUEST_ERROR_MESSAGE}"`);

  // Duplicate approved request for VRM-017 on tomorrow
  const resDupApproved = checkDuplicateShiftRequest(existingShiftRequests, 'VRM-017', tomorrow);
  assert(resDupApproved.hasDuplicate === true, "Duplicate approved shift request must be REJECTED");

  // Cancelled request allows resubmission
  const resCancelled = checkDuplicateShiftRequest(existingShiftRequests, 'VRM-018', tomorrow);
  assert(resCancelled.hasDuplicate === false, "Resubmission for cancelled request must be ALLOWED");

  // Different employee, same date
  const resDiffEmp = checkDuplicateShiftRequest(existingShiftRequests, 'VRM-020', today);
  assert(resDiffEmp.hasDuplicate === false, "Different employee on same date must be ALLOWED");
}

// -----------------------------------------------------------------------------
// Scenario 6: Leave Requests Duplicate & Overlapping Prevention
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 3: Leave Range & Overlap Prevention ---');
{
  const existingLeaves = [
    {
      id: 'LR-001',
      employeeId: 'VRM-016',
      startDate: today,
      endDate: tomorrow,
      status: 'Pending'
    },
    {
      id: 'LR-002',
      employeeId: 'VRM-019',
      startDate: today,
      endDate: today,
      status: 'Rejected'
    }
  ];

  // Exact duplicate pending leave
  const resExact = checkDuplicateLeaveRequest(existingLeaves, 'VRM-016', today, tomorrow);
  assert(resExact.hasDuplicate === true, "Exact duplicate pending leave must be REJECTED");

  // Overlapping leave (e.g., today only, within today-tomorrow)
  const resOverlap = checkDuplicateLeaveRequest(existingLeaves, 'VRM-016', today, today);
  assert(resOverlap.hasDuplicate === true, "Overlapping leave (subset of existing range) must be REJECTED");

  // Resubmission after rejection
  const resRejected = checkDuplicateLeaveRequest(existingLeaves, 'VRM-019', today, today);
  assert(resRejected.hasDuplicate === false, "Resubmission after rejection must be ALLOWED");

  // Non-overlapping leave for same employee (future date)
  const afterTomorrowDate = new Date(tomorrowDate);
  afterTomorrowDate.setUTCDate(afterTomorrowDate.getUTCDate() + 2);
  const futureDate = afterTomorrowDate.toISOString().split('T')[0];
  const resNonOverlap = checkDuplicateLeaveRequest(existingLeaves, 'VRM-016', futureDate, futureDate);
  assert(resNonOverlap.hasDuplicate === false, "Non-overlapping future leave must be ALLOWED");
}

// -----------------------------------------------------------------------------
// Scenario 7: Multi-click & Concurrency Deduplication Simulation
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 4: Rapid Multi-click & Concurrency Deduplication ---');
{
  // Simulate 10 rapid clicks from user interface
  const store = [];
  let acceptedCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < 10; i++) {
    const check = checkDuplicateShiftRequest(store, 'VRM-016', tomorrow);
    if (!check.hasDuplicate) {
      store.push({
        id: `SR-${Date.now()}-${i}`,
        employeeId: 'VRM-016',
        requestedDate: tomorrow,
        status: 'Pending'
      });
      acceptedCount++;
    } else {
      rejectedCount++;
    }
  }

  assert(acceptedCount === 1, "Rapid clicks: Exactly ONE record created");
  assert(rejectedCount === 9, "Rapid clicks: Subsequent 9 clicks rejected as duplicates");
  assert(store.length === 1, "Storage contains exactly 1 active record");
}

// -----------------------------------------------------------------------------
// Scenario 8: Cross-Midnight Asia/Kolkata Validation
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 5: Timezone & Cross-Midnight Invariance ---');
{
  // Test when UTC is 19:00 (previous day in UTC), Asia/Kolkata is 00:30 (next day in IST)
  // Example: 2026-10-19 19:00:00 UTC = 2026-10-20 00:30:00 IST (+05:30)
  const crossMidnightUtc = new Date('2026-10-19T19:00:00Z');
  const kolkataDate = getKolkataDateString(crossMidnightUtc);
  assert(kolkataDate === '2026-10-20', "Cross-midnight: 19:00 UTC resolves correctly to next day (2026-10-20) in Asia/Kolkata");

  // Verify that an Indian user submitting on 2026-10-20 00:15 IST does NOT get rejected as a past date
  const isPast = kolkataDate < '2026-10-20';
  assert(!isPast, "Cross-midnight: Today's date in IST is not treated as past");
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n' + '='.repeat(70));
console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL VALIDATION & CONCURRENCY TESTS PASSED PERFECTLY!\n');
}
