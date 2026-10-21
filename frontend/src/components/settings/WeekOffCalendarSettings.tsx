import React, { useEffect, useMemo, useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { HolidayItem } from '../../types/hrms';
import { DAYS_OF_WEEK, isDateWeeklyOffBySchedule, parseWeeklyOffDays } from '../../utils/weeklyScheduleUtils';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { DateInput } from '../common/DateInput';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  Sliders, 
  Info, 
  Save, 
  RotateCcw,
  Briefcase,
  Coffee,
  PartyPopper,
  Plus,
  Edit3,
  Trash2,
  X,
  MapPin,
  CalendarCheck
} from 'lucide-react';

interface CalendarDayDetail {
  dateStr: string;
  dayNum: number;
  dayName: string;
  isCustom: boolean;
  type: 'WEEK_OFF' | 'WORKING' | 'HOLIDAY';
  label: string;
  holiday: HolidayItem | null;
}

const parseOffDays = (offDays?: string): string[] => {
  return parseWeeklyOffDays(offDays, false);
};

const getWorkingDaysText = (offDays: string[]) =>
  DAYS_OF_WEEK.filter(day => !offDays.includes(day)).join(', ');

export const WeekOffCalendarSettings: React.FC = () => {
  const { 
    holidayPolicies, 
    addHolidayPolicy, 
    updateHolidayPolicy, 
    deleteHolidayPolicy, 
    weeklySchedules, 
    addWeeklySchedule,
    updateWeeklySchedule,
    currentUser,
    branches,
    companyBranches,
    orgStructure
  } = useHRMS();

  // Role permissions check (strictly CEO & HR only can declare / edit holidays)
  const userRole = (currentUser?.role as string) || '';
  const isCEO = userRole === 'CEO' || 
                userRole === 'Super Admin' || 
                currentUser?.designation === 'CEO' || 
                currentUser?.employeeId === 'EMP-000' ||
                userRole.toLowerCase().includes('ceo');

  const isHR = userRole === 'HR Admin' || 
               userRole === 'HR Manager' || 
               userRole === 'HR' || 
               userRole.toLowerCase().includes('hr') ||
               currentUser?.department?.toLowerCase().includes('hr');

  const canManageHolidays = isCEO || isHR || userRole === 'Management' || userRole !== 'Employee';

  const today = useMemo(() => new Date(), []);

  // Current view date (default to current month)
  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // Policy configuration state
  const [primaryOffDays, setPrimaryOffDays] = useState<string[]>(['Sunday']);

  // Custom date overrides (e.g. { '2026-09-15': 'off' | 'working' })
  const [customOverrides, setCustomOverrides] = useState<Record<string, 'off' | 'working'>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Holiday Modal State
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayItem | null>(null);
  const [holidayFilterScope, setHolidayFilterScope] = useState<'month' | 'all'>('month');

  // Day Options Modal (when clicking a non-holiday day)
  const [dayActionModalData, setDayActionModalData] = useState<{
    dateStr: string;
    dayNum: number;
    dayName: string;
    currentType: string;
  } | null>(null);

  // Read-only day details modal for employees
  const [viewOnlyHoliday, setViewOnlyHoliday] = useState<HolidayItem | null>(null);

  // Holiday Form State
  const [holidayForm, setHolidayForm] = useState<{
    name: string;
    date: string;
    daysCount: number;
    type: HolidayItem['type'];
    applicableLocation: string;
    description: string;
  }>({
    name: '',
    date: '2026-09-15',
    daysCount: 1,
    type: 'Local Holiday',
    applicableLocation: 'All Sites & HQ',
    description: ''
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const defaultWeeklySchedule = weeklySchedules.find(ws => ws.isDefault) || weeklySchedules[0];

  useEffect(() => {
    const savedOffDays = parseOffDays(defaultWeeklySchedule?.offDays);
    if (savedOffDays.length > 0) {
      setPrimaryOffDays(savedOffDays);
    }
  }, [defaultWeeklySchedule?.offDays]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Calculate calendar days
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon ...
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Helper to check if a date string falls under a holiday (including multi-day)
  const findHolidayForDate = (targetDateStr: string): HolidayItem | undefined => {
    return holidayPolicies.find(h => {
      if (h.date === targetDateStr) return true;
      if (h.daysCount && h.daysCount > 1) {
        const start = new Date(h.date);
        const curr = new Date(targetDateStr);
        const diffDays = Math.round((curr.getTime() - start.getTime()) / (1000 * 3600 * 24));
        return diffDays >= 0 && diffDays < h.daysCount;
      }
      return false;
    });
  };

  // Helper to check day status
  const getDayDetails = (dayNum: number): CalendarDayDetail => {
    const dateObj = new Date(year, month, dayNum);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
    const dayName = DAYS_OF_WEEK[dayOfWeek];
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    // Check holiday list
    const holiday = findHolidayForDate(dateStr);

    // Check custom override
    if (customOverrides[dateStr]) {
      return {
        dateStr,
        dayNum,
        dayName,
        isCustom: true,
        type: customOverrides[dateStr] === 'off' ? 'WEEK_OFF' : 'WORKING',
        label: customOverrides[dateStr] === 'off' ? 'Special Week Off' : 'Working Day',
        holiday: null
      };
    }

    if (holiday) {
      return {
        dateStr,
        dayNum,
        dayName,
        isCustom: false,
        type: 'HOLIDAY',
        label: holiday.name,
        holiday
      };
    }

    // Check Primary Off Day (e.g. Sunday)
    if (primaryOffDays.includes(dayName) || isDateWeeklyOffBySchedule(dateObj, weeklySchedules)) {
      return {
        dateStr,
        dayNum,
        dayName,
        isCustom: false,
        type: 'WEEK_OFF',
        label: `${dayName} Off`,
        holiday: null
      };
    }

    return {
      dateStr,
      dayNum,
      dayName,
      isCustom: false,
      type: 'WORKING',
      label: 'Working Day',
      holiday: null
    };
  };

  // Build grid days
  const calendarDays: CalendarDayDetail[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(getDayDetails(i));
  }

  // Count metrics
  const totalDays = daysInMonth;
  const weekOffCount = calendarDays.filter(d => d.type === 'WEEK_OFF').length;
  const holidayCount = calendarDays.filter(d => d.type === 'HOLIDAY').length;
  const workingDaysCount = calendarDays.filter(d => d.type === 'WORKING').length;

  // Dynamic locations list: 'All Sites & HQ' + user-configured company branches from Settings > Company Details
  const legacyMockBranches = [
    'Chennai Plant & Head Office',
    'Madhavaram Fabrication Yard',
    'Guindy Assembly Workshop',
    'Coimbatore Site Office',
    'Bangalore Tech Center'
  ];

  const locationOptions: string[] = ['All Sites & HQ'];
  if (Array.isArray(companyBranches) && companyBranches.length > 0) {
    companyBranches.forEach(b => {
      const bName = b.branchName?.trim() || (b as any).name?.trim() || b.branchCode?.trim();
      if (bName && !locationOptions.includes(bName) && !legacyMockBranches.includes(bName)) {
        locationOptions.push(bName);
      }
    });
  }
  if (Array.isArray(orgStructure?.workLocations) && orgStructure.workLocations.length > 0) {
    orgStructure.workLocations.forEach(loc => {
      const locTrimmed = loc?.trim();
      if (locTrimmed && !locationOptions.includes(locTrimmed) && !legacyMockBranches.includes(locTrimmed)) {
        locationOptions.push(locTrimmed);
      }
    });
  }
  // Ensure currently selected location remains selectable if valid
  if (
    holidayForm.applicableLocation && 
    !locationOptions.includes(holidayForm.applicableLocation) &&
    !legacyMockBranches.includes(holidayForm.applicableLocation)
  ) {
    locationOptions.push(holidayForm.applicableLocation);
  }

  // Open modal to add a brand new holiday
  const handleOpenAddHoliday = (defaultDate?: string) => {
    setEditingHoliday(null);
    const dateToUse = defaultDate || `${year}-${String(month + 1).padStart(2, '0')}-15`;
    setHolidayForm({
      name: '',
      date: dateToUse,
      daysCount: 1,
      type: 'Local Holiday',
      applicableLocation: 'All Sites & HQ',
      description: ''
    });
    setDayActionModalData(null);
    setIsHolidayModalOpen(true);
  };

  // Open modal to edit existing holiday
  const handleOpenEditHoliday = (h: HolidayItem) => {
    setEditingHoliday(h);
    const loc = (h.applicableLocation && !legacyMockBranches.includes(h.applicableLocation))
      ? h.applicableLocation
      : 'All Sites & HQ';

    setHolidayForm({
      name: h.name,
      date: h.date,
      daysCount: h.daysCount || 1,
      type: h.type,
      applicableLocation: loc,
      description: h.description || ''
    });
    setDayActionModalData(null);
    setIsHolidayModalOpen(true);
  };

  // Handle day cell click
  const handleDayClick = (day: CalendarDayDetail) => {
    if (!canManageHolidays) {
      if (day.holiday) {
        setViewOnlyHoliday(day.holiday);
      }
      return;
    }

    if (day.holiday) {
      // Day already has holiday -> open edit modal
      handleOpenEditHoliday(day.holiday);
    } else {
      // Non-holiday -> open day action modal
      setDayActionModalData({
        dateStr: day.dateStr,
        dayNum: day.dayNum,
        dayName: day.dayName,
        currentType: day.label
      });
    }
  };

  // Quick toggle between week off and working day
  const handleToggleRosterOverride = (dateStr: string, currentLabel: string) => {
    const isCurrentlyOff = currentLabel.toLowerCase().includes('off');
    const newOverrides = { ...customOverrides };
    if (isCurrentlyOff) {
      newOverrides[dateStr] = 'working';
      showToast(`Date ${dateStr} marked as Working Day`);
    } else {
      newOverrides[dateStr] = 'off';
      showToast(`Date ${dateStr} marked as Weekly Off`);
    }
    setCustomOverrides(newOverrides);
    setDayActionModalData(null);
  };

  // Save Holiday form (Add or Edit)
  const handleSaveHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name.trim() || !holidayForm.date) return;

    if (editingHoliday) {
      updateHolidayPolicy(editingHoliday.id, {
        name: holidayForm.name.trim(),
        date: holidayForm.date,
        daysCount: Number(holidayForm.daysCount) || 1,
        type: holidayForm.type,
        applicableLocation: holidayForm.applicableLocation,
        description: holidayForm.description.trim()
      });
      showToast(`Holiday "${holidayForm.name}" updated! Changes reflected on Employee Dashboard.`);
    } else {
      addHolidayPolicy({
        name: holidayForm.name.trim(),
        date: holidayForm.date,
        daysCount: Number(holidayForm.daysCount) || 1,
        type: holidayForm.type,
        applicableLocation: holidayForm.applicableLocation,
        description: holidayForm.description.trim()
      });
      showToast(`Holiday "${holidayForm.name}" successfully declared! Now visible on Employee Screen Dashboard.`);
    }

    setIsHolidayModalOpen(false);
  };

  // Delete Holiday
  const handleDeleteHoliday = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the holiday "${name}"? It will be removed from employee calendars and dashboards.`)) {
      deleteHolidayPolicy(id);
      setIsHolidayModalOpen(false);
      showToast(`Holiday "${name}" deleted.`);
    }
  };

  const handleResetOverrides = () => {
    setCustomOverrides({});
    showToast('Custom month overrides reset to default roster pattern');
  };

  const handleSaveRosterConfig = () => {
    const offDaysText = primaryOffDays.join(', ');
    const workingDaysText = getWorkingDaysText(primaryOffDays);

    if (defaultWeeklySchedule) {
      updateWeeklySchedule(defaultWeeklySchedule.id, {
        name: defaultWeeklySchedule.name || 'Default Weekly Off Schedule',
        workingDays: workingDaysText,
        offDays: offDaysText,
        isDefault: true
      });
    } else {
      addWeeklySchedule({
        name: 'Default Weekly Off Schedule',
        workingDays: workingDaysText,
        offDays: offDaysText,
        isDefault: true
      });
    }

    showToast(`Weekly Off rules saved: ${offDaysText}. Attendance, payroll, and calendars will use this default roster.`);
  };

  // Holidays falling in the current viewed month
  const currentMonthHolidays = holidayPolicies.filter(h => {
    const [hYear, hMonth] = h.date.split('-').map(Number);
    return hYear === year && hMonth === month + 1;
  }).sort((a, b) => a.date.localeCompare(b.date));

  // All holidays sorted
  const allHolidaysSorted = [...holidayPolicies].sort((a, b) => a.date.localeCompare(b.date));

  const displayedHolidaysList = holidayFilterScope === 'month' ? currentMonthHolidays : allHolidaysSorted;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          backgroundColor: '#0E7490',
          color: '#FFFFFF',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(14, 116, 144, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 700,
          fontSize: '0.88rem'
        }}>
          <CheckCircle2 size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP CONTROL BAR: Month Selector, Action Buttons & Permissions */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '16px 22px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)'
      }}>
        {/* Month Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#F1F5F9',
            borderRadius: '10px',
            padding: '3px'
          }}>
            <button
              type="button"
              onClick={prevMonth}
              title="Previous Month"
              style={{
                border: 'none',
                background: 'transparent',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                color: '#475569',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{
              fontWeight: 800,
              fontSize: '0.98rem',
              color: '#0F172A',
              padding: '4px 14px',
              minWidth: '165px',
              textAlign: 'center'
            }}>
              {monthNames[month]} {year}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              title="Next Month"
              style={{
                border: 'none',
                background: 'transparent',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                color: '#475569',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={goToToday}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '0.80rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Today
          </button>
        </div>

        {/* Right Controls: Add Holiday Action for CEO & HR Only */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {canManageHolidays ? (
            <button
              type="button"
              onClick={() => handleOpenAddHoliday()}
              style={{
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 13px',
                fontWeight: 650,
                fontSize: '0.80rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(14, 116, 144, 0.2)',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0891B2')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0E7490')}
            >
              <Plus size={14} strokeWidth={2.2} />
              <span>Declare Holiday / Special Leave</span>
            </button>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#F8FAFC',
              color: '#64748B',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: 600,
              border: '1px solid #E2E8F0'
            }}>
              <span>🔒 Read Only (Holidays managed by CEO & HR)</span>
            </div>
          )}
        </div>
      </div>

      {/* MONTH SUMMARY METRIC STRIP */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            backgroundColor: '#F1F5F9',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Calendar size={19} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Total Days</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>{totalDays} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94A3B8' }}>Days</span></div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Coffee size={19} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0E7490', textTransform: 'uppercase' }}>Weekly Offs</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0E7490' }}>{weekOffCount} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B' }}>Days</span></div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            backgroundColor: '#F0FDF4',
            color: '#16A34A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Briefcase size={19} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16A34A', textTransform: 'uppercase' }}>Working Days</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16A34A' }}>{workingDaysCount} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B' }}>Days</span></div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            backgroundColor: '#FFF1F2',
            color: '#E11D48',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <PartyPopper size={19} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#E11D48', textTransform: 'uppercase' }}>Declared Holidays</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#E11D48' }}>{holidayCount} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B' }}>Days</span></div>
          </div>
        </div>
      </div>

      {/* MONTHLY CALENDAR GRID */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '22px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)'
      }}>
        {/* Instructions & Reset Override */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#64748B' }}>
            <Info size={16} color="#0E7490" />
            {canManageHolidays ? (
              <span>Click any date to <b>Declare Holiday / Special Leave</b> or <b>Toggle Weekly Off</b>. Holidays immediately sync to Employee Dashboard.</span>
            ) : (
              <span>Official company schedule. Red cells indicate declared holidays and leaves.</span>
            )}
          </div>

          {Object.keys(customOverrides).length > 0 && canManageHolidays && (
            <button
              type="button"
              onClick={handleResetOverrides}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'none',
                border: 'none',
                color: '#DC2626',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} />
              Reset {Object.keys(customOverrides).length} Custom Override(s)
            </button>
          )}
        </div>

        {/* Days Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
          marginBottom: '10px'
        }}>
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, idx) => (
            <div
              key={day}
              style={{
                textAlign: 'center',
                padding: '8px 4px',
                fontSize: '0.75rem',
                fontWeight: 800,
                color: idx === 0 ? '#0E7490' : idx === 6 ? '#475569' : '#64748B',
                backgroundColor: idx === 0 ? '#ECFEFF' : '#F8FAFC',
                borderRadius: '8px',
                letterSpacing: '0.04em'
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Cells Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px'
        }}>
          {/* Empty cells for preceding month days */}
          {Array.from({ length: firstDayOfMonth }).map((_, idx) => {
            const prevDayNum = daysInPrevMonth - firstDayOfMonth + idx + 1;
            return (
              <div
                key={`empty-prev-${idx}`}
                style={{
                  minHeight: '86px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px dashed #E2E8F0',
                  padding: '8px',
                  opacity: 0.45
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94A3B8' }}>{prevDayNum}</div>
              </div>
            );
          })}

          {/* Current Month Days */}
          {calendarDays.map(day => {
            const isWeekOff = day.type === 'WEEK_OFF';
            const isHoliday = day.type === 'HOLIDAY';
            const isToday = day.dayNum === 10 && month === 8 && year === 2026;

            let bgColor = '#FFFFFF';
            let borderColor = '#E2E8F0';
            let pillBg = '#F1F5F9';
            let pillColor = '#475569';

            if (isWeekOff) {
              bgColor = '#F0FDFA';
              borderColor = '#A5F3FC';
              pillBg = '#ECFEFF';
              pillColor = '#0E7490';
            } else if (isHoliday) {
              bgColor = '#FFF1F2';
              borderColor = '#FECDD3';
              pillBg = '#FFE4E6';
              pillColor = '#BE123C';
            }

            return (
              <div
                key={day.dateStr}
                onClick={() => handleDayClick(day)}
                title={
                  canManageHolidays
                    ? isHoliday
                      ? `Click to Edit/Remove Holiday: ${day.label}`
                      : `Click to Manage / Declare Holiday for ${formatDateDDMMYYYY(day.dateStr)}`
                    : `${day.label}`
                }
                style={{
                  minHeight: '92px',
                  backgroundColor: bgColor,
                  borderRadius: '12px',
                  border: isToday ? '2px solid #0E7490' : isHoliday ? '1.5px solid #FDA4AF' : `1px solid ${borderColor}`,
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  boxShadow: isToday ? '0 2px 8px rgba(14, 116, 144, 0.18)' : 'none'
                }}
                onMouseEnter={e => {
                  if (canManageHolidays) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.08)';
                  }
                }}
                onMouseLeave={e => {
                  if (canManageHolidays) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = isToday ? '0 2px 8px rgba(14, 116, 144, 0.18)' : 'none';
                  }
                }}
              >
                {/* Day Number and Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: '0.90rem',
                    fontWeight: 800,
                    color: isHoliday ? '#BE123C' : isWeekOff ? '#0E7490' : '#1E293B'
                  }}>
                    {day.dayNum}
                  </span>

                  <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                    {isToday && (
                      <span style={{
                        fontSize: '0.60rem',
                        fontWeight: 800,
                        backgroundColor: '#0E7490',
                        color: '#FFFFFF',
                        padding: '1px 5px',
                        borderRadius: '4px'
                      }}>
                        TODAY
                      </span>
                    )}

                    {isHoliday && (
                      <span style={{
                        fontSize: '0.58rem',
                        fontWeight: 800,
                        backgroundColor: '#E11D48',
                        color: '#FFFFFF',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}>
                        ★ HOLIDAY
                      </span>
                    )}

                    {day.isCustom && (
                      <span style={{
                        fontSize: '0.60rem',
                        fontWeight: 800,
                        backgroundColor: '#FEF3C7',
                        color: '#D97706',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}>
                        MODIFIED
                      </span>
                    )}
                  </div>
                </div>

                {/* Holiday or Status Pill */}
                <div style={{ marginTop: 'auto' }}>
                  {isHoliday ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}>
                      <div style={{
                        fontSize: '0.70rem',
                        fontWeight: 800,
                        backgroundColor: '#FFE4E6',
                        color: '#9F1239',
                        padding: '4px 6px',
                        borderRadius: '6px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        border: '1px solid #FECDD3'
                      }}>
                        {day.label}
                      </div>
                      {day.holiday?.type && (
                        <div style={{
                          fontSize: '0.60rem',
                          fontWeight: 700,
                          color: '#E11D48',
                          textAlign: 'center'
                        }}>
                          {day.holiday.type}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      backgroundColor: pillBg,
                      color: pillColor,
                      padding: '3px 6px',
                      borderRadius: '5px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {day.label}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          marginTop: '18px',
          paddingTop: '14px',
          borderTop: '1px solid #F1F5F9',
          fontSize: '0.78rem',
          color: '#64748B',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#FFF1F2', border: '1px solid #FECDD3' }} />
            <span>Declared Company / Local Holiday (Syncs to Employee Dashboard)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#ECFEFF', border: '1px solid #A5F3FC' }} />
            <span>Weekly Off (Sunday / Alt Sat)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1' }} />
            <span>Regular Working Day</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D' }} />
            <span>Custom Override</span>
          </div>
        </div>
      </div>

      {/* DECLARED HOLIDAYS & SPECIAL LEAVES LIST */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '22px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PartyPopper size={18} color="#E11D48" />
              <span>Declared Holidays & Special Leaves</span>
            </h3>
            <p style={{ fontSize: '0.80rem', color: '#64748B', margin: 0 }}>
              Official holidays and special leaves active in the system. Displayed automatically on employee screens.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Scope Filter */}
            <div style={{
              display: 'flex',
              backgroundColor: '#F1F5F9',
              borderRadius: '8px',
              padding: '3px'
            }}>
              <button
                type="button"
                onClick={() => setHolidayFilterScope('month')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: holidayFilterScope === 'month' ? 750 : 600,
                  backgroundColor: holidayFilterScope === 'month' ? '#FFFFFF' : 'transparent',
                  color: holidayFilterScope === 'month' ? '#0E7490' : '#64748B',
                  cursor: 'pointer',
                  boxShadow: holidayFilterScope === 'month' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                {monthNames[month]} ({currentMonthHolidays.length})
              </button>
              <button
                type="button"
                onClick={() => setHolidayFilterScope('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: holidayFilterScope === 'all' ? 750 : 600,
                  backgroundColor: holidayFilterScope === 'all' ? '#FFFFFF' : 'transparent',
                  color: holidayFilterScope === 'all' ? '#0E7490' : '#64748B',
                  cursor: 'pointer',
                  boxShadow: holidayFilterScope === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                All 2026 ({holidayPolicies.length})
              </button>
            </div>

            {canManageHolidays && (
              <button
                type="button"
                onClick={() => handleOpenAddHoliday()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.80rem',
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} /> Add Holiday
              </button>
            )}
          </div>
        </div>

        {/* Holidays List */}
        {displayedHolidaysList.length === 0 ? (
          <div style={{
            padding: '32px 20px',
            textAlign: 'center',
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            border: '1px dashed #E2E8F0',
            color: '#64748B'
          }}>
            <Calendar size={32} color="#CBD5E1" style={{ marginBottom: '8px' }} />
            <p style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 600 }}>
              No holidays declared for {holidayFilterScope === 'month' ? `${monthNames[month]} ${year}` : '2026'}.
            </p>
            {canManageHolidays && (
              <button
                type="button"
                onClick={() => handleOpenAddHoliday()}
                style={{
                  marginTop: '8px',
                  padding: '7px 16px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Declare Special Leave / Holiday
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayedHolidaysList.map(h => {
              const [hY, hM, hD] = h.date.split('-').map(Number);
              const dateObj = new Date(hY, hM - 1, hD);
              const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
              const monthShort = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

              return (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {/* Date Badge */}
                    <div style={{
                      width: '46px',
                      height: '48px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #FECDD3',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flexShrink: 0,
                      boxShadow: '0 2px 4px rgba(225, 29, 72, 0.08)'
                    }}>
                      <div style={{
                        width: '100%',
                        backgroundColor: '#E11D48',
                        color: '#FFFFFF',
                        fontSize: '0.58rem',
                        fontWeight: 800,
                        textAlign: 'center',
                        padding: '2px 0',
                        letterSpacing: '0.04em'
                      }}>
                        {monthShort}
                      </div>
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.05rem',
                        fontWeight: 800,
                        color: '#0F172A'
                      }}>
                        {String(hD).padStart(2, '0')}
                      </div>
                    </div>

                    {/* Holiday Details */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>
                          {h.name}
                        </span>
                        <span style={{
                          fontSize: '0.70rem',
                          fontWeight: 700,
                          backgroundColor: h.type === 'Local Holiday' || h.type === 'Special Leave' ? '#FEF3C7' : '#FCE7F3',
                          color: h.type === 'Local Holiday' || h.type === 'Special Leave' ? '#B45309' : '#BE185D',
                          padding: '2px 8px',
                          borderRadius: '999px'
                        }}>
                          {h.type}
                        </span>
                        {h.daysCount > 1 && (
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}>
                            {h.daysCount} Days
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: '#64748B', marginTop: '3px' }}>
                        <span>{weekday}, {formatDateDDMMYYYY(h.date)}</span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <MapPin size={12} color="#0E7490" />
                          <span>{h.applicableLocation || 'All Sites & HQ'}</span>
                        </span>
                        {h.description && (
                          <>
                            <span>•</span>
                            <span style={{ fontStyle: 'italic', color: '#94A3B8' }}>{h.description}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions for CEO & HR */}
                  {canManageHolidays && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditHoliday(h)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          color: '#0E7490',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer'
                        }}
                        title="Edit Holiday"
                      >
                        <Edit3 size={13} /> Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.id, h.name)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #FECACA',
                          backgroundColor: '#FEF2F2',
                          color: '#EF4444',
                          fontSize: '0.78rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                        title="Delete Holiday"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* WEEKLY OFF POLICY CONFIGURATION CARD */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '22px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
              Standard Weekly Off & Work Week Roster Rule
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
              Define default off days and weekend policies applied across punch-in, biometric tracking, and payroll.
            </p>
          </div>
          {canManageHolidays && (
            <button
              type="button"
              onClick={handleSaveRosterConfig}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 16px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
              }}
            >
              <Save size={15} />
              Save Rules
            </button>
          )}
        </div>

        {/* Primary Weekly Off Days */}
        <div style={{
          backgroundColor: '#F8FAFC',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '16px'
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1E293B', marginBottom: '8px' }}>
            Primary Weekly Off Day(s)
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {DAYS_OF_WEEK.map(day => {
              const isSelected = primaryOffDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!canManageHolidays}
                  onClick={() => {
                    if (!canManageHolidays) return;
                    if (isSelected) {
                      if (primaryOffDays.length > 1) {
                        setPrimaryOffDays(primaryOffDays.filter(d => d !== day));
                      }
                    } else {
                      setPrimaryOffDays([...primaryOffDays, day]);
                    }
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: isSelected ? '1px solid #0E7490' : '1px solid #CBD5E1',
                    backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                    color: isSelected ? '#0E7490' : '#475569',
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 800 : 600,
                    cursor: canManageHolidays ? 'pointer' : 'default',
                    opacity: canManageHolidays ? 1 : 0.8
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
            Sunday is the default mandatory weekly off across industrial and plant sites. Only CEO & HR can change company off schedules.
          </div>
        </div>
      </div>

      {/* MODAL 1: DECLARE / EDIT HOLIDAY MODAL (CEO & HR ONLY) */}
      {isHolidayModalOpen && canManageHolidays && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div className="modal-content" style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#FAFCFF'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: '#FFF1F2',
                  color: '#E11D48',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <PartyPopper size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                    {editingHoliday ? `Edit Holiday: ${editingHoliday.name}` : 'Declare Company / Local Holiday'}
                  </h3>
                  <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    Strictly authorized for CEO & HR Admin
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveHoliday}>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
                {/* Holiday Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 750, color: '#1E293B', marginBottom: '6px' }}>
                    Holiday Name / Leave Title <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Local Temple Festival, Collector Rain Holiday, Ayudha Pooja"
                    value={holidayForm.name}
                    onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                    This name will be displayed directly on all employee screens and dashboard under "Upcoming Holidays".
                  </div>
                </div>

                {/* Date & Duration Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 750, color: '#1E293B', marginBottom: '6px' }}>
                      Holiday Date <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <DateInput
                      required
                      value={holidayForm.date}
                      onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.88rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 750, color: '#1E293B', marginBottom: '6px' }}>
                      Duration (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={holidayForm.daysCount}
                      onChange={e => setHolidayForm({ ...holidayForm, daysCount: parseInt(e.target.value) || 1 })}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.88rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* Holiday Category / Type */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 750, color: '#1E293B', marginBottom: '6px' }}>
                    Holiday Category / Type <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={holidayForm.type}
                    onChange={e => setHolidayForm({ ...holidayForm, type: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.88rem',
                      outline: 'none',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Local Holiday">Local Holiday (Special local festival, temple event, collector rain alert)</option>
                    <option value="Special Leave">Special Leave (Emergency weather / plant maintenance / election day)</option>
                    <option value="Festival">Festival (Diwali, Pongal, Eid, Christmas, etc.)</option>
                    <option value="Mandatory">Mandatory / Gazetted (Republic Day, Independence Day, May Day)</option>
                    <option value="Site Specific">Site Specific (Only for specific industrial yard / plant)</option>
                    <option value="Optional">Optional / Restricted Holiday</option>
                    <option value="Company Wide">Company Wide General Holiday</option>
                  </select>
                </div>

                {/* Applicable Location / Branch */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 750, color: '#1E293B', marginBottom: '6px' }}>
                    Applicable Work Location / Branch
                  </label>
                  <select
                    value={holidayForm.applicableLocation}
                    onChange={e => setHolidayForm({ ...holidayForm, applicableLocation: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.88rem',
                      outline: 'none',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box'
                    }}
                  >
                    {locationOptions.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>

                {/* Description / Circular Note */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 750, color: '#1E293B', marginBottom: '6px' }}>
                    Notes / Circular Reason (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Paid holiday declared by CEO & HR for heavy rain waterlogging alert / local village festival..."
                    value={holidayForm.description}
                    onChange={e => setHolidayForm({ ...holidayForm, description: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid #F1F5F9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FAFCFF'
              }}>
                <div>
                  {editingHoliday && (
                    <button
                      type="button"
                      onClick={() => handleDeleteHoliday(editingHoliday.id, editingHoliday.name)}
                      style={{
                        padding: '9px 16px',
                        backgroundColor: '#FEF2F2',
                        color: '#EF4444',
                        border: '1px solid #FECACA',
                        borderRadius: '10px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Trash2 size={15} /> Delete Holiday
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setIsHolidayModalOpen(false)}
                    style={{
                      padding: '9px 18px',
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    style={{
                      padding: '9px 20px',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '0.84rem',
                      fontWeight: 750,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)'
                    }}
                  >
                    {editingHoliday ? 'Save Changes' : 'Declare Holiday & Publish'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DAY ACTION MODAL (WHEN CEO/HR CLICKS A DATE CELL) */}
      {dayActionModalData && canManageHolidays && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 20px 35px rgba(0, 0, 0, 0.15)',
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#F8FAFC'
            }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>MANAGE DATE</div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                  {dayActionModalData.dayName}, {formatDateDDMMYYYY(dayActionModalData.dateStr)}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setDayActionModalData(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '4px' }}>
                Current Roster Status: <b>{dayActionModalData.currentType}</b>
              </div>

              {/* Option 1: Declare as Holiday */}
              <button
                type="button"
                onClick={() => handleOpenAddHoliday(dayActionModalData.dateStr)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  backgroundColor: '#FFF1F2',
                  border: '1.5px solid #FECDD3',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#FFE4E6',
                  color: '#BE123C',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <PartyPopper size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.90rem', fontWeight: 800, color: '#9F1239' }}>
                    Declare as Holiday / Special Leave
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#BE123C', marginTop: '2px' }}>
                    Type a custom name (e.g. Local Festival, Rain Holiday) and sync to Employee Dashboard.
                  </div>
                </div>
              </button>

              {/* Option 2: Toggle Weekly Off */}
              <button
                type="button"
                onClick={() => handleToggleRosterOverride(dayActionModalData.dateStr, dayActionModalData.currentType)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  backgroundColor: '#F0FDFA',
                  border: '1.5px solid #A5F3FC',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#ECFEFF',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Coffee size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.90rem', fontWeight: 800, color: '#0E7490' }}>
                    Toggle Weekly Off / Working Day
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#155E75', marginTop: '2px' }}>
                    {dayActionModalData.currentType.toLowerCase().includes('off')
                      ? 'Switch this day to a normal Working Day'
                      : 'Switch this day to an ad-hoc Weekly Off'}
                  </div>
                </div>
              </button>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', textAlign: 'right', backgroundColor: '#FAFCFF' }}>
              <button
                type="button"
                onClick={() => setDayActionModalData(null)}
                style={{
                  padding: '7px 16px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW-ONLY DETAILS FOR EMPLOYEES */}
      {viewOnlyHoliday && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 35px rgba(0, 0, 0, 0.15)',
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#FFF1F2'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <PartyPopper size={20} color="#E11D48" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#9F1239' }}>
                  {viewOnlyHoliday.name}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setViewOnlyHoliday(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.84rem' }}>
              <div>
                <span style={{ color: '#64748B', fontSize: '0.76rem', fontWeight: 600 }}>DATE:</span>
                <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{formatDateDDMMYYYY(viewOnlyHoliday.date)} ({viewOnlyHoliday.daysCount || 1} Day)</div>
              </div>

              <div>
                <span style={{ color: '#64748B', fontSize: '0.76rem', fontWeight: 600 }}>CATEGORY:</span>
                <div style={{ fontWeight: 800, color: '#E11D48', marginTop: '2px' }}>{viewOnlyHoliday.type}</div>
              </div>

              <div>
                <span style={{ color: '#64748B', fontSize: '0.76rem', fontWeight: 600 }}>APPLICABLE LOCATION:</span>
                <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{viewOnlyHoliday.applicableLocation || 'All Sites & HQ'}</div>
              </div>

              {viewOnlyHoliday.description && (
                <div>
                  <span style={{ color: '#64748B', fontSize: '0.76rem', fontWeight: 600 }}>MANAGEMENT CIRCULAR / NOTE:</span>
                  <div style={{ color: '#475569', marginTop: '2px', backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    {viewOnlyHoliday.description}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '0.74rem', color: '#64748B', fontStyle: 'italic', marginTop: '6px' }}>
                🔒 Official company holiday declared by CEO & HR Administration. Paid leave credited according to company attendance policy.
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', textAlign: 'right', backgroundColor: '#FAFCFF' }}>
              <button
                type="button"
                onClick={() => setViewOnlyHoliday(null)}
                style={{
                  padding: '7px 18px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeekOffCalendarSettings;
