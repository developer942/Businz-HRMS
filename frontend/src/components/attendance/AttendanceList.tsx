import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { AttendanceRecord } from '../../types/hrms';
import { formatDateDDMMYYYY, formatTimeDisplay } from '../../utils/dateUtils';
import { 
  CalendarCheck, 
  MapPin, 
  Search, 
  Download, 
  CheckCircle2, 
  Clock, 
  X, 
  Filter, 
  FileClock, 
  Send, 
  RotateCcw,
  Calendar as CalendarIcon,
  ShieldCheck,
  Edit3,
  Eye,
  Timer,
  Users,
  AlertTriangle,
  UserCheck,
  UserX,
  Building2,
  ChevronRight,
  Plus
} from 'lucide-react';
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal';
import { AttendanceCalendarView } from './AttendanceCalendarView';
import { AttendanceAuditLogModal } from './AttendanceAuditLogModal';
import { AttendanceTimePickerModal } from './AttendanceTimePickerModal';
import { ReviewOvertimeView } from './ReviewOvertimeView';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';

interface AttendanceListProps {
  onBackToInsights?: () => void;
}

export const AttendanceList: React.FC<AttendanceListProps> = ({ onBackToInsights }) => {
  const { 
    attendanceRecords, 
    markAttendance, 
    employees, 
    departments, 
    currentUser,
    submitAttendanceCorrection,
    correctAttendanceRecord,
    shifts
  } = useHRMS();

  // Multi-row selection state for attendance table
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<string[]>([]);

  const handleToggleAttendance = (id: string) => {
    setSelectedAttendanceIds(prev => 
      prev.includes(id) ? prev.filter(aId => aId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (filteredRecords.length > 0 && filteredRecords.every(r => selectedAttendanceIds.includes(r.id))) {
      setSelectedAttendanceIds(prev => prev.filter(id => !filteredRecords.some(r => r.id === id)));
    } else {
      const pageIds = filteredRecords.map(r => r.id);
      setSelectedAttendanceIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  // Navigation sub-tabs: 'cards' | 'review_ot' | 'table' | 'calendar'
  const [activeTab, setActiveTab] = useState<'cards' | 'review_ot' | 'table' | 'calendar'>('cards');
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  // Filters state
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterOtOnly, setFilterOtOnly] = useState<boolean>(false);

  // Modal & Picker target states
  const [correctionTargetRecord, setCorrectionTargetRecord] = useState<AttendanceRecord | null>(null);
  const [viewDetailRecord, setViewDetailRecord] = useState<AttendanceRecord | null>(null);
  const [timePickerTarget, setTimePickerTarget] = useState<AttendanceRecord | null>(null);

  // Employee Missed Punch Request Modal
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    missingType: 'Full Attendance' as 'Check In' | 'Check Out' | 'Full Attendance',
    requestedCheckIn: '09:30 AM',
    requestedCheckOut: '06:30 PM',
    reason: '',
    supportingDocUrl: ''
  });

  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = currentUser.employeeId || 'EMP-001';
    const emp = employees.find(e => e.employeeId === targetEmpId) || employees[0];
    submitAttendanceCorrection({
      employeeId: targetEmpId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : currentUser.name,
      department: emp?.department || currentUser.department || 'Engineering',
      date: correctionForm.date,
      missingType: correctionForm.missingType,
      requestedCheckIn: correctionForm.requestedCheckIn,
      requestedCheckOut: correctionForm.requestedCheckOut,
      reason: correctionForm.reason || 'Missed punch adjustment',
      supportingDocUrl: correctionForm.supportingDocUrl
    });
    setShowCorrectionModal(false);
    setCorrectionForm({
      date: new Date().toISOString().split('T')[0],
      missingType: 'Full Attendance',
      requestedCheckIn: '09:30 AM',
      requestedCheckOut: '06:30 PM',
      reason: '',
      supportingDocUrl: ''
    });
  };

  const isEmployeeRole = currentUser.role === 'Employee';
  const isManagerRole = currentUser.role === 'Department Manager';
  const isHRorCEO = 
    currentUser.role === 'Super Admin' || 
    currentUser.role === 'CEO' || 
    currentUser.role === 'HR Manager' || 
    currentUser.role === 'HR Admin' || 
    currentUser.role === 'Management' ||
    currentUser.role === 'Manager' ||
    currentUser.role === 'Department Manager';

  // Consolidate unique departments
  const uniqueDepartments = Array.from(
    new Set([
      ...departments.map(d => d.name),
      ...employees.map(e => e.department),
      ...attendanceRecords.map(a => a.department)
    ].filter(Boolean))
  );

  const isDepartmentMatch = (recordDept: string, targetDept: string) => {
    if (!targetDept || targetDept === 'All') return true;
    if (!recordDept) return false;
    const r = recordDept.trim().toLowerCase();
    const t = targetDept.trim().toLowerCase();
    if (r === t) return true;
    if ((r.includes('hr') || r.includes('human resources')) && (t.includes('hr') || t.includes('human resources'))) return true;
    if ((r.includes('it') || r.includes('engineering') || r.includes('tech')) && (t.includes('it') || t.includes('engineering') || t.includes('tech'))) return true;
    return r.includes(t) || t.includes(r);
  };

  const roleScopedAttendance = (
    isEmployeeRole
      ? attendanceRecords.filter(a => a.employeeId === (currentUser.employeeId || 'EMP-001'))
      : isManagerRole
      ? attendanceRecords.filter(a => isDepartmentMatch(a.department, currentUser.department))
      : attendanceRecords
  ).filter(a => a.employeeId !== 'EMP-000');

  const todayStr = new Date().toISOString().split('T')[0];
  const targetDateRecords = roleScopedAttendance.filter(a => !selectedDate || a.date === selectedDate);

  const countTotal = employees.filter(e => e.employeeId !== 'EMP-000' && e.email?.toLowerCase() !== 'admin@businz.com' && e.email?.toLowerCase() !== 'developer@businz.com' && e.designation !== 'Super Administrator').length;
  const countPresent = targetDateRecords.filter(a => a.status === 'Present' || a.status === 'Late').length;
  const countLate = targetDateRecords.filter(a => a.status === 'Late').length;
  const countAbsent = targetDateRecords.filter(a => a.status === 'Absent').length;
  const countHalfDay = targetDateRecords.filter(a => a.status === 'Half Day').length;
  const countLeave = targetDateRecords.filter(a => a.status === 'On Leave' || (a.status as string) === 'Leave').length;
  const countWfh = targetDateRecords.filter(a => a.status === 'Work From Home' || (a.status as string) === 'WFH').length;
  const countMissingPunch = targetDateRecords.filter(a => a.status === 'Missing Punch' || (!a.checkOut && a.checkIn && a.date !== todayStr)).length;
  const countOt = targetDateRecords.filter(a => (a.otHours && a.otHours > 0) || (a.workingHours && a.workingHours > 8.5)).length;

  const filteredRecords = roleScopedAttendance.filter(a => {
    const matchesDate = !selectedDate || a.date === selectedDate;
    const matchesStatus = selectedStatus === 'All' 
      ? true 
      : selectedStatus === 'Leave' 
      ? (a.status === 'On Leave' || (a.status as string) === 'Leave')
      : selectedStatus === 'WFH'
      ? (a.status === 'Work From Home' || (a.status as string) === 'WFH')
      : a.status === selectedStatus;
    
    const matchesDept = (isManagerRole || selectedDept === 'All') ? true : isDepartmentMatch(a.department, selectedDept);
    const matchesSearch = !searchQuery.trim() || 
      a.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.department.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesOt = !filterOtOnly || (a.otHours && a.otHours > 0) || (a.workingHours && a.workingHours > 8.5);

    return matchesDate && matchesStatus && matchesDept && matchesSearch && matchesOt;
  });

  const handlePillStatusClick = (record: AttendanceRecord, targetStatus: string) => {
    if (targetStatus === 'P') {
      setTimePickerTarget(record);
    } else if (targetStatus === 'OT') {
      setActiveTab('review_ot');
    } else {
      const statusMap: Record<string, AttendanceRecord['status']> = {
        'HD': 'Half Day',
        'A': 'Absent',
        'L': 'On Leave',
        'F': 'Present'
      };
      const st = statusMap[targetStatus] || 'Present';
      correctAttendanceRecord({
        attendanceId: record.id,
        status: st,
        reason: `Quick Pill Status override to ${st}`,
        changedBy: `${currentUser.name} (${currentUser.role})`
      });
    }
  };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Plus Jakarta Sans', sans-serif" }}>
      {/* Page Title & Action Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>Attendance Management {isEmployeeRole ? '(My Logs)' : isManagerRole ? `(${currentUser.department} Department)` : '(Company Wide)'}</h1>
          <p className="page-subtitle">Daily attendance logs, check-in punch overrides, OT approval, and leave synchronization</p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onBackToInsights && (
            <button 
              className="btn btn-secondary btn-sm"
              onClick={onBackToInsights}
              style={{ fontWeight: 600 }}
            >
              ← Back to Insights
            </button>
          )}

          {isHRorCEO && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAuditModal(true)}
              style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1' }}
            >
              <ShieldCheck size={15} style={{ color: '#0E7490' }} /> Correction Audit Logs
            </button>
          )}

          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCorrectionModal(true)}
            style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FileClock size={15} /> Request Missed Punch
          </button>
          <button 
            className="btn btn-primary btn-sm"
            onClick={() => markAttendance(currentUser.employeeId || 'EMP-001', 'Present', 'Manual Punch')}
            style={{ backgroundColor: '#2563EB', borderColor: '#2563EB' }}
          >
            <Clock size={16} /> Quick Check-In Punch
          </button>
        </div>
      </div>

      {/* 1. CLICKABLE KPI SUMMARY CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div
          onClick={() => { setSelectedStatus('All'); setFilterOtOnly(false); setActiveTab('cards'); }}
          style={{
            backgroundColor: selectedStatus === 'All' && !filterOtOnly ? '#EFF6FF' : '#FFFFFF',
            border: selectedStatus === 'All' && !filterOtOnly ? '2px solid #2563EB' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Total Staff</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>{countTotal}</div>
        </div>

        <div
          onClick={() => { setSelectedStatus('Present'); setFilterOtOnly(false); setActiveTab('cards'); }}
          style={{
            backgroundColor: selectedStatus === 'Present' ? '#DCFCE7' : '#FFFFFF',
            border: selectedStatus === 'Present' ? '2px solid #16A34A' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Present</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>{countPresent}</div>
        </div>

        <div
          onClick={() => { setSelectedStatus('Late'); setFilterOtOnly(false); setActiveTab('cards'); }}
          style={{
            backgroundColor: selectedStatus === 'Late' ? '#FEF3C7' : '#FFFFFF',
            border: selectedStatus === 'Late' ? '2px solid #D97706' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase' }}>Late</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B45309', marginTop: '2px' }}>{countLate}</div>
        </div>

        <div
          onClick={() => { setSelectedStatus('Absent'); setFilterOtOnly(false); setActiveTab('cards'); }}
          style={{
            backgroundColor: selectedStatus === 'Absent' ? '#FEE2E2' : '#FFFFFF',
            border: selectedStatus === 'Absent' ? '2px solid #DC2626' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>Absent</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B91C1C', marginTop: '2px' }}>{countAbsent}</div>
        </div>

        <div
          onClick={() => { setSelectedStatus('Half Day'); setFilterOtOnly(false); setActiveTab('cards'); }}
          style={{
            backgroundColor: selectedStatus === 'Half Day' ? '#FEF3C7' : '#FFFFFF',
            border: selectedStatus === 'Half Day' ? '2px solid #D97706' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#78350F', textTransform: 'uppercase' }}>Half Day</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#D97706', marginTop: '2px' }}>{countHalfDay}</div>
        </div>

        <div
          onClick={() => { setSelectedStatus('Leave'); setFilterOtOnly(false); setActiveTab('cards'); }}
          style={{
            backgroundColor: selectedStatus === 'Leave' || selectedStatus === 'On Leave' ? '#F3E8FF' : '#FFFFFF',
            border: selectedStatus === 'Leave' || selectedStatus === 'On Leave' ? '2px solid #9333EA' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B21A8', textTransform: 'uppercase' }}>On Leave</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7E22CE', marginTop: '2px' }}>{countLeave}</div>
        </div>

        <div
          onClick={() => { setSelectedStatus('WFH'); setFilterOtOnly(false); setActiveTab('cards'); }}
          style={{
            backgroundColor: selectedStatus === 'WFH' || selectedStatus === 'Work From Home' ? '#E0F2FE' : '#FFFFFF',
            border: selectedStatus === 'WFH' || selectedStatus === 'Work From Home' ? '2px solid #0284C7' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#075985', textTransform: 'uppercase' }}>WFH</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0369A1', marginTop: '2px' }}>{countWfh}</div>
        </div>

        <div
          onClick={() => { setSelectedStatus('Missing Punch'); setFilterOtOnly(false); setActiveTab('cards'); }}
          style={{
            backgroundColor: selectedStatus === 'Missing Punch' ? '#FFEDD5' : '#FFFFFF',
            border: selectedStatus === 'Missing Punch' ? '2px solid #EA580C' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9A3412', textTransform: 'uppercase' }}>Missing Punch</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#C2410C', marginTop: '2px' }}>{countMissingPunch}</div>
        </div>

        <div
          onClick={() => { setActiveTab('review_ot'); }}
          style={{
            backgroundColor: activeTab === 'review_ot' ? '#EDE9FE' : '#FFFFFF',
            border: activeTab === 'review_ot' ? '2px solid #7C3AED' : '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '12px 14px',
            cursor: 'pointer'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5B21B6', textTransform: 'uppercase' }}>Review OT</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#6D28D9', marginTop: '2px' }}>{countOt}</div>
        </div>
      </div>

      {/* 2. SUB NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('cards')}
          style={{
            padding: '10px 22px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: activeTab === 'cards' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'cards' ? '#FFFFFF' : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Clock size={16} /> Daily Cards View (Screenshot 3)
        </button>

        <button
          onClick={() => setActiveTab('review_ot')}
          style={{
            padding: '10px 22px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: activeTab === 'review_ot' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'review_ot' ? '#FFFFFF' : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Timer size={16} /> Review Overtime
        </button>

        <button
          onClick={() => setActiveTab('table')}
          style={{
            padding: '10px 22px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: activeTab === 'table' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'table' ? '#FFFFFF' : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <FileClock size={16} /> Attendance Log Table
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          style={{
            padding: '10px 22px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: activeTab === 'calendar' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'calendar' ? '#FFFFFF' : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CalendarIcon size={16} /> Calendar Grid
        </button>
      </div>

      {/* TAB CONTENT: REVIEW OVERTIME VIEW (Screenshot 1 & Screenshot 4) */}
      {activeTab === 'review_ot' ? (
        <ReviewOvertimeView onBack={() => setActiveTab('cards')} />
      ) : activeTab === 'calendar' ? (
        <AttendanceCalendarView />
      ) : activeTab === 'cards' ? (
        /* TAB CONTENT: DAILY CARDS VIEW (Exact Screenshot 3 Layout) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredRecords.length === 0 ? (
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '40px', textAlign: 'center', color: '#64748B', border: '1px solid #E2E8F0' }}>
              No attendance records found matching filters.
            </div>
          ) : (
            filteredRecords.map(record => {
              const inVal = record.checkIn || '9:59 AM';
              const outVal = record.checkOut || '6:35 PM';
              const isPresent = record.status === 'Present' || record.status === 'Late';

              return (
                <div
                  key={record.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '18px',
                    border: '1px solid #E2E8F0',
                    padding: '20px 24px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}
                >
                  {/* Top Header Row of Card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                        {formatDateDDMMYYYY(record.date)} <span style={{ color: '#64748B', fontWeight: 500 }}>I {record.employeeName}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                        {record.workingHours || 8.6} Hrs | {record.department} ({record.employeeId})
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setCorrectionTargetRecord(record)}
                        style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Add Note - Logs
                      </button>
                    </div>
                  </div>

                  {/* Status Pills Array (Exact match with Screenshot 3) */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '12px',
                    paddingTop: '8px'
                  }}>
                    {/* Pill 1: P | Punch Times (Solid Green when Present, clicking opens Time Picker Modal) */}
                    <button
                      type="button"
                      onClick={() => handlePillStatusClick(record, 'P')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '12px',
                        border: isPresent ? 'none' : '1px solid #E2E8F0',
                        backgroundColor: isPresent ? '#16A34A' : '#F8FAFC',
                        color: isPresent ? '#FFFFFF' : '#475569',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: isPresent ? '0 2px 4px rgba(22, 163, 74, 0.2)' : 'none'
                      }}
                    >
                      <span>P</span> <span style={{ borderLeft: isPresent ? '1px solid rgba(255,255,255,0.4)' : '1px solid #CBD5E1', paddingLeft: '8px' }}>{inVal} - {outVal}</span>
                    </button>

                    {/* Pill 2: HD | Half Day */}
                    <button
                      type="button"
                      onClick={() => handlePillStatusClick(record, 'HD')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '12px',
                        border: record.status === 'Half Day' ? 'none' : '1px solid #E2E8F0',
                        backgroundColor: record.status === 'Half Day' ? '#D97706' : '#F8FAFC',
                        color: record.status === 'Half Day' ? '#FFFFFF' : '#475569',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>HD</span> <span style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '8px' }}>Half Day</span>
                    </button>

                    {/* Pill 3: A | Absent */}
                    <button
                      type="button"
                      onClick={() => handlePillStatusClick(record, 'A')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '12px',
                        border: record.status === 'Absent' ? 'none' : '1px solid #E2E8F0',
                        backgroundColor: record.status === 'Absent' ? '#DC2626' : '#F8FAFC',
                        color: record.status === 'Absent' ? '#FFFFFF' : '#475569',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>A</span> <span style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '8px' }}>Absent</span>
                    </button>

                    {/* Pill 4: F | Fine */}
                    <button
                      type="button"
                      onClick={() => handlePillStatusClick(record, 'F')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        color: '#475569',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>F</span> <span style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '8px' }}>Fine</span>
                    </button>

                    {/* Pill 5: OT | Overtime */}
                    <button
                      type="button"
                      onClick={() => handlePillStatusClick(record, 'OT')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        color: '#475569',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>OT</span> <span style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '8px' }}>Overtime</span>
                    </button>

                    {/* Pill 6: L | Leave */}
                    <button
                      type="button"
                      onClick={() => handlePillStatusClick(record, 'L')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '12px',
                        border: record.status === 'On Leave' || (record.status as string) === 'Leave' ? 'none' : '1px solid #E2E8F0',
                        backgroundColor: record.status === 'On Leave' || (record.status as string) === 'Leave' ? '#7E22CE' : '#F8FAFC',
                        color: record.status === 'On Leave' || (record.status as string) === 'Leave' ? '#FFFFFF' : '#475569',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>L</span> <span style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '8px' }}>Leave</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* TAB CONTENT: STANDARD DETAILED LOG TABLE */
        <div>
          <div className="card" style={{ padding: '16px 20px', marginBottom: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '400px' }}>
                <input
                  type="text"
                  className="form-control"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search staff name, ID, department..."
                  style={{ paddingLeft: '34px', fontSize: '0.84rem', height: '38px', borderRadius: '10px' }}
                />
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.84rem', color: '#64748B', fontWeight: 600 }}>
                  Showing <strong style={{ color: '#2563EB' }}>{filteredRecords.length}</strong> record(s)
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: '16px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#475569', fontWeight: 700 }}>
                    <th style={{ width: '40px', minWidth: '40px', textAlign: 'center', padding: '14px 16px' }}>
                      <input
                        type="checkbox"
                        checked={filteredRecords.length > 0 && filteredRecords.every(r => selectedAttendanceIds.includes(r.id))}
                        onChange={handleToggleSelectAll}
                        style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                        aria-label="Select all attendance records"
                      />
                    </th>
                    <th style={{ padding: '14px 16px' }}>Employee</th>
                    <th style={{ padding: '14px 16px' }}>Date</th>
                    <th style={{ padding: '14px 16px' }}>Shift</th>
                    <th style={{ padding: '14px 16px' }}>Check-In</th>
                    <th style={{ padding: '14px 16px' }}>Check-Out</th>
                    <th style={{ padding: '14px 16px' }}>Hours</th>
                    <th style={{ padding: '14px 16px' }}>OT</th>
                    <th style={{ padding: '14px 16px' }}>Status</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(rec => {
                    const isSelected = selectedAttendanceIds.includes(rec.id);

                    return (
                      <tr 
                        key={rec.id} 
                        style={{ 
                          borderBottom: '1px solid #F1F5F9',
                          backgroundColor: isSelected ? '#ECFEFF' : undefined,
                          borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '12px 16px', width: '40px' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleAttendance(rec.id)}
                            style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                            aria-label={`Select attendance for ${rec.employeeName}`}
                          />
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>{rec.employeeName}</td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(rec.date)}</td>
                        <td style={{ padding: '12px 16px' }}>{rec.shiftName || shifts[0]?.shiftName || 'Shift 1 (09:00 AM - 06:00 PM)'}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: rec.checkIn ? '#16A34A' : '#DC2626' }}>{formatTimeDisplay(rec.checkIn, 'Missing')}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: rec.checkOut ? '#16A34A' : '#DC2626' }}>{formatTimeDisplay(rec.checkOut, 'Missing')}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{rec.workingHours || 0} hrs</td>
                        <td style={{ padding: '12px 16px' }}>{rec.otHours ? `+${rec.otHours}h` : '-'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '9999px', backgroundColor: '#DCFCE7', color: '#15803D' }}>
                            {rec.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button onClick={() => setCorrectionTargetRecord(rec)} className="btn btn-primary btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem', backgroundColor: '#2563EB' }}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Floating Action Bar per AGENTS.md */}
          <StandardFloatingActionBar
            selectedCount={selectedAttendanceIds.length}
            onClearSelection={() => setSelectedAttendanceIds([])}
            onEdit={selectedAttendanceIds.length === 1 ? () => {
              const rec = filteredRecords.find(r => r.id === selectedAttendanceIds[0]);
              if (rec) setCorrectionTargetRecord(rec);
            } : undefined}
          />
        </div>
      )}

      {/* TIME PICKER MODAL (Screenshot 2) */}
      {timePickerTarget && (
        <AttendanceTimePickerModal
          employeeName={timePickerTarget.employeeName}
          date={timePickerTarget.date}
          initialCheckIn={timePickerTarget.checkIn}
          initialCheckOut={timePickerTarget.checkOut}
          isOpen={!!timePickerTarget}
          onClose={() => setTimePickerTarget(null)}
          onSave={(inTime, outTime) => {
            correctAttendanceRecord({
              attendanceId: timePickerTarget.id,
              status: 'Present',
              checkIn: inTime,
              checkOut: outTime,
              reason: 'Punch timings updated via Time Picker Modal',
              changedBy: `${currentUser.name} (${currentUser.role})`
            });
            setTimePickerTarget(null);
          }}
        />
      )}

      {/* ATTENDANCE CORRECTION MODAL */}
      {correctionTargetRecord && (
        <AttendanceCorrectionModal
          record={correctionTargetRecord}
          onClose={() => setCorrectionTargetRecord(null)}
        />
      )}

      {/* AUDIT LOG TRAIL MODAL */}
      {showAuditModal && (
        <AttendanceAuditLogModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
        />
      )}
    </div>
  );
};
