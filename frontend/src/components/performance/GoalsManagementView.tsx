import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { GoalItem, EmployeePerformanceDetail } from '../../types/performance';
import { INITIAL_GOALS } from '../../data/performanceInitialData';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { getMonthInfo } from '../../utils/monthUtils';
import { DateInput } from '../common/DateInput';
import {
  Target,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  User,
  X,
  Sliders,
  Check,
  Building2
} from 'lucide-react';

interface GoalsManagementViewProps {
  employees: EmployeePerformanceDetail[];
  initialGoals?: GoalItem[];
}

export const GoalsManagementView: React.FC<GoalsManagementViewProps> = ({
  employees,
  initialGoals = INITIAL_GOALS
}) => {
  const [goals, setGoals] = useState<GoalItem[]>(initialGoals);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isAddGoalModalOpen, setIsAddGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalItem | null>(null);
  const [progressValue, setProgressValue] = useState(0);

  // New Goal Form State
  const [goalName, setGoalName] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalEmpId, setGoalEmpId] = useState(employees[0]?.employeeId || '');
  const [startDate, setStartDate] = useState(() => getMonthInfo().monthStart);
  const [dueDate, setDueDate] = useState(() => getMonthInfo().monthEnd);
  const [targetMetric, setTargetMetric] = useState('');
  const [weightage, setWeightage] = useState(30);

  const { orgStructure } = useHRMS();
  const configuredDepts = orgStructure?.departments || [];
  const departments = ['ALL', ...configuredDepts];
  const statuses = ['ALL', 'Not Started', 'In Progress', 'Completed', 'Overdue'];

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.employeeId === goalEmpId) || employees[0];
    const newGoal: GoalItem = {
      id: `GOAL-${Date.now()}`,
      goalName,
      description: goalDesc,
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      department: emp.department,
      startDate,
      dueDate,
      targetMetric,
      currentProgress: 0,
      weightage,
      status: 'In Progress',
      approvedBy: 'Velmurugan (CEO)'
    };

    setGoals([newGoal, ...goals]);
    setIsAddGoalModalOpen(false);
    setGoalName('');
    setGoalDesc('');
    setTargetMetric('');
  };

  const handleOpenUpdateProgress = (g: GoalItem) => {
    setEditingGoal(g);
    setProgressValue(g.currentProgress);
  };

  const handleSaveProgress = () => {
    if (!editingGoal) return;
    setGoals(prev => prev.map(g => {
      if (g.id !== editingGoal.id) return g;
      const updatedProg = progressValue;
      return {
        ...g,
        currentProgress: updatedProg,
        status: updatedProg === 100 ? 'Completed' : g.status
      };
    }));
    setEditingGoal(null);
  };

  const handleApproveGoal = (id: string) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, approvedBy: 'Approved by HR/CEO' } : g));
  };

  const filteredGoals = goals.filter(g => {
    const matchesSearch = g.goalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === 'ALL' || g.department.toLowerCase() === deptFilter.toLowerCase();
    const matchesStatus = statusFilter === 'ALL' || g.status === statusFilter;
    return matchesSearch && matchesDept && matchesStatus;
  });

  const getStatusBadge = (status: GoalItem['status']) => {
    switch (status) {
      case 'Completed':
        return { bg: '#DCFCE7', text: '#15803D', label: 'Completed' };
      case 'In Progress':
        return { bg: '#ECFEFF', text: '#0E7490', label: 'In Progress' };
      case 'Not Started':
        return { bg: '#F1F5F9', text: '#475569', label: 'Not Started' };
      case 'Overdue':
        return { bg: '#FEE2E2', text: '#B91C1C', label: 'Overdue' };
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
            backgroundColor: '#FDF4FF',
            color: '#A21CAF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Target size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#1E293B', fontFamily: 'DM Sans, sans-serif', letterSpacing: '-0.02em' }}>
              Performance Goals Management
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
              Set strategic employee goals, track completion percentages, due dates and supervisor approvals
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAddGoalModalOpen(true)}
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
          <span>Add New Goal</span>
        </button>
      </div>

      {/* ── FILTER STRIP ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search goals by title or employee..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Department:</span>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', backgroundColor: '#FFFFFF', outline: 'none' }}
            >
              {departments.map(d => (
                <option key={d} value={d}>{d === 'ALL' ? 'All Departments' : d}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', backgroundColor: '#FFFFFF', outline: 'none' }}
            >
              {statuses.map(s => (
                <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>
              ))}
            </select>
          </div>
        </div>

        <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
          {filteredGoals.length} Goals Active
        </span>
      </div>

      {/* ── GOALS TABLE ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Goal & Target Metric</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Assigned Employee</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Department</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Timeline</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', minWidth: '170px' }}>Progress</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Weightage</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGoals.map((g, idx) => {
                const badge = getStatusBadge(g.status);
                return (
                  <tr
                    key={g.id}
                    style={{
                      borderBottom: '1px solid #E7ECF3',
                      backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFCFE',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ECFEFF'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#FFFFFF' : '#FAFCFE'}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <strong style={{ fontSize: '13px', color: '#1E293B', display: 'block' }}>
                        {g.goalName}
                      </strong>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '2px', maxWidth: '320px' }}>
                        {g.description}
                      </span>
                      <span style={{ fontSize: '11px', color: '#0E7490', fontWeight: 700, display: 'block', marginTop: '4px' }}>
                        Target: {g.targetMetric}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#0E7490', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                          {g.employeeName.charAt(0)}
                        </div>
                        <div>
                          <strong style={{ fontSize: '13px', color: '#1E293B', display: 'block' }}>
                            {g.employeeName}
                          </strong>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>
                            {g.employeeId}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: '#F1F5F9', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                        {g.department}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#475569' }}>
                      <div>Due: <strong>{formatDateDDMMYYYY(g.dueDate)}</strong></div>
                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>Start: {formatDateDDMMYYYY(g.startDate)}</span>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '7px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(g.currentProgress, 100)}%`,
                            height: '100%',
                            backgroundColor: g.currentProgress >= 100 ? '#16A34A' : '#0E7490',
                            borderRadius: '4px'
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', minWidth: '36px', textAlign: 'right' }}>
                          {g.currentProgress}%
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#ECFEFF',
                        color: '#0E7490',
                        fontSize: '11px',
                        fontWeight: 700
                      }}>
                        {g.weightage}%
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        backgroundColor: badge.bg,
                        color: badge.text,
                        fontSize: '11px',
                        fontWeight: 700
                      }}>
                        {badge.label}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenUpdateProgress(g)}
                          title="Update Progress"
                          style={{
                            padding: '5px 9px',
                            borderRadius: '8px',
                            backgroundColor: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            color: '#334155',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Sliders size={12} />
                          <span>Progress</span>
                        </button>

                        {!g.approvedBy && (
                          <button
                            type="button"
                            onClick={() => handleApproveGoal(g.id)}
                            title="Approve Goal"
                            style={{
                              padding: '5px 9px',
                              borderRadius: '8px',
                              backgroundColor: '#DCFCE7',
                              border: '1px solid #86EFAC',
                              color: '#15803D',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Check size={12} />
                            <span>Approve</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── UPDATE PROGRESS MODAL ── */}
      {editingGoal && (
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
            maxWidth: '440px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E293B' }}>
                Update Goal Progress
              </h3>
              <button
                type="button"
                onClick={() => setEditingGoal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748B' }}>
              Goal: <strong>{editingGoal.goalName}</strong> ({editingGoal.employeeName})
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                    Current Progress:
                  </label>
                  <strong style={{ fontSize: '16px', color: '#0E7490' }}>
                    {progressValue}%
                  </strong>
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progressValue}
                  onChange={e => setProgressValue(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#0E7490', cursor: 'pointer' }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                  <span>0% Not Started</span>
                  <span>50% In Progress</span>
                  <span>100% Completed</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingGoal(null)}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProgress}
                  style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Progress
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE GOAL MODAL ── */}
      {isAddGoalModalOpen && (
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
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Target size={20} color="#0E7490" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E293B' }}>
                  Add Personal / Team Goal
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddGoalModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Goal Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Achieve ₹1.2 Cr MMS Structure Sales"
                  value={goalName}
                  onChange={e => setGoalName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Description & Execution Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Key milestones, strategies or targets..."
                  value={goalDesc}
                  onChange={e => setGoalDesc(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Assign to Employee <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={goalEmpId}
                    onChange={e => setGoalEmpId(e.target.value)}
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
                    Weightage (%) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={weightage}
                    onChange={e => setWeightage(parseInt(e.target.value) || 25)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Target Metric <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ₹1.2 Cr Booking or 95% Completion"
                  value={targetMetric}
                  onChange={e => setTargetMetric(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Start Date
                  </label>
                  <DateInput
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Due Date
                  </label>
                  <DateInput
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddGoalModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Create Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
