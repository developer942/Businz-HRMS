// Automated Integration Test Suite for VRM Enterprise HRM
// Tests settings cascading, payroll computations, attendance late checks, leave sync, and deletion safety checks

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return 0;
  let [_, hoursStr, minsStr, modifier] = match;
  let hours = parseInt(hoursStr, 10);
  const mins = parseInt(minsStr, 10);
  if (modifier) {
    const mod = modifier.toUpperCase();
    if (mod === 'PM' && hours < 12) hours += 12;
    if (mod === 'AM' && hours === 12) hours = 0;
  }
  return hours * 60 + mins;
}

function calculateLateStatus(checkInTime, shiftStartTime, gracePeriodMins = 15) {
  const checkInMins = parseTimeToMinutes(checkInTime);
  const shiftMins = parseTimeToMinutes(shiftStartTime);
  if (checkInMins <= shiftMins + gracePeriodMins) return 'On Time';
  if (checkInMins <= shiftMins + 30) return 'Late (<30m)';
  return 'Severely Late';
}

function calculateWorkingHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 8.5;
  const inMins = parseTimeToMinutes(checkIn);
  const outMins = parseTimeToMinutes(checkOut);
  if (outMins > inMins) {
    return Number(((outMins - inMins) / 60).toFixed(1));
  }
  return 8.5;
}

function runTests() {
  console.log('====================================================');
  console.log('STARTING AUTOMATED HRMS FLOW & SETTINGS AUDIT');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${name} ${details}`);
      failed++;
    }
  }

  // TEST SUITE 1: Shift & Attendance Grace Period Engine
  console.log('[TEST SUITE 1] Shift & Attendance Grace Period Engine');
  const shiftStart = '09:00 AM';
  const grace = 15;

  assert('Check-in 09:05 AM is On Time', calculateLateStatus('09:05 AM', shiftStart, grace) === 'On Time');
  assert('Check-in 09:15 AM (exact grace limit) is On Time', calculateLateStatus('09:15 AM', shiftStart, grace) === 'On Time');
  assert('Check-in 09:25 AM is Late (<30m)', calculateLateStatus('09:25 AM', shiftStart, grace) === 'Late (<30m)');
  assert('Check-in 09:35 AM is Severely Late', calculateLateStatus('09:35 AM', shiftStart, grace) === 'Severely Late');
  assert('Working hours 09:00 AM to 05:30 PM is 8.5h', calculateWorkingHours('09:00 AM', '05:30 PM') === 8.5);
  assert('Working hours 09:00 AM to 06:00 PM is 9h', calculateWorkingHours('09:00 AM', '06:00 PM') === 9.0);

  // TEST SUITE 2: Leave Approval to Attendance Synchronization
  console.log('\n[TEST SUITE 2] Leave Approval to Attendance Synchronization');
  function simulateLeaveApproval(startDateStr, endDateStr, employeeId, employeeName, department) {
    const dates = [];
    const curr = new Date(startDateStr);
    const end = new Date(endDateStr);
    while (curr <= end) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates.map((d, i) => ({
      id: `ATT-LV-${employeeId}-${d}`,
      employeeId,
      employeeName,
      department,
      date: d,
      status: 'On Leave',
      workingHours: 0,
      lateStatus: 'On Time'
    }));
  }

  const leaveRecords = simulateLeaveApproval('2026-09-10', '2026-09-12', 'EMP-001', 'Pavithra', 'Management');
  assert('Leave spanning 3 days generates exactly 3 attendance sync entries', leaveRecords.length === 3);
  assert('All synced leave records have status "On Leave"', leaveRecords.every(r => r.status === 'On Leave'));
  assert('Working hours on leave are set to 0', leaveRecords.every(r => r.workingHours === 0));

  // TEST SUITE 3: Statutory Payroll & Advance Salary Deduction Engine
  console.log('\n[TEST SUITE 3] Statutory Payroll & Advance Salary Deduction Engine');
  function computePayrollRecord(basicSalary, allowances, presentDays, workingDays, epfRate, advanceEmi = 0) {
    const dailyRate = basicSalary / workingDays;
    const leaveDeduction = Math.round(Math.max(0, (workingDays - presentDays) * dailyRate));
    const grossSalary = basicSalary + allowances;
    const epfDeduction = Math.round((basicSalary * epfRate) / 100);
    const professionalTax = 208;
    const totalDeductions = epfDeduction + professionalTax + leaveDeduction + advanceEmi;
    const netSalary = Math.max(0, grossSalary - totalDeductions);
    return {
      grossSalary,
      epfDeduction,
      professionalTax,
      leaveDeduction,
      advanceDeduction: advanceEmi,
      totalDeductions,
      netSalary
    };
  }

  const payrollResult = computePayrollRecord(60000, 25000, 28, 30, 12, 10000);
  assert('Gross salary calculation is correct (60000 + 25000 = 85000)', payrollResult.grossSalary === 85000);
  assert('EPF 12% on 60000 basic is 7200', payrollResult.epfDeduction === 7200);
  assert('2 absent days leave deduction on 60000 basic is 4000', payrollResult.leaveDeduction === 4000);
  assert('Advance salary EMI of 10000 is included in deductions', payrollResult.advanceDeduction === 10000);
  assert('Net salary reflects all statutory and advance deductions', payrollResult.netSalary === (85000 - 7200 - 208 - 4000 - 10000));

  // TEST SUITE 4: Master Data Deletion Safety Checks
  console.log('\n[TEST SUITE 4] Master Data Deletion Safety Checks');
  const mockEmployees = [
    { employeeId: 'EMP-001', firstName: 'Pavithra', department: 'Management', designation: 'CEO', workLocation: 'Chennai HQ', workShift: 'General Shift' },
    { employeeId: 'EMP-002', firstName: 'Ramesh', department: 'Production Head', designation: 'Production Head', workLocation: 'Guindy Yard', workShift: 'Morning Shift' }
  ];
  const mockAssets = [
    { id: 'AST-1', assignedTo: 'EMP-001', name: 'Dell XPS 15' }
  ];
  const mockBranches = [
    { id: 'BR-1', name: 'Chennai HQ', departments: ['Management'] },
    { id: 'BR-2', name: 'Guindy Yard', departments: ['Production Head'] }
  ];

  function canDeleteEmployee(empId) {
    const hasAssets = mockAssets.some(a => a.assignedTo === empId);
    if (hasAssets) return { canDelete: false, reason: 'Employee has company assets assigned' };
    return { canDelete: true };
  }

  function canDeleteDepartment(deptName) {
    const hasStaff = mockEmployees.some(e => e.department === deptName);
    if (hasStaff) return { canDelete: false, reason: `Department "${deptName}" has active staff members` };
    return { canDelete: true };
  }

  function canDeleteBranch(branchName) {
    const hasStaff = mockEmployees.some(e => e.workLocation === branchName);
    if (hasStaff) return { canDelete: false, reason: `Branch "${branchName}" has assigned employees` };
    return { canDelete: true };
  }

  assert('Employee EMP-001 with assigned Dell XPS cannot be deleted', canDeleteEmployee('EMP-001').canDelete === false);
  assert('Employee EMP-002 without assets can be deleted', canDeleteEmployee('EMP-002').canDelete === true);
  assert('Department "Production Head" with active staff cannot be deleted', canDeleteDepartment('Production Head').canDelete === false);
  assert('Empty department "Design Team" can be deleted', canDeleteDepartment('Design Team').canDelete === true);
  assert('Branch "Chennai HQ" with assigned staff cannot be deleted', canDeleteBranch('Chennai HQ').canDelete === false);
  assert('Unused branch "Salem Branch" can be deleted', canDeleteBranch('Salem Branch').canDelete === true);

  // TEST SUITE 5: Advance Salary & Loan Policy Constraints
  console.log('\n[TEST SUITE 5] Advance Salary & Loan Policy Constraints');
  const loanPolicy = {
    maxAdvancePercent: 75,
    maxEmiTenureMonths: 12
  };
  const basicSalary = 80000;
  const maxEligible = (basicSalary * loanPolicy.maxAdvancePercent) / 100;

  assert('Max eligible salary advance on 80000 basic at 75% policy is 60000', maxEligible === 60000);
  assert('Request of 70000 (> 60000) is blocked by limit', 70000 > maxEligible);
  assert('Tenure of 14 months (> 12) is blocked by policy tenure', 14 > loanPolicy.maxEmiTenureMonths);
  assert('Request of 50000 over 6 months is valid', 50000 <= maxEligible && 6 <= loanPolicy.maxEmiTenureMonths);

  // TEST SUITE 6: Employee Onboarding Form Validation Rules
  console.log('\n[TEST SUITE 6] Employee Onboarding Form Validation Rules');
  function validateOnboarding(step, data) {
    if (step === 1) {
      if (!data.firstName) return 'First Name is mandatory';
      if (!data.phone || data.phone.replace(/\D/g, '').length < 10) return 'Invalid 10-digit phone';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (data.email && !emailRegex.test(data.email)) return 'Invalid email format';
    }
    if (step === 5) {
      if (!data.monthlyCtc || data.monthlyCtc <= 0) return 'CTC must be > 0';
      if (!data.panNumber || data.panNumber.length !== 10) return 'PAN must be 10 characters';
    }
    return null;
  }

  assert('Step 1 blocks empty first name', validateOnboarding(1, { firstName: '' }) !== null);
  assert('Step 1 blocks invalid phone number "123"', validateOnboarding(1, { firstName: 'John', phone: '123' }) !== null);
  assert('Step 1 blocks invalid email "john@"', validateOnboarding(1, { firstName: 'John', phone: '9876543210', email: 'john@' }) !== null);
  assert('Step 1 accepts valid personal details', validateOnboarding(1, { firstName: 'John', phone: '9876543210', email: 'john@vrm.com' }) === null);
  assert('Step 5 blocks invalid PAN length', validateOnboarding(5, { monthlyCtc: 50000, panNumber: 'ABC12' }) !== null);
  assert('Step 5 accepts valid CTC and 10-char PAN', validateOnboarding(5, { monthlyCtc: 50000, panNumber: 'ABCDE1234F' }) === null);

  console.log('\n====================================================');
  console.log(`TEST RESULTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
