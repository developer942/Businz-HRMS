import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { AttendancePolicy } from '../../types/settings';
import { GPSGeofenceSettings } from './GPSGeofenceSettings';
import { 
  Clock, 
  CalendarCheck, 
  Calendar,
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  MapPin,
  Sliders,
  X,
  Check,
  Users,
  Building,
  Briefcase,
  Bell,
  EyeOff
} from 'lucide-react';
import { OvertimePolicySettings } from './OvertimePolicySettings';
import { WeekOffCalendarSettings } from './WeekOffCalendarSettings';

// Custom Animated Toggle Switch
const ToggleSwitch: React.FC<{ checked: boolean; onChange: (val: boolean) => void }> = ({ checked, onChange }) => {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '99px',
        backgroundColor: checked ? '#0E7490' : '#CBD5E1',
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
          backgroundColor: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transform: checked ? 'translateX(20px)' : 'translateX(0px)',
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

export const AttendanceTimeSettings: React.FC = () => {
  const { 
    masterAttendancePolicies, 
    addMasterAttendancePolicy, 
    updateMasterAttendancePolicy, 
    toggleMasterAttendancePolicyStatus,
    deleteMasterAttendancePolicy,
    shifts,
    departments,
    employees,
    currentUser
  } = useHRMS();

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

  const isPrivileged = isCEO || isHR || userRole === 'Management' || userRole === 'Super Admin' || userRole !== 'Employee';
  const [activeSubTab, setActiveSubTab] = useState<'policies' | 'week_off' | 'ot_policies' | 'gps'>('policies');

  // Policy Modal State
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<AttendancePolicy | null>(null);

  // Derivations for multi-select options
  const allShifts = useMemo(() => shifts || [], [shifts]);
  const allDepartmentNames = useMemo(() => {
    return Array.from(new Set(
      (departments || []).map(d => d.name).concat(employees.map(e => e.department)).filter(Boolean)
    ));
  }, [departments, employees]);

  const allDesignationNames = useMemo(() => {
    return Array.from(new Set(
      employees.map(e => e.designation).filter(Boolean)
    ));
  }, [employees]);

  // Exactly 7 Clean Late Policy Fields Form State
  const [formState, setFormState] = useState<{
    policyName: string;
    applicableScope: 'ALL' | 'SHIFT' | 'DEPARTMENT' | 'DESIGNATION' | 'SPECIFIC';
    applicableDepartments: string[];
    applicableDesignations: string[];
    applicableShifts: string[];
    applicableEmployees: string[];
    gracePeriodMinutes: number;
    allowedLateCount: number;
    warningSystemEnabled: boolean;
    halfDayRuleEnabled: boolean;
    halfDayThresholdCount: number;
    lopRuleEnabled: boolean;
    lopThresholdCount: number;
  }>({
    policyName: '',
    applicableScope: 'ALL',
    applicableDepartments: [],
    applicableDesignations: [],
    applicableShifts: [],
    applicableEmployees: [],
    gracePeriodMinutes: 10,
    allowedLateCount: 3,
    warningSystemEnabled: true,
    halfDayRuleEnabled: true,
    halfDayThresholdCount: 4,
    lopRuleEnabled: true,
    lopThresholdCount: 6
  });

  // Conflict Detection across active policies (Precedence: Specific Staff > Shift > Designation > Dept > All)
  const conflictingPolicyIds = useMemo(() => {
    const active = masterAttendancePolicies.filter(p => p.status === 'Active');
    const conflicts = new Set<string>();

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const p1 = active[i];
        const p2 = active[j];

        const p1All = (!p1.applicableEmployees || p1.applicableEmployees === 'ALL') &&
                      (!p1.applicableDepartments || p1.applicableDepartments === 'ALL') &&
                      (!p1.applicableDesignations || p1.applicableDesignations === 'ALL') &&
                      (!p1.applicableShifts || p1.applicableShifts === 'ALL');
        const p2All = (!p2.applicableEmployees || p2.applicableEmployees === 'ALL') &&
                      (!p2.applicableDepartments || p2.applicableDepartments === 'ALL') &&
                      (!p2.applicableDesignations || p2.applicableDesignations === 'ALL') &&
                      (!p2.applicableShifts || p2.applicableShifts === 'ALL');

        if (p1All && p2All) {
          conflicts.add(p1.id);
          conflicts.add(p2.id);
          continue;
        }

        if (Array.isArray(p1.applicableShifts) && Array.isArray(p2.applicableShifts)) {
          if (p1.applicableShifts.some(s => p2.applicableShifts!.includes(s))) {
            conflicts.add(p1.id);
            conflicts.add(p2.id);
          }
        }

        if (Array.isArray(p1.applicableEmployees) && Array.isArray(p2.applicableEmployees)) {
          if (p1.applicableEmployees.some(e => p2.applicableEmployees!.includes(e))) {
            conflicts.add(p1.id);
            conflicts.add(p2.id);
          }
        }
      }
    }
    return conflicts;
  }, [masterAttendancePolicies]);

  const openAddPolicyModal = () => {
    setEditingPolicy(null);
    setFormState({
      policyName: '',
      applicableScope: 'ALL',
      applicableDepartments: [],
      applicableDesignations: [],
      applicableShifts: [],
      applicableEmployees: [],
      gracePeriodMinutes: 10,
      allowedLateCount: 3,
      warningSystemEnabled: true,
      halfDayRuleEnabled: true,
      halfDayThresholdCount: 4,
      lopRuleEnabled: true,
      lopThresholdCount: 6
    });
    setIsPolicyModalOpen(true);
  };

  const openEditPolicyModal = (p: AttendancePolicy) => {
    setEditingPolicy(p);

    let scope: 'ALL' | 'SHIFT' | 'DEPARTMENT' | 'DESIGNATION' | 'SPECIFIC' = 'ALL';
    if (Array.isArray(p.applicableEmployees) && p.applicableEmployees.length > 0) scope = 'SPECIFIC';
    else if (Array.isArray(p.applicableShifts) && p.applicableShifts.length > 0) scope = 'SHIFT';
    else if (Array.isArray(p.applicableDesignations) && p.applicableDesignations.length > 0) scope = 'DESIGNATION';
    else if (Array.isArray(p.applicableDepartments) && p.applicableDepartments.length > 0) scope = 'DEPARTMENT';

    setFormState({
      policyName: p.policyName,
      applicableScope: scope,
      applicableDepartments: Array.isArray(p.applicableDepartments) ? p.applicableDepartments : [],
      applicableDesignations: Array.isArray(p.applicableDesignations) ? p.applicableDesignations : [],
      applicableShifts: Array.isArray(p.applicableShifts) ? p.applicableShifts : [],
      applicableEmployees: Array.isArray(p.applicableEmployees) ? p.applicableEmployees : [],
      gracePeriodMinutes: p.graceTimeMinutes ?? 10,
      allowedLateCount: p.allowedLateCount ?? 3,
      warningSystemEnabled: p.warningSystemEnabled ?? true,
      halfDayRuleEnabled: p.halfDayRuleEnabled ?? true,
      halfDayThresholdCount: p.halfDayThresholdCount ?? 4,
      lopRuleEnabled: p.lopRuleEnabled ?? true,
      lopThresholdCount: p.lopThresholdCount ?? 6
    });
    setIsPolicyModalOpen(true);
  };

  const handleSavePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.policyName.trim()) {
      alert('Please enter a policy name.');
      return;
    }

    const payload = {
      policyName: formState.policyName.trim(),
      applicableEmployees: (formState.applicableScope === 'SPECIFIC' ? formState.applicableEmployees : 'ALL') as 'ALL' | string[],
      applicableDepartments: (formState.applicableScope === 'DEPARTMENT' ? formState.applicableDepartments : 'ALL') as 'ALL' | string[],
      applicableDesignations: (formState.applicableScope === 'DESIGNATION' ? formState.applicableDesignations : 'ALL') as 'ALL' | string[],
      applicableShifts: (formState.applicableScope === 'SHIFT' ? formState.applicableShifts : 'ALL') as 'ALL' | string[],
      graceTimeMinutes: Number(formState.gracePeriodMinutes) >= 0 ? Number(formState.gracePeriodMinutes) : 10,
      allowedLateCount: Number(formState.allowedLateCount) >= 0 ? Number(formState.allowedLateCount) : 3,
      warningSystemEnabled: Boolean(formState.warningSystemEnabled),
      halfDayRuleEnabled: Boolean(formState.halfDayRuleEnabled),
      halfDayThresholdCount: Number(formState.halfDayThresholdCount) || 4,
      lopRuleEnabled: Boolean(formState.lopRuleEnabled),
      lopThresholdCount: Number(formState.lopThresholdCount) || 6,
      status: (editingPolicy ? editingPolicy.status : 'Active') as 'Active' | 'Inactive'
    };

    if (editingPolicy) {
      updateMasterAttendancePolicy(editingPolicy.id, payload);
    } else {
      addMasterAttendancePolicy(payload);
    }
    setIsPolicyModalOpen(false);
  };

  const handleDeletePolicy = (p: AttendancePolicy) => {
    if (window.confirm(`Delete late policy "${p.policyName}"? Historical attendance punches and finalized payroll records will be safely preserved.`)) {
      deleteMasterAttendancePolicy(p.id);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Section Header & Sub-tab Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: '#FFFFFF',
        padding: '12px 18px',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)'
      }}>
        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#F1F5F9',
          padding: '4px',
          borderRadius: '10px'
        }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('policies')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeSubTab === 'policies' ? '#FFFFFF' : 'transparent',
              color: activeSubTab === 'policies' ? '#0E7490' : '#64748B',
              boxShadow: activeSubTab === 'policies' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              fontWeight: activeSubTab === 'policies' ? 750 : 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <CalendarCheck size={15} />
            <span>Late Policy</span>
            <span style={{
              fontSize: '0.7rem',
              padding: '1px 6px',
              borderRadius: '999px',
              backgroundColor: activeSubTab === 'policies' ? '#ECFEFF' : '#E2E8F0',
              color: activeSubTab === 'policies' ? '#0E7490' : '#64748B',
              fontWeight: 700
            }}>
              {masterAttendancePolicies.filter(p => p.status !== 'Archived').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('week_off')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeSubTab === 'week_off' ? '#FFFFFF' : 'transparent',
              color: activeSubTab === 'week_off' ? '#0E7490' : '#64748B',
              boxShadow: activeSubTab === 'week_off' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              fontWeight: activeSubTab === 'week_off' ? 750 : 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Calendar size={15} />
            <span>Week Off Calendar</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ot_policies')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeSubTab === 'ot_policies' ? '#FFFFFF' : 'transparent',
              color: activeSubTab === 'ot_policies' ? '#0E7490' : '#64748B',
              boxShadow: activeSubTab === 'ot_policies' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              fontWeight: activeSubTab === 'ot_policies' ? 750 : 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Sliders size={15} />
            <span>Overtime (OT) Rules</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('gps')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeSubTab === 'gps' ? '#FFFFFF' : 'transparent',
              color: activeSubTab === 'gps' ? '#0E7490' : '#64748B',
              boxShadow: activeSubTab === 'gps' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              fontWeight: activeSubTab === 'gps' ? 750 : 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <MapPin size={15} />
            <span>GPS Geofence Perimeter</span>
          </button>
        </div>

        {/* Primary Action Button */}
        {isPrivileged && activeSubTab === 'policies' && (
          <button
            type="button"
            onClick={openAddPolicyModal}
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
            <span>Create Policy</span>
          </button>
        )}
      </div>

      {/* TAB 1: LATE ATTENDANCE POLICIES LIST */}
      {activeSubTab === 'policies' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Policy Conflict Alert Banner */}
          {conflictingPolicyIds.size > 0 && (
            <div style={{
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.84rem',
              color: '#92400E'
            }}>
              <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0 }} />
              <div>
                <strong>Policy Conflict Warning:</strong> Multiple active late policies overlap in shift or employee assignments.
                BUSINZ automatically enforces deterministic precedence: <code>Specific Staff &gt; Shift &gt; Designation &gt; Department &gt; Company-Wide</code> to prevent duplicate penalties.
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
            {masterAttendancePolicies.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1.5px dashed #CBD5E1',
                padding: '48px 24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px'
              }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={24} />
                </div>
                <div style={{ fontWeight: 750, fontSize: '1.05rem', color: '#0F172A' }}>No Late Attendance Policies Configured</div>
                <div style={{ color: '#64748B', fontSize: '0.86rem', maxWidth: '440px', lineHeight: 1.5 }}>
                  Click <strong>+ Create Policy</strong> above to configure your organization's late attendance grace period, monthly allowed late count, warnings, Half-Day conversion, and Loss of Pay (LOP) rules across all shifts.
                </div>
              </div>
            ) : (
              masterAttendancePolicies.map(policy => {
                const isActive = policy.status === 'Active';
                const isArchived = policy.status === 'Archived';
                const hasConflict = conflictingPolicyIds.has(policy.id);

                // Scope description
                let scopeLabel = 'All Employees & Shifts';
                if (Array.isArray(policy.applicableEmployees) && policy.applicableEmployees.length > 0) {
                  scopeLabel = `Specific: ${policy.applicableEmployees.length} Staff`;
                } else if (Array.isArray(policy.applicableShifts) && policy.applicableShifts.length > 0) {
                  scopeLabel = `Shifts: ${policy.applicableShifts.join(', ')}`;
                } else if (Array.isArray(policy.applicableDepartments) && policy.applicableDepartments.length > 0) {
                  scopeLabel = `Dept: ${policy.applicableDepartments.join(', ')}`;
                } else if (Array.isArray(policy.applicableDesignations) && policy.applicableDesignations.length > 0) {
                  scopeLabel = `Desig: ${policy.applicableDesignations.join(', ')}`;
                }

                return (
                  <div
                    key={policy.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '16px',
                      border: hasConflict ? '1.5px solid #F59E0B' : '1px solid #E2E8F0',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
                      opacity: isArchived ? 0.6 : 1,
                      transition: 'all 0.18s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(15, 23, 42, 0.06)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.03)'}
                  >
                    <div>
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 750, color: '#0F172A', letterSpacing: '-0.01em' }}>
                              {policy.policyName}
                            </h4>
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>
                              v{policy.version}
                            </span>
                            {hasConflict && (
                              <span style={{
                                fontSize: '0.70rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                backgroundColor: '#FEF3C7',
                                color: '#B45309',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <AlertTriangle size={11} /> Overlap
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.78rem', color: '#0E7490', fontWeight: 600, display: 'inline-block', marginTop: '3px' }}>
                            Scope: {scopeLabel}
                          </span>
                        </div>

                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          backgroundColor: isActive ? '#DCFCE7' : '#F1F5F9',
                          color: isActive ? '#15803D' : '#64748B'
                        }}>
                          ● {policy.status}
                        </span>
                      </div>

                      {/* 7 Policy Parameters Grid */}
                      <div style={{
                        backgroundColor: '#F8FAFC',
                        padding: '14px',
                        borderRadius: '12px',
                        fontSize: '0.82rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '12px',
                        marginBottom: '14px',
                        border: '1px solid #F1F5F9'
                      }}>
                        {/* 1. Grace Period */}
                        <div>
                          <span style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
                            Grace Period:
                          </span>
                          <div style={{ fontWeight: 700, color: '#0E7490', marginTop: '2px' }}>
                            +{policy.graceTimeMinutes ?? 10} Mins Grace
                          </div>
                        </div>

                        {/* 2. Allowed Late Count */}
                        <div>
                          <span style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
                            Allowed Late Count:
                          </span>
                          <div style={{ fontWeight: 700, color: '#16A34A', marginTop: '2px' }}>
                            {policy.allowedLateCount ?? 3} Free / Month
                          </div>
                        </div>

                        {/* 3. Warning System */}
                        <div>
                          <span style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
                            Warning System:
                          </span>
                          <div style={{ marginTop: '2px' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: policy.warningSystemEnabled ? '#EFF6FF' : '#F1F5F9',
                              color: policy.warningSystemEnabled ? '#1E40AF' : '#64748B'
                            }}>
                              {policy.warningSystemEnabled ? '✓ Enabled' : 'Disabled'}
                            </span>
                          </div>
                        </div>

                        {/* 4. Half-Day Rule */}
                        <div>
                          <span style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
                            Half-Day Rule:
                          </span>
                          <div style={{ marginTop: '2px' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: policy.halfDayRuleEnabled ? '#FEF3C7' : '#F1F5F9',
                              color: policy.halfDayRuleEnabled ? '#B45309' : '#64748B'
                            }}>
                              {policy.halfDayRuleEnabled ? `Trigger @ ${policy.halfDayThresholdCount ?? 4}th Late` : 'Disabled'}
                            </span>
                          </div>
                        </div>

                        {/* 5. Loss of Pay (LOP) */}
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>
                            Loss of Pay (LOP):
                          </span>
                          <div style={{ marginTop: '2px' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: policy.lopRuleEnabled ? '#FEE2E2' : '#F1F5F9',
                              color: policy.lopRuleEnabled ? '#DC2626' : '#64748B'
                            }}>
                              {policy.lopRuleEnabled ? `Trigger @ ${policy.lopThresholdCount ?? 6}th Late (1 Day LOP)` : 'Disabled'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: '14px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {isPrivileged ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              style={{ 
                                fontSize: '0.78rem', 
                                padding: '6px 14px', 
                                borderRadius: '8px', 
                                backgroundColor: '#0E7490', 
                                color: '#FFFFFF', 
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              onClick={() => openEditPolicyModal(policy)}
                              title="Edit this Late Attendance Policy"
                            >
                              <Edit3 size={13} /> Edit Policy
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ 
                                fontSize: '0.78rem', 
                                padding: '6px 12px', 
                                borderRadius: '8px', 
                                backgroundColor: '#F8FAFC', 
                                border: '1px solid #CBD5E1', 
                                color: '#334155', 
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                              onClick={() => toggleMasterAttendancePolicyStatus(policy.id)}
                              disabled={isArchived}
                            >
                              {isActive ? 'Disable' : 'Enable'}
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                            🔒 Active Policy (CEO & HR Managed)
                          </span>
                        )}
                      </div>

                      {isPrivileged && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ 
                            color: '#EF4444', 
                            padding: '6px 12px', 
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FECACA',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                          onClick={() => handleDeletePolicy(policy)}
                          title="Delete Policy safely (Historical attendance records preserved)"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: WEEK OFF CALENDAR */}
      {activeSubTab === 'week_off' && (
        <WeekOffCalendarSettings />
      )}

      {/* TAB 3: OVERTIME (OT) RULES */}
      {activeSubTab === 'ot_policies' && (
        <OvertimePolicySettings />
      )}

      {/* TAB 4: GPS & GEOFENCE PERIMETER */}
      {activeSubTab === 'gps' && (
        <GPSGeofenceSettings />
      )}

      {/* CREATE / EDIT LATE POLICY MODAL (EXACTLY 7 CLEAN FIELDS) */}
      {isPolicyModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} color="#0E7490" />
                <h3 style={{ margin: 0 }}>
                  {editingPolicy ? `Edit Late Policy: ${editingPolicy.policyName}` : 'Create Late Policy'}
                </h3>
              </div>
              <button className="close-btn" title="Close" onClick={() => setIsPolicyModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePolicy}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. Policy Name */}
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A' }}>
                    1. Policy Name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. General Late Policy, Operations Shift Late Rule"
                    value={formState.policyName}
                    onChange={e => setFormState({ ...formState, policyName: e.target.value })}
                    required
                  />
                </div>

                {/* 2. Applicable Employees (Multi-Shift, Dept, Desig, or Specific Staff) */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A', marginBottom: '2px' }}>
                      2. Applicable Employees & Multi-Shift Support <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                      Users are NOT required to create one late policy per shift. Select multiple shifts or groups under this single policy; lateness will be calculated dynamically from each shift's individual start time.
                    </div>
                  </div>

                  {/* Scope Selector Pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                    {[
                      { key: 'ALL', label: 'All Employees & Shifts', icon: Users },
                      { key: 'SHIFT', label: 'Specific Shift(s)', icon: Clock },
                      { key: 'DEPARTMENT', label: 'Department(s)', icon: Building },
                      { key: 'DESIGNATION', label: 'Designation(s)', icon: Briefcase },
                      { key: 'SPECIFIC', label: 'Specific Staff', icon: ShieldCheck }
                    ].map(tab => {
                      const Icon = tab.icon;
                      const isSelected = formState.applicableScope === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setFormState({ ...formState, applicableScope: tab.key as any })}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: `1.5px solid ${isSelected ? '#0E7490' : '#E2E8F0'}`,
                            backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                            color: isSelected ? '#0E7490' : '#475569',
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: '0.80rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          <Icon size={14} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Shift Selection Multi-select */}
                  {formState.applicableScope === 'SHIFT' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#334155' }}>
                          Select Applicable Shifts ({formState.applicableShifts.length} selected):
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (formState.applicableShifts.length === allShifts.length) {
                              setFormState({ ...formState, applicableShifts: [] });
                            } else {
                              setFormState({ ...formState, applicableShifts: allShifts.map(s => s.shiftName) });
                            }
                          }}
                          style={{
                            fontSize: '0.74rem',
                            color: '#0E7490',
                            fontWeight: 700,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          {formState.applicableShifts.length === allShifts.length ? 'Deselect All' : 'Select All Shifts'}
                        </button>
                      </div>

                      {allShifts.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>No shifts configured in Shift Settings yet.</div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                          {allShifts.map(s => {
                            const isChecked = formState.applicableShifts.includes(s.shiftName) || formState.applicableShifts.includes(s.id);
                            return (
                              <label
                                key={s.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '0.78rem',
                                  padding: '8px 10px',
                                  backgroundColor: isChecked ? '#EFF6FF' : '#FFFFFF',
                                  border: `1px solid ${isChecked ? '#BFDBFE' : '#E2E8F0'}`,
                                  borderRadius: '8px',
                                  cursor: 'pointer'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setFormState({ ...formState, applicableShifts: [...formState.applicableShifts, s.shiftName] });
                                    } else {
                                      setFormState({ ...formState, applicableShifts: formState.applicableShifts.filter(n => n !== s.shiftName && n !== s.id) });
                                    }
                                  }}
                                  style={{ accentColor: '#0E7490' }}
                                />
                                <div>
                                  <div style={{ fontWeight: 700, color: '#1E293B' }}>{s.shiftName}</div>
                                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{s.startTime} – {s.endTime}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Department Selection Multi-select */}
                  {formState.applicableScope === 'DEPARTMENT' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '10px' }}>
                        Select Applicable Departments:
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                        {allDepartmentNames.map(dept => {
                          const isChecked = formState.applicableDepartments.includes(dept);
                          return (
                            <label
                              key={dept}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.78rem',
                                padding: '6px 10px',
                                backgroundColor: isChecked ? '#ECFEFF' : '#FFFFFF',
                                border: `1px solid ${isChecked ? '#A5F3FC' : '#E2E8F0'}`,
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setFormState({ ...formState, applicableDepartments: [...formState.applicableDepartments, dept] });
                                  } else {
                                    setFormState({ ...formState, applicableDepartments: formState.applicableDepartments.filter(d => d !== dept) });
                                  }
                                }}
                                style={{ accentColor: '#0E7490' }}
                              />
                              <span style={{ fontWeight: 600, color: '#1E293B' }}>{dept}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Designation Selection Multi-select */}
                  {formState.applicableScope === 'DESIGNATION' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '10px' }}>
                        Select Applicable Designations:
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                        {allDesignationNames.map(desig => {
                          const isChecked = formState.applicableDesignations.includes(desig);
                          return (
                            <label
                              key={desig}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.78rem',
                                padding: '6px 10px',
                                backgroundColor: isChecked ? '#ECFEFF' : '#FFFFFF',
                                border: `1px solid ${isChecked ? '#A5F3FC' : '#E2E8F0'}`,
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setFormState({ ...formState, applicableDesignations: [...formState.applicableDesignations, desig] });
                                  } else {
                                    setFormState({ ...formState, applicableDesignations: formState.applicableDesignations.filter(d => d !== desig) });
                                  }
                                }}
                                style={{ accentColor: '#0E7490' }}
                              />
                              <span style={{ fontWeight: 600, color: '#1E293B' }}>{desig}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Specific Staff Selection */}
                  {formState.applicableScope === 'SPECIFIC' && (
                    <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0', maxHeight: '180px', overflowY: 'auto' }}>
                      <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '10px' }}>
                        Select Specific Staff ({formState.applicableEmployees.length} selected):
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                        {employees.map(emp => {
                          const isChecked = formState.applicableEmployees.includes(emp.employeeId);
                          return (
                            <label
                              key={emp.employeeId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.78rem',
                                padding: '6px 10px',
                                backgroundColor: isChecked ? '#EFF6FF' : '#FFFFFF',
                                border: `1px solid ${isChecked ? '#BFDBFE' : '#E2E8F0'}`,
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setFormState({ ...formState, applicableEmployees: [...formState.applicableEmployees, emp.employeeId] });
                                  } else {
                                    setFormState({ ...formState, applicableEmployees: formState.applicableEmployees.filter(id => id !== emp.employeeId) });
                                  }
                                }}
                                style={{ accentColor: '#0E7490' }}
                              />
                              <div>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{emp.firstName} {emp.lastName}</span>
                                <span style={{ fontSize: '0.70rem', color: '#64748B', display: 'block' }}>{emp.employeeId} • {emp.department}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {formState.applicableScope === 'ALL' && (
                    <div style={{
                      backgroundColor: '#ECFEFF',
                      border: '1px solid #CFFAFE',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontSize: '0.80rem',
                      color: '#0E7490',
                      fontWeight: 600
                    }}>
                      ✓ Applies automatically company-wide to all shifts and active employees.
                    </div>
                  )}
                </div>

                {/* 3. Grace Period & 4. Allowed Late Count Row */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* 3. Grace Period */}
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A', marginBottom: '2px' }}>
                      3. Grace Period (Minutes) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ fontSize: '0.76rem', color: '#64748B', marginBottom: '6px' }}>
                      Calculated from each shift's individual start time.
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        className="form-control"
                        min={0}
                        max={120}
                        value={formState.gracePeriodMinutes}
                        onChange={e => setFormState({ ...formState, gracePeriodMinutes: parseInt(e.target.value) || 0 })}
                        required
                        style={{ paddingRight: '55px' }}
                      />
                      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>
                        Mins
                      </span>
                    </div>
                  </div>

                  {/* 4. Allowed Late Count */}
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A', marginBottom: '2px' }}>
                      4. Allowed Late Count (per Month) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ fontSize: '0.76rem', color: '#64748B', marginBottom: '6px' }}>
                      Free late entries allowed per employee each month.
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        className="form-control"
                        min={0}
                        max={31}
                        value={formState.allowedLateCount}
                        onChange={e => setFormState({ ...formState, allowedLateCount: parseInt(e.target.value) || 0 })}
                        required
                        style={{ paddingRight: '75px' }}
                      />
                      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>
                        Days/Mo
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. Warning System */}
                <div style={{
                  borderTop: '1px solid #E2E8F0',
                  paddingTop: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#F8FAFC',
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1px solid #F1F5F9'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Bell size={16} color="#0E7490" />
                      5. Warning System
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                      Display late arrival warning counters on employee dashboard and notify reporting managers.
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={formState.warningSystemEnabled}
                    onChange={val => setFormState({ ...formState, warningSystemEnabled: val })}
                  />
                </div>

                {/* 6. Half-Day Rule */}
                <div style={{
                  borderTop: '1px solid #E2E8F0',
                  paddingTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  backgroundColor: formState.halfDayRuleEnabled ? '#FFFBEB' : '#F8FAFC',
                  padding: '14px',
                  borderRadius: '12px',
                  border: `1px solid ${formState.halfDayRuleEnabled ? '#FDE68A' : '#F1F5F9'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A' }}>
                        6. Half-Day Rule
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                        Automatically mark attendance penalty as half-day once the late threshold count is reached.
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={formState.halfDayRuleEnabled}
                      onChange={val => setFormState({ ...formState, halfDayRuleEnabled: val })}
                    />
                  </div>

                  {formState.halfDayRuleEnabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                      <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#334155' }}>
                        Trigger at Late Count:
                      </span>
                      <input
                        type="number"
                        className="form-control"
                        min={1}
                        max={31}
                        value={formState.halfDayThresholdCount}
                        onChange={e => setFormState({ ...formState, halfDayThresholdCount: parseInt(e.target.value) || 4 })}
                        style={{ width: '90px' }}
                      />
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        th late occurrence in month (e.g. 4th late marks as half-day)
                      </span>
                    </div>
                  )}
                </div>

                {/* 7. Loss of Pay (LOP) */}
                <div style={{
                  borderTop: '1px solid #E2E8F0',
                  paddingTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  backgroundColor: formState.lopRuleEnabled ? '#FEF2F2' : '#F8FAFC',
                  padding: '14px',
                  borderRadius: '12px',
                  border: `1px solid ${formState.lopRuleEnabled ? '#FECACA' : '#F1F5F9'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A' }}>
                        7. Loss of Pay (LOP)
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                        Deduct full day salary via existing Payroll Framework (avoids duplicate Half-Day deduction).
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={formState.lopRuleEnabled}
                      onChange={val => setFormState({ ...formState, lopRuleEnabled: val })}
                    />
                  </div>

                  {formState.lopRuleEnabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                      <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#334155' }}>
                        Trigger at Late Count:
                      </span>
                      <input
                        type="number"
                        className="form-control"
                        min={1}
                        max={31}
                        value={formState.lopThresholdCount}
                        onChange={e => setFormState({ ...formState, lopThresholdCount: parseInt(e.target.value) || 6 })}
                        style={{ width: '90px' }}
                      />
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        th late occurrence in month (e.g. 6th late incurs 1 full-day LOP)
                      </span>
                    </div>
                  )}
                </div>

              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsPolicyModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#0E7490', border: 'none' }}>
                  {editingPolicy ? 'Update Policy' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
