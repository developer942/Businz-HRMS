import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { DateInput } from '../common/DateInput';
import { 
  CalendarCheck, 
  Clock, 
  Calendar, 
  Settings2, 
  Star, 
  ChevronRight, 
  CheckCircle2, 
  Save, 
  X, 
  Sliders, 
  FileText, 
  CalendarDays, 
  Gift, 
  AlertCircle, 
  Plus, 
  ShieldCheck,
  Building,
  Check,
  Info,
  Edit2,
  Trash2,
  Tag
} from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { 
  Shift, 
  LeavePolicyItem, 
  HolidayItem, 
  AttendancePolicyItem, 
  WeeklyScheduleItem 
} from '../../types/hrms';

// Custom Animated Toggle Switch
const ToggleSwitch: React.FC<{ checked: boolean; onChange: (val: boolean) => void }> = ({ checked, onChange }) => {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '46px',
        height: '24px',
        borderRadius: '99px',
        backgroundColor: checked ? '#0E7490' : '#cbd5e1',
        padding: '2px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        flexShrink: 0
      }}
    >
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transform: checked ? 'translateX(22px)' : 'translateX(0px)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {checked && <Check size={12} color="#0E7490" strokeWidth={3} />}
      </div>
    </div>
  );
};

export const AttendanceSettings: React.FC = () => {
  const { 
    setActiveModule,
    shifts,
    addShift,
    updateShift,
    deleteShift,
    leavePolicies,
    addLeavePolicy,
    updateLeavePolicy,
    deleteLeavePolicy,
    holidayPolicies,
    addHolidayPolicy,
    updateHolidayPolicy,
    deleteHolidayPolicy,
    attendancePolicies,
    addAttendancePolicy,
    updateAttendancePolicy,
    deleteAttendancePolicy,
    weeklySchedules,
    addWeeklySchedule,
    updateWeeklySchedule,
    deleteWeeklySchedule,
    attendanceConfig,
    updateAttendanceConfig
  } = useHRMS();

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  type ModalType = 
    | null 
    | 'attendancePolicy' 
    | 'holidayPolicy' 
    | 'weeklyPolicy' 
    | 'compOffRules' 
    | 'shiftPolicy' 
    | 'leavePolicy' 
    | 'automationRules' 
    | 'overtimeRules';

  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Form creation / editing state within modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state for each entity
  const [attendancePolicyForm, setAttendancePolicyForm] = useState({
    name: '',
    mode: 'Selfie & AI Face Scan' as AttendancePolicyItem['mode'],
    status: 'Active' as 'Active' | 'Inactive',
    description: ''
  });

  const [shiftForm, setShiftForm] = useState({
    shiftName: '',
    startTime: '09:00',
    endTime: '18:00',
    gracePeriodMins: 15,
    breakDurationMins: 45,
    workingHours: 8.25,
    color: '#0E7490'
  });

  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    daysCount: 1,
    type: 'Mandatory' as HolidayItem['type'],
    applicableLocation: 'All Sites & Corporate'
  });

  const [leavePolicyForm, setLeavePolicyForm] = useState({
    name: '',
    code: '',
    quotaDays: 12,
    monthlyAccrual: '1 Day / Month',
    carryForward: 'Max 10 Days',
    color: '#0E7490',
    status: 'Active' as 'Active' | 'Inactive',
    description: ''
  });

  const [weeklyScheduleForm, setWeeklyScheduleForm] = useState({
    name: '',
    workingDays: 'Mon, Tue, Wed, Thu, Fri, Sat',
    offDays: 'Sunday',
    isDefault: false
  });

  // Local state for rules forms to allow Cancel vs Save
  const [rulesConfigState, setRulesConfigState] = useState({ ...attendanceConfig });

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const openModal = (type: ModalType) => {
    setActiveModal(type);
    setIsFormOpen(false);
    setEditingId(null);
    setRulesConfigState({ ...attendanceConfig });
  };

  const closeModal = () => {
    setActiveModal(null);
    setIsFormOpen(false);
    setEditingId(null);
  };

  /* ---------------- HANDLERS FOR ATTENDANCE POLICIES ---------------- */
  const handleSaveAttendancePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendancePolicyForm.name) return;

    if (editingId) {
      updateAttendancePolicy(editingId, attendancePolicyForm);
      triggerToast(`Attendance policy "${attendancePolicyForm.name}" updated!`);
    } else {
      addAttendancePolicy(attendancePolicyForm);
      triggerToast(`New attendance policy "${attendancePolicyForm.name}" created! Active in Attendance capture.`);
    }
    setIsFormOpen(false);
    setEditingId(null);
    setAttendancePolicyForm({ name: '', mode: 'Selfie & AI Face Scan', status: 'Active', description: '' });
  };

  const startEditAttendancePolicy = (item: AttendancePolicyItem) => {
    setAttendancePolicyForm({
      name: item.name,
      mode: item.mode,
      status: item.status,
      description: item.description || ''
    });
    setEditingId(item.id);
    setIsFormOpen(true);
  };

  // Helper to dynamically calculate working hours directly from start and end time (Full shift duration)
  const calcWorkingHours = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const cleanStart = String(start).trim().slice(0, 5);
    const cleanEnd = String(end).trim().slice(0, 5);
    const [startH, startM] = cleanStart.split(':').map(Number);
    const [endH, endM] = cleanEnd.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

    let totalMins = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMins < 0) totalMins += 24 * 60; // Overnight shift

    return Math.round((totalMins / 60) * 100) / 100;
  };

  /* ---------------- HANDLERS FOR SHIFT POLICIES ---------------- */
  const handleSaveShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftForm.shiftName) return;

    const computedHours = calcWorkingHours(shiftForm.startTime, shiftForm.endTime);
    const finalHours = shiftForm.workingHours ? Number(shiftForm.workingHours) : computedHours;

    if (editingId) {
      updateShift(editingId, {
        shiftName: shiftForm.shiftName,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        breakDurationMins: Number(shiftForm.breakDurationMins),
        workingHours: finalHours || computedHours,
        color: shiftForm.color
      });
      triggerToast(`Shift policy "${shiftForm.shiftName}" updated! Reflected in Shift Management.`);
    } else {
      addShift({
        shiftName: shiftForm.shiftName,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        gracePeriodMins: 0,
        breakDurationMins: Number(shiftForm.breakDurationMins),
        workingHours: finalHours || computedHours,
        assignments: [],
        color: shiftForm.color
      });
      triggerToast(`New Shift "${shiftForm.shiftName}" created! Live in Shift Management.`);
    }
    setIsFormOpen(false);
    setEditingId(null);
    setShiftForm({ shiftName: '', startTime: '09:30', endTime: '18:30', gracePeriodMins: 15, breakDurationMins: 45, workingHours: 9, color: '#0E7490' });
  };

  const startEditShift = (shift: Shift) => {
    const cleanStart = (shift.startTime || '09:30').slice(0, 5);
    const cleanEnd = (shift.endTime || '18:30').slice(0, 5);
    const breakMins = shift.breakDurationMins || 45;
    const computedHours = calcWorkingHours(cleanStart, cleanEnd);

    setShiftForm({
      shiftName: shift.shiftName,
      startTime: cleanStart,
      endTime: cleanEnd,
      gracePeriodMins: shift.gracePeriodMins ?? 15,
      breakDurationMins: breakMins,
      workingHours: computedHours > 0 ? computedHours : (shift.workingHours || 9),
      color: shift.color || '#0E7490'
    });
    setEditingId(shift.id);
    setIsFormOpen(true);
  };

  /* ---------------- HANDLERS FOR HOLIDAY POLICIES ---------------- */
  const handleSaveHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name) return;

    if (editingId) {
      updateHolidayPolicy(editingId, holidayForm);
      triggerToast(`Holiday "${holidayForm.name}" updated! Calendar synchronized.`);
    } else {
      addHolidayPolicy(holidayForm);
      triggerToast(`New Holiday "${holidayForm.name}" created! Live in Leave Management calendar.`);
    }
    setIsFormOpen(false);
    setEditingId(null);
    setHolidayForm({ name: '', date: new Date().toISOString().split('T')[0], daysCount: 1, type: 'Mandatory', applicableLocation: 'All Sites & Corporate' });
  };

  const startEditHoliday = (h: HolidayItem) => {
    setHolidayForm({
      name: h.name,
      date: h.date,
      daysCount: h.daysCount,
      type: h.type,
      applicableLocation: h.applicableLocation || 'All Sites & Corporate'
    });
    setEditingId(h.id);
    setIsFormOpen(true);
  };

  /* ---------------- HANDLERS FOR LEAVE POLICIES ---------------- */
  const handleSaveLeavePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leavePolicyForm.name) return;

    if (editingId) {
      updateLeavePolicy(editingId, {
        ...leavePolicyForm,
        quotaDays: Number(leavePolicyForm.quotaDays)
      });
      triggerToast(`Leave Policy "${leavePolicyForm.name}" updated! Live in Leave Management.`);
    } else {
      addLeavePolicy({
        ...leavePolicyForm,
        quotaDays: Number(leavePolicyForm.quotaDays)
      });
      triggerToast(`New Leave Policy "${leavePolicyForm.name}" created! Now available in Apply Leave modal.`);
    }
    setIsFormOpen(false);
    setEditingId(null);
    setLeavePolicyForm({ name: '', code: '', quotaDays: 12, monthlyAccrual: '1 Day / Month', carryForward: 'Max 10 Days', color: '#0E7490', status: 'Active', description: '' });
  };

  const startEditLeavePolicy = (lp: LeavePolicyItem) => {
    setLeavePolicyForm({
      name: lp.name,
      code: lp.code,
      quotaDays: lp.quotaDays,
      monthlyAccrual: lp.monthlyAccrual,
      carryForward: lp.carryForward,
      color: lp.color,
      status: lp.status,
      description: lp.description || ''
    });
    setEditingId(lp.id);
    setIsFormOpen(true);
  };

  /* ---------------- HANDLERS FOR WEEKLY POLICIES ---------------- */
  const handleSaveWeeklySchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weeklyScheduleForm.name) return;

    if (editingId) {
      updateWeeklySchedule(editingId, weeklyScheduleForm);
      triggerToast(`Weekly Schedule "${weeklyScheduleForm.name}" updated!`);
    } else {
      addWeeklySchedule(weeklyScheduleForm);
      triggerToast(`New Weekly Schedule "${weeklyScheduleForm.name}" created!`);
    }
    setIsFormOpen(false);
    setEditingId(null);
    setWeeklyScheduleForm({ name: '', workingDays: 'Mon, Tue, Wed, Thu, Fri, Sat', offDays: 'Sunday', isDefault: false });
  };

  const startEditWeeklySchedule = (ws: WeeklyScheduleItem) => {
    setWeeklyScheduleForm({
      name: ws.name,
      workingDays: ws.workingDays,
      offDays: ws.offDays,
      isDefault: Boolean(ws.isDefault)
    });
    setEditingId(ws.id);
    setIsFormOpen(true);
  };

  /* ---------------- HANDLERS FOR RULES (CONFIG) ---------------- */
  const handleSaveRulesConfig = (e: React.FormEvent) => {
    e.preventDefault();
    updateAttendanceConfig(rulesConfigState);
    triggerToast('Attendance rules & automation parameters saved successfully! Live in all modules.');
    closeModal();
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto', fontFamily: 'var(--font-primary)', paddingBottom: '60px', boxSizing: 'border-box' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          color: '#1e40af',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.12)',
          fontWeight: 700,
          zIndex: 1500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} color="#0E7490" /> {toastMessage}
        </div>
      )}

      {/* Header & Subtitle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div>
          <h2 style={{ 
            fontSize: '1.45rem', 
            fontWeight: 800, 
            color: '#0f172a', 
            margin: '0 0 4px 0',
            letterSpacing: '-0.02em'
          }}>
            Attendance Settings
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#64748b', margin: 0, fontWeight: 500 }}>
            Manage and Update Your Attendance Policies, Shifts, Holidays & Leave Quotas
          </p>
        </div>
      </div>

      {/* TWO-COLUMN GRID OF THE 8 POLICY CARDS (100% ALIGNED, STRICT 76px HEIGHT) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '14px',
        width: '100%',
        boxSizing: 'border-box'
      }}>

        {/* ROW 1 Left: Attendance Policy */}
        <div 
          onClick={() => openModal('attendancePolicy')}
          className="business-setting-card"
          style={cardStyle}
          onMouseEnter={handleCardHover}
          onMouseLeave={handleCardLeave}
        >
          <div style={iconBadgeStyle('#ECFEFF', '#0E7490')}>
            <CalendarCheck size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={labelStyle}>Attendance Policy</div>
            <div style={valueStyle}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {attendancePolicies.length} Attendance Policy Created
              </span>
              <span style={{ ...pillStyle('#ECFEFF', '#0E7490'), flexShrink: 0, marginLeft: '6px' }}>Active</span>
            </div>
          </div>
          <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>

        {/* ROW 1 Right: Shift Policy */}
        <div 
          onClick={() => openModal('shiftPolicy')}
          className="business-setting-card"
          style={cardStyle}
          onMouseEnter={handleCardHover}
          onMouseLeave={handleCardLeave}
        >
          <div style={iconBadgeStyle('#FEF3C7', '#D97706')}>
            <Star size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={labelStyle}>Shift Policy</div>
            <div style={valueStyle}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {shifts.length} Shift Policy Created
              </span>
              <span style={{ ...pillStyle('#FEF3C7', '#D97706'), flexShrink: 0, marginLeft: '6px' }}>{shifts.length} Shifts Live</span>
            </div>
          </div>
          <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>

        {/* ROW 2 Left: Holiday Policy */}
        <div 
          onClick={() => openModal('holidayPolicy')}
          className="business-setting-card"
          style={cardStyle}
          onMouseEnter={handleCardHover}
          onMouseLeave={handleCardLeave}
        >
          <div style={iconBadgeStyle('#F0FDF4', '#16A34A')}>
            <Calendar size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={labelStyle}>Holiday Policy</div>
            <div style={valueStyle}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {holidayPolicies.length} Holiday Policy Created
              </span>
              <span style={{ ...pillStyle('#DCFCE7', '#166534'), flexShrink: 0, marginLeft: '6px' }}>Synced</span>
            </div>
          </div>
          <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>

        {/* ROW 2 Right: Leave Policy */}
        <div 
          onClick={() => openModal('leavePolicy')}
          className="business-setting-card"
          style={cardStyle}
          onMouseEnter={handleCardHover}
          onMouseLeave={handleCardLeave}
        >
          <div style={iconBadgeStyle('#EFF6FF', '#2563EB')}>
            <CalendarDays size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={labelStyle}>Leave Policy</div>
            <div style={valueStyle}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {leavePolicies.length} Leave Policy Created
              </span>
              <span style={{ ...pillStyle('#EFF6FF', '#1D4ED8'), flexShrink: 0, marginLeft: '6px' }}>Live in Leaves</span>
            </div>
          </div>
          <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>

        {/* ROW 3 Left: Weekly Policy */}
        <div 
          onClick={() => openModal('weeklyPolicy')}
          className="business-setting-card"
          style={cardStyle}
          onMouseEnter={handleCardHover}
          onMouseLeave={handleCardLeave}
        >
          <div style={iconBadgeStyle('#F1F5F9', '#475569')}>
            <FileText size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={labelStyle}>Weekly Policy</div>
            <div style={valueStyle}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {weeklySchedules.length} Weekly Policy Created
              </span>
              <span style={{ ...pillStyle('#F1F5F9', '#334155'), flexShrink: 0, marginLeft: '6px' }}>Roster</span>
            </div>
          </div>
          <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>

        {/* ROW 3 Right: Automation Rules */}
        <div 
          onClick={() => openModal('automationRules')}
          className="business-setting-card"
          style={cardStyle}
          onMouseEnter={handleCardHover}
          onMouseLeave={handleCardLeave}
        >
          <div style={iconBadgeStyle('#EDE9FE', '#7C3AED')}>
            <Settings2 size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={labelStyle}>Automation Rules</div>
            <div style={valueStyle} title={`Late Grace: ${attendanceConfig.lateGraceMinutes}m • Auto-Approval ${attendanceConfig.enableAutoApproval ? 'ON' : 'OFF'}`}>
              Late Grace: {attendanceConfig.lateGraceMinutes}m • Auto-Approval
            </div>
          </div>
          <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>

        {/* ROW 4 Left: Comp Off Rules */}
        <div 
          onClick={() => openModal('compOffRules')}
          className="business-setting-card"
          style={cardStyle}
          onMouseEnter={handleCardHover}
          onMouseLeave={handleCardLeave}
        >
          <div style={iconBadgeStyle('#FDF2F8', '#DB2777')}>
            <Gift size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={labelStyle}>Comp Off Rules</div>
            <div style={valueStyle} title={`Min ${attendanceConfig.compOffMinHoursFullDay}h • Validity ${attendanceConfig.compOffValidityDays} Days`}>
              Min {attendanceConfig.compOffMinHoursFullDay}h • Validity {attendanceConfig.compOffValidityDays}d
              <span style={{ ...pillStyle('#FDF2F8', '#BE185D'), flexShrink: 0, marginLeft: '6px' }}>Comp-Off</span>
            </div>
          </div>
          <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>

        {/* ROW 4 Right: Overtime Rules */}
        <div 
          onClick={() => openModal('overtimeRules')}
          className="business-setting-card"
          style={cardStyle}
          onMouseEnter={handleCardHover}
          onMouseLeave={handleCardLeave}
        >
          <div style={iconBadgeStyle('#FEF3C7', '#B45309')}>
            <Clock size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={labelStyle}>Overtime Rules</div>
            <div style={valueStyle} title={`Normal OT: ${attendanceConfig.normalOtMultiplier}x • Holiday OT: ${attendanceConfig.holidayOtMultiplier}x`}>
              OT: {attendanceConfig.normalOtMultiplier}x / {attendanceConfig.holidayOtMultiplier}x
              <span style={{ ...pillStyle('#FEF3C7', '#B45309'), flexShrink: 0, marginLeft: '6px' }}>Payroll Sync</span>
            </div>
          </div>
          <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>

      </div>

      {/* FULLY INTERACTIVE CRUD MODALS (CREATE, EDIT, DELETE & SYNC) */}
      {activeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1400,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0',
            position: 'relative'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CalendarCheck size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {activeModal === 'attendancePolicy' && 'Attendance Capture Policies & Punch Modes'}
                    {activeModal === 'shiftPolicy' && 'Shift Policy & Work Schedules'}
                    {activeModal === 'holidayPolicy' && 'Enterprise Holiday Calendar Policies'}
                    {activeModal === 'leavePolicy' && 'Annual Leave Entitlement Policies'}
                    {activeModal === 'weeklyPolicy' && 'Weekly Work Schedules & Rest Days'}
                    {activeModal === 'automationRules' && 'Attendance Automation & Grace Rules'}
                    {activeModal === 'compOffRules' && 'Compensatory Off (Comp-Off) Policy'}
                    {activeModal === 'overtimeRules' && 'Overtime Multipliers & Rules'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Created policies immediately reflect and function in their respective HRM modules
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* ==================== 1. ATTENDANCE POLICY MODAL ==================== */}
            {activeModal === 'attendancePolicy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.88rem', color: '#334155', fontWeight: 700 }}>
                    Active Attendance Policies ({attendancePolicies.length}):
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setAttendancePolicyForm({ name: '', mode: 'Selfie & AI Face Scan', status: 'Active', description: '' });
                      setIsFormOpen(prev => !prev);
                    }}
                    style={primaryButtonStyle}
                  >
                    {isFormOpen ? <X size={14} /> : <Plus size={14} />}
                    {isFormOpen ? 'Close Form' : 'Add Attendance Policy'}
                  </button>
                </div>

                {/* Form to Add / Edit Attendance Policy */}
                {isFormOpen && (
                  <form onSubmit={handleSaveAttendancePolicy} style={formContainerStyle}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0E7490', marginBottom: '8px' }}>
                      {editingId ? 'Edit Attendance Policy' : 'Create New Attendance Policy'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={modalLabelStyle}>Policy Name <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Site Engineers Telemetry"
                          value={attendancePolicyForm.name}
                          onChange={e => setAttendancePolicyForm({ ...attendancePolicyForm, name: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Capture Mode <span style={{ color: '#EF4444' }}>*</span></label>
                        <select
                          value={attendancePolicyForm.mode}
                          onChange={e => setAttendancePolicyForm({ ...attendancePolicyForm, mode: e.target.value as any })}
                          style={modalInputStyle}
                        >
                          <option value="Selfie & AI Face Scan">Selfie & AI Face Scan</option>
                          <option value="Geofenced Mobile">Geofenced Mobile (GPS)</option>
                          <option value="Biometric Fingerprint">Biometric Fingerprint</option>
                          <option value="Location Telemetry">Location Telemetry</option>
                          <option value="Face Scan + Punch Out">Face Scan + Punch Out</option>
                          <option value="Manual Web Punch">Manual Web Punch</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={modalLabelStyle}>Description</label>
                      <input
                        type="text"
                        placeholder="e.g. Dual verification for staff at Madhavaram Site"
                        value={attendancePolicyForm.description}
                        onChange={e => setAttendancePolicyForm({ ...attendancePolicyForm, description: e.target.value })}
                        style={modalInputStyle}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button type="button" onClick={() => setIsFormOpen(false)} style={secondaryButtonStyle}>Cancel</button>
                      <button type="submit" style={primaryButtonStyle}>{editingId ? 'Update Policy' : 'Save Policy'}</button>
                    </div>
                  </form>
                )}

                {/* List of Policies with Edit / Delete */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {attendancePolicies.map(ap => (
                    <div key={ap.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{ap.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                          Mode: <strong>{ap.mode}</strong> {ap.description && `• ${ap.description}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={pillStyle('#DCFCE7', '#166534')}>{ap.status}</span>
                        <button type="button" onClick={() => startEditAttendancePolicy(ap)} title="Edit Policy" style={iconActionBtnStyle('#0E7490')}>
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => { deleteAttendancePolicy(ap.id); triggerToast(`Policy "${ap.name}" removed.`); }} title="Delete Policy" style={iconActionBtnStyle('#EF4444')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Global Punch Controls */}
                <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>Global Punch In/Out Controls</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.84rem', color: '#334155' }}>Track In & Out Timestamps</span>
                    <ToggleSwitch checked={attendanceConfig.trackInOutTime} onChange={(v) => updateAttendanceConfig({ trackInOutTime: v })} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.84rem', color: '#334155' }}>Compulsory Punch-Out for Full Attendance</span>
                    <ToggleSwitch checked={attendanceConfig.noAttendanceWithoutPunchOut} onChange={(v) => updateAttendanceConfig({ noAttendanceWithoutPunchOut: v })} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.84rem', color: '#334155' }}>Allow Multiple Punches in Same Shift</span>
                    <ToggleSwitch checked={attendanceConfig.allowMultiplePunches} onChange={(v) => updateAttendanceConfig({ allowMultiplePunches: v })} />
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 2. SHIFT POLICY MODAL ==================== */}
            {activeModal === 'shiftPolicy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.88rem', color: '#334155', fontWeight: 700 }}>
                      Active Shift Policies ({shifts.length}):
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#0E7490', marginLeft: '8px', fontWeight: 600 }}>
                      (Synchronized with Shift Management)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setShiftForm({ shiftName: '', startTime: '09:00', endTime: '18:00', gracePeriodMins: 15, breakDurationMins: 45, workingHours: 8.25, color: '#0E7490' });
                      setIsFormOpen(prev => !prev);
                    }}
                    style={primaryButtonStyle}
                  >
                    {isFormOpen ? <X size={14} /> : <Plus size={14} />}
                    {isFormOpen ? 'Close Form' : 'Create Shift Policy'}
                  </button>
                </div>

                {/* Form to Add / Edit Shift */}
                {isFormOpen && (
                  <form onSubmit={handleSaveShift} style={formContainerStyle}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0E7490', marginBottom: '8px' }}>
                      {editingId ? 'Edit Shift Policy' : 'Create New Shift Policy'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={modalLabelStyle}>Shift Name <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Afternoon Fabrication Shift"
                          value={shiftForm.shiftName}
                          onChange={e => setShiftForm({ ...shiftForm, shiftName: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Start Time <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="time"
                          required
                          value={shiftForm.startTime}
                          onChange={e => {
                            const newStart = e.target.value;
                            setShiftForm(prev => {
                              const computed = newStart && prev.endTime ? calcWorkingHours(newStart, prev.endTime) : prev.workingHours;
                              return { ...prev, startTime: newStart, workingHours: computed > 0 ? computed : prev.workingHours };
                            });
                          }}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>End Time <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="time"
                          required
                          value={shiftForm.endTime}
                          onChange={e => {
                            const newEnd = e.target.value;
                            setShiftForm(prev => {
                              const computed = prev.startTime && newEnd ? calcWorkingHours(prev.startTime, newEnd) : prev.workingHours;
                              return { ...prev, endTime: newEnd, workingHours: computed > 0 ? computed : prev.workingHours };
                            });
                          }}
                          style={modalInputStyle}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={modalLabelStyle}>Working Hours</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={shiftForm.workingHours}
                          onChange={e => setShiftForm({ ...shiftForm, workingHours: Number(e.target.value) })}
                          style={modalInputStyle}
                        />
                        <small style={{ color: '#0E7490', fontSize: '0.74rem', display: 'block', marginTop: '4px', fontWeight: 600 }}>
                          ⚡ Auto-calculated: {calcWorkingHours(shiftForm.startTime, shiftForm.endTime)} hrs
                        </small>
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Color Accent</label>
                        <select
                          value={shiftForm.color}
                          onChange={e => setShiftForm({ ...shiftForm, color: e.target.value })}
                          style={modalInputStyle}
                        >
                          <option value="#0E7490">Dark Teal</option>
                          <option value="#2563EB">Royal Blue</option>
                          <option value="#16A34A">Forest Green</option>
                          <option value="#7C3AED">Purple</option>
                          <option value="#D97706">Amber Orange</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button type="button" onClick={() => setIsFormOpen(false)} style={secondaryButtonStyle}>Cancel</button>
                      <button type="submit" style={primaryButtonStyle}>{editingId ? 'Update Shift' : 'Save Shift Policy'}</button>
                    </div>
                  </form>
                )}

                {/* List of Shifts with Edit / Delete */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {shifts.map(sp => (
                    <div key={sp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: sp.color || '#0E7490' }} />
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{sp.shiftName}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            Hours: {sp.startTime} - {sp.endTime} ({sp.workingHours || 8} hrs)
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={pillStyle('#ECFEFF', '#0E7490')}>{sp.assignedEmployeeCount || 0} Staff</span>
                        <button type="button" onClick={() => startEditShift(sp)} title="Edit Shift" style={iconActionBtnStyle('#0E7490')}>
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => { deleteShift(sp.id); triggerToast(`Shift "${sp.shiftName}" deleted.`); }} title="Delete Shift" style={iconActionBtnStyle('#EF4444')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== 3. HOLIDAY POLICY MODAL ==================== */}
            {activeModal === 'holidayPolicy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.88rem', color: '#334155', fontWeight: 700 }}>
                      Holiday Calendar Policies ({holidayPolicies.length}):
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#16A34A', marginLeft: '8px', fontWeight: 600 }}>
                      (Live in Leave Management Calendar)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setHolidayForm({ name: '', date: new Date().toISOString().split('T')[0], daysCount: 1, type: 'Mandatory', applicableLocation: 'All Sites & Corporate' });
                      setIsFormOpen(prev => !prev);
                    }}
                    style={primaryButtonStyle}
                  >
                    {isFormOpen ? <X size={14} /> : <Plus size={14} />}
                    {isFormOpen ? 'Close Form' : 'Add Holiday Policy'}
                  </button>
                </div>

                {/* Form to Add / Edit Holiday */}
                {isFormOpen && (
                  <form onSubmit={handleSaveHoliday} style={formContainerStyle}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0E7490', marginBottom: '8px' }}>
                      {editingId ? 'Edit Holiday Policy' : 'Add New Corporate Holiday'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={modalLabelStyle}>Holiday Name <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Ayudha Pooja"
                          value={holidayForm.name}
                          onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Date <span style={{ color: '#EF4444' }}>*</span></label>
                        <DateInput
                          required
                          value={holidayForm.date}
                          onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={modalLabelStyle}>Days Count</label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={holidayForm.daysCount}
                          onChange={e => setHolidayForm({ ...holidayForm, daysCount: Number(e.target.value) })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Category</label>
                        <select
                          value={holidayForm.type}
                          onChange={e => setHolidayForm({ ...holidayForm, type: e.target.value as any })}
                          style={modalInputStyle}
                        >
                          <option value="Mandatory">Mandatory Statutory</option>
                          <option value="Festival">Festival Break</option>
                          <option value="State Specific">State Specific</option>
                          <option value="Compulsory">Compulsory National</option>
                          <option value="Optional">Optional / Floating</option>
                        </select>
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Location Scope</label>
                        <input
                          type="text"
                          value={holidayForm.applicableLocation}
                          onChange={e => setHolidayForm({ ...holidayForm, applicableLocation: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button type="button" onClick={() => setIsFormOpen(false)} style={secondaryButtonStyle}>Cancel</button>
                      <button type="submit" style={primaryButtonStyle}>{editingId ? 'Update Holiday' : 'Save Holiday'}</button>
                    </div>
                  </form>
                )}

                {/* List of Holidays with Edit / Delete */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {holidayPolicies.map(hp => (
                    <div key={hp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{hp.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          Date: <strong>{formatDateDDMMYYYY(hp.date)}</strong> • Paid: {hp.daysCount} Day(s) {hp.applicableLocation && `• ${hp.applicableLocation}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={pillStyle('#FEF3C7', '#D97706')}>{hp.type}</span>
                        <button type="button" onClick={() => startEditHoliday(hp)} title="Edit Holiday" style={iconActionBtnStyle('#0E7490')}>
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => { deleteHolidayPolicy(hp.id); triggerToast(`Holiday "${hp.name}" removed.`); }} title="Delete Holiday" style={iconActionBtnStyle('#EF4444')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== 4. LEAVE POLICY MODAL ==================== */}
            {activeModal === 'leavePolicy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.88rem', color: '#334155', fontWeight: 700 }}>
                      Configured Leave Policies ({leavePolicies.length}):
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#2563EB', marginLeft: '8px', fontWeight: 600 }}>
                      (Synchronized with Apply Leave Dropdown & Quotas)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setLeavePolicyForm({ name: '', code: '', quotaDays: 12, monthlyAccrual: '1 Day / Month', carryForward: 'Max 10 Days', color: '#0E7490', status: 'Active', description: '' });
                      setIsFormOpen(prev => !prev);
                    }}
                    style={primaryButtonStyle}
                  >
                    {isFormOpen ? <X size={14} /> : <Plus size={14} />}
                    {isFormOpen ? 'Close Form' : 'Create Leave Policy'}
                  </button>
                </div>

                {/* Form to Add / Edit Leave Policy */}
                {isFormOpen && (
                  <form onSubmit={handleSaveLeavePolicy} style={formContainerStyle}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0E7490', marginBottom: '8px' }}>
                      {editingId ? 'Edit Leave Policy' : 'Create New Leave Policy'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={modalLabelStyle}>Policy Name <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Bereavement Leave"
                          value={leavePolicyForm.name}
                          onChange={e => setLeavePolicyForm({ ...leavePolicyForm, name: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Short Code <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. BL"
                          value={leavePolicyForm.code}
                          onChange={e => setLeavePolicyForm({ ...leavePolicyForm, code: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Quota (Days/Year) <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="number"
                          required
                          value={leavePolicyForm.quotaDays}
                          onChange={e => setLeavePolicyForm({ ...leavePolicyForm, quotaDays: Number(e.target.value) })}
                          style={modalInputStyle}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={modalLabelStyle}>Monthly Accrual</label>
                        <input
                          type="text"
                          value={leavePolicyForm.monthlyAccrual}
                          onChange={e => setLeavePolicyForm({ ...leavePolicyForm, monthlyAccrual: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Carry Forward</label>
                        <input
                          type="text"
                          value={leavePolicyForm.carryForward}
                          onChange={e => setLeavePolicyForm({ ...leavePolicyForm, carryForward: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Color Badge</label>
                        <select
                          value={leavePolicyForm.color}
                          onChange={e => setLeavePolicyForm({ ...leavePolicyForm, color: e.target.value })}
                          style={modalInputStyle}
                        >
                          <option value="#0E7490">Dark Teal</option>
                          <option value="#2563EB">Royal Blue</option>
                          <option value="#16A34A">Green</option>
                          <option value="#DB2777">Rose Pink</option>
                          <option value="#7C3AED">Purple</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button type="button" onClick={() => setIsFormOpen(false)} style={secondaryButtonStyle}>Cancel</button>
                      <button type="submit" style={primaryButtonStyle}>{editingId ? 'Update Policy' : 'Save Policy'}</button>
                    </div>
                  </form>
                )}

                {/* List of Leave Policies with Edit / Delete */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {leavePolicies.map(lp => (
                    <div key={lp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: lp.color || '#0E7490' }} />
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{lp.name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            Quota: <strong>{lp.quotaDays} Days/Year</strong> • Accrual: {lp.monthlyAccrual} • Carry: {lp.carryForward}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={pillStyle('#EFF6FF', '#1D4ED8')}>{lp.status}</span>
                        <button type="button" onClick={() => startEditLeavePolicy(lp)} title="Edit Leave Policy" style={iconActionBtnStyle('#0E7490')}>
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => { deleteLeavePolicy(lp.id); triggerToast(`Leave Policy "${lp.name}" deleted.`); }} title="Delete Leave Policy" style={iconActionBtnStyle('#EF4444')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== 5. WEEKLY POLICY MODAL ==================== */}
            {activeModal === 'weeklyPolicy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.88rem', color: '#334155', fontWeight: 700 }}>
                    Configured Weekly Roster Policies ({weeklySchedules.length}):
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setWeeklyScheduleForm({ name: '', workingDays: 'Monday to Saturday', offDays: 'Sunday Only', isDefault: false });
                      setIsFormOpen(prev => !prev);
                    }}
                    style={primaryButtonStyle}
                  >
                    {isFormOpen ? 'Close Form' : 'Add Weekly Schedule'}
                  </button>
                </div>

                {isFormOpen && (
                  <form onSubmit={handleSaveWeeklySchedule} style={formContainerStyle}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0E7490', marginBottom: '8px' }}>
                      {editingId ? 'Edit Weekly Schedule' : 'Create Weekly Schedule'}
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={modalLabelStyle}>Schedule Name <span style={{ color: '#EF4444' }}>*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 5-Day Corporate Schedule"
                        value={weeklyScheduleForm.name}
                        onChange={e => setWeeklyScheduleForm({ ...weeklyScheduleForm, name: e.target.value })}
                        style={modalInputStyle}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                      <div>
                        <label style={modalLabelStyle}>Working Days <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Mon, Tue, Wed, Thu, Fri"
                          value={weeklyScheduleForm.workingDays}
                          onChange={e => setWeeklyScheduleForm({ ...weeklyScheduleForm, workingDays: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                      <div>
                        <label style={modalLabelStyle}>Off Days <span style={{ color: '#EF4444' }}>*</span></label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Saturday, Sunday"
                          value={weeklyScheduleForm.offDays}
                          onChange={e => setWeeklyScheduleForm({ ...weeklyScheduleForm, offDays: e.target.value })}
                          style={modalInputStyle}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button type="button" onClick={() => setIsFormOpen(false)} style={secondaryButtonStyle}>Cancel</button>
                      <button type="submit" style={primaryButtonStyle}>{editingId ? 'Update Schedule' : 'Save Schedule'}</button>
                    </div>
                  </form>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {weeklySchedules.map(wp => (
                    <div key={wp.id} style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{wp.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={pillStyle('#F1F5F9', '#334155')}>Off: {wp.offDays}</span>
                          <button type="button" onClick={() => startEditWeeklySchedule(wp)} title="Edit" style={iconActionBtnStyle('#0E7490')}>
                            <Edit2 size={14} />
                          </button>
                          <button type="button" onClick={() => { deleteWeeklySchedule(wp.id); triggerToast(`Schedule "${wp.name}" deleted.`); }} title="Delete" style={iconActionBtnStyle('#EF4444')}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>Working: {wp.workingDays}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== 6. AUTOMATION RULES MODAL ==================== */}
            {activeModal === 'automationRules' && (
              <form onSubmit={handleSaveRulesConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <label style={modalLabelStyle}>Late Entry Grace Window</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={rulesConfigState.lateGraceMinutes}
                        onChange={(e) => setRulesConfigState({
                          ...rulesConfigState,
                          lateGraceMinutes: Number(e.target.value)
                        })}
                        style={{ width: '90px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                      />
                      <span style={{ fontSize: '0.82rem', color: '#64748b' }}>minutes</span>
                    </div>
                  </div>

                  <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <label style={modalLabelStyle}>Max Permitted Late Marks</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={rulesConfigState.maxLateEntriesPerMonth}
                        onChange={(e) => setRulesConfigState({
                          ...rulesConfigState,
                          maxLateEntriesPerMonth: Number(e.target.value)
                        })}
                        style={{ width: '90px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                      />
                      <span style={{ fontSize: '0.82rem', color: '#64748b' }}>per month</span>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={modalLabelStyle}>Late Penalty Deduction Rule</label>
                  <input
                    type="text"
                    value={rulesConfigState.latePenaltyDeduction}
                    onChange={(e) => setRulesConfigState({ ...rulesConfigState, latePenaltyDeduction: e.target.value })}
                    style={modalInputStyle}
                  />
                </div>

                <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>Auto-Approve Regularization Requests</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Automatically resolve pending attendance disputes</div>
                    </div>
                    <ToggleSwitch
                      checked={rulesConfigState.enableAutoApproval}
                      onChange={(v) => setRulesConfigState({ ...rulesConfigState, enableAutoApproval: v })}
                    />
                  </div>
                  {rulesConfigState.enableAutoApproval && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                      <span style={{ fontSize: '0.82rem', color: '#475569' }}>Automatically approve after:</span>
                      <input
                        type="number"
                        min={1}
                        max={14}
                        value={rulesConfigState.autoApproveDays}
                        onChange={(e) => setRulesConfigState({ ...rulesConfigState, autoApproveDays: Number(e.target.value) })}
                        style={{ width: '70px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700, textAlign: 'center' }}
                      />
                      <span style={{ fontSize: '0.82rem', color: '#64748b' }}>days</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={closeModal} style={secondaryButtonStyle}>Cancel</button>
                  <button type="submit" style={primaryButtonStyle}>Save Automation Rules</button>
                </div>
              </form>
            )}

            {/* ==================== 7. COMP OFF RULES MODAL ==================== */}
            {activeModal === 'compOffRules' && (
              <form onSubmit={handleSaveRulesConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={modalLabelStyle}>Min Hours for Half-Day Comp Off</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={rulesConfigState.compOffMinHoursHalfDay}
                      onChange={(e) => setRulesConfigState({ ...rulesConfigState, compOffMinHoursHalfDay: Number(e.target.value) })}
                      style={modalInputStyle}
                    />
                  </div>
                  <div>
                    <label style={modalLabelStyle}>Min Hours for Full-Day Comp Off</label>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={rulesConfigState.compOffMinHoursFullDay}
                      onChange={(e) => setRulesConfigState({ ...rulesConfigState, compOffMinHoursFullDay: Number(e.target.value) })}
                      style={modalInputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={modalLabelStyle}>Comp Off Expiry / Validity (Days)</label>
                    <input
                      type="number"
                      min={15}
                      max={365}
                      value={rulesConfigState.compOffValidityDays}
                      onChange={(e) => setRulesConfigState({ ...rulesConfigState, compOffValidityDays: Number(e.target.value) })}
                      style={modalInputStyle}
                    />
                  </div>
                  <div>
                    <label style={modalLabelStyle}>Max Accrual per Month</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={rulesConfigState.compOffMaxAccrualPerMonth}
                      onChange={(e) => setRulesConfigState({ ...rulesConfigState, compOffMaxAccrualPerMonth: Number(e.target.value) })}
                      style={modalInputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#334155' }}>Require Manager Approval for Comp Off</span>
                  <ToggleSwitch
                    checked={rulesConfigState.compOffRequireManagerApproval}
                    onChange={(v) => setRulesConfigState({ ...rulesConfigState, compOffRequireManagerApproval: v })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={closeModal} style={secondaryButtonStyle}>Cancel</button>
                  <button type="submit" style={primaryButtonStyle}>Save Comp Off Rules</button>
                </div>
              </form>
            )}

            {/* ==================== 8. OVERTIME RULES MODAL ==================== */}
            {activeModal === 'overtimeRules' && (
              <form onSubmit={handleSaveRulesConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>Enable Overtime Tracking & Compensation</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Overtime calculations automatically reflect in monthly payroll</div>
                  </div>
                  <ToggleSwitch
                    checked={rulesConfigState.enableOvertime}
                    onChange={(v) => setRulesConfigState({ ...rulesConfigState, enableOvertime: v })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={modalLabelStyle}>Normal Day OT Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      min={1}
                      max={5}
                      value={rulesConfigState.normalOtMultiplier}
                      onChange={(e) => setRulesConfigState({ ...rulesConfigState, normalOtMultiplier: Number(e.target.value) })}
                      style={modalInputStyle}
                    />
                  </div>
                  <div>
                    <label style={modalLabelStyle}>Holiday / Rest Day OT Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      min={1}
                      max={5}
                      value={rulesConfigState.holidayOtMultiplier}
                      onChange={(e) => setRulesConfigState({ ...rulesConfigState, holidayOtMultiplier: Number(e.target.value) })}
                      style={modalInputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={modalLabelStyle}>Min OT Trigger Minutes</label>
                    <input
                      type="number"
                      min={15}
                      max={120}
                      value={rulesConfigState.minOtTriggerMinutes}
                      onChange={(e) => setRulesConfigState({ ...rulesConfigState, minOtTriggerMinutes: Number(e.target.value) })}
                      style={modalInputStyle}
                    />
                  </div>
                  <div>
                    <label style={modalLabelStyle}>Max OT Hours per Month Cap</label>
                    <input
                      type="number"
                      min={10}
                      max={150}
                      value={rulesConfigState.maxOtHoursPerMonth}
                      onChange={(e) => setRulesConfigState({ ...rulesConfigState, maxOtHoursPerMonth: Number(e.target.value) })}
                      style={modalInputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#334155' }}>Auto-Credit OT Earnings directly into Payroll</span>
                  <ToggleSwitch
                    checked={rulesConfigState.autoCreditOtToPayroll}
                    onChange={(v) => setRulesConfigState({ ...rulesConfigState, autoCreditOtToPayroll: v })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={closeModal} style={secondaryButtonStyle}>Cancel</button>
                  <button type="submit" style={primaryButtonStyle}>Save Overtime Rules</button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

// UI Styling Constants adhering strictly to VRM Enterprise HRM Design System
const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '14px',
  border: '1px solid #e2e8f0',
  padding: '0 18px',
  height: '76px',
  minHeight: '76px',
  maxHeight: '76px',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
  boxSizing: 'border-box',
  overflow: 'hidden',
  width: '100%',
  minWidth: 0
};

const handleCardHover = (e: React.MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.borderColor = '#0E7490';
  e.currentTarget.style.boxShadow = '0 4px 14px rgba(14, 116, 144, 0.1)';
  e.currentTarget.style.transform = 'translateY(-1px)';
};

const handleCardLeave = (e: React.MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.borderColor = '#e2e8f0';
  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.03)';
  e.currentTarget.style.transform = 'translateY(0)';
};

const iconBadgeStyle = (bg: string, color: string): React.CSSProperties => ({
  width: '42px',
  height: '42px',
  borderRadius: '10px',
  backgroundColor: bg,
  color: color,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
});

const labelStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '3px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const valueStyle: React.CSSProperties = {
  fontSize: '0.88rem',
  fontWeight: 600,
  color: '#0f172a',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: 'flex',
  alignItems: 'center',
  minWidth: 0
};

const pillStyle = (bg: string, color: string): React.CSSProperties => ({
  backgroundColor: bg,
  color: color,
  fontSize: '0.72rem',
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: '999px',
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0
});

const modalLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '6px'
};

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1.5px solid #cbd5e1',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: '#ffffff'
};

const formContainerStyle: React.CSSProperties = {
  backgroundColor: '#f0fdfa',
  border: '1.5px solid #99f6e4',
  borderRadius: '14px',
  padding: '16px',
  marginBottom: '10px'
};

const primaryButtonStyle: React.CSSProperties = {
  backgroundColor: '#0E7490',
  color: '#ffffff',
  padding: '8px 16px',
  borderRadius: '10px',
  border: 'none',
  fontSize: '0.82rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  boxShadow: '0 2px 8px rgba(14, 116, 144, 0.25)'
};

const secondaryButtonStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#475569',
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  fontWeight: 700,
  cursor: 'pointer'
};

const iconActionBtnStyle = (color: string): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: color,
  padding: '5px',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease'
});
