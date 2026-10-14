import { calculateSandwichLeave } from '../../frontend/src/services/sandwichLeaveEngine';
import { SandwichLeavePolicy } from '../../frontend/src/types/sandwichLeave';
import { Employee, WeeklyScheduleItem } from '../../frontend/src/types/hrms';

console.log('--- TESTING DYNAMIC WEEK OFF SANDWICH CALCULATION ---');

const mockEmployee: Employee = {
  id: 'vrm-004-uuid',
  employeeId: 'VRM-004',
  name: 'Mohamed Noorisha Bilal',
  email: 'bilal@vrm.com',
  department: 'Solar Operations',
  designation: 'Field Engineer',
  role: 'Employee',
  joinDate: '2025-01-01',
  status: 'Active'
} as any;

const policyON: SandwichLeavePolicy = {
  id: 'policy-corp-1',
  policyName: 'Standard Corporate Sandwich Policy',
  description: 'Default test policy',
  applicableLeaveTypes: ['Casual Leave', 'Casual Leave (CL)', 'Sick Leave', 'Sick Leave (SL)'],
  applicableEmployees: 'ALL',
  applicableDepartments: 'ALL',
  applicableDesignations: 'ALL',
  applicableBranches: 'ALL',
  effectiveFrom: '2026-01-01',
  status: 'Active',
  sandwichRuleEnabled: true, // ON
  countWeeklyOffAsLeave: true,
  countPublicHolidayAsLeave: true,
  sandwichCondition: 'BOTH_SIDES_MANDATORY',
  payType: 'SAME_AS_APPLIED_LEAVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 1
};

const policyOFF: SandwichLeavePolicy = {
  ...policyON,
  sandwichRuleEnabled: false, // OFF
};

// 1. Company sets Week Off as Sunday in Week Off Calendar
const sundaySchedule: WeeklyScheduleItem[] = [{
  id: 'ws-sunday',
  name: 'Sunday Off Schedule',
  workingDays: 'Mon, Tue, Wed, Thu, Fri, Sat',
  offDays: 'Sunday',
  isDefault: true
}];

console.log('\n[TEST 1] Company gives Sunday Off (15/10/2026 to 19/10/2026):');
const resSunON = calculateSandwichLeave({
  startDate: '2026-10-15',
  endDate: '2026-10-19',
  leaveType: 'Casual Leave',
  employee: mockEmployee,
  policies: [policyON],
  existingLeaves: [],
  holidays: [],
  weeklySchedules: sundaySchedule
});

console.log('ON: Working Days:', resSunON.appliedLeaveDays, 'Sandwich Days:', resSunON.sandwichDays, 'Total:', resSunON.totalDays);
if (resSunON.appliedLeaveDays === 4 && resSunON.sandwichDays === 1 && resSunON.totalDays === 5) {
  console.log('✅ PASS: Sunday correctly counted as 1 sandwich day! Total = 5');
} else {
  console.error('❌ FAIL', resSunON);
  process.exit(1);
}

const resSunOFF = calculateSandwichLeave({
  startDate: '2026-10-15',
  endDate: '2026-10-19',
  leaveType: 'Casual Leave',
  employee: mockEmployee,
  policies: [policyOFF],
  existingLeaves: [],
  holidays: [],
  weeklySchedules: sundaySchedule
});
console.log('OFF: Working Days:', resSunOFF.appliedLeaveDays, 'Sandwich Days:', resSunOFF.sandwichDays, 'Total:', resSunOFF.totalDays);
if (resSunOFF.appliedLeaveDays === 4 && resSunOFF.sandwichDays === 0 && resSunOFF.totalDays === 4) {
  console.log('✅ PASS: When OFF, Sunday is NOT counted as sandwich! Total = 4');
} else {
  console.error('❌ FAIL', resSunOFF);
  process.exit(1);
}

// 2. Company gives Friday Off in Week Off Calendar (e.g. Middle East company roster)
const fridaySchedule: WeeklyScheduleItem[] = [{
  id: 'ws-friday',
  name: 'Friday Off Schedule',
  workingDays: 'Sat, Sun, Mon, Tue, Wed, Thu',
  offDays: 'Friday',
  isDefault: true
}];

console.log('\n[TEST 2] Company gives Friday Off (15/10/2026 Thu to 19/10/2026 Mon):');
const resFriON = calculateSandwichLeave({
  startDate: '2026-10-15',
  endDate: '2026-10-19',
  leaveType: 'Casual Leave',
  employee: mockEmployee,
  policies: [policyON],
  existingLeaves: [],
  holidays: [],
  weeklySchedules: fridaySchedule
});
console.log('ON: Working Days:', resFriON.appliedLeaveDays, 'Sandwich Days:', resFriON.sandwichDays, 'Total:', resFriON.totalDays);
resFriON.breakdown.forEach(b => console.log(`  ${b.date} (${b.dayOfWeek}): type=${b.dayType}, isSandwich=${b.isSandwich}, reason=${b.reason}`));
if (resFriON.appliedLeaveDays === 4 && resFriON.sandwichDays === 1 && resFriON.totalDays === 5) {
  console.log('✅ PASS: Friday (16/10) correctly converted to Sandwich Leave!');
} else {
  console.error('❌ FAIL', resFriON);
  process.exit(1);
}

// 3. Company gives Saturday AND Sunday Off (5-day work week)
const weekendSchedule: WeeklyScheduleItem[] = [{
  id: 'ws-sat-sun',
  name: 'Saturday & Sunday Off Schedule',
  workingDays: 'Mon, Tue, Wed, Thu, Fri',
  offDays: 'Saturday, Sunday',
  isDefault: true
}];

console.log('\n[TEST 3] Company gives Saturday & Sunday Off (15/10/2026 Thu to 19/10/2026 Mon):');
const resWeekendON = calculateSandwichLeave({
  startDate: '2026-10-15',
  endDate: '2026-10-19',
  leaveType: 'Casual Leave',
  employee: mockEmployee,
  policies: [policyON],
  existingLeaves: [],
  holidays: [],
  weeklySchedules: weekendSchedule
});
console.log('ON: Working Days:', resWeekendON.appliedLeaveDays, 'Sandwich Days:', resWeekendON.sandwichDays, 'Total:', resWeekendON.totalDays);
if (resWeekendON.appliedLeaveDays === 3 && resWeekendON.sandwichDays === 2 && resWeekendON.totalDays === 5) {
  console.log('✅ PASS: Both Saturday and Sunday counted as sandwich days (3 working + 2 sandwich = 5 total)!');
} else {
  console.error('❌ FAIL', resWeekendON);
  process.exit(1);
}

const resWeekendOFF = calculateSandwichLeave({
  startDate: '2026-10-15',
  endDate: '2026-10-19',
  leaveType: 'Casual Leave',
  employee: mockEmployee,
  policies: [policyOFF],
  existingLeaves: [],
  holidays: [],
  weeklySchedules: weekendSchedule
});
console.log('OFF: Working Days:', resWeekendOFF.appliedLeaveDays, 'Sandwich Days:', resWeekendOFF.sandwichDays, 'Total:', resWeekendOFF.totalDays);
if (resWeekendOFF.appliedLeaveDays === 3 && resWeekendOFF.sandwichDays === 0 && resWeekendOFF.totalDays === 3) {
  console.log('✅ PASS: When OFF, weekends are NOT sandwich days (Working = 3, Total = 3)!');
} else {
  console.error('❌ FAIL', resWeekendOFF);
  process.exit(1);
}

console.log('\n🎉 ALL DYNAMIC WEEK OFF TESTS PASSED PERFECTLY! 🎉');
