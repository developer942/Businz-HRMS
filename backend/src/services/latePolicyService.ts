import { PoolClient } from 'pg';
import { query } from '../config/database.js';
import { ShiftRecord } from '../types/hrms.js';

export interface ConfiguredLatePolicy {
  id: string;
  policyName: string;
  applicableDepartments: 'ALL' | string[];
  applicableDesignations: 'ALL' | string[];
  applicableShifts: 'ALL' | string[];
  applicableEmployees: 'ALL' | string[];
  graceTimeMinutes: number;
  allowedLateCount: number;
  warningSystemEnabled: boolean;
  halfDayRuleEnabled: boolean;
  halfDayThresholdCount: number;
  lopRuleEnabled: boolean;
  lopThresholdCount: number;
  status: 'Active' | 'Inactive' | 'Archived';
}

export interface EmployeePolicyContext {
  id?: string;
  employeeId: string;
  department?: string;
  designation?: string;
  workShift?: string;
}

export interface LateEvaluationOutcome {
  isLate: boolean;
  isWithinGrace: boolean;
  gracePeriodMins: number;
  lateDurationMinutes: number;
  status: 'Present' | 'Late';
  lateStatus: string;
  monthlyLateCount: number;
  allowedLateCount: number;
  penaltyType: 'NONE' | 'WARNING' | 'HALF_DAY' | 'LOP';
  deductionDays: number;
  warningMessage: string | null;
  policyId: string;
  policyName: string;
  notes: string;
}

export const DEFAULT_CORPORATE_LATE_POLICY: ConfiguredLatePolicy = {
  id: 'AP-DEFAULT-001',
  policyName: 'Standard Corporate Attendance Policy',
  applicableDepartments: 'ALL',
  applicableDesignations: 'ALL',
  applicableShifts: 'ALL',
  applicableEmployees: 'ALL',
  graceTimeMinutes: 40,
  allowedLateCount: 3,
  warningSystemEnabled: true,
  halfDayRuleEnabled: true,
  halfDayThresholdCount: 4,
  lopRuleEnabled: true,
  lopThresholdCount: 6,
  status: 'Active',
};

function normalizeScopeField(val: unknown): 'ALL' | string[] {
  if (!val || val === 'ALL') return 'ALL';
  if (Array.isArray(val)) {
    const cleaned = val
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    if (cleaned.length === 0) return 'ALL';
    if (cleaned.some((item) => item.toUpperCase() === 'ALL')) return 'ALL';
    return cleaned;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed.toUpperCase() === 'ALL') return 'ALL';
    return [trimmed];
  }
  return 'ALL';
}

export function normalizeLatePolicyRecord(raw: any): ConfiguredLatePolicy {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CORPORATE_LATE_POLICY };
  }

  const graceRaw = Number(raw.graceTimeMinutes ?? raw.gracePeriodMinutes ?? raw.grace_time_minutes);
  const allowedRaw = Number(raw.allowedLateCount ?? raw.allowed_late_count);
  const halfDayThresholdRaw = Number(raw.halfDayThresholdCount ?? raw.half_day_threshold_count);
  const lopThresholdRaw = Number(raw.lopThresholdCount ?? raw.lop_threshold_count);

  const halfDayEnabled =
    raw.halfDayRuleEnabled !== undefined
      ? Boolean(raw.halfDayRuleEnabled)
      : raw.halfDayTriggerEnabled !== undefined
        ? Boolean(raw.halfDayTriggerEnabled)
        : true;

  const lopEnabled =
    raw.lopRuleEnabled !== undefined
      ? Boolean(raw.lopRuleEnabled)
      : raw.lopTriggerEnabled !== undefined
        ? Boolean(raw.lopTriggerEnabled)
        : true;

  const warningEnabled =
    raw.warningSystemEnabled !== undefined ? Boolean(raw.warningSystemEnabled) : true;

  const rawStatus = String(raw.status || 'Active').trim();
  const status: 'Active' | 'Inactive' | 'Archived' =
    rawStatus === 'Inactive' || rawStatus === 'Archived' ? rawStatus : 'Active';

  return {
    id: String(raw.id || DEFAULT_CORPORATE_LATE_POLICY.id),
    policyName: String(raw.policyName || raw.name || DEFAULT_CORPORATE_LATE_POLICY.policyName),
    applicableDepartments: normalizeScopeField(raw.applicableDepartments),
    applicableDesignations: normalizeScopeField(raw.applicableDesignations),
    applicableShifts: normalizeScopeField(raw.applicableShifts),
    applicableEmployees: normalizeScopeField(raw.applicableEmployees),
    graceTimeMinutes: Number.isFinite(graceRaw) && graceRaw >= 0 ? graceRaw : 40,
    allowedLateCount: Number.isFinite(allowedRaw) && allowedRaw >= 0 ? allowedRaw : 3,
    warningSystemEnabled: warningEnabled,
    halfDayRuleEnabled: halfDayEnabled,
    halfDayThresholdCount:
      Number.isFinite(halfDayThresholdRaw) && halfDayThresholdRaw >= 1 ? halfDayThresholdRaw : 4,
    lopRuleEnabled: lopEnabled,
    lopThresholdCount:
      Number.isFinite(lopThresholdRaw) && lopThresholdRaw >= 1 ? lopThresholdRaw : 6,
    status,
  };
}

export async function loadActiveLatePoliciesFromDb(
  client?: PoolClient
): Promise<ConfiguredLatePolicy[]> {
  try {
    const sql = `
      SELECT setting_key, setting_val
      FROM public.company_settings
      WHERE setting_key IN ('master_attendance_policies_data', 'master_attendance_policies')
      ORDER BY CASE WHEN setting_key = 'master_attendance_policies_data' THEN 0 ELSE 1 END
    `;
    const res = client ? await client.query(sql) : await query(sql);
    for (const row of res.rows) {
      const val = row?.setting_val;
      if (Array.isArray(val) && val.length > 0) {
        const normalized = val
          .map((item) => normalizeLatePolicyRecord(item))
          .filter((p) => p.status === 'Active');
        if (normalized.length > 0) {
          return normalized;
        }
      }
    }
  } catch (err) {
    console.warn('[LatePolicyService] Could not query company_settings for late policies:', err);
  }
  return [{ ...DEFAULT_CORPORATE_LATE_POLICY }];
}

function matchesCaseInsensitive(list: string[], candidate?: string | null): boolean {
  if (!candidate) return false;
  const target = candidate.trim().toLowerCase();
  if (!target) return false;
  return list.some((item) => item.trim().toLowerCase() === target);
}

export function isLatePolicyApplicable(
  policy: ConfiguredLatePolicy,
  employee: EmployeePolicyContext,
  shift?: ShiftRecord | null
): boolean {
  if (!policy || policy.status !== 'Active') return false;

  // 1. Specific Employees filter
  if (Array.isArray(policy.applicableEmployees)) {
    const matchesEmp =
      matchesCaseInsensitive(policy.applicableEmployees, employee.employeeId) ||
      matchesCaseInsensitive(policy.applicableEmployees, employee.id);
    if (!matchesEmp) return false;
  }

  // 2. Specific Shifts filter
  if (Array.isArray(policy.applicableShifts)) {
    const matchesShift =
      matchesCaseInsensitive(policy.applicableShifts, shift?.id) ||
      matchesCaseInsensitive(policy.applicableShifts, shift?.shiftName) ||
      matchesCaseInsensitive(policy.applicableShifts, employee.workShift);
    if (!matchesShift) return false;
  }

  // 3. Specific Designations filter
  if (Array.isArray(policy.applicableDesignations)) {
    if (!matchesCaseInsensitive(policy.applicableDesignations, employee.designation)) {
      return false;
    }
  }

  // 4. Specific Departments filter
  if (Array.isArray(policy.applicableDepartments)) {
    if (!matchesCaseInsensitive(policy.applicableDepartments, employee.department)) {
      return false;
    }
  }

  return true;
}

/**
 * Resolves the single effective Late Policy for an employee + shift using specificity precedence:
 * Specific Employee (5) > Specific Shift (4) > Specific Designation (3) > Specific Department (2) > Global ALL (1)
 */
export function resolveEffectiveLatePolicyForEmployee(
  policies: ConfiguredLatePolicy[],
  employee: EmployeePolicyContext,
  shift?: ShiftRecord | null
): ConfiguredLatePolicy {
  const active = (policies || []).filter((p) => p.status === 'Active');
  const matching = active.filter((p) => isLatePolicyApplicable(p, employee, shift));

  if (matching.length === 0) {
    return active[0] || { ...DEFAULT_CORPORATE_LATE_POLICY };
  }

  const scored = matching.map((p) => {
    let score = 1;
    if (Array.isArray(p.applicableEmployees)) score = 5;
    else if (Array.isArray(p.applicableShifts)) score = 4;
    else if (Array.isArray(p.applicableDesignations)) score = 3;
    else if (Array.isArray(p.applicableDepartments)) score = 2;
    return { policy: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].policy;
}

/**
 * Counts prior late occurrences for an employee in the given YYYY-MM month from PostgreSQL
 * (excluding the current shiftDate so re-evaluation is idempotent).
 */
export async function countEmployeeMonthlyLateOccurrences(
  employeeUuid: string,
  shiftDate: string,
  client?: PoolClient
): Promise<number> {
  const yearMonth = shiftDate.slice(0, 7); // YYYY-MM
  const monthStart = `${yearMonth}-01`;
  const sql = `
    SELECT COUNT(*)::int AS cnt
    FROM public.attendance_records
    WHERE employee_id = $1
      AND COALESCE(shift_date, date) >= $2::date
      AND COALESCE(shift_date, date) < ($2::date + INTERVAL '1 month')
      AND COALESCE(shift_date, date) <> $3::date
      AND (
        status::text = 'Late'
        OR COALESCE(late_duration_minutes, 0) > 0
        OR (
          late_status IS NOT NULL
          AND late_status NOT IN ('On Time', 'Within Grace', 'Early', 'N/A', '')
          AND late_status ILIKE '%late%'
        )
      )
  `;
  try {
    const res = client
      ? await client.query<{ cnt: number }>(sql, [employeeUuid, monthStart, shiftDate])
      : await query<{ cnt: number }>(sql, [employeeUuid, monthStart, shiftDate]);
    return Number(res.rows[0]?.cnt ?? 0);
  } catch (err) {
    console.warn('[LatePolicyService] Failed counting monthly late occurrences:', err);
    return 0;
  }
}

/**
 * Pure calculation of punctuality & Late Policy penalty for a check-in timestamp.
 *
 * Rules:
 * - Check-in up to `shiftStart` -> Present ('On Time')
 * - Check-in after `shiftStart` and up to `shiftStart + graceTimeMinutes` (inclusive to the minute) -> Present ('Within Grace')
 * - Check-in after `shiftStart + graceTimeMinutes` -> Late
 * - When Late:
 *   - Occurrence k = previousMonthlyLateCount + 1
 *   - 1 <= k <= allowedLateCount -> Warning (if warningSystemEnabled), 0 deduction
 *   - k >= lopThresholdCount (when lopRuleEnabled) -> 1.0 Day Loss of Pay (LOP) penalty (never double-deducts Half-Day)
 *   - k >= halfDayThresholdCount (when halfDayRuleEnabled and not LOP) -> 0.5 Day Half-Day penalty
 */
export function evaluateCheckInPunctualityAndPenalty(params: {
  checkInTime: Date | string;
  shiftStartDateTime: Date | string;
  policy: ConfiguredLatePolicy;
  previousMonthlyLateCount: number;
}): LateEvaluationOutcome {
  const { policy, previousMonthlyLateCount } = params;
  const checkInTime = params.checkInTime instanceof Date ? params.checkInTime : new Date(params.checkInTime);
  const shiftStartDateTime =
    params.shiftStartDateTime instanceof Date ? params.shiftStartDateTime : new Date(params.shiftStartDateTime);
  const gracePeriodMins =
    Number.isFinite(policy.graceTimeMinutes) && policy.graceTimeMinutes >= 0
      ? policy.graceTimeMinutes
      : 40;
  const allowedLateCount =
    Number.isFinite(policy.allowedLateCount) && policy.allowedLateCount >= 0
      ? policy.allowedLateCount
      : 3;

  const diffMs = checkInTime.getTime() - shiftStartDateTime.getTime();
  // Use whole-minute elapsed comparison so e.g. 09:40:00 (and 09:40:xx) is 40 mins (<= 40 grace -> Present)
  // and 09:41:00 is 41 mins (> 40 grace -> Late), while 09:40:01 with seconds-precision test > graceEnd is also handled:
  // Specifically, if diffMs <= gracePeriodMins * 60_000, it is within grace.
  // What if seconds are 09:40:30? Floor to minutes gives 40 minutes unless exact seconds past grace cutoff are tested.
  const graceCutoffMs = shiftStartDateTime.getTime() + gracePeriodMins * 60_000;
  const isLate = checkInTime.getTime() > graceCutoffMs;
  const isWithinGrace = !isLate && diffMs > 0;

  if (!isLate) {
    return {
      isLate: false,
      isWithinGrace,
      gracePeriodMins,
      lateDurationMinutes: 0,
      status: 'Present',
      lateStatus: 'On Time',
      monthlyLateCount: previousMonthlyLateCount,
      allowedLateCount,
      penaltyType: 'NONE',
      deductionDays: 0,
      warningMessage: null,
      policyId: policy.id,
      policyName: policy.policyName,
      notes: isWithinGrace
        ? `Checked in within ${gracePeriodMins}-min grace period (${policy.policyName})`
        : `Checked in on time (${policy.policyName})`,
    };
  }

  const lateDurationMinutes = Math.max(1, Math.ceil(diffMs / 60_000));
  const monthlyLateCount = previousMonthlyLateCount + 1;

  let penaltyType: 'NONE' | 'WARNING' | 'HALF_DAY' | 'LOP' = 'NONE';
  let deductionDays = 0;
  let warningMessage: string | null = null;
  let lateStatus = 'Late';

  const triggersLop =
    Boolean(policy.lopRuleEnabled) &&
    monthlyLateCount > allowedLateCount &&
    monthlyLateCount >= (policy.lopThresholdCount || 6);

  const triggersHalfDay =
    !triggersLop &&
    Boolean(policy.halfDayRuleEnabled) &&
    monthlyLateCount > allowedLateCount &&
    monthlyLateCount >= (policy.halfDayThresholdCount || 4);

  if (monthlyLateCount <= allowedLateCount) {
    if (policy.warningSystemEnabled) {
      penaltyType = 'WARNING';
      warningMessage = `Late Warning ${monthlyLateCount}/${allowedLateCount}: You have used ${monthlyLateCount} of ${allowedLateCount} allowed late arrivals this month.`;
      lateStatus = `Late (Warning ${monthlyLateCount}/${allowedLateCount})`;
    } else {
      lateStatus = `Late (${monthlyLateCount}/${allowedLateCount})`;
    }
  } else if (triggersLop) {
    penaltyType = 'LOP';
    deductionDays = 1.0;
    warningMessage = `Loss of Pay (LOP) Triggered: Late occurrence #${monthlyLateCount} this month (LOP threshold: ${policy.lopThresholdCount}).`;
    lateStatus = `Late - LOP (Late #${monthlyLateCount})`;
  } else if (triggersHalfDay) {
    penaltyType = 'HALF_DAY';
    deductionDays = 0.5;
    warningMessage = `Half-Day Penalty Triggered: Late occurrence #${monthlyLateCount} this month (Half-Day threshold: ${policy.halfDayThresholdCount}).`;
    lateStatus = `Late - Half Day (Late #${monthlyLateCount})`;
  } else {
    if (policy.warningSystemEnabled) {
      penaltyType = 'WARNING';
      warningMessage = `Late Limit Exceeded: Late occurrence #${monthlyLateCount} this month (Allowed: ${allowedLateCount}).`;
    }
    lateStatus = `Late (Late #${monthlyLateCount})`;
  }

  const notes = JSON.stringify({
    policyId: policy.id,
    policyName: policy.policyName,
    gracePeriodMins,
    lateDurationMinutes,
    monthlyLateCount,
    allowedLateCount,
    penaltyType,
    deductionDays,
    warningMessage,
  });

  return {
    isLate: true,
    isWithinGrace: false,
    gracePeriodMins,
    lateDurationMinutes,
    status: 'Late',
    lateStatus,
    monthlyLateCount,
    allowedLateCount,
    penaltyType,
    deductionDays,
    warningMessage,
    policyId: policy.id,
    policyName: policy.policyName,
    notes,
  };
}
