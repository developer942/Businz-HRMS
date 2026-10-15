// VRM Enterprise HRMS - Attendance & Overtime Calculation Engine
// Strictly computes worked hours, break deductions, potential/approved OT, late/early flags, salary impact & monthly summaries

import { AttendanceRecord, Employee } from '../types/hrms';
import {
  ShiftModel,
  OvertimePolicy,
  DepartmentOtPolicy,
  EmployeeOtPolicy,
  AttendancePolicyConfig,
  SalaryImpactSummary,
  MonthlyAttendanceSummary
} from '../types/attendanceEnterprise';

/**
 * Parses time string (e.g. "09:00 AM", "07:15 PM", "09:30", "18:45") into total minutes from midnight.
 */
export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  let clean = timeStr.trim();
  if (!clean || clean === '--:--' || clean === '-' || clean === 'N/A' || clean === '—') return null;

  // Normalize potential typing mistakes like 10;30 AM or 10.00 AM
  clean = clean.replace(/^(\d{1,2})[;.](\d{2})/, '$1:$2');

  // Handle full ISO datetime string (e.g. 2026-10-06T12:48:30.277+00:00)
  if (clean.includes('T') || clean.includes('Z') || (clean.includes('-') && clean.includes(':'))) {
    let parsed: Date;
    if (clean.endsWith('Z') || clean.includes('+') || /-[0-9]{2}:?[0-9]{2}$/.test(clean)) {
      parsed = new Date(clean);
    } else {
      parsed = new Date(clean.includes('T') ? (clean.endsWith('Z') ? clean : clean + 'Z') : clean.replace(/\s+/, 'T') + 'Z');
    }
    if (!isNaN(parsed.getTime())) {
      const istStr = parsed.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = istStr.split(':').map(Number);
      let h = parts[0];
      if (h === 24) h = 0;
      return h * 60 + parts[1];
    }
  }

  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridian = match[3]?.toUpperCase();

  if (meridian) {
    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
  }

  return hours * 60 + minutes;
}

/**
 * Formats decimal hours (e.g. 10.08) into standard enterprise display: "10h 05m"
 */
export function formatHoursAndMinutes(hoursVal: number): string {
  if (!hoursVal || isNaN(hoursVal) || hoursVal <= 0) return '0h 00m';
  const totalMinutes = Math.round(hoursVal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Resolves an employee's Overtime Eligibility taking into account:
 * 1. Individual Exception ('Follow Department Policy' | 'Allow OT' | 'Block OT')
 * 2. Department-level policy
 */
export function resolveEmployeeOtEligibility(
  employeeId: string,
  department: string,
  deptPolicies: DepartmentOtPolicy[],
  empPolicies: EmployeeOtPolicy[]
): {
  isEligible: boolean;
  reason: string;
  maxDailyOt: number;
  maxMonthlyOt: number;
  source: 'Individual Exception' | 'Department Policy' | 'Default';
} {
  const empPolicy = empPolicies.find(p => p.employeeId === employeeId);
  const deptPolicy = deptPolicies.find(p => p.department.toLowerCase() === department.toLowerCase());
  const normalizeOtAllowed = (value: unknown, fallback = true): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['no', 'false', '0', 'off', 'disabled'].includes(normalized)) return false;
      if (['yes', 'true', '1', 'on', 'enabled'].includes(normalized)) return true;
    }
    return fallback;
  };

  // 1. Check explicit Individual Exception first
  if (empPolicy) {
    if (empPolicy.individualException === 'Block OT') {
      return {
        isEligible: false,
        reason: 'Overtime blocked by Individual Employee Exception',
        maxDailyOt: 0,
        maxMonthlyOt: 0,
        source: 'Individual Exception'
      };
    }
    if (empPolicy.individualException === 'Allow OT') {
      return {
        isEligible: true,
        reason: 'Overtime granted by Individual Employee Exception',
        maxDailyOt: empPolicy.maxOtDaily || 4,
        maxMonthlyOt: empPolicy.maxOtMonthly || 60,
        source: 'Individual Exception'
      };
    }
  }

  // 2. Follow Department Policy
  if (deptPolicy) {
    if (!normalizeOtAllowed((deptPolicy as any).otAllowed, true)) {
      return {
        isEligible: false,
        reason: `Department (${department}) is not eligible for Overtime`,
        maxDailyOt: 0,
        maxMonthlyOt: 0,
        source: 'Department Policy'
      };
    }
    return {
      isEligible: true,
      reason: `Eligible under ${department} Department OT Policy`,
      maxDailyOt: deptPolicy.maxOtHoursDaily || 4,
      maxMonthlyOt: deptPolicy.maxOtHoursMonthly || 60,
      source: 'Department Policy'
    };
  }

  // 3. Fallback default
  return {
    isEligible: true,
    reason: 'Standard Company Policy',
    maxDailyOt: 4,
    maxMonthlyOt: 60,
    source: 'Default'
  };
}

export interface AttendanceCalculationResult {
  grossMinutes: number;
  breakMinutes: number;
  netWorkedMinutes: number;
  workedHours: number;
  regularHours: number;
  potentialOtHours: number;
  lateMinutes: number;
  earlyCheckoutMinutes: number;
  status: AttendanceRecord['status'];
  lateStatus: 'On Time' | 'Late (<30m)' | 'Severely Late' | 'N/A';
}

/**
 * Computes exact working hours, shift comparisons, and potential OT.
 */
export function calculateAttendanceHoursAndStatus(params: {
  checkIn?: string | null;
  checkOut?: string | null;
  shift: ShiftModel;
  otPolicy?: OvertimePolicy;
  attendancePolicy?: AttendancePolicyConfig;
  isOtEligible: boolean;
  manualStatusOverride?: AttendanceRecord['status'];
}): AttendanceCalculationResult {
  const {
    checkIn,
    checkOut,
    shift,
    otPolicy,
    attendancePolicy,
    isOtEligible,
    manualStatusOverride
  } = params;

  const inMins = parseTimeToMinutes(checkIn);
  const outMins = parseTimeToMinutes(checkOut);
  const shiftStartMins = parseTimeToMinutes(shift.startTime) ?? 9 * 60; // 09:00 AM
  const shiftEndMins = parseTimeToMinutes(shift.endTime) ?? 18 * 60;    // 06:00 PM

  const graceMins = shift.gracePeriodMinutes ?? attendancePolicy?.gracePeriodMinutes ?? 10;
  const breakMins = shift.breakDurationMinutes ?? 60;
  const reqHours = shift.requiredWorkingHours ?? 9.0;
  const halfDayThreshold = attendancePolicy?.minWorkingHoursHalfDay ?? 4.5;

  // Case 1: Missing both punches
  if (inMins === null && outMins === null) {
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Absent',
      lateStatus: 'N/A'
    };
  }

  // Case 2: Only Check-In present
  if (inMins !== null && outMins === null) {
    const lateMins = Math.max(0, inMins - (shiftStartMins + graceMins));
    const lateStatus = lateMins === 0 ? 'On Time' : lateMins <= 30 ? 'Late (<30m)' : 'Severely Late';
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: inMins > shiftStartMins ? inMins - shiftStartMins : 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Missing Punch',
      lateStatus
    };
  }

  // Case 3: Only Check-Out present
  if (inMins === null && outMins !== null) {
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Missing Punch',
      lateStatus: 'N/A'
    };
  }

  // Case 4: Both Check-In and Check-Out present
  let grossMins = (outMins! >= inMins!) ? (outMins! - inMins!) : (outMins! + 24 * 60 - inMins!);
  
  // Deduct break only if worked duration exceeds standard half-shift
  const applicableBreakMins = grossMins > (breakMins + 120) ? breakMins : 0;
  const netMins = Math.max(0, grossMins - applicableBreakMins);
  const workedHours = Math.round((netMins / 60) * 100) / 100;

  // Late calculation
  const lateMinutes = inMins! > (shiftStartMins + graceMins) ? (inMins! - shiftStartMins) : 0;
  let lateStatus: AttendanceCalculationResult['lateStatus'] = 'On Time';
  if (lateMinutes > 0) {
    lateStatus = (inMins! - shiftStartMins) <= 30 ? 'Late (<30m)' : 'Severely Late';
  }

  // Early checkout calculation
  const earlyThreshold = shift.earlyCheckoutThresholdMinutes ?? 10;
  const earlyCheckoutMinutes = (outMins! < (shiftEndMins - earlyThreshold))
    ? (shiftEndMins - outMins!)
    : 0;

  // Potential OT calculation
  let potentialOtHours = 0;
  if (isOtEligible && otPolicy?.enabled !== false) {
    // OT Hours = Actual Eligible Working Hours - Required Working Hours
    const rawOtHours = Math.max(0, workedHours - reqHours);
    const minOtDurationMins = otPolicy?.minimumOtDurationMinutes ?? 30;
    const minOtHours = minOtDurationMins / 60;

    if (rawOtHours >= minOtHours) {
      const maxDaily = otPolicy?.maximumDailyOtHours ?? 4;
      potentialOtHours = Math.min(rawOtHours, maxDaily);
      potentialOtHours = Math.round(potentialOtHours * 100) / 100;
    }
  }

  const regularHours = Math.min(workedHours, reqHours);

  // Status determination
  let status: AttendanceRecord['status'] = manualStatusOverride || 'Present';
  if (!manualStatusOverride || manualStatusOverride === 'Present' || manualStatusOverride === 'Late') {
    if (workedHours < halfDayThreshold && workedHours > 0) {
      status = 'Half Day';
    } else if (lateMinutes > 0) {
      status = 'Late';
    } else {
      status = 'Present';
    }
  }

  return {
    grossMinutes: grossMins,
    breakMinutes: applicableBreakMins,
    netWorkedMinutes: netMins,
    workedHours,
    regularHours,
    potentialOtHours,
    lateMinutes,
    earlyCheckoutMinutes,
    status,
    lateStatus
  };
}

/**
 * Computes OT Salary Rate & Payout according to configured OT Salary Policy
 */
export function calculateOtSalaryAmount(params: {
  otHours: number;
  dailySalary: number;
  standardWorkingHours: number;
  otPolicy: OvertimePolicy;
  dayType?: 'Regular' | 'Weekend' | 'Holiday';
}): { hourlyRate: number; multiplier: number; otAmount: number } {
  const {
    otHours,
    dailySalary,
    standardWorkingHours,
    otPolicy,
    dayType = 'Regular'
  } = params;

  if (otHours <= 0) {
    return { hourlyRate: 0, multiplier: 1, otAmount: 0 };
  }

  const reqHours = standardWorkingHours > 0 ? standardWorkingHours : 9.0;
  let baseHourlyRate = 0;

  switch (otPolicy.rateMethod) {
    case 'Fixed Amount Per Hour':
      baseHourlyRate = otPolicy.fixedRatePerHour || 100;
      break;

    case 'Daily Salary Based':
      // Daily Salary ÷ Standard Working Hours = Hourly Rate
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
      break;

    case 'Hourly Salary Based':
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
      break;

    case 'Basic Salary Based':
      // Basic / 26 / Standard Working Hours
      baseHourlyRate = Math.round(((dailySalary * 26) / 26 / reqHours) * 100) / 100;
      break;

    case 'Percentage Based':
      const standardRate = dailySalary / reqHours;
      baseHourlyRate = Math.round((standardRate * ((otPolicy.fixedRatePerHour || 100) / 100)) * 100) / 100;
      break;

    default:
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
  }

  // Multipliers from Policy
  let multiplier = otPolicy.regularMultiplier || 1.0;
  if (dayType === 'Weekend') multiplier = otPolicy.weekendMultiplier || 1.5;
  if (dayType === 'Holiday') multiplier = otPolicy.holidayMultiplier || 2.0;

  const otAmount = Math.round(baseHourlyRate * otHours * multiplier * 100) / 100;

  return {
    hourlyRate: baseHourlyRate,
    multiplier,
    otAmount
  };
}

/**
 * Computes Attendance + Salary Impact Summary for single attendance record
 */
export function calculateAttendanceSalaryImpact(params: {
  employee?: Employee;
  record: AttendanceRecord;
  shift: ShiftModel;
  attendancePolicy: AttendancePolicyConfig;
  otPolicy: OvertimePolicy;
  dayType?: 'Regular' | 'Weekend' | 'Holiday';
}): SalaryImpactSummary {
  const {
    employee,
    record,
    shift,
    attendancePolicy,
    otPolicy,
    dayType = 'Regular'
  } = params;

  const basicSalary = employee?.basicSalary || 26000;
  const workingDaysPerMonth = 26;
  const dailySalary = Math.round((basicSalary / workingDaysPerMonth) * 100) / 100;
  const standardHours = shift.requiredWorkingHours || 9.0;
  const hourlyRate = Math.round((dailySalary / standardHours) * 100) / 100;

  const regularWorkHours = record.workingHours || 0;
  const approvedOt = record.approvedOtHours || 0;

  // 1. OT Earnings
  const { otAmount } = calculateOtSalaryAmount({
    otHours: approvedOt,
    dailySalary,
    standardWorkingHours: standardHours,
    otPolicy,
    dayType
  });

  // 2. Half-Day Deduction
  let halfDayDeduction = 0;
  if (record.status === 'Half Day') {
    if (attendancePolicy.halfDayDeductionType === 'Half Day Salary Deduction') {
      halfDayDeduction = Math.round(dailySalary * 0.5 * 100) / 100;
    } else if (attendancePolicy.halfDayDeductionType === 'Percentage Deduction') {
      const pct = (attendancePolicy.halfDayDeductionValue || 50) / 100;
      halfDayDeduction = Math.round(dailySalary * pct * 100) / 100;
    } else if (attendancePolicy.halfDayDeductionType === 'Fixed Deduction') {
      halfDayDeduction = attendancePolicy.halfDayDeductionValue || 450;
    }
  }

  // 3. Absent Deduction
  let absentDeduction = 0;
  if (record.status === 'Absent') {
    if (attendancePolicy.absentDeductionType === 'Full Day Salary') {
      absentDeduction = dailySalary;
    } else if (attendancePolicy.absentDeductionType === 'Percentage') {
      absentDeduction = Math.round(dailySalary * ((attendancePolicy.absentDeductionValue || 100) / 100) * 100) / 100;
    } else if (attendancePolicy.absentDeductionType === 'Fixed Amount') {
      absentDeduction = attendancePolicy.absentDeductionValue || dailySalary;
    }
  }

  // 4. Late Deduction
  let lateDeduction = 0;
  if (record.lateDurationMinutes && record.lateDurationMinutes > 0) {
    if (attendancePolicy.lateAction === 'Salary Deduction') {
      if (attendancePolicy.lateDeductionType === 'Per Minute') {
        lateDeduction = record.lateDurationMinutes * (attendancePolicy.lateDeductionValue || 5);
      } else if (attendancePolicy.lateDeductionType === 'Fixed Amount') {
        lateDeduction = attendancePolicy.lateDeductionValue || 100;
      } else if (attendancePolicy.lateDeductionType === 'Percentage') {
        lateDeduction = Math.round(dailySalary * ((attendancePolicy.lateDeductionValue || 5) / 100) * 100) / 100;
      }
    }
  }

  // 5. Early Checkout Deduction
  let earlyCheckoutDeduction = 0;
  if (record.earlyCheckoutMinutes && record.earlyCheckoutMinutes > 0) {
    if (attendancePolicy.earlyCheckoutAction === 'Deduct Salary') {
      if (attendancePolicy.earlyCheckoutDeductionType === 'Per Minute') {
        earlyCheckoutDeduction = record.earlyCheckoutMinutes * (attendancePolicy.earlyCheckoutDeductionValue || 5);
      } else if (attendancePolicy.earlyCheckoutDeductionType === 'Fixed Amount') {
        earlyCheckoutDeduction = attendancePolicy.earlyCheckoutDeductionValue || 100;
      }
    }
  }

  const netAdjustment = Math.round((otAmount - halfDayDeduction - absentDeduction - lateDeduction - earlyCheckoutDeduction) * 100) / 100;

  return {
    dailySalary,
    standardWorkingHours: standardHours,
    hourlyRate,
    regularWorkHours,
    otHours: approvedOt,
    otAmount,
    halfDayDeduction,
    lateDeduction,
    absentDeduction,
    earlyCheckoutDeduction,
    netAdjustment
  };
}

/**
 * Computes Monthly Attendance Summary for an Employee
 */
export function aggregateMonthlyAttendanceSummary(
  employeeId: string,
  records: AttendanceRecord[],
  shift: ShiftModel,
  attendancePolicy: AttendancePolicyConfig,
  otPolicy: OvertimePolicy,
  employee?: Employee
): MonthlyAttendanceSummary {
  const empRecords = records.filter(r => r.employeeId === employeeId);

  let presentDays = 0;
  let absentDays = 0;
  let halfDays = 0;
  let leaveDays = 0;
  let weeklyOffDays = 0;
  let holidayDays = 0;
  let lateDays = 0;
  let earlyCheckoutDays = 0;
  let missingAttendanceDays = 0;
  let approvedOtHours = 0;
  let pendingOtHours = 0;
  let rejectedOtHours = 0;
  let totalOtAmount = 0;
  let totalDeductionAmount = 0;

  const basicSalary = employee?.basicSalary || 26000;
  const dailySalary = Math.round((basicSalary / 26) * 100) / 100;
  const standardHours = shift.requiredWorkingHours || 9.0;

  empRecords.forEach(rec => {
    switch (rec.status) {
      case 'Present':
        presentDays++;
        break;
      case 'Absent':
        absentDays++;
        break;
      case 'Half Day':
        halfDays++;
        break;
      case 'On Leave':
        leaveDays++;
        break;
      case 'Week Off':
        weeklyOffDays++;
        break;
      case 'Holiday':
        holidayDays++;
        break;
      case 'Missing Punch':
        missingAttendanceDays++;
        break;
      default:
        if (rec.checkIn && rec.checkOut) presentDays++;
    }

    if (rec.lateStatus && rec.lateStatus !== 'On Time' && rec.lateStatus !== 'N/A') {
      lateDays++;
    }

    if (rec.earlyCheckoutMinutes && rec.earlyCheckoutMinutes > 0) {
      earlyCheckoutDays++;
    }

    if (rec.approvedOtHours && rec.approvedOtHours > 0) {
      approvedOtHours += rec.approvedOtHours;
      const { otAmount } = calculateOtSalaryAmount({
        otHours: rec.approvedOtHours,
        dailySalary,
        standardWorkingHours: standardHours,
        otPolicy
      });
      totalOtAmount += otAmount;
    }

    if (rec.otStatus === 'Pending' && rec.calculatedOtHours) {
      pendingOtHours += rec.calculatedOtHours;
    }

    if (rec.otStatus === 'Rejected' && rec.calculatedOtHours) {
      rejectedOtHours += rec.calculatedOtHours;
    }

    // Accumulate deductions
    const impact = calculateAttendanceSalaryImpact({
      employee,
      record: rec,
      shift,
      attendancePolicy,
      otPolicy
    });
    totalDeductionAmount += (impact.halfDayDeduction + impact.absentDeduction + impact.lateDeduction + impact.earlyCheckoutDeduction);
  });

  const totalWorkingDays = empRecords.length || 26;
  const netImpact = Math.round((totalOtAmount - totalDeductionAmount) * 100) / 100;

  return {
    totalWorkingDays,
    presentDays,
    absentDays,
    halfDays,
    leaveDays,
    weeklyOffDays,
    holidayDays,
    lateDays,
    earlyCheckoutDays,
    missingAttendanceDays,
    approvedOtHours: Math.round(approvedOtHours * 100) / 100,
    pendingOtHours: Math.round(pendingOtHours * 100) / 100,
    rejectedOtHours: Math.round(rejectedOtHours * 100) / 100,
    totalOtAmount: Math.round(totalOtAmount * 100) / 100,
    totalDeductionAmount: Math.round(totalDeductionAmount * 100) / 100,
    netImpact
  };
}
