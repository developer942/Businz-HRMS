import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { getMonthInfo } from '../../utils/monthUtils';
import {
  DepartmentPerformanceDetail,
  EmployeePerformanceDetail,
  CompanyDepartment
} from '../../types/performance';
import { DEPARTMENT_TEMPLATES } from '../../data/performanceInitialData';
import { PerformanceTerminologyTooltip } from './PerformanceTerminologyTooltip';
import {
  Building2,
  Users,
  Target,
  Award,
  AlertCircle,
  TrendingUp,
  CheckCircle2,
  Clock,
  Briefcase,
  AlertTriangle,
  ChevronRight,
  ShieldAlert,
  Layers,
  ArrowRight,
  Filter,
  Search,
  CheckSquare,
  ShieldCheck,
  Calendar,
  Lock
} from 'lucide-react';

interface DepartmentPerformanceViewProps {
  departments: DepartmentPerformanceDetail[];
  employees: EmployeePerformanceDetail[];
  selectedDepartmentName?: CompanyDepartment | string;
  onSelectDepartmentName?: (name: CompanyDepartment | string) => void;
  onSelectEmployee: (empId: string) => void;
  isManager?: boolean;
  managerDepartment?: string;
}

export const DepartmentPerformanceView: React.FC<DepartmentPerformanceViewProps> = ({
  departments,
  employees,
  selectedDepartmentName = 'Sales',
  onSelectDepartmentName,
  onSelectEmployee,
  isManager = false,
  managerDepartment = 'Sales'
}) => {
  const { orgStructure } = useHRMS();
  const [activeDeptName, setActiveDeptName] = useState<CompanyDepartment | string>(
    isManager ? (managerDepartment as CompanyDepartment) : selectedDepartmentName
  );

  // Filters State
  const currentMonthInfo = useMemo(() => getMonthInfo(), []);
  const [periodFilter, setPeriodFilter] = useState<string>('All Periods');
  const [kpiFilter, setKpiFilter] = useState<'ALL' | 'ON_TRACK' | 'AT_RISK' | 'BELOW_TARGET'>('ALL');
  const [pipFilter, setPipFilter] = useState<'ALL' | 'ACTIVE_PIP' | 'NOT_ON_PIP'>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');

  const effectiveDeptName = activeDeptName;

  const handleDeptChange = (deptName: CompanyDepartment | string) => {
    setActiveDeptName(deptName);
    if (onSelectDepartmentName) {
      onSelectDepartmentName(deptName);
    }
  };

  // Find department summary or construct fallback
  const currentDeptDetail = departments.find(d => 
    d.departmentName.toLowerCase() === effectiveDeptName.toLowerCase()
  ) || {
    departmentName: effectiveDeptName,
    employeeCount: 0,
    headName: 'Unassigned',
    avgOverallScore: 0,
    avgKpiScore: 0,
    avgKraScore: 0,
    goalCompletionRate: 0,
    attendanceImpactScore: 0,
    taskCompletionRate: 0,
    pipCount: 0,
    reviewStatus: 'Pending Review',
    status: 'Pending Review'
  };

  // Template for current department
  const currentTemplate = DEPARTMENT_TEMPLATES.find(t => 
    t.department.toLowerCase() === effectiveDeptName.toLowerCase()
  ) || null;

  // Employees in this department
  const deptEmployees = employees.filter(e =>
    e.department.toLowerCase() === effectiveDeptName.toLowerCase() ||
    e.department.toLowerCase().includes(effectiveDeptName.toLowerCase().split(' ')[0])
  );

  // Filtered employees for table
  const filteredDeptEmployees = deptEmployees.filter(e => {
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      const matches = e.employeeName.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (kpiFilter === 'ON_TRACK' && e.kpiScore < 80) return false;
    if (kpiFilter === 'AT_RISK' && (e.kpiScore < 70 || e.kpiScore >= 80)) return false;
    if (kpiFilter === 'BELOW_TARGET' && e.kpiScore >= 70) return false;
    if (pipFilter === 'ACTIVE_PIP' && !e.hasActivePip) return false;
    if (pipFilter === 'NOT_ON_PIP' && e.hasActivePip) return false;
    return true;
  });

  const topPerformer = deptEmployees.reduce((best, cur) => cur.overallScore > (best?.overallScore || 0) ? cur : best, deptEmployees[0]);
  const lowPerformers = deptEmployees.filter(e => e.overallScore < 75 || e.hasActivePip);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      
      {/* ── TOP 8 DEPARTMENT TABS (PILL NAVIGATION) ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '12px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        overflowX: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 'max-content' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '4px' }}>
              Departments:
            </span>
            {((orgStructure?.departments && orgStructure.departments.length > 0)
              ? orgStructure.departments
              : (departments.length > 0 ? departments.map(d => d.departmentName) : ['General'])
            ).map((dept: string) => {
              const isActive = effectiveDeptName.toLowerCase() === dept.toLowerCase();
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => handleDeptChange(dept)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '12px',
                    border: isActive ? '1px solid #0E7490' : '1px solid #E2E8F0',
                    backgroundColor: isActive ? '#0E7490' : '#FFFFFF',
                    color: isActive ? '#FFFFFF' : '#334155',
                    fontSize: '0.84rem',
                    fontWeight: isActive ? 750 : 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                    fontFamily: "'Plus Jakarta Sans', sans-serif"
                  }}
                >
                  <Building2 size={14} />
                  <span>{dept}</span>
                </button>
              );
            })}
          </div>

          {isManager && (
            <div style={{ fontSize: '12px', color: '#0E7490', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ECFEFF', padding: '4px 10px', borderRadius: '8px', border: '1px solid #A5F3FC' }}>
              <ShieldCheck size={14} />
              <span>Manager RBAC: Direct reports visibility only</span>
            </div>
          )}
        </div>
      </div>

      {/* ── DEPARTMENT HERO BANNER & KEY SCORES ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          borderBottom: '1px solid #F1F5F9',
          paddingBottom: '20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Building2 size={28} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#0E7490', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Performance → Departments → {activeDeptName}
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: currentDeptDetail.reviewStatus === 'Up to Date' ? '#DCFCE7' : '#FEF3C7',
                  color: currentDeptDetail.reviewStatus === 'Up to Date' ? '#15803D' : '#B45309',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  {currentDeptDetail.reviewStatus}
                </span>
              </div>
              <h2 style={{ margin: '4px 0 2px', fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {activeDeptName} Department Performance
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Department Head: <strong>{currentDeptDetail.headName}</strong> • Team Size: <strong>{deptEmployees.length} Members</strong>
              </p>
            </div>
          </div>

          {/* Department Score Stamp */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            backgroundColor: '#FAFCFE',
            border: '1px solid #E2E8F0',
            padding: '12px 20px',
            borderRadius: '14px'
          }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Dept Performance Score
              </span>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#0E7490', lineHeight: '1.1' }}>
                {currentDeptDetail.avgOverallScore}%
              </div>
            </div>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              border: '3px solid #0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 800,
              color: '#0E7490',
              backgroundColor: '#ECFEFF'
            }}>
              ★
            </div>
          </div>
        </div>

        {/* ── METRIC TILES FOR THIS DEPARTMENT ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '14px'
        }}>
          {/* Average KPI Score */}
          <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>Avg KPI Score</span>
              <PerformanceTerminologyTooltip term="KPI" />
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#1E293B' }}>
              {currentDeptDetail.avgKpiScore}%
            </div>
          </div>

          {/* Average KRA Score */}
          <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>Avg KRA Score</span>
              <PerformanceTerminologyTooltip term="KRA" />
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#1E293B' }}>
              {currentDeptDetail.avgKraScore}%
            </div>
          </div>

          {/* Goal Completion */}
          <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
              Goal Completion
            </span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A' }}>
              {currentDeptDetail.goalCompletionRate}%
            </div>
          </div>

          {/* Attendance Impact */}
          <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
              Attendance Impact
            </span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0E7490' }}>
              {currentDeptDetail.attendanceImpactScore}%
            </div>
          </div>

          {/* Task Completion */}
          <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
              Task Completion
            </span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563EB' }}>
              {currentDeptDetail.taskCompletionRate}%
            </div>
          </div>

          {/* PIP Employees */}
          <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>PIP Staff</span>
              <PerformanceTerminologyTooltip term="PIP" />
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: currentDeptDetail.pipCount > 0 ? '#D97706' : '#1E293B' }}>
              {currentDeptDetail.pipCount} Active
            </div>
          </div>
        </div>
      </div>

      {/* ── DEPARTMENT-SPECIFIC KRA & KPI TEMPLATES ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        gap: '20px'
      }}>
        {/* Department KRA Template */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Target size={16} />
              </div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>
                {activeDeptName} KRA Templates (Key Result Areas)
              </h3>
            </div>
            <PerformanceTerminologyTooltip term="KRA" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(!currentTemplate || !currentTemplate.kras || currentTemplate.kras.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: '#94A3B8', fontSize: '13px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px dashed #CBD5E1' }}>
                No KRA templates configured for this department yet.
              </div>
            ) : (
              currentTemplate.kras.map((kra, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '13px', color: '#1E293B', display: 'block' }}>
                      {kra.title}
                    </strong>
                    <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '2px' }}>
                      {kra.description}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '90px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      Weight: {kra.weightage}%
                    </span>
                    <span style={{ fontSize: '11px', color: '#475569', display: 'block', marginTop: '3px' }}>
                      {kra.targetMetric}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Department KPI Template */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={16} />
              </div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>
                {activeDeptName} KPI Metrics (Key Performance Indicators)
              </h3>
            </div>
            <PerformanceTerminologyTooltip term="KPI" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(!currentTemplate || !currentTemplate.kpis || currentTemplate.kpis.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: '#94A3B8', fontSize: '13px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px dashed #CBD5E1' }}>
                No KPI metrics configured for this department yet.
              </div>
            ) : (
              currentTemplate.kpis.map((kpi, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '13px', color: '#1E293B', display: 'block' }}>
                      {kpi.title}
                    </strong>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      Target: {kpi.target}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      Weight: {kpi.weightage}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── DEPARTMENT EMPLOYEES & TOP PERFORMERS ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E7ECF3',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        {/* Table Header & Interactive Filter Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
                {effectiveDeptName} Department Members ({filteredDeptEmployees.length} of {deptEmployees.length})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
                Performance tracking, KRAs, quantifiable KPIs, PIP status, attendance & open tasks
              </p>
            </div>

            {/* Quick Summary Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                Avg KPI Achievement:
              </span>
              <span style={{
                padding: '3px 10px',
                borderRadius: '9999px',
                backgroundColor: currentDeptDetail.avgKpiScore >= 80 ? '#DCFCE7' : '#FEF3C7',
                color: currentDeptDetail.avgKpiScore >= 80 ? '#15803D' : '#B45309',
                fontSize: '12px',
                fontWeight: 800
              }}>
                {currentDeptDetail.avgKpiScore}%
              </span>
            </div>
          </div>

          {/* Filter Bar (Period, KPI Status, PIP Status & Search) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            backgroundColor: '#F8FAFC',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0'
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 200px' }}>
              <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder={`Search ${effectiveDeptName} staff by name, ID...`}
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  fontFamily: "'Plus Jakarta Sans', sans-serif"
                }}
              />
            </div>

            {/* Filter 1: Period (Monthly / Quarterly) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Period:</span>
              <select
                value={periodFilter}
                onChange={e => setPeriodFilter(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  backgroundColor: '#FFFFFF',
                  color: '#1E293B',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="All Periods">All Evaluation Periods</option>
                <option value={currentMonthInfo.fullLabel}>{currentMonthInfo.fullLabel} (Current)</option>
                <option value={`Q${Math.floor(currentMonthInfo.monthIndex / 3) + 1} ${currentMonthInfo.year}`}>Q{Math.floor(currentMonthInfo.monthIndex / 3) + 1} {currentMonthInfo.year} Quarterly</option>
              </select>
            </div>

            {/* Filter 2: KPI Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>KPI Status:</span>
              <select
                value={kpiFilter}
                onChange={e => setKpiFilter(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  backgroundColor: '#FFFFFF',
                  color: '#1E293B',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ON_TRACK">On Track (≥ 80%)</option>
                <option value="AT_RISK">At Risk (70 - 79%)</option>
                <option value="BELOW_TARGET">Below Target (&lt; 70%)</option>
              </select>
            </div>

            {/* Filter 3: PIP Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>PIP:</span>
              <select
                value={pipFilter}
                onChange={e => setPipFilter(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  backgroundColor: '#FFFFFF',
                  color: '#1E293B',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All PIP</option>
                <option value="ACTIVE_PIP">On Active PIP</option>
                <option value="NOT_ON_PIP">Not on PIP</option>
              </select>
            </div>

            {/* Reset Filters button if any filter is active */}
            {(kpiFilter !== 'ALL' || pipFilter !== 'ALL' || periodFilter !== 'All Periods' || searchFilter) && (
              <button
                type="button"
                onClick={() => {
                  setKpiFilter('ALL');
                  setPipFilter('ALL');
                  setPeriodFilter('All Periods');
                  setSearchFilter('');
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {filteredDeptEmployees.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#64748B', fontSize: '13px', backgroundColor: '#F8FAFC', borderRadius: '12px' }}>
            No staff records match the current filters for {effectiveDeptName}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Employee</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Designation</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>KRA Status</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>KPI %</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>PIP Status</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Attendance %</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Open Tasks</th>
                  <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeptEmployees.map((emp, idx) => {
                  const openTasksCount = Math.max(0, emp.taskPerformance.tasksAssigned - emp.taskPerformance.tasksCompleted);
                  const isExceeded = emp.kraScore >= 90;
                  const isOnTrack = emp.kraScore >= 80 && emp.kraScore < 90;
                  const isAtRisk = emp.kraScore >= 70 && emp.kraScore < 80;

                  return (
                    <tr
                      key={emp.id}
                      onClick={() => onSelectEmployee(emp.employeeId)}
                      style={{
                        borderBottom: '1px solid #E7ECF3',
                        backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFCFE',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ECFEFF'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#FFFFFF' : '#FAFCFE'}
                    >
                      {/* 1. Name */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            backgroundColor: '#0E7490',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 750
                          }}>
                            {emp.employeeName.charAt(0)}
                          </div>
                          <div>
                            <strong style={{ fontSize: '13px', color: '#1E293B', display: 'block' }}>
                              {emp.employeeName}
                            </strong>
                            <span style={{ fontSize: '11px', color: '#64748B' }}>
                              {emp.employeeId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Designation */}
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#334155' }}>
                        {emp.designation}
                      </td>

                      {/* 3. KRA Status */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: isExceeded ? '#DCFCE7' : isOnTrack ? '#ECFEFF' : isAtRisk ? '#FEF3C7' : '#FEE2E2',
                            color: isExceeded ? '#15803D' : isOnTrack ? '#0E7490' : isAtRisk ? '#B45309' : '#B91C1C'
                          }}>
                            {isExceeded ? 'Exceeded' : isOnTrack ? 'On Track' : isAtRisk ? 'At Risk' : 'Behind'}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                            {emp.kraScore}%
                          </span>
                        </div>
                      </td>

                      {/* 4. KPI % */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{
                            fontSize: '13px',
                            color: emp.kpiScore >= 90 ? '#16A34A' : emp.kpiScore >= 80 ? '#0E7490' : emp.kpiScore >= 70 ? '#D97706' : '#DC2626',
                            minWidth: '36px'
                          }}>
                            {emp.kpiScore}%
                          </strong>
                          <div style={{ width: '56px', height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(emp.kpiScore, 100)}%`,
                              height: '100%',
                              backgroundColor: emp.kpiScore >= 90 ? '#22C55E' : emp.kpiScore >= 80 ? '#0E7490' : emp.kpiScore >= 70 ? '#F59E0B' : '#EF4444'
                            }} />
                          </div>
                        </div>
                      </td>

                      {/* 5. PIP Status */}
                      <td style={{ padding: '12px 14px' }}>
                        {emp.hasActivePip ? (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            backgroundColor: '#FEE2E2',
                            color: '#B91C1C',
                            fontSize: '11px',
                            fontWeight: 750,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <span>On PIP</span>
                          </span>
                        ) : (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            fontSize: '11px',
                            fontWeight: 600
                          }}>
                            Not on PIP
                          </span>
                        )}
                      </td>

                      {/* 6. Attendance % */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: emp.attendanceImpact.attendancePercent >= 95 ? '#ECFEFF' : '#FFFBEB',
                          color: emp.attendanceImpact.attendancePercent >= 95 ? '#0E7490' : '#D97706',
                          fontSize: '12px',
                          fontWeight: 700
                        }}>
                          {emp.attendanceImpact.attendancePercent}%
                        </span>
                      </td>

                      {/* 7. Open Tasks */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            {openTasksCount} Open
                          </span>
                          {emp.taskPerformance.overdueTasks > 0 && (
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#FEE2E2',
                              color: '#B91C1C',
                              fontSize: '10px',
                              fontWeight: 750
                            }}>
                              {emp.taskPerformance.overdueTasks} Overdue
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 8. Actions */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEmployee(emp.employeeId);
                          }}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '8px',
                            backgroundColor: '#ECFEFF',
                            border: '1px solid #A5F3FC',
                            color: '#0E7490',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                          }}
                          title={`View full performance profile for ${emp.employeeName}`}
                        >
                          <span>View Profile</span>
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
