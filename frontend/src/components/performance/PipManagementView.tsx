import React, { useState } from 'react';
import {
  PipRecord,
  EmployeePerformanceDetail,
  PipStatus
} from '../../types/performance';
import { PerformanceTerminologyTooltip } from './PerformanceTerminologyTooltip';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  User,
  Plus,
  ArrowUpRight,
  Filter,
  CheckSquare,
  X,
  FileText,
  ShieldAlert,
  HelpCircle,
  TrendingUp,
  RotateCcw,
  Check,
  Building2,
  Target
} from 'lucide-react';

interface PipManagementViewProps {
  pipRecords: PipRecord[];
  employees: EmployeePerformanceDetail[];
  onAddPipRecord: (newPip: PipRecord) => void;
  onUpdatePipMilestone: (pipId: string, milestoneId: string, status: 'Completed' | 'In Progress' | 'Pending') => void;
  onUpdatePipStatus?: (pipId: string, newStatus: PipStatus) => void;
  onSelectEmployee: (empId: string) => void;
}

const PIP_STATUSES: (PipStatus | 'ALL')[] = [
  'ALL',
  'Draft',
  'Active',
  'Under Review',
  'Successfully Completed',
  'Extended',
  'Failed',
  'Closed'
];

export const PipManagementView: React.FC<PipManagementViewProps> = ({
  pipRecords,
  employees,
  onAddPipRecord,
  onUpdatePipMilestone,
  onUpdatePipStatus,
  onSelectEmployee
}) => {
  const [filterStatus, setFilterStatus] = useState<PipStatus | 'ALL'>('ALL');
  const [selectedPip, setSelectedPip] = useState<PipRecord | null>(pipRecords[0] || null);
  const [isNewPipModalOpen, setIsNewPipModalOpen] = useState(false);

  // Form State for new PIP
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.employeeId || '');
  const [durationDays, setDurationDays] = useState<number>(60);
  const [reason, setReason] = useState<string>('');
  const [performanceIssue, setPerformanceIssue] = useState<string>('');
  const [improvementArea, setImprovementArea] = useState<string>('');
  const [expectedTarget, setExpectedTarget] = useState<string>('');
  const [supportRequired, setSupportRequired] = useState<string>('');
  const [actionPlan, setActionPlan] = useState<string>('');
  const [reviewFrequency, setReviewFrequency] = useState<'Weekly' | 'Bi-Weekly' | 'Monthly'>('Weekly');
  const [assignedReviewer, setAssignedReviewer] = useState<string>('Velmurugan (CEO)');
  const [mentorName, setMentorName] = useState<string>('');
  const [milestone1, setMilestone1] = useState<string>('');
  const [milestone2, setMilestone2] = useState<string>('');

  const activeCount = pipRecords.filter(p => p.status === 'Active').length;
  const underReviewCount = pipRecords.filter(p => p.status === 'Under Review').length;
  const completedCount = pipRecords.filter(p => p.status === 'Successfully Completed').length;

  const filteredPips = pipRecords.filter(p => {
    if (filterStatus === 'ALL') return true;
    return p.status === filterStatus;
  });

  const handleCreatePipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.employeeId === selectedEmpId) || employees[0];

    const startDate = new Date().toISOString().split('T')[0];
    const endDateObj = new Date();
    endDateObj.setDate(endDateObj.getDate() + durationDays);
    const targetEndDate = endDateObj.toISOString().split('T')[0];

    const milestones = [];
    if (milestone1.trim()) {
      milestones.push({
        id: `m-${Date.now()}-1`,
        title: milestone1.trim(),
        targetDate: targetEndDate,
        status: 'In Progress' as const
      });
    }
    if (milestone2.trim()) {
      milestones.push({
        id: `m-${Date.now()}-2`,
        title: milestone2.trim(),
        targetDate: targetEndDate,
        status: 'Pending' as const
      });
    }

    const newPip: PipRecord = {
      id: `PIP-${Date.now()}`,
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      department: emp.department,
      designation: emp.designation,
      initiatorName: 'Velmurugan (CEO)',
      mentorName: mentorName || 'Assigned Mentor',
      assignedReviewer: assignedReviewer || 'Arun Kumar',
      startDate,
      targetEndDate,
      durationDays,
      reason,
      performanceIssue,
      improvementArea,
      expectedTarget,
      supportRequired,
      actionPlan,
      reviewFrequency,
      focusAreas: [improvementArea],
      milestones,
      status: 'Active',
      progressPercentage: 0,
      reviewNotes: 'PIP plan activated. Mentoring sessions begin this week.'
    };

    onAddPipRecord(newPip);
    setSelectedPip(newPip);
    setIsNewPipModalOpen(false);

    // Reset fields
    setReason('');
    setPerformanceIssue('');
    setImprovementArea('');
    setExpectedTarget('');
    setSupportRequired('');
    setActionPlan('');
    setMilestone1('');
    setMilestone2('');
  };

  const getStatusBadge = (status: PipStatus) => {
    switch (status) {
      case 'Active':
        return { bg: '#FEF3C7', text: '#B45309', label: 'Active Plan' };
      case 'Under Review':
        return { bg: '#ECFEFF', text: '#0E7490', label: 'Under Review' };
      case 'Successfully Completed':
        return { bg: '#DCFCE7', text: '#15803D', label: 'Successfully Completed' };
      case 'Extended':
        return { bg: '#EFF6FF', text: '#1D4ED8', label: 'Extended 30 Days' };
      case 'Failed':
        return { bg: '#FEE2E2', text: '#B91C1C', label: 'Failed' };
      case 'Closed':
        return { bg: '#F1F5F9', text: '#475569', label: 'Closed' };
      case 'Draft':
        return { bg: '#F8FAFC', text: '#64748B', label: 'Draft' };
      default:
        return { bg: '#F1F5F9', text: '#475569', label: status };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── TOP HEADER CARD ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: '#FEF3C7',
            color: '#D97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#1E293B', fontFamily: 'DM Sans, sans-serif', letterSpacing: '-0.02em' }}>
                Performance Improvement Plan (PIP)
              </h1>
              <PerformanceTerminologyTooltip term="PIP" />
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
              Structured, supportive coaching framework answering 5 core questions to help employees succeed
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsNewPipModalOpen(true)}
          style={{
            padding: '9px 16px',
            backgroundColor: '#0E7490',
            color: '#FFFFFF',
            borderRadius: '12px',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
          }}
        >
          <Plus size={16} />
          <span>Create New PIP</span>
        </button>
      </div>

      {/* ── STATUS TABS FILTER ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        overflowX: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginRight: '4px' }}>
            Status:
          </span>
          {PIP_STATUSES.map(st => {
            const isActive = filterStatus === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  border: isActive ? '1px solid #0E7490' : '1px solid #E2E8F0',
                  backgroundColor: isActive ? '#0E7490' : '#FFFFFF',
                  color: isActive ? '#FFFFFF' : '#475569',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {st === 'ALL' ? 'All Plans' : st}
              </button>
            );
          })}
        </div>

        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
          {filteredPips.length} Plans Shown
        </span>
      </div>

      {/* ── MAIN CONTENT: SPLIT COLUMN (LIST ON LEFT, 5-QUESTION DETAIL ON RIGHT) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 380px) 1fr',
        gap: '20px',
        alignItems: 'start'
      }}>
        
        {/* Left: PIP List */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>
            Active & Past PIP Records ({filteredPips.length})
          </h3>

          {filteredPips.map(pip => {
            const isSelected = selectedPip?.id === pip.id;
            const badge = getStatusBadge(pip.status);
            return (
              <div
                key={pip.id}
                onClick={() => setSelectedPip(pip)}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: isSelected ? '#ECFEFF' : '#F8FAFC',
                  border: isSelected ? '2px solid #0E7490' : '1px solid #E2E8F0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '14px', color: '#1E293B' }}>
                    {pip.employeeName}
                  </strong>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: badge.bg,
                    color: badge.text,
                    fontSize: '11px',
                    fontWeight: 700
                  }}>
                    {badge.label}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px' }}>
                  {pip.designation} • {pip.department}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#475569' }}>
                  <Clock size={13} color="#0E7490" />
                  <span>{pip.durationDays} Days ({formatDateDDMMYYYY(pip.startDate)} to {formatDateDDMMYYYY(pip.targetEndDate)})</span>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                    <span>Progress</span>
                    <span>{pip.progressPercentage}%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pip.progressPercentage}%`,
                      height: '100%',
                      backgroundColor: pip.progressPercentage >= 80 ? '#16A34A' : '#0E7490',
                      borderRadius: '4px'
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Detailed 5-Question Framework Display */}
        {selectedPip ? (
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E7ECF3',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Header of selected PIP */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase' }}>
                    Plan ID: {selectedPip.id}
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: getStatusBadge(selectedPip.status).bg,
                    color: getStatusBadge(selectedPip.status).text,
                    fontSize: '11px',
                    fontWeight: 700
                  }}>
                    {selectedPip.status}
                  </span>
                </div>
                <h2 style={{ margin: '4px 0 2px', fontSize: '18px', fontWeight: 800, color: '#1E293B' }}>
                  {selectedPip.employeeName} ({selectedPip.employeeId})
                </h2>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {selectedPip.designation} • {selectedPip.department} • Initiated by: {selectedPip.initiatorName}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onSelectEmployee(selectedPip.employeeId)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#ECFEFF',
                  border: '1px solid #A5F3FC',
                  color: '#0E7490',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                View Employee Profile ›
              </button>
            </div>

            {/* ── THE 5 CORE QUESTIONS (VERY CLEAR FOR USER AND EMPLOYEE) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Question 1: What is the problem? */}
              <div style={{
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '12px',
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <AlertTriangle size={15} color="#D97706" />
                  <strong style={{ fontSize: '13px', color: '#92400E' }}>
                    1. What is the problem?
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                  {selectedPip.performanceIssue || selectedPip.reason}
                </p>
              </div>

              {/* Question 2: What should improve? */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <TrendingUp size={15} color="#0E7490" />
                  <strong style={{ fontSize: '13px', color: '#0E7490' }}>
                    2. What should improve?
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                  {selectedPip.improvementArea || selectedPip.focusAreas.join('; ')}
                </p>
              </div>

              {/* Question 3: What is the target? */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Target size={15} color="#16A34A" />
                  <strong style={{ fontSize: '13px', color: '#15803D' }}>
                    3. What is the target?
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                  {selectedPip.expectedTarget || 'Achieve benchmark standards and clear milestone checkoffs.'}
                </p>
              </div>

              {/* Question 4: What support is provided? */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <User size={15} color="#7C3AED" />
                  <strong style={{ fontSize: '13px', color: '#7C3AED' }}>
                    4. What support is provided?
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                  {selectedPip.supportRequired || `Assigned Mentor: ${selectedPip.mentorName}. Weekly check-ins and review sessions.`}
                </p>
              </div>

              {/* Question 5: When will it be reviewed? */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Clock size={15} color="#0E7490" />
                  <strong style={{ fontSize: '13px', color: '#0E7490' }}>
                    5. When will it be reviewed?
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#1E293B', lineHeight: '1.45' }}>
                  Frequency: <strong>{selectedPip.reviewFrequency || 'Weekly'}</strong> • Assigned Reviewer: <strong>{selectedPip.assignedReviewer}</strong> • Target End Date: <strong>{formatDateDDMMYYYY(selectedPip.targetEndDate)}</strong>
                </p>
              </div>

            </div>

            {/* ── MILESTONES CHECKLIST ── */}
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>
                  Milestones & Action Checkpoints ({selectedPip.milestones.length})
                </h4>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Click to mark milestones completed
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedPip.milestones.map(m => {
                  const isDone = m.status === 'Completed';
                  return (
                    <div
                      key={m.id}
                      onClick={() => onUpdatePipMilestone(selectedPip.id, m.id, isDone ? 'In Progress' : 'Completed')}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        backgroundColor: isDone ? '#F0FDF4' : '#FFFFFF',
                        border: isDone ? '1px solid #86EFAC' : '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '6px',
                          backgroundColor: isDone ? '#16A34A' : '#FFFFFF',
                          border: isDone ? 'none' : '2px solid #CBD5E1',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {isDone && <Check size={13} strokeWidth={3} />}
                        </div>
                        <div>
                          <strong style={{ fontSize: '13px', color: isDone ? '#15803D' : '#1E293B', textDecoration: isDone ? 'line-through' : 'none' }}>
                            {m.title}
                          </strong>
                          {m.notes && (
                            <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '2px' }}>
                              Note: {m.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        Due: {formatDateDDMMYYYY(m.targetDate)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mentor Notes */}
            {selectedPip.reviewNotes && (
              <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <strong style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                  Mentor / Reviewer Progress Log:
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: '#334155', fontStyle: 'italic' }}>
                  "{selectedPip.reviewNotes}"
                </p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '40px', backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E7ECF3', textAlign: 'center', color: '#64748B' }}>
            Select a PIP record from the left to view details.
          </div>
        )}

      </div>

      {/* ── CREATE NEW PIP MODAL ── */}
      {isNewPipModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} color="#0E7490" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E293B' }}>
                  Initiate Performance Improvement Plan (PIP)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPipModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePipSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Select Employee <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={selectedEmpId}
                    onChange={e => setSelectedEmpId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    {employees.map(emp => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.employeeName} ({emp.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Duration (Days) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={durationDays}
                    onChange={e => setDurationDays(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    <option value={30}>30 Days (Accelerated)</option>
                    <option value={60}>60 Days (Standard)</option>
                    <option value={90}>90 Days (Comprehensive)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  1. What is the problem? (Performance Issue) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Clearly explain the performance gap or challenge..."
                  value={performanceIssue}
                  onChange={e => setPerformanceIssue(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  2. What should improve? (Improvement Area) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Key competencies, speed, accuracy, or conversion habits to build..."
                  value={improvementArea}
                  onChange={e => setImprovementArea(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  3. What is the target? (Expected Target) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Min. ₹35L cumulative booking, zero fastener stockouts..."
                  value={expectedTarget}
                  onChange={e => setExpectedTarget(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  4. What support is provided? *
                </label>
                <textarea
                  rows={2}
                  placeholder="Training, mentoring, joint visits, software tools..."
                  value={supportRequired}
                  onChange={e => setSupportRequired(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Assigned Mentor
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Arun Kumar (Sales Head)"
                    value={mentorName}
                    onChange={e => setMentorName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    5. When will it be reviewed? *
                  </label>
                  <select
                    value={reviewFrequency}
                    onChange={e => setReviewFrequency(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="Weekly">Weekly Review</option>
                    <option value="Bi-Weekly">Bi-Weekly Review</option>
                    <option value="Monthly">Monthly Review</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Milestone 1
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Complete product training by Week 2"
                    value={milestone1}
                    onChange={e => setMilestone1(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Milestone 2
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Close 3 trial customer contracts"
                    value={milestone2}
                    onChange={e => setMilestone2(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewPipModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Initiate PIP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
