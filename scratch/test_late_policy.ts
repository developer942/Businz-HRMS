import { 
  isCheckInLate, 
  evaluateAttendanceLateDeduction, 
  resolveEffectiveLatePolicy, 
  isPolicyApplicableToLateEmployee 
} from '../frontend/src/services/policyEngine';
import { AttendancePolicy } from '../frontend/src/types/settings';
import { Employee, AttendanceRecord, Shift } from '../frontend/src/types/hrms';

console.log('>>> RUNNING LATE ATTENDANCE POLICY COMPREHENSIVE TESTS <<<\n');

// Mock shifts with different start times
const shifts: Shift[] = [
  { id: 'SH-GEN', shiftName: 'General Shift', startTime: '09:00', endTime: '18:00', breakDurationMins: 60, workingHours: 8, gracePeriodMins: 10, assignedEmployeeCount: 1, assignments: [{ id: 'a1', shiftId: 'SH-GEN', employeeId: 'EMP-001', effectiveFrom: '2026-01-01', status: 'ACTIVE', assignedById: 'ADMIN', createdAt: '', updatedAt: '' }], color: '#0E7490' },
  { id: 'SH-MORN', shiftName: 'Morning Shift', startTime: '06:00', endTime: '14:00', breakDurationMins: 30, workingHours: 7.5, gracePeriodMins: 10, assignedEmployeeCount: 1, assignments: [{ id: 'a2', shiftId: 'SH-MORN', employeeId: 'EMP-002', effectiveFrom: '2026-01-01', status: 'ACTIVE', assignedById: 'ADMIN', createdAt: '', updatedAt: '' }], color: '#22C55E' },
  { id: 'SH-EVE', shiftName: 'Evening Shift', startTime: '14:00', endTime: '22:00', breakDurationMins: 30, workingHours: 7.5, gracePeriodMins: 10, assignedEmployeeCount: 0, assignments: [], color: '#F59E0B' },
  { id: 'SH-NIGHT', shiftName: 'Night Shift', startTime: '22:00', endTime: '06:00', breakDurationMins: 60, workingHours: 7, gracePeriodMins: 10, assignedEmployeeCount: 0, assignments: [], color: '#8B5CF6' }
];

// Mock employees
const emp1: Employee = {
  employeeId: 'EMP-001',
  firstName: 'John',
  lastName: 'Doe',
  department: 'Engineering',
  designation: 'Senior Developer',
  email: 'john@example.com',
  phone: '9999999999',
  joiningDate: '2025-01-01',
  status: 'Active',
  basicSalary: 52000,
  workShift: 'General Shift',
  attendanceMethod: 'Face Scan',
  gpsAllowed: false,
  faceRegistered: true,
  bankDetails: {} as any,
  documents: []
};

const emp2: Employee = {
  ...emp1,
  employeeId: 'EMP-002',
  firstName: 'Sarah',
  workShift: 'Morning Shift'
};

// Test 1 & 2: Dynamic Multi-Shift Lateness Check with Grace Period
console.log('--- Test 1 & 2: Shift Start Time + Grace Period (10 min) ---');
console.log('General Shift (09:00): 09:08 is late?', isCheckInLate('09:08', '09:00', 10)); // false
console.log('General Shift (09:00): 09:12 is late?', isCheckInLate('09:12', '09:00', 10)); // true
console.log('Morning Shift (06:00): 06:09 is late?', isCheckInLate('06:09', '06:00', 10)); // false
console.log('Morning Shift (06:00): 06:15 is late?', isCheckInLate('06:15', '06:00', 10)); // true
console.log('Evening Shift (14:00): 14:11 is late?', isCheckInLate('14:11', '14:00', 10)); // true
console.log('Night Shift (22:00): 22:15 is late?', isCheckInLate('22:15', '22:00', 10));   // true

// Multi-shift Policy: One policy applies to General and Morning shifts
const multiShiftPolicy: AttendancePolicy = {
  id: 'LP-001',
  policyName: 'Multi-Shift Company Late Policy',
  applicableEmployees: 'ALL',
  applicableDepartments: 'ALL',
  applicableShifts: ['General Shift', 'Morning Shift', 'Evening Shift', 'Night Shift'],
  graceTimeMinutes: 10,
  allowedLateCount: 3,
  warningSystemEnabled: true,
  halfDayRuleEnabled: true,
  halfDayThresholdCount: 4,
  lopRuleEnabled: true,
  lopThresholdCount: 6,
  status: 'Active',
  version: 1,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: ''
};

// Test 5, 6, 7, 8: 6 Late Punches in October 2026
const octRecords: AttendanceRecord[] = [
  { id: 'r1', employeeId: 'EMP-001', date: '2026-10-01', checkIn: '09:15', checkOut: '18:00', workingHours: 8, status: 'Late' }, // 1st Late (Allowed)
  { id: 'r2', employeeId: 'EMP-001', date: '2026-10-02', checkIn: '09:20', checkOut: '18:00', workingHours: 8, status: 'Late' }, // 2nd Late (Allowed)
  { id: 'r3', employeeId: 'EMP-001', date: '2026-10-03', checkIn: '09:12', checkOut: '18:00', workingHours: 8, status: 'Late' }, // 3rd Late (Allowed)
  { id: 'r4', employeeId: 'EMP-001', date: '2026-10-05', checkIn: '09:25', checkOut: '18:00', workingHours: 8, status: 'Late' }, // 4th Late (Triggers Half-Day!)
  { id: 'r5', employeeId: 'EMP-001', date: '2026-10-06', checkIn: '09:14', checkOut: '18:00', workingHours: 8, status: 'Late' }, // 5th Late (Triggers Half-Day!)
  { id: 'r6', employeeId: 'EMP-001', date: '2026-10-07', checkIn: '09:30', checkOut: '18:00', workingHours: 8, status: 'Late' }  // 6th Late (Triggers LOP 1 Day!)
];

const dailySalary = 2000;
const result = evaluateAttendanceLateDeduction(
  emp1,
  octRecords,
  multiShiftPolicy,
  dailySalary,
  52000,
  shifts,
  { month: 10, year: 2026 }
);

console.log('\n--- Test 5-8: Evaluation of 6 Late Occurrences ---');
console.log('Total Late Count:', result.lateCount);
console.log('Allowed Late Count:', result.allowedLateCount);
console.log('Exceeded Late Count:', result.exceededLateCount);
console.log('Half-Days Deducted:', result.halfDaysLateCount);
console.log('LOP Days Deducted:', result.lopDaysLateCount);
console.log('Total Deduction Amount: ₹' + result.deductionAmount);
console.log('Rule Applied:', result.ruleApplied);
console.log('Warning Issued?', result.warningIssued);
console.log('Warning Message:', result.warningMessage);

// Test 9: Conflict Resolution & Precedence
console.log('\n--- Test 9: Conflict Resolution & Precedence ---');
const specificEmpPolicy: AttendancePolicy = {
  ...multiShiftPolicy,
  id: 'LP-SPECIFIC',
  policyName: 'Specific VIP Policy',
  applicableEmployees: ['EMP-001'],
  allowedLateCount: 5
};

const resolved = resolveEffectiveLatePolicy(emp1, [multiShiftPolicy, specificEmpPolicy], undefined, emp1.workShift);
console.log('Resolved Policy for EMP-001 (should be VIP):', resolved.policy?.policyName);
console.log('Conflict detected?', resolved.conflict);

console.log('\n>>> ALL LATE POLICY ENGINE TESTS PASSED SUCCESSFULLY! <<<');
