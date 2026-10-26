import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  SalaryComponentConfig,
  ComponentEligibilityType,
  ComponentEligibilityBase,
  ComponentEligibilityOperator,
} from '../../types/settings';
import { payrollApi } from '../../services/payrollApi';
import { INITIAL_PAYROLL_CONFIG } from '../../data/settingsInitialData';
import { formatCurrency } from '../../utils/numbers';
import { 
  getEligibilityBadgeLabel, 
  validateComponentEligibility 
} from '../../services/policyEngine';
import { 
  CreditCard, 
  Plus, 
  Edit3, 
  CheckCircle2, 
  Sliders, 
  FileText, 
  Layers, 
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Info,
  RotateCcw,
  X,
  Users,
  Search,
  Filter
} from 'lucide-react';

export const PayrollSettings: React.FC = () => {
  const { 
    payrollSettingsConfig, 
    updatePayrollSettingsConfig, 
    toggleSalaryComponent,
    currentUser,
    employees
  } = useHRMS();

  const isPrivileged = currentUser.role !== 'Employee';

  // Component Edit Modal
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<SalaryComponentConfig | null>(null);
  const [defaultValueDraft, setDefaultValueDraft] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState<string | null>(null);
  const [limitMaxDraft, setLimitMaxDraft] = useState<string | null>(null);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [compValidationError, setCompValidationError] = useState<string | null>(null);

  const [compForm, setCompForm] = useState<{
    name: string;
    code: string;
    type: 'EARNING' | 'DEDUCTION';
    calculationMethod: 'FIXED_AMOUNT' | 'PERCENTAGE' | 'FORMULA';
    defaultValue: number;
    percentageBase: 'BASIC' | 'GROSS' | 'CTC';
    formula: string;
    isStatutory: boolean;
    isConfidential: boolean;
    description: string;
    eligibilityType: ComponentEligibilityType;
    eligibilityBase: ComponentEligibilityBase;
    eligibilityOperator: ComponentEligibilityOperator;
    eligibilityLimit: number;
    eligibilityLimitMax: number;
    eligibleEmployeeIds: string[];
  }>({
    name: '',
    code: '',
    type: 'EARNING',
    calculationMethod: 'FIXED_AMOUNT',
    defaultValue: 0,
    percentageBase: 'BASIC',
    formula: '',
    isStatutory: false,
    isConfidential: false,
    description: '',
    eligibilityType: 'ALL',
    eligibilityBase: 'CTC',
    eligibilityOperator: '>=',
    eligibilityLimit: 0,
    eligibilityLimitMax: 0,
    eligibleEmployeeIds: []
  });

  const filteredPickerEmployees = useMemo(() => {
    const q = empSearchQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e => 
      e.employeeId?.toLowerCase().includes(q) ||
      e.firstName?.toLowerCase().includes(q) ||
      e.lastName?.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q) ||
      e.designation?.toLowerCase().includes(q)
    );
  }, [employees, empSearchQuery]);

  const openAddCompModal = () => {
    openAddCompModalWithType('EARNING');
  };

  const openAddCompModalWithType = (type: 'EARNING' | 'DEDUCTION') => {
    setEditingComp(null);
    setCompValidationError(null);
    setEmpSearchQuery('');
    setCompForm({
      name: '',
      code: '',
      type: type,
      calculationMethod: type === 'EARNING' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
      defaultValue: type === 'EARNING' ? 10 : 0,
      percentageBase: type === 'EARNING' ? 'CTC' : 'GROSS',
      formula: '',
      isStatutory: false,
      isConfidential: false,
      description: '',
      eligibilityType: 'ALL',
      eligibilityBase: 'CTC',
      eligibilityOperator: '>=',
      eligibilityLimit: 0,
      eligibilityLimitMax: 0,
      eligibleEmployeeIds: []
    });
    setDefaultValueDraft(type === 'EARNING' ? '10' : '');
    setLimitDraft('');
    setLimitMaxDraft('');
    setIsCompModalOpen(true);
  };

  const openEditCompModal = (c: SalaryComponentConfig) => {
    setEditingComp(c);
    setCompValidationError(null);
    setEmpSearchQuery('');
    setCompForm({
      name: c.name,
      code: c.code,
      type: c.type,
      calculationMethod: c.calculationMethod,
      defaultValue: c.defaultValue,
      percentageBase: c.percentageBase || 'BASIC',
      formula: c.formula || '',
      isStatutory: c.isStatutory,
      isConfidential: c.isConfidential,
      description: c.description,
      eligibilityType: c.eligibilityType || 'ALL',
      eligibilityBase: c.eligibilityBase || 'CTC',
      eligibilityOperator: c.eligibilityOperator || '>=',
      eligibilityLimit: c.eligibilityLimit ?? 0,
      eligibilityLimitMax: c.eligibilityLimitMax ?? 0,
      eligibleEmployeeIds: c.eligibleEmployeeIds || []
    });
    setDefaultValueDraft(c.defaultValue !== undefined && c.defaultValue !== null ? String(c.defaultValue) : '');
    setLimitDraft(c.eligibilityLimit !== undefined && c.eligibilityLimit !== null ? String(c.eligibilityLimit) : '');
    setLimitMaxDraft(c.eligibilityLimitMax !== undefined && c.eligibilityLimitMax !== null ? String(c.eligibilityLimitMax) : '');
    setIsCompModalOpen(true);
  };

  const handleDefaultValueChange = (rawValue: string) => {
    setDefaultValueDraft(rawValue);
    setCompForm(prev => ({ ...prev, defaultValue: rawValue === '' ? 0 : Number(rawValue) }));
  };

  const handleLimitChange = (rawValue: string) => {
    setLimitDraft(rawValue);
    setCompForm(prev => ({ ...prev, eligibilityLimit: rawValue === '' ? 0 : Number(rawValue) }));
  };

  const handleLimitMaxChange = (rawValue: string) => {
    setLimitMaxDraft(rawValue);
    setCompForm(prev => ({ ...prev, eligibilityLimitMax: rawValue === '' ? 0 : Number(rawValue) }));
  };

  const handleSaveComp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!compForm.name.trim() || !compForm.code.trim()) {
      setCompValidationError('Component Name and Code are required.');
      return;
    }

    const validation = validateComponentEligibility(compForm);
    if (!validation.isValid) {
      setCompValidationError(validation.error || 'Please correct component eligibility configuration.');
      return;
    }
    setCompValidationError(null);

    const compData: Partial<SalaryComponentConfig> = {
      name: compForm.name,
      code: compForm.code.toUpperCase().replace(/\s+/g, '_'),
      type: compForm.type,
      calculationMethod: compForm.calculationMethod,
      defaultValue: Number(compForm.defaultValue) || 0,
      percentageBase: compForm.percentageBase,
      formula: compForm.formula,
      isStatutory: compForm.isStatutory,
      isConfidential: compForm.isConfidential,
      description: compForm.description,
      eligibilityType: compForm.eligibilityType,
      eligibilityBase: compForm.eligibilityBase,
      eligibilityOperator: compForm.eligibilityOperator,
      eligibilityLimit: compForm.eligibilityLimit ? Number(compForm.eligibilityLimit) : 0,
      eligibilityLimitMax: compForm.eligibilityLimitMax ? Number(compForm.eligibilityLimitMax) : undefined,
      eligibleEmployeeIds: compForm.eligibleEmployeeIds || [],
      version: editingComp?.version ? editingComp.version + 1 : 1,
      effectiveFrom: new Date().toISOString()
    };

    if (editingComp) {
      const updated = payrollSettingsConfig.components.map(c => {
        if (c.id === editingComp.id) {
          return {
            ...c,
            ...compData
          } as SalaryComponentConfig;
        }
        return c;
      });
      updatePayrollSettingsConfig({ components: updated });
      payrollApi.updatePayrollSettingsConfig({ components: updated }).catch(() => {});
    } else {
      const newComp: SalaryComponentConfig = {
        id: `c-${Date.now()}`,
        active: true,
        ...compData
      } as SalaryComponentConfig;
      const updated = [...payrollSettingsConfig.components, newComp];
      updatePayrollSettingsConfig({ components: updated });
      payrollApi.updatePayrollSettingsConfig({ components: updated }).catch(() => {});
    }
    setIsCompModalOpen(false);
  };

  const handleDeleteComp = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to permanently delete the salary component "${name}"?`)) {
      const updated = payrollSettingsConfig.components.filter(c => c.id !== id);
      updatePayrollSettingsConfig({ components: updated });
    }
  };

  // Official company earnings (Basic 40%, DA 20%, HRA 35%, Conveyance 5% = 100% CTC)
  const earnings = payrollSettingsConfig.components.filter(c => c.type === 'EARNING');
  const deductions = payrollSettingsConfig.components.filter(c => c.type === 'DEDUCTION');

  const getCalculationDetails = (comp: SalaryComponentConfig) => {
    if (comp.calculationMethod === 'FIXED_AMOUNT') {
      return formatCurrency(comp.defaultValue);
    }
    if (comp.calculationMethod === 'PERCENTAGE') {
      return `${comp.defaultValue}% of ${comp.percentageBase || (comp.type === 'EARNING' ? 'CTC' : 'Gross')}`;
    }
    return `Formula: ${comp.formula || '-'}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Integrated Navigation & Actions Bar */}
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
        {/* Left: Section Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            fontWeight: 750,
            fontSize: '0.84rem'
          }}>
            <Layers size={16} />
            <span>Salary Components</span>
            <span style={{
              fontSize: '0.7rem',
              padding: '1px 6px',
              borderRadius: '999px',
              backgroundColor: '#FFFFFF',
              color: '#0E7490',
              fontWeight: 700
            }}>
              {earnings.length + deductions.length}
            </span>
          </div>
        </div>

        {/* Right: Add Component Button */}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => openAddCompModal()}
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            borderRadius: '10px', 
            fontWeight: 750,
            backgroundColor: '#0E7490',
            color: '#FFFFFF',
            border: 'none',
            padding: '8px 16px',
            fontSize: '0.84rem',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(14, 116, 144, 0.25)'
          }}
        >
          <Plus size={16} /> Add Salary Component
        </button>
      </div>

      {/* SALARY COMPONENTS TABLES */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Earnings Table */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22C55E' }} />
                Earnings & Allowances ({earnings.length})
              </h3>
            </div>

            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Code</th>
                  <th>Method</th>
                  <th>Calculation Details</th>
                  <th>Eligibility</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {earnings.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748B', fontSize: '13px' }}>
                      No earnings & allowances configured. Click <strong>+ Add Salary Component</strong> to create one.
                    </td>
                  </tr>
                ) : (
                  earnings.map(comp => (
                    <tr key={comp.id} style={{ opacity: comp.active ? 1 : 0.55 }}>
                      <td>
                        <strong>{comp.name}</strong>
                        <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{comp.description}</div>
                      </td>
                      <td><code>{comp.code}</code></td>
                      <td><span className="status-pill eta">{comp.calculationMethod.replace(/_/g, ' ')}</span></td>
                      <td>
                        {getCalculationDetails(comp)}
                      </td>
                      <td>
                        <span className="status-pill eta" style={{ fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                          {getEligibilityBadgeLabel(comp)}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${comp.active ? 'approved' : 'overdue'}`}>
                          {comp.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px' }}
                            onClick={() => openEditCompModal(comp)}
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px' }}
                            onClick={() => toggleSalaryComponent(comp.code)}
                          >
                            {comp.active ? 'Disable' : 'Enable'}
                          </button>
                          {isPrivileged && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', color: '#DC2626', borderColor: '#FECACA' }}
                              onClick={() => handleDeleteComp(comp.id, comp.name)}
                              title="Delete Component"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Deductions Table */}
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E7ECF3', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#991B1B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
                Deductions & Statutory Contributions ({deductions.length})
              </h3>
            </div>

            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Code</th>
                  <th>Method</th>
                  <th>Calculation Details</th>
                  <th>Eligibility</th>
                  <th>Employee Visibility</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deductions.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748B', fontSize: '13px' }}>
                      No deductions configured. Click <strong>+ Add Salary Component</strong> to create one.
                    </td>
                  </tr>
                ) : (
                  deductions.map(comp => (
                    <tr key={comp.id} style={{ opacity: comp.active ? 1 : 0.55 }}>
                      <td>
                        <strong>{comp.name}</strong>
                        <div style={{ fontSize: '0.74rem', color: '#64748B' }}>{comp.description}</div>
                      </td>
                      <td><code>{comp.code}</code></td>
                      <td><span className="status-pill eta">{comp.calculationMethod.replace(/_/g, ' ')}</span></td>
                      <td>
                        {comp.code === 'EPF' && comp.calculationMethod !== 'FORMULA' ? (
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>12% of Base (Basic + DA + Conveyance)</span>
                        ) : comp.code === 'ESIC' && comp.calculationMethod !== 'FORMULA' ? (
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>0.75% of Gross (wage ceiling ₹21,000.00)</span>
                        ) : (
                          <>
                            {comp.calculationMethod === 'FIXED_AMOUNT' && formatCurrency(comp.defaultValue)}
                            {comp.calculationMethod === 'PERCENTAGE' && `${comp.defaultValue}% of ${comp.percentageBase || 'Gross'}`}
                            {comp.calculationMethod === 'FORMULA' && `Formula: ${comp.formula}`}
                          </>
                        )}
                      </td>
                      <td>
                        <span className="status-pill eta" style={{ fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                          {getEligibilityBadgeLabel(comp)}
                        </span>
                      </td>
                      <td>
                        {comp.isConfidential ? (
                          <span style={{ fontSize: '0.76rem', color: '#DC2626', fontWeight: 600 }}>
                            Confidential (OTHERS)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.76rem', color: '#16A34A', fontWeight: 600 }}>
                            Visible
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`status-pill ${comp.active ? 'approved' : 'overdue'}`}>
                          {comp.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px' }}
                            onClick={() => openEditCompModal(comp)}
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px' }}
                            onClick={() => toggleSalaryComponent(comp.code)}
                          >
                            {comp.active ? 'Disable' : 'Enable'}
                          </button>
                          {isPrivileged && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', color: '#DC2626', borderColor: '#FECACA' }}
                              onClick={() => handleDeleteComp(comp.id, comp.name)}
                              title="Delete Component"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* COMPONENT CREATE / EDIT MODAL */}
      {isCompModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3>{editingComp ? `Edit Component: ${editingComp.name}` : 'Create Salary Component'}</h3>
              <button className="close-btn" title="Close" onClick={() => setIsCompModalOpen(false)}>
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSaveComp} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', overflowY: 'auto', padding: '16px' }}>
                {compValidationError && (
                  <div style={{
                    gridColumn: '1 / -1',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertCircle size={16} />
                    <span>{compValidationError}</span>
                  </div>
                )}

                <div>
                  <label className="form-label">Component Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={compForm.name}
                    onChange={e => setCompForm({ ...compForm, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Component Code</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. HRA"
                    value={compForm.code}
                    onChange={e => setCompForm({ ...compForm, code: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 750 }}>Component Classification</label>
                  <select
                    className="form-control"
                    value={compForm.type}
                    onChange={e => {
                      const newType = e.target.value as 'EARNING' | 'DEDUCTION';
                      setCompForm(prev => ({
                        ...prev,
                        type: newType,
                        calculationMethod: newType === 'EARNING' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
                        defaultValue: newType === 'EARNING' ? 10 : 0,
                        percentageBase: newType === 'EARNING' ? 'BASIC' : 'GROSS'
                      }));
                    }}
                    style={{ fontWeight: 700 }}
                  >
                    <option value="EARNING">Earning & Allowance (+)</option>
                    <option value="DEDUCTION">Deduction & Statutory (-)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Calculation Method</label>
                  <select
                    className="form-control"
                    value={compForm.calculationMethod}
                    onChange={e => setCompForm({ ...compForm, calculationMethod: e.target.value as any })}
                  >
                    <option value="FIXED_AMOUNT">Fixed Monthly Amount (₹)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FORMULA">Custom Formula</option>
                  </select>
                </div>

                {compForm.calculationMethod === 'PERCENTAGE' ? (
                  <>
                    <div>
                      <label className="form-label">Percentage Value (%)</label>
                      <input
                        type="number"
                        placeholder="0"
                        className="form-control"
                        value={defaultValueDraft !== null ? defaultValueDraft : (compForm.defaultValue ? String(compForm.defaultValue) : '')}
                        onChange={e => handleDefaultValueChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label">Base Salary</label>
                      <select
                        className="form-control"
                        value={compForm.percentageBase}
                        onChange={e => setCompForm({ ...compForm, percentageBase: e.target.value as any })}
                      >
                        <option value="BASIC">Basic Salary</option>
                        <option value="GROSS">Gross Salary</option>
                        <option value="CTC">Total CTC</option>
                      </select>
                    </div>
                  </>
                ) : compForm.calculationMethod === 'FIXED_AMOUNT' ? (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Fixed Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      className="form-control"
                      value={defaultValueDraft !== null ? defaultValueDraft : (compForm.defaultValue ? String(compForm.defaultValue) : '')}
                      onChange={e => handleDefaultValueChange(e.target.value)}
                    />
                  </div>
                ) : (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Mathematical Formula</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. BASIC * 12 / 100"
                      value={compForm.formula}
                      onChange={e => setCompForm({ ...compForm, formula: e.target.value })}
                    />
                  </div>
                )}

                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Description / Purpose</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={compForm.description}
                    onChange={e => setCompForm({ ...compForm, description: e.target.value })}
                  />
                </div>

                {compForm.type === 'DEDUCTION' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem' }}>
                      <input
                        type="checkbox"
                        checked={compForm.isConfidential}
                        onChange={e => setCompForm({ ...compForm, isConfidential: e.target.checked })}
                      />
                      Mark as Confidential (Displays under generic OTHERS on employee payslips)
                    </label>
                  </div>
                )}

                {/* Eligibility & Applicability Section */}
                <div style={{
                  gridColumn: '1 / -1',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '14px',
                  backgroundColor: '#F8FAFC'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sliders size={15} color="#0E7490" />
                      Component Eligibility Rules
                    </div>
                    <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                      Shared calculation engine
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748B', marginBottom: '10px' }}>
                    Control which employees qualify for this component across salary structures, onboarding, previews, payroll runs, and payslips.
                  </div>

                  {/* 3 Eligibility Modes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setCompForm({ ...compForm, eligibilityType: 'ALL' })}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        border: `1.5px solid ${compForm.eligibilityType === 'ALL' ? '#0E7490' : '#E2E8F0'}`,
                        backgroundColor: compForm.eligibilityType === 'ALL' ? '#ECFEFF' : '#FFFFFF',
                        color: compForm.eligibilityType === 'ALL' ? '#0E7490' : '#334155',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>All Employees</div>
                      <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '2px' }}>Every payroll employee</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCompForm({ ...compForm, eligibilityType: 'SALARY_CONDITION' })}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        border: `1.5px solid ${compForm.eligibilityType === 'SALARY_CONDITION' ? '#0E7490' : '#E2E8F0'}`,
                        backgroundColor: compForm.eligibilityType === 'SALARY_CONDITION' ? '#ECFEFF' : '#FFFFFF',
                        color: compForm.eligibilityType === 'SALARY_CONDITION' ? '#0E7490' : '#334155',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Salary Condition</div>
                      <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '2px' }}>CTC / Basic / Gross thresholds</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCompForm({ ...compForm, eligibilityType: 'SELECTED_EMPLOYEES' })}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        border: `1.5px solid ${compForm.eligibilityType === 'SELECTED_EMPLOYEES' ? '#0E7490' : '#E2E8F0'}`,
                        backgroundColor: compForm.eligibilityType === 'SELECTED_EMPLOYEES' ? '#ECFEFF' : '#FFFFFF',
                        color: compForm.eligibilityType === 'SELECTED_EMPLOYEES' ? '#0E7490' : '#334155',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Selected Employees</div>
                      <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '2px' }}>
                        {compForm.eligibleEmployeeIds?.length || 0} selected
                      </div>
                    </button>
                  </div>

                  {/* Mode-specific panels */}
                  {compForm.eligibilityType === 'SALARY_CONDITION' && (
                    <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: compForm.eligibilityOperator === 'BETWEEN' ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1.2fr', gap: '8px', alignItems: 'end' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>Eligibility Based On</label>
                          <select
                            className="form-control"
                            style={{ fontSize: '0.82rem' }}
                            value={compForm.eligibilityBase}
                            onChange={e => setCompForm({ ...compForm, eligibilityBase: e.target.value as any })}
                          >
                            <option value="CTC">Monthly CTC</option>
                            <option value="BASIC">Basic Salary</option>
                            <option value="GROSS">Gross Salary</option>
                          </select>
                        </div>

                        <div>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>Operator</label>
                          <select
                            className="form-control"
                            style={{ fontSize: '0.82rem' }}
                            value={compForm.eligibilityOperator}
                            onChange={e => setCompForm({ ...compForm, eligibilityOperator: e.target.value as any })}
                          >
                            <option value=">">&gt; Greater Than</option>
                            <option value=">=">&gt;= Greater Than or Equal To</option>
                            <option value="<">&lt; Less Than</option>
                            <option value="<=">&lt;= Less Than or Equal To</option>
                            <option value="=">= Equal To</option>
                            <option value="BETWEEN">BETWEEN (Range)</option>
                          </select>
                        </div>

                        <div>
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>
                            {compForm.eligibilityOperator === 'BETWEEN' ? 'Min Salary (₹)' : 'Salary Limit (₹)'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="e.g. 30000"
                            className="form-control"
                            style={{ fontSize: '0.82rem' }}
                            value={limitDraft !== null ? limitDraft : (compForm.eligibilityLimit ? String(compForm.eligibilityLimit) : '')}
                            onChange={e => handleLimitChange(e.target.value)}
                            required
                          />
                        </div>

                        {compForm.eligibilityOperator === 'BETWEEN' && (
                          <div>
                            <label className="form-label" style={{ fontSize: '0.78rem' }}>Max Salary (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="e.g. 50000"
                              className="form-control"
                              style={{ fontSize: '0.82rem' }}
                              value={limitMaxDraft !== null ? limitMaxDraft : (compForm.eligibilityLimitMax ? String(compForm.eligibilityLimitMax) : '')}
                              onChange={e => handleLimitMaxChange(e.target.value)}
                              required
                            />
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '8px', fontSize: '0.74rem', color: '#0E7490', backgroundColor: '#ECFEFF', padding: '6px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Info size={14} />
                        <span>
                          Rule: Applies when <strong>{compForm.eligibilityBase}</strong> {compForm.eligibilityOperator}{' '}
                          <strong>{formatCurrency(Number(limitDraft !== null ? (limitDraft || 0) : compForm.eligibilityLimit) || 0)}</strong>
                          {compForm.eligibilityOperator === 'BETWEEN' && (
                            <> and <strong>{formatCurrency(Number(limitMaxDraft !== null ? (limitMaxDraft || 0) : compForm.eligibilityLimitMax) || 0)}</strong></>
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  {compForm.eligibilityType === 'SELECTED_EMPLOYEES' && (
                    <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                          <input
                            type="text"
                            placeholder="Search by name, ID, or department..."
                            value={empSearchQuery}
                            onChange={e => setEmpSearchQuery(e.target.value)}
                            className="form-control"
                            style={{ paddingLeft: '30px', fontSize: '0.8rem', height: '34px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                            onClick={() => {
                              const allIds = employees.map(e => e.employeeId || e.id);
                              setCompForm({ ...compForm, eligibleEmployeeIds: allIds });
                            }}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                            onClick={() => setCompForm({ ...compForm, eligibleEmployeeIds: [] })}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: '6px' }}>
                        {filteredPickerEmployees.length === 0 ? (
                          <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.78rem' }}>
                            No employees match your search query.
                          </div>
                        ) : (
                          filteredPickerEmployees.map(emp => {
                            const empId = emp.employeeId || emp.id;
                            const isChecked = compForm.eligibleEmployeeIds?.includes(empId);
                            return (
                              <label
                                key={emp.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '6px 10px',
                                  borderBottom: '1px solid #F8FAFC',
                                  cursor: 'pointer',
                                  backgroundColor: isChecked ? '#F0FDFA' : 'transparent',
                                  fontSize: '0.8rem'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  style={{ accentColor: '#0E7490' }}
                                  checked={isChecked}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setCompForm({
                                        ...compForm,
                                        eligibleEmployeeIds: [...(compForm.eligibleEmployeeIds || []), empId]
                                      });
                                    } else {
                                      setCompForm({
                                        ...compForm,
                                        eligibleEmployeeIds: (compForm.eligibleEmployeeIds || []).filter(id => id !== empId)
                                      });
                                    }
                                  }}
                                />
                                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{emp.firstName} {emp.lastName}</span>
                                    <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: '#64748B' }}>({emp.employeeId})</span>
                                  </div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                                    {emp.department || 'General'}
                                  </span>
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '0.74rem', color: '#64748B', textAlign: 'right' }}>
                        <strong>{compForm.eligibleEmployeeIds?.length || 0}</strong> of {employees.length} employees selected
                      </div>
                    </div>
                  )}

                  {compForm.eligibilityType === 'ALL' && (
                    <div style={{ fontSize: '0.76rem', color: '#475569', fontStyle: 'italic', padding: '6px 2px' }}>
                      ✓ This component will be applied to all employees covered by the payroll policy.
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid #E2E8F0' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsCompModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingComp ? 'Update Component' : 'Create Component'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
