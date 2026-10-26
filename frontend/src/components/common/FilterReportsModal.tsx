import React, { useState, useEffect, useMemo } from 'react';
import { X, Check } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';

export interface FilterReportsState {
  branches: string[];
  departments: string[];
  shifts: string[];
  employmentTypes: string[];
  modesOfWork: string[];
  branchDepartments?: { [branch: string]: string[] };
}

export const initialFilterReportsState: FilterReportsState = {
  branches: [],
  departments: [],
  shifts: [],
  employmentTypes: [],
  modesOfWork: [],
  branchDepartments: {}
};

interface FilterReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilters: FilterReportsState;
  onApply: (filters: FilterReportsState) => void;
  onReset: () => void;
}

type FilterTab = 'branch' | 'department' | 'shift' | 'employment_type' | 'mode_of_work';

export const FilterReportsModal: React.FC<FilterReportsModalProps> = ({
  isOpen,
  onClose,
  currentFilters,
  onApply,
  onReset
}) => {
  const { 
    branches, 
    companyBranches, 
    departments, 
    shifts, 
    employmentTypes, 
    orgStructure 
  } = useHRMS();
  const [activeTab, setActiveTab] = useState<FilterTab>('branch');
  const [localFilters, setLocalFilters] = useState<FilterReportsState>(currentFilters);

  // Dynamic Branch Options sourced directly from Settings (Company Details & Organization)
  const branchOptions = useMemo(() => {
    const list = [
      ...(companyBranches || []).map(b => b.branchName?.trim()),
      ...(branches || []).map(b => b.name?.trim()),
      ...(orgStructure?.workLocations || []).map(l => l?.trim())
    ].filter(Boolean);

    return Array.from(new Map(list.map(name => [name.toLowerCase(), name])).values());
  }, [companyBranches, branches, orgStructure]);

  // Dynamic Department Options sourced directly from Settings (Organization)
  const departmentOptions = useMemo(() => {
    const list = [
      ...(departments || []).map(d => d.name?.trim()),
      ...(orgStructure?.departments || []).map(d => d?.trim())
    ].filter(Boolean);

    return Array.from(new Map(list.map(name => [name.toLowerCase(), name])).values());
  }, [departments, orgStructure]);

  // Dynamic Shift Options sourced directly from Company Shifts in HRMSContext
  const shiftOptions = useMemo(() => {
    if (shifts && shifts.length > 0) {
      return shifts.map(s => s.shiftName);
    }
    return [];
  }, [shifts]);

  const employmentTypeOptions = useMemo(() => {
    const names = [
      ...(orgStructure?.employmentTypes || []),
      ...(employmentTypes || []).filter(t => t.status !== 'Inactive').map(t => t.name)
    ]
      .map(name => name.trim())
      .filter(Boolean);

    const uniqueNames = Array.from(new Map(names.map(name => [name.toLowerCase(), name])).values());
    return uniqueNames.length > 0 ? uniqueNames : ['Full-Time', 'Intern', 'Provisional'];
  }, [orgStructure, employmentTypes]);

  // Sync state when modal opens, preserving only valid settings-backed options
  useEffect(() => {
    if (isOpen) {
      const validBranches = (currentFilters.branches || []).filter(b => branchOptions.includes(b));
      const validDepartments = (currentFilters.departments || []).filter(d => departmentOptions.includes(d));
      const validShifts = (currentFilters.shifts || []).filter(s => shiftOptions.includes(s));
      const validEmploymentTypes = (currentFilters.employmentTypes || []).filter(t => employmentTypeOptions.includes(t));
      const validModesOfWork = (currentFilters.modesOfWork || []).filter(m => modeOfWorkOptions.includes(m));
      setLocalFilters({
        ...currentFilters,
        branches: validBranches,
        departments: validDepartments,
        shifts: validShifts,
        employmentTypes: validEmploymentTypes,
        modesOfWork: validModesOfWork,
        branchDepartments: currentFilters.branchDepartments || {}
      });
    }
  }, [isOpen, currentFilters, branchOptions, departmentOptions, shiftOptions, employmentTypeOptions]);

  if (!isOpen) return null;

  const modeOfWorkOptions = [
    'Work From Office (WFO)',
    'On Field / Travel'
  ];

  // Helper to toggle simple array options
  const toggleArrayItem = (key: 'branches' | 'departments' | 'shifts' | 'employmentTypes' | 'modesOfWork', item: string) => {
    setLocalFilters(prev => {
      const currentList = prev[key] || [];
      const exists = currentList.includes(item);
      return {
        ...prev,
        [key]: exists ? currentList.filter(i => i !== item) : [...currentList, item]
      };
    });
  };

  // Select All / Deselect All logic for active tab
  const handleSelectAll = () => {
    if (activeTab === 'branch') {
      const allSelected = (localFilters.branches || []).length === branchOptions.length && branchOptions.length > 0;
      setLocalFilters(prev => ({ ...prev, branches: allSelected ? [] : [...branchOptions] }));
    } else if (activeTab === 'department') {
      const allSelected = (localFilters.departments || []).length === departmentOptions.length && departmentOptions.length > 0;
      setLocalFilters(prev => ({ ...prev, departments: allSelected ? [] : [...departmentOptions] }));
    } else if (activeTab === 'shift') {
      const allSelected = (localFilters.shifts || []).length === shiftOptions.length && shiftOptions.length > 0;
      setLocalFilters(prev => ({ ...prev, shifts: allSelected ? [] : [...shiftOptions] }));
    } else if (activeTab === 'employment_type') {
      const allSelected = (localFilters.employmentTypes || []).length === employmentTypeOptions.length && employmentTypeOptions.length > 0;
      setLocalFilters(prev => ({ ...prev, employmentTypes: allSelected ? [] : [...employmentTypeOptions] }));
    } else if (activeTab === 'mode_of_work') {
      const allSelected = (localFilters.modesOfWork || []).length === modeOfWorkOptions.length && modeOfWorkOptions.length > 0;
      setLocalFilters(prev => ({ ...prev, modesOfWork: allSelected ? [] : [...modeOfWorkOptions] }));
    }
  };

  // Active counts for tab badges
  const branchCount = (localFilters.branches || []).length;
  const departmentCount = (localFilters.departments || []).length;
  const shiftCount = (localFilters.shifts || []).length;
  const empTypeCount = (localFilters.employmentTypes || []).length;
  const modeCount = (localFilters.modesOfWork || []).length;

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    setLocalFilters(initialFilterReportsState);
    onReset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="filter-modal-overlay" onClick={onClose}>
      <div className="filter-reports-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="filter-modal-header">
          <h2 className="filter-modal-title">Filter Reports</h2>
          <button 
            className="filter-modal-close-btn" 
            onClick={onClose}
            title="Close filter modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body with 2-Column Split */}
        <div className="filter-modal-body">
          
          {/* Left Column: Filter By Sidebar */}
          <div className="filter-sidebar">
            <div className="filter-sidebar-title">Filter By</div>

            <button 
              className={`filter-nav-item ${activeTab === 'branch' ? 'active' : ''}`}
              onClick={() => setActiveTab('branch')}
            >
              <span>Branch</span>
              {branchCount > 0 && <span className="filter-nav-count-badge">{branchCount}</span>}
            </button>

            <button 
              className={`filter-nav-item ${activeTab === 'department' ? 'active' : ''}`}
              onClick={() => setActiveTab('department')}
            >
              <span>Department</span>
              {departmentCount > 0 && <span className="filter-nav-count-badge">{departmentCount}</span>}
            </button>

            <button 
              className={`filter-nav-item ${activeTab === 'shift' ? 'active' : ''}`}
              onClick={() => setActiveTab('shift')}
            >
              <span>Shift</span>
              {shiftCount > 0 && <span className="filter-nav-count-badge">{shiftCount}</span>}
            </button>

            <button 
              className={`filter-nav-item ${activeTab === 'employment_type' ? 'active' : ''}`}
              onClick={() => setActiveTab('employment_type')}
            >
              <span>Employment Type</span>
              {empTypeCount > 0 && <span className="filter-nav-count-badge">{empTypeCount}</span>}
            </button>

            <button 
              className={`filter-nav-item ${activeTab === 'mode_of_work' ? 'active' : ''}`}
              onClick={() => setActiveTab('mode_of_work')}
            >
              <span>Mode of Work</span>
              {modeCount > 0 && <span className="filter-nav-count-badge">{modeCount}</span>}
            </button>
          </div>

          {/* Right Column: Filter Options Content Panel */}
          <div className="filter-content-panel">
            
            {/* Header with Title and Select All */}
            <div className="filter-content-header">
              <span className="filter-content-title">
                {activeTab === 'branch' && 'Branch'}
                {activeTab === 'department' && 'Department'}
                {activeTab === 'shift' && 'Shift'}
                {activeTab === 'employment_type' && 'Employment Type'}
                {activeTab === 'mode_of_work' && 'Mode of Work'}
              </span>

              <button 
                className="filter-select-all-btn"
                onClick={handleSelectAll}
              >
                Select All
              </button>
            </div>

            {/* TAB 1: Branch */}
            {activeTab === 'branch' && (
              <div className="filter-items-list" style={{ gap: '10px' }}>
                {branchOptions.length === 0 ? (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                    No branches configured in Settings. Please add branches under Company Details or Organization Settings.
                  </div>
                ) : (
                  branchOptions.map((branch) => {
                    const isChecked = (localFilters.branches || []).includes(branch);
                    return (
                      <div 
                        key={branch} 
                        onClick={() => toggleArrayItem('branches', branch)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '4px 0',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '3px',
                          border: isChecked ? '1.5px solid #0E7490' : '1.5px solid #64748b',
                          backgroundColor: isChecked ? '#0E7490' : '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s ease'
                        }}>
                          {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: '0.94rem', color: isChecked ? '#0f172a' : '#334155', fontWeight: isChecked ? 600 : 400 }}>
                          {branch}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: Department */}
            {activeTab === 'department' && (
              <div className="filter-items-list" style={{ gap: '10px' }}>
                {departmentOptions.length === 0 ? (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                    No departments configured in Settings. Please add departments under Organization Settings.
                  </div>
                ) : (
                  departmentOptions.map((dept) => {
                    const isChecked = (localFilters.departments || []).includes(dept);
                    return (
                      <div 
                        key={dept} 
                        onClick={() => toggleArrayItem('departments', dept)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '4px 0',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '3px',
                          border: isChecked ? '1.5px solid #0E7490' : '1.5px solid #64748b',
                          backgroundColor: isChecked ? '#0E7490' : '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s ease'
                        }}>
                          {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: '0.94rem', color: isChecked ? '#0f172a' : '#334155', fontWeight: isChecked ? 600 : 400 }}>
                          {dept}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: Shift */}
            {activeTab === 'shift' && (
              <div className="filter-items-list" style={{ gap: '10px' }}>
                {shiftOptions.length === 0 ? (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                    No shifts configured for this company. Please configure shifts in Shift Management.
                  </div>
                ) : (
                  shiftOptions.map((shift) => {
                    const isChecked = localFilters.shifts.includes(shift);
                    return (
                      <div 
                        key={shift}
                        onClick={() => toggleArrayItem('shifts', shift)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '4px 0',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '3px',
                          border: isChecked ? '1.5px solid #0E7490' : '1.5px solid #64748b',
                          backgroundColor: isChecked ? '#0E7490' : '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s ease'
                        }}>
                          {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: '0.94rem', color: isChecked ? '#0f172a' : '#334155', fontWeight: isChecked ? 600 : 400 }}>
                          {shift}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 3: Employment Type */}
            {activeTab === 'employment_type' && (
              <div className="filter-items-list" style={{ gap: '10px' }}>
                {employmentTypeOptions.map((empType) => {
                  const isChecked = localFilters.employmentTypes.includes(empType);
                  return (
                    <div 
                      key={empType}
                      onClick={() => toggleArrayItem('employmentTypes', empType)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '4px 0',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '3px',
                        border: isChecked ? '1.5px solid #0E7490' : '1.5px solid #64748b',
                        backgroundColor: isChecked ? '#0E7490' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.15s ease'
                      }}>
                        {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: '0.94rem', color: isChecked ? '#0f172a' : '#334155', fontWeight: isChecked ? 600 : 400 }}>
                        {empType}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 4: Mode of Work */}
            {activeTab === 'mode_of_work' && (
              <div className="filter-items-list" style={{ gap: '10px' }}>
                {modeOfWorkOptions.map((mode) => {
                  const isChecked = localFilters.modesOfWork.includes(mode);
                  return (
                    <div 
                      key={mode}
                      onClick={() => toggleArrayItem('modesOfWork', mode)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '4px 0',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '3px',
                        border: isChecked ? '1.5px solid #0E7490' : '1.5px solid #64748b',
                        backgroundColor: isChecked ? '#0E7490' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.15s ease'
                      }}>
                        {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: '0.94rem', color: isChecked ? '#0f172a' : '#334155', fontWeight: isChecked ? 600 : 400 }}>
                        {mode}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </div>

        {/* Modal Footer */}
        <div className="filter-modal-footer">
          <button 
            className="filter-reset-btn"
            onClick={handleReset}
          >
            Reset
          </button>
          <button 
            className="filter-apply-btn"
            onClick={handleApply}
          >
            Apply
          </button>
        </div>

      </div>
    </div>
  );
};
export default FilterReportsModal;
