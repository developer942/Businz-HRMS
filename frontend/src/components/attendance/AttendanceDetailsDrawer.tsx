import React, { useState, useMemo } from 'react';
import {
  X,
  Clock,
  Calendar,
  Building2,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  History,
  Edit3,
  Coffee,
  ShieldCheck,
  DollarSign,
  FileText,
  UserCheck,
  TrendingUp,
  AlertTriangle,
  Award,
  Timer,
  ArrowRight,
  Info
} from 'lucide-react';
import { AttendanceRecord } from '../../types/hrms';
import { useHRMS } from '../../context/HRMSContext';
import { formatCurrency } from '../../utils/numbers';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import {
  formatHoursAndMinutes,
  resolveEmployeeOtEligibility,
  calculateAttendanceSalaryImpact,
  aggregateMonthlyAttendanceSummary,
  buildEmployeeMonthlyAttendanceOtReport
} from '../../services/attendanceCalculationEngine';
import { isOwnerOrCEO } from '../../data/hrmsInitialData';
import { ShiftModel } from '../../types/attendanceEnterprise';

interface AttendanceDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  record: AttendanceRecord | null;
  onOpenCorrection?: (record: AttendanceRecord) => void;
  onOpenOtRequest?: (record: AttendanceRecord) => void;
}

export const AttendanceDetailsDrawer: React.FC<AttendanceDetailsDrawerProps> = ({
  isOpen,
  onClose,
  record,
  onOpenCorrection,
  onOpenOtRequest
}) => {
  const {
    attendanceAuditLogs,
    currentUser,
    employees,
    shifts,
    departmentOtPolicies,
    employeeOtPolicies,
    overtimePolicy,
    attendancePolicyConfig,
    missedPunchRequests,
    overtimeRequests,
    attendanceRecords,
    payrollSettingsConfig
  } = useHRMS();

  const [activeTab, setActiveTab] = useState<'overview' | 'hours_ot' | 'salary_impact' | 'monthly' | 'history'>('overview');

  if (!isOpen || !record) return null;

  const isHrOrCeo =
    currentUser?.role === 'CEO' ||
    currentUser?.role === 'HR Manager' ||
    currentUser?.role === 'HR Admin' ||
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'Management' ||
    currentUser?.role === 'ERP Administrator';

  const employee = employees.find(e => e.id === record.employeeId || e.employeeId === record.employeeId);
  if (isOwnerOrCEO(employee || record)) return null;

  // Find assigned shift or fallback
  const assignedShift = shifts.find(s => s.assignments?.some(a => a.employeeId === record.employeeId));
  const shiftModel: ShiftModel = {
    id: assignedShift?.id || shifts[0]?.id || 'SH-01',
    shiftName: record.shiftName || assignedShift?.shiftName || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)',
    shiftCode: (assignedShift as any)?.shiftCode || 'GEN-01',
    startTime: assignedShift?.startTime || '09:00 AM',
    endTime: assignedShift?.endTime || '06:00 PM',
    requiredWorkingHours: ('requiredWorkingHours' in (assignedShift || {}) ? (assignedShift as any).requiredWorkingHours : (assignedShift as any)?.workingHours) || 9.0,
    breakDurationMinutes: ('breakDurationMinutes' in (assignedShift || {}) ? (assignedShift as any).breakDurationMinutes : (assignedShift as any)?.breakDurationMins) || 60,
    gracePeriodMinutes: ('gracePeriodMinutes' in (assignedShift || {}) ? (assignedShift as any).gracePeriodMinutes : (assignedShift as any)?.gracePeriodMins) || 10,
    lateThresholdMinutes: 15,
    earlyCheckoutThresholdMinutes: 10,
    otStartsAfter: 'After required working hours completed',
    maximumDailyOtHours: 4.0
  };

  // Resolve OT eligibility
  const otEligibility = resolveEmployeeOtEligibility(
    record.employeeId,
    record.department,
    departmentOtPolicies,
    employeeOtPolicies
  );

  // Salary Impact Summary (Section 22)
  const salaryImpact = calculateAttendanceSalaryImpact({
    employee,
    record,
    shift: shiftModel,
    attendancePolicy: attendancePolicyConfig,
    otPolicy: overtimePolicy
  });

  // Monthly Attendance Summary (Section 23)
  const monthlySummary = aggregateMonthlyAttendanceSummary(
    record.employeeId,
    attendanceRecords,
    shiftModel,
    attendancePolicyConfig,
    overtimePolicy,
    employee
  );

  const recDateStr = String(record.date || record.shiftDate || '');
  const recYear = Number(recDateStr.slice(0, 4)) || new Date().getFullYear();
  const recMonth = Number(recDateStr.slice(5, 7)) || (new Date().getMonth() + 1);
  const monthlyOtReport = buildEmployeeMonthlyAttendanceOtReport({
    employee: employee || { employeeId: record.employeeId, department: record.department },
    attendanceRecords,
    overtimeRequests,
    overtimePolicy,
    departmentOtPolicies,
    employeeOtPolicies,
    payrollConfig: payrollSettingsConfig,
    shifts,
    month: recMonth,
    year: recYear
  });

  // Audit Logs for this record/employee
  const auditLogs = attendanceAuditLogs.filter(
    log => log.attendanceId === record.id || (log.employeeId === record.employeeId && log.date === record.date)
  );

  // Related Missed Punch & OT Requests
  const relatedMissedRequests = missedPunchRequests.filter(
    r => r.employeeId === record.employeeId && r.date === record.date
  );
  const relatedOtRequests = overtimeRequests.filter(
    r => r.employeeId === record.employeeId && r.date === record.date
  );

  // Status Badge Helper
  const getStatusBadge = (status: AttendanceRecord['status']) => {
    switch (status) {
      case 'Present':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Half Day':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Absent':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'On Leave':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'Work From Home':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'Holiday':
      case 'Week Off':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Missing Punch':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const workedHoursDisplay = formatHoursAndMinutes(record.workingHours || 0);
  const shiftHoursDisplay = formatHoursAndMinutes(shiftModel.requiredWorkingHours);
  const breakDisplay = formatHoursAndMinutes((shiftModel.breakDurationMinutes || 60) / 60);
  const potentialOtDisplay = formatHoursAndMinutes(record.calculatedOtHours || 0);
  const approvedOtDisplay = formatHoursAndMinutes(record.approvedOtHours || 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
          
          {/* ── DRAWER HEADER (Section 5, 33) ── */}
          <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-cyan-700 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                {record.employeeName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">{record.employeeName}</h2>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${getStatusBadge(record.status)}`}>
                    {record.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                  <span>ID: <strong className="text-slate-700">{record.employeeId}</strong></span>
                  <span>•</span>
                  <span>Dept: <strong className="text-slate-700">{record.department}</strong></span>
                  <span>•</span>
                  <span>Role: <strong className="text-slate-700">{employee?.designation || 'Specialist'}</strong></span>
                  <span>•</span>
                  <span className="text-cyan-800 font-semibold">{formatDateDDMMYYYY(record.date)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── TAB BAR ── */}
          <div className="px-6 border-b border-slate-100 bg-white flex gap-2 pt-2">
            {[
              { id: 'overview', label: 'Overview & Shift' },
              { id: 'hours_ot', label: 'Hours & OT Details' },
              { id: 'salary_impact', label: 'Salary Preview' },
              { id: 'monthly', label: 'Monthly Summary' },
              { id: 'history', label: `Audit & History (${auditLogs.length + relatedMissedRequests.length + relatedOtRequests.length})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-cyan-700 text-cyan-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── DRAWER BODY SCROLL ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">

            {/* TAB 1: OVERVIEW & SHIFT DETAILS */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {/* Punch Overview Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-cyan-50/70 border border-cyan-100 rounded-2xl p-3.5">
                    <span className="text-xs font-semibold text-cyan-800">Check-In</span>
                    <div className="text-lg font-mono font-bold text-cyan-950 mt-1">
                      {record.checkIn || '--:--'}
                    </div>
                    <span className="text-[10px] text-cyan-700">
                      {record.lateStatus && record.lateStatus !== 'On Time' ? `Late (${record.lateDurationMinutes || 15}m)` : 'On Time'}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                    <span className="text-xs font-semibold text-slate-600">Lunch Break</span>
                    <div className="text-lg font-bold text-slate-800 mt-1">
                      {shiftModel.breakDurationMinutes || 60}m
                    </div>
                    <span className="text-[10px] text-slate-400">Allocated Break</span>
                  </div>

                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5">
                    <span className="text-xs font-semibold text-indigo-800">Check-Out</span>
                    <div className="text-lg font-mono font-bold text-indigo-950 mt-1">
                      {record.checkOut || '--:--'}
                    </div>
                    <span className="text-[10px] text-indigo-700">
                      {record.earlyCheckoutMinutes ? `Early (${record.earlyCheckoutMinutes}m)` : 'Standard'}
                    </span>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-3.5">
                    <span className="text-xs font-semibold text-emerald-800">Net Worked</span>
                    <div className="text-lg font-bold text-emerald-950 mt-1">
                      {workedHoursDisplay}
                    </div>
                    <span className="text-[10px] text-emerald-700">Effective Hours</span>
                  </div>
                </div>

                {/* SHIFT DETAILS (Section 5) */}
                <div className="border border-slate-200/90 rounded-2xl p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-cyan-700" /> Shift Details
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-cyan-100 text-cyan-800">
                      {shiftModel.shiftCode}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                    <div>
                      <span className="text-slate-400 block">Shift Name</span>
                      <strong className="text-slate-800 text-sm">{shiftModel.shiftName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Working Window</span>
                      <strong className="text-slate-800 text-sm">{shiftModel.startTime} - {shiftModel.endTime}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Required Hours</span>
                      <strong className="text-slate-800 text-sm">{shiftModel.requiredWorkingHours} Hours</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Grace Period</span>
                      <strong className="text-slate-800 text-sm">{shiftModel.gracePeriodMinutes} Minutes</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Break Duration</span>
                      <strong className="text-slate-800 text-sm">{shiftModel.breakDurationMinutes} Minutes</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">OT Starts After</span>
                      <strong className="text-slate-800 text-sm">{shiftModel.requiredWorkingHours}h Shift Completed</strong>
                    </div>
                  </div>
                </div>

                {/* ATTENDANCE DETAILS (Section 5) */}
                <div className="border border-slate-200/90 rounded-2xl p-4 bg-white space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-cyan-700" /> Attendance Punctuality & Verification
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="text-slate-400 block">Late By</span>
                      <span className={`font-bold text-sm ${record.lateDurationMinutes ? 'text-amber-700' : 'text-slate-700'}`}>
                        {record.lateDurationMinutes ? `${record.lateDurationMinutes} Minutes` : 'None (0m)'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="text-slate-400 block">Early Checkout</span>
                      <span className={`font-bold text-sm ${record.earlyCheckoutMinutes ? 'text-rose-700' : 'text-slate-700'}`}>
                        {record.earlyCheckoutMinutes ? `Yes (${record.earlyCheckoutMinutes}m)` : 'No'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="text-slate-400 block">Punch Method</span>
                      <span className="font-bold text-sm text-slate-800">
                        {record.method || 'Biometric'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="text-slate-400 block">Face Verified</span>
                      <span className="font-bold text-sm text-emerald-700">
                        {record.faceVerified ? 'Yes (98.4%)' : 'Hardware Terminal'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: WORKING HOURS & OT DETAILS (Section 5, 8, 14, 15) */}
            {activeTab === 'hours_ot' && (
              <div className="space-y-5">
                {/* WORKING HOURS BREAKDOWN (Section 5) */}
                <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Working Hours Breakdown
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600">Shift Required Hours</span>
                      <strong className="text-slate-900 font-mono text-sm">{shiftHoursDisplay}</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600">Actual Worked Hours (Gross - Break)</span>
                      <strong className="text-cyan-900 font-mono text-sm">{workedHoursDisplay}</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600">Break Deducted</span>
                      <strong className="text-slate-700 font-mono text-sm">{breakDisplay}</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600">Regular Work Hours Credited</span>
                      <strong className="text-slate-800 font-mono text-sm">{formatHoursAndMinutes(Math.min(record.workingHours || 0, shiftModel.requiredWorkingHours))}</strong>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-cyan-800 font-semibold">Eligible / Potential Overtime Detected</span>
                      <strong className="text-cyan-800 font-mono text-sm">{potentialOtDisplay}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-emerald-800 font-semibold">Approved Overtime (For Payroll Payout)</span>
                      <strong className="text-emerald-800 font-mono text-sm">{approvedOtDisplay}</strong>
                    </div>
                  </div>
                </div>

                {/* OVERTIME DETAILS (Section 5, 8, 12, 13) */}
                <div className="border border-cyan-200 bg-cyan-50/40 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-950 flex items-center gap-1.5">
                      <Timer className="w-4 h-4 text-cyan-700" /> Overtime Policy & Approval Status
                    </h3>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                      otEligibility.isEligible ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}>
                      OT Eligibility: {otEligibility.isEligible ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-white p-3 rounded-xl border border-cyan-100">
                    <div>
                      <span className="text-slate-400 block">Eligibility Source</span>
                      <strong className="text-slate-800">{otEligibility.source}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Daily Limit Cap</span>
                      <strong className="text-slate-800">{otEligibility.maxDailyOt} Hours</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Monthly Limit Cap</span>
                      <strong className="text-slate-800">{otEligibility.maxMonthlyOt} Hours</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Approval Status</span>
                      <strong className={record.otStatus === 'Approved' ? 'text-emerald-700' : 'text-amber-700'}>
                        {record.otStatus || 'Pending Review'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Hourly OT Rate</span>
                      <strong className="text-slate-800 font-mono">{formatCurrency(salaryImpact.hourlyRate)}/hr</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Approved OT Payout</span>
                      <strong className="text-emerald-700 font-mono text-sm">{formatCurrency(salaryImpact.otAmount)}</strong>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 italic">
                    Note: Potential OT is not automatically paid out. It requires HR/CEO approval per configured overtime guidelines.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: SALARY IMPACT PREVIEW (Section 22) */}
            {activeTab === 'salary_impact' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-cyan-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs uppercase font-semibold tracking-wider text-cyan-300">
                        Attendance Salary Preview
                      </span>
                      <h3 className="text-xl font-bold tracking-tight mt-0.5">
                        Net Adjustment: {salaryImpact.netAdjustment >= 0 ? `+${formatCurrency(salaryImpact.netAdjustment)}` : `-${formatCurrency(Math.abs(salaryImpact.netAdjustment))}`}
                      </h3>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold text-lg text-white">
                      ₹
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs bg-white/10 rounded-xl p-3 border border-white/10">
                    <div>
                      <span className="text-cyan-200 block">Daily Salary Base</span>
                      <strong className="text-white text-sm font-mono">{formatCurrency(salaryImpact.dailySalary)}</strong>
                    </div>
                    <div>
                      <span className="text-cyan-200 block">Standard Hours</span>
                      <strong className="text-white text-sm font-mono">{salaryImpact.standardWorkingHours}h</strong>
                    </div>
                  </div>
                </div>

                {/* Granular Breakdown (Section 22) */}
                <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-2 text-xs">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600 font-medium">Regular Work Completed</span>
                    <span className="font-mono text-slate-800">{salaryImpact.regularWorkHours} hrs</span>
                  </div>

                  <div className="flex justify-between py-2 border-b border-slate-100 text-emerald-700">
                    <span className="font-medium">+ Overtime Earnings ({salaryImpact.otHours} hrs @ {formatCurrency(salaryImpact.hourlyRate)}/hr)</span>
                    <span className="font-mono font-bold">+{formatCurrency(salaryImpact.otAmount)}</span>
                  </div>

                  <div className="flex justify-between py-2 border-b border-slate-100 text-amber-700">
                    <span className="font-medium">- Half-Day Salary Deduction</span>
                    <span className="font-mono font-bold">-{formatCurrency(salaryImpact.halfDayDeduction)}</span>
                  </div>

                  <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700">
                    <span className="font-medium">- Absent (Loss of Pay) Deduction</span>
                    <span className="font-mono font-bold">-{formatCurrency(salaryImpact.absentDeduction)}</span>
                  </div>

                  <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700">
                    <span className="font-medium">- Late Arrival Penalty</span>
                    <span className="font-mono font-bold">-{formatCurrency(salaryImpact.lateDeduction)}</span>
                  </div>

                  <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700">
                    <span className="font-medium">- Early Checkout Deduction</span>
                    <span className="font-mono font-bold">-{formatCurrency(salaryImpact.earlyCheckoutDeduction)}</span>
                  </div>

                  <div className="flex justify-between pt-2 text-sm font-bold text-slate-900">
                    <span>Net Attendance Adjustment</span>
                    <span className={salaryImpact.netAdjustment >= 0 ? 'text-emerald-700 font-mono' : 'text-rose-700 font-mono'}>
                      {salaryImpact.netAdjustment >= 0 ? `+${formatCurrency(salaryImpact.netAdjustment)}` : `-${formatCurrency(Math.abs(salaryImpact.netAdjustment))}`}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    <strong>Important:</strong> This represents an attendance calculation preview. Final monthly payroll processing commits and pays only finalized, verified records.
                  </span>
                </div>
              </div>
            )}

            {/* TAB 4: MONTHLY ATTENDANCE SUMMARY (Section 23) */}
            {activeTab === 'monthly' && (
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Employee Monthly Rollup Metrics
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <span className="text-slate-400 block">Total Working Days</span>
                      <strong className="text-slate-800 text-base">{monthlySummary.totalWorkingDays}</strong>
                    </div>

                    <div className="bg-emerald-50 p-3 rounded-xl text-emerald-900">
                      <span className="text-emerald-700 block">Present Days</span>
                      <strong className="text-base">{monthlySummary.presentDays}</strong>
                    </div>

                    <div className="bg-rose-50 p-3 rounded-xl text-rose-900">
                      <span className="text-rose-700 block">Absent Days</span>
                      <strong className="text-base">{monthlySummary.absentDays}</strong>
                    </div>

                    <div className="bg-amber-50 p-3 rounded-xl text-amber-900">
                      <span className="text-amber-700 block">Half Days</span>
                      <strong className="text-base">{monthlySummary.halfDays}</strong>
                    </div>

                    <div className="bg-indigo-50 p-3 rounded-xl text-indigo-900">
                      <span className="text-indigo-700 block">Leave Days</span>
                      <strong className="text-base">{monthlySummary.leaveDays}</strong>
                    </div>

                    <div className="bg-slate-100 p-3 rounded-xl text-slate-800">
                      <span className="text-slate-500 block">Weekly Off / Holidays</span>
                      <strong className="text-base">{monthlySummary.weeklyOffDays + monthlySummary.holidayDays}</strong>
                    </div>

                    <div className="bg-amber-50 p-3 rounded-xl text-amber-900">
                      <span className="text-amber-700 block">Late Days Exceeded</span>
                      <strong className="text-base">{monthlySummary.lateDays}</strong>
                    </div>

                    <div className="bg-rose-50 p-3 rounded-xl text-rose-900">
                      <span className="text-rose-700 block">Early Checkout Days</span>
                      <strong className="text-base">{monthlySummary.earlyCheckoutDays}</strong>
                    </div>

                    <div className="bg-amber-50 p-3 rounded-xl text-amber-900">
                      <span className="text-amber-700 block">Missing Attendance</span>
                      <strong className="text-base">{monthlySummary.missingAttendanceDays}</strong>
                    </div>
                  </div>
                </div>

                {/* Monthly Attendance + Overtime Details Breakdown Table */}
                {monthlyOtReport.rows.length > 0 && (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-bold text-slate-600 uppercase">
                            <th className="py-2.5 px-3">DATE</th>
                            <th className="py-2.5 px-3">SHIFT TIME</th>
                            <th className="py-2.5 px-3 text-right">SHIFT WORK HRS</th>
                            {monthlyOtReport.showOtFields ? (
                              <>
                                <th className="py-2.5 px-3 text-right text-cyan-800">OT HRS</th>
                                <th className="py-2.5 px-3 text-right text-cyan-800">OT AMOUNT</th>
                              </>
                            ) : (
                              <th className="py-2.5 px-3 text-right">STATUS</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyOtReport.rows.map(row => (
                            <tr key={row.id} className="border-b border-slate-100">
                              <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">
                                {formatDateDDMMYYYY(row.date)}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                <div className="font-medium text-slate-800">{row.shiftTime}</div>
                                <div className="text-[10px] text-slate-400">{row.punchTimeDisplay}</div>
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                {row.shiftWorkHrs} hrs
                              </td>
                              {monthlyOtReport.showOtFields ? (
                                <>
                                  <td className="py-2 px-3 text-right font-mono font-bold text-cyan-800">
                                    {row.otHrs > 0 ? `${row.otHrs} hrs` : '0 hrs'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                                    {formatCurrency(row.otAmount)}
                                  </td>
                                </>
                              ) : (
                                <td className="py-2 px-3 text-right font-semibold text-slate-700">
                                  {row.status}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        {monthlyOtReport.showOtFields && (
                          <tfoot>
                            <tr className="bg-cyan-50 border-t-2 border-cyan-200 font-bold text-cyan-900">
                              <td colSpan={3} className="py-2.5 px-3">
                                TOTAL APPROVED OT HOURS: {monthlyOtReport.totalApprovedOtHours} hrs
                              </td>
                              <td colSpan={2} className="py-2.5 px-3 text-right">
                                TOTAL APPROVED OT AMOUNT: {formatCurrency(monthlyOtReport.totalApprovedOtAmount)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

                {/* Monthly OT & Payout Rollup (Only for OT-eligible employees) */}
                {monthlyOtReport.showOtFields && (
                  <div className="border border-cyan-200 bg-cyan-50/30 rounded-2xl p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-900">
                      Monthly Overtime & Financial Summary
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-white p-3 rounded-xl border border-cyan-100">
                      <div>
                        <span className="text-slate-400 block">Approved OT Hours</span>
                        <strong className="text-emerald-700 text-sm font-mono">{monthlyOtReport.totalApprovedOtHours} hrs</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Pending OT Claims</span>
                        <strong className="text-amber-700 text-sm font-mono">{monthlySummary.pendingOtHours} hrs</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Rejected OT Hours</span>
                        <strong className="text-rose-700 text-sm font-mono">{monthlySummary.rejectedOtHours} hrs</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Total OT Payout</span>
                        <strong className="text-emerald-700 text-sm font-mono">+{formatCurrency(monthlyOtReport.totalApprovedOtAmount)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Total Deductions</span>
                        <strong className="text-rose-700 text-sm font-mono">-{formatCurrency(monthlySummary.totalDeductionAmount)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Net Payout Impact</span>
                        <strong className={monthlySummary.netImpact >= 0 ? 'text-emerald-700 text-sm font-mono' : 'text-rose-700 text-sm font-mono'}>
                          {monthlySummary.netImpact >= 0 ? `+${formatCurrency(monthlySummary.netImpact)}` : `-${formatCurrency(Math.abs(monthlySummary.netImpact))}`}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: REQUESTS & AUDIT TIMELINE (Section 5, 31) */}
            {activeTab === 'history' && (
              <div className="space-y-5">
                {/* Related Requests Table */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-cyan-700" /> Requests on this Date
                  </h3>
                  {relatedMissedRequests.length === 0 && relatedOtRequests.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-400">
                      No correction or overtime requests submitted for this date.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {relatedMissedRequests.map(req => (
                        <div key={req.id} className="border border-slate-200 rounded-xl p-3 bg-white text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{req.requestType}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              req.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : (req.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800')
                            }`}>
                              {req.status}
                            </span>
                          </div>
                          <p className="text-slate-600">
                            Requested: <strong>{req.requestedCheckIn || 'N/A'}</strong> → <strong>{req.requestedCheckOut || 'N/A'}</strong>
                          </p>
                          <p className="text-slate-400 italic">"{req.reason}"</p>
                        </div>
                      ))}

                      {relatedOtRequests.map(ot => (
                        <div key={ot.id} className="border border-cyan-100 rounded-xl p-3 bg-cyan-50/40 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-cyan-950">Overtime Request ({ot.requestedOtHours}h)</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ot.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : (ot.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800')
                            }`}>
                              {ot.status}
                            </span>
                          </div>
                          <p className="text-slate-600">
                            Approved: <strong>{ot.approvedOtHours} hrs</strong> (Calculated ₹{ot.calculatedAmount})
                          </p>
                          <p className="text-slate-400 italic">"{ot.reason}"</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* AUDIT TIMELINE (Section 31) */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-cyan-700" /> Immutable Security Audit Trail ({auditLogs.length})
                  </h3>

                  {auditLogs.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-400">
                      No manual modifications recorded for this record.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {auditLogs.map(log => (
                        <div key={log.id} className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{log.fieldChanged}</span>
                            <span className="text-slate-400 font-mono text-[11px]">{log.timestamp}</span>
                          </div>
                          <p className="text-slate-700 bg-slate-50 p-2 rounded-lg font-mono text-[11px]">
                            {log.newValue}
                          </p>
                          <div className="flex items-center justify-between text-slate-500 pt-1 text-[11px]">
                            <span>Modified By: <strong className="text-slate-700">{log.changedBy}</strong></span>
                            <span>Reason: <em>"{log.reason}"</em></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ── DRAWER FOOTER ACTIONS ── */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Record ID: <span className="font-mono text-slate-700">{record.id}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-white transition-colors"
              >
                Close
              </button>

              {/* Employee can request correction if record has issues */}
              {onOpenCorrection && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCorrection(record);
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Request Correction
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
