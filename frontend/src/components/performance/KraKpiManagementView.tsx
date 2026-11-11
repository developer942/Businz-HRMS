import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import {
  KraItem,
  KpiItem,
  EmployeePerformanceDetail,
  CompanyDepartment
} from '../../types/performance';
import { PerformanceTerminologyTooltip } from './PerformanceTerminologyTooltip';
import {
  Target,
  TrendingUp,
  Plus,
  Search,
  Filter,
  Edit2,
  Archive,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  Award
} from 'lucide-react';

interface KraKpiManagementViewProps {
  employees: EmployeePerformanceDetail[];
  onUpdateEmployees?: (updated: EmployeePerformanceDetail[]) => void;
}

export const KraKpiManagementView: React.FC<KraKpiManagementViewProps> = ({
  employees,
  onUpdateEmployees
}) => {
  const [subTab, setSubTab] = useState<'kra' | 'kpi'>('kra');
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Flattened KRAs from all employees for centralized management
  const [kras, setKras] = useState<(KraItem & { employeeName: string; employeeId: string; department: string })[]>(() => {
    const list: (KraItem & { employeeName: string; employeeId: string; department: string })[] = [];
    employees.forEach(emp => {
      emp.kras.forEach(k => {
        list.push({
          ...k,
          employeeName: emp.employeeName,
          employeeId: emp.employeeId,
          department: emp.department
        });
      });
    });
    return list;
  });

  // Flattened KPIs from all employees
  const [kpis, setKpis] = useState<(KpiItem & { employeeName: string; employeeId: string })[]>(() => {
    const list: (KpiItem & { employeeName: string; employeeId: string })[] = [];
    employees.forEach(emp => {
      if (emp.kpis) {
        emp.kpis.forEach(kp => {
          list.push({
            ...kp,
            employeeName: emp.employeeName,
            employeeId: emp.employeeId
          });
        });
      }
    });
    return list;
  });

  // Modal States
  const [isCreateKraModalOpen, setIsCreateKraModalOpen] = useState(false);
  const [isCreateKpiModalOpen, setIsCreateKpiModalOpen] = useState(false);

  // KRA Form State
  const [kraTitle, setKraTitle] = useState('');
  const [kraDesc, setKraDesc] = useState('');
  const [kraTarget, setKraTarget] = useState('');
  const [kraWeight, setKraWeight] = useState(25);
  const [kraEmployeeId, setKraEmployeeId] = useState(employees[0]?.employeeId || '');
  const [kraReviewPeriod, setKraReviewPeriod] = useState('2026 Q3');

  // KPI Form State
  const [kpiTitle, setKpiTitle] = useState('');
  const [kpiTarget, setKpiTarget] = useState('');
  const [kpiActual, setKpiActual] = useState('');
  const [kpiWeight, setKpiWeight] = useState(20);
  const [kpiUnit, setKpiUnit] = useState('%');
  const [kpiEmployeeId, setKpiEmployeeId] = useState(employees[0]?.employeeId || '');

  const { orgStructure } = useHRMS();
  const configuredDepts = orgStructure?.departments || [];
  const departments = ['ALL', ...configuredDepts];

  const handleCreateKra = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmp = employees.find(e => e.employeeId === kraEmployeeId) || employees[0];
    const newKraItem: KraItem & { employeeName: string; employeeId: string; department: string } = {
      id: `kra-${Date.now()}`,
      title: kraTitle,
      description: kraDesc,
      weightage: kraWeight,
      targetMetric: kraTarget,
      achievedMetric: 'Pending Evaluation',
      achievementPercentage: 0,
      score: 0,
      reviewPeriod: kraReviewPeriod,
      status: 'On Track',
      employeeName: targetEmp.employeeName,
      employeeId: targetEmp.employeeId,
      department: targetEmp.department
    };

    setKras([newKraItem, ...kras]);
    setIsCreateKraModalOpen(false);
    setKraTitle('');
    setKraDesc('');
    setKraTarget('');
  };

  const handleCreateKpi = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmp = employees.find(e => e.employeeId === kpiEmployeeId) || employees[0];
    const actualVal = parseFloat(kpiActual) || 0;
    const targetVal = parseFloat(kpiTarget) || 100;
    const ach = Math.min(Math.round((actualVal / (targetVal || 1)) * 100), 100);

    const newKpiItem: KpiItem & { employeeName: string; employeeId: string } = {
      id: `kpi-${Date.now()}`,
      title: kpiTitle,
      department: targetEmp.department,
      target: kpiTarget,
      actual: kpiActual,
      achievementPercentage: ach,
      weightage: kpiWeight,
      score: ach,
      unit: kpiUnit,
      employeeName: targetEmp.employeeName,
      employeeId: targetEmp.employeeId
    };

    setKpis([newKpiItem, ...kpis]);
    setIsCreateKpiModalOpen(false);
    setKpiTitle('');
    setKpiTarget('');
    setKpiActual('');
  };

  const handleArchiveKra = (id: string) => {
    setKras(prev => prev.filter(k => k.id !== id));
  };

  const handleArchiveKpi = (id: string) => {
    setKpis(prev => prev.filter(kp => kp.id !== id));
  };

  // Filtered lists
  const filteredKras = kras.filter(k => {
    const matchesSearch = k.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.targetMetric.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === 'ALL' || k.department.toLowerCase() === deptFilter.toLowerCase();
    return matchesSearch && matchesDept;
  });

  const filteredKpis = kpis.filter(k => {
    const matchesSearch = k.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === 'ALL' || k.department.toLowerCase() === deptFilter.toLowerCase();
    return matchesSearch && matchesDept;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── TOP HEADER & SUB-TABS ── */}
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
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {subTab === 'kra' ? <Target size={24} /> : <TrendingUp size={24} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#1E293B', fontFamily: 'DM Sans, sans-serif', letterSpacing: '-0.02em' }}>
                {subTab === 'kra' ? 'KRA Management' : 'KPI Management'}
              </h1>
              <PerformanceTerminologyTooltip term={subTab === 'kra' ? 'KRA' : 'KPI'} />
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
              {subTab === 'kra'
                ? 'Create, assign, set weightage and track Key Result Areas across departments'
                : 'Configure measurable Key Performance Indicators, progress bars and targets'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Sub Tab Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: '#F1F5F9',
            padding: '4px',
            borderRadius: '12px'
          }}>
            <button
              type="button"
              onClick={() => setSubTab('kra')}
              style={{
                padding: '8px 16px',
                borderRadius: '9px',
                border: 'none',
                backgroundColor: subTab === 'kra' ? '#0E7490' : 'transparent',
                color: subTab === 'kra' ? '#FFFFFF' : '#475569',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Target size={14} />
              <span>KRAs ({kras.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('kpi')}
              style={{
                padding: '8px 16px',
                borderRadius: '99px',
                border: 'none',
                backgroundColor: subTab === 'kpi' ? '#0E7490' : 'transparent',
                color: subTab === 'kpi' ? '#FFFFFF' : '#475569',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <TrendingUp size={14} />
              <span>KPIs ({kpis.length})</span>
            </button>
          </div>

          {/* Action Button */}
          {subTab === 'kra' ? (
            <button
              type="button"
              onClick={() => setIsCreateKraModalOpen(true)}
              title="Create KRA"
              aria-label="Create KRA"
              style={{
                width: '38px',
                height: '38px',
                padding: 0,
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                borderRadius: '10px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
              }}
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreateKpiModalOpen(true)}
              title="Create KPI"
              aria-label="Create KPI"
              style={{
                width: '38px',
                height: '38px',
                padding: 0,
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                borderRadius: '10px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
              }}
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* ── FILTER & SEARCH BAR ── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder={`Search ${subTab.toUpperCase()} or employee...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="#64748B" />
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                color: '#1E293B',
                fontWeight: 600,
                outline: 'none',
                backgroundColor: '#FFFFFF'
              }}
            >
              {departments.map(d => (
                <option key={d} value={d}>
                  {d === 'ALL' ? 'All Departments' : d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
          Showing {subTab === 'kra' ? filteredKras.length : filteredKpis.length} entries
        </span>
      </div>

      {/* ── KRA TABLE VIEW ── */}
      {subTab === 'kra' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>KRA Area & Description</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Department</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Assigned Employee</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Weightage</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Target Metric</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Achievement</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Score</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredKras.map((k, idx) => (
                  <tr
                    key={k.id}
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
                        {k.title}
                      </strong>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '2px', maxWidth: '280px' }}>
                        {k.description}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: '#F1F5F9', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                        {k.department}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E293B', fontWeight: 600 }}>
                      {k.employeeName}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#ECFEFF',
                        color: '#0E7490',
                        fontSize: '12px',
                        fontWeight: 800
                      }}>
                        {k.weightage}%
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                      {k.targetMetric}
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E293B' }}>
                      {k.achievedMetric}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <strong style={{ fontSize: '13px', color: '#0E7490' }}>
                        {k.score || 0}%
                      </strong>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: k.status === 'Exceeded' || k.status === 'Completed' || k.status === 'Good' ? '#DCFCE7' : k.status === 'On Track' ? '#EFF6FF' : '#FEF3C7',
                        color: k.status === 'Exceeded' || k.status === 'Completed' || k.status === 'Good' ? '#15803D' : k.status === 'On Track' ? '#1D4ED8' : '#B45309'
                      }}>
                        {k.status}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleArchiveKra(k.id)}
                          title="Archive KRA"
                          style={{
                            padding: '4px',
                            background: 'none',
                            border: 'none',
                            color: '#94A3B8',
                            cursor: 'pointer'
                          }}
                        >
                          <Archive size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── KPI TABLE VIEW (WITH PROGRESS BARS) ── */}
      {subTab === 'kpi' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E7ECF3',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>KPI Indicator</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Department</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Assigned Employee</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Target</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Actual</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Achievement & Progress</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Weightage</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Score</th>
                  <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredKpis.map((kp, idx) => (
                  <tr
                    key={kp.id}
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
                        {kp.title}
                      </strong>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: '#F1F5F9', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                        {kp.department}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E293B', fontWeight: 600 }}>
                      {kp.employeeName}
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                      {kp.target}
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E293B', fontWeight: 700 }}>
                      {kp.actual}
                    </td>

                    {/* Simple Progress Bar */}
                    <td style={{ padding: '14px 16px', minWidth: '160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '7px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(kp.achievementPercentage, 100)}%`,
                            height: '100%',
                            backgroundColor: kp.achievementPercentage >= 100 ? '#16A34A' : kp.achievementPercentage >= 80 ? '#0E7490' : '#D97706',
                            borderRadius: '4px'
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', minWidth: '38px', textAlign: 'right' }}>
                          {kp.achievementPercentage}%
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#DCFCE7',
                        color: '#15803D',
                        fontSize: '12px',
                        fontWeight: 800
                      }}>
                        {kp.weightage}%
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <strong style={{ fontSize: '13px', color: '#0E7490' }}>
                        {kp.score}%
                      </strong>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleArchiveKpi(kp.id)}
                        title="Archive KPI"
                        style={{
                          padding: '4px',
                          background: 'none',
                          border: 'none',
                          color: '#94A3B8',
                          cursor: 'pointer'
                        }}
                      >
                        <Archive size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CREATE KRA MODAL ── */}
      {isCreateKraModalOpen && (
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
                  Create & Assign New KRA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateKraModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateKra} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  KRA Title / Area <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Utility Solar Order Booking, Onboarding Compliance"
                  value={kraTitle}
                  onChange={e => setKraTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Description & Scope
                </label>
                <textarea
                  rows={2}
                  placeholder="Key strategic outcome expected from employee..."
                  value={kraDesc}
                  onChange={e => setKraDesc(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Assign to Employee <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={kraEmployeeId}
                    onChange={e => setKraEmployeeId(e.target.value)}
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
                    value={kraWeight}
                    onChange={e => setKraWeight(parseInt(e.target.value) || 25)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Target Metric <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ₹80 Lakhs Booking, 100 Tickets"
                    value={kraTarget}
                    onChange={e => setKraTarget(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Review Period
                  </label>
                  <input
                    type="text"
                    value={kraReviewPeriod}
                    onChange={e => setKraReviewPeriod(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateKraModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save & Assign KRA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CREATE KPI MODAL ── */}
      {isCreateKpiModalOpen && (
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
                <TrendingUp size={20} color="#0E7490" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E293B' }}>
                  Create & Assign New KPI
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateKpiModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateKpi} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  KPI Indicator Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Sales Target, Tickets Resolved, Invoice Accuracy"
                  value={kpiTitle}
                  onChange={e => setKpiTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Assign to Employee <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={kpiEmployeeId}
                    onChange={e => setKpiEmployeeId(e.target.value)}
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
                    value={kpiWeight}
                    onChange={e => setKpiWeight(parseInt(e.target.value) || 20)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Target Value <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 100 or ₹80L"
                    value={kpiTarget}
                    onChange={e => setKpiTarget(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Actual Value <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 92"
                    value={kpiActual}
                    onChange={e => setKpiActual(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Unit
                  </label>
                  <select
                    value={kpiUnit}
                    onChange={e => setKpiUnit(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="%">% Percentage</option>
                    <option value="₹">₹ Currency</option>
                    <option value="qty">Count (Qty)</option>
                    <option value="hrs">Hours</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateKpiModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#0E7490', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save & Assign KPI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
