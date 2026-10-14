import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';

export interface TaskFiltersState {
  departments: string[];
  priorities: string[];
  statuses: string[];
  sources: string[];
  dateRange: 'all' | 'today' | 'this_week' | 'this_month';
}

export const initialTaskFiltersState: TaskFiltersState = {
  departments: [],
  priorities: [],
  statuses: [],
  sources: [],
  dateRange: 'all'
};

interface TaskFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilters: TaskFiltersState;
  onApply: (filters: TaskFiltersState) => void;
  onReset: () => void;
}

type TaskFilterTab = 'department' | 'priority' | 'status' | 'date_range';

export const TaskFilterModal: React.FC<TaskFilterModalProps> = ({
  isOpen,
  onClose,
  currentFilters,
  onApply,
  onReset
}) => {
  const { departments } = useHRMS();
  const [activeTab, setActiveTab] = useState<TaskFilterTab>('department');
  const [localFilters, setLocalFilters] = useState<TaskFiltersState>(currentFilters);

  useEffect(() => {
    if (isOpen) {
      setLocalFilters(currentFilters);
    }
  }, [isOpen, currentFilters]);

  if (!isOpen) return null;

  const departmentList = departments.length > 0 
    ? departments.map(d => d.name)
    : [
        'HR',
        'Sales',
        'Accounts',
        'Procurement',
        'Dispatch',
        'Design',
        'Finance',
        'Technical Support'
      ];

  const priorityOptions = [
    { value: 'Urgent', label: 'Urgent', color: '#ef4444', desc: 'Critical blocker requiring immediate resolution' },
    { value: 'High', label: 'High', color: '#f59e0b', desc: 'Important high-priority business deliverable' },
    { value: 'Medium', label: 'Medium', color: '#0284C7', desc: 'Normal planned operational task' },
    { value: 'Low', label: 'Low', color: '#64748b', desc: 'Backlog or minor enhancement item' }
  ];

  const statusOptions = [
    { value: 'TODO', label: 'To-Do / Open', desc: 'Not yet started' },
    { value: 'IN_PROGRESS', label: 'In Progress', desc: 'Currently actively worked upon' },
    { value: 'COMPLETED', label: 'Completed', desc: 'Submitted for verification or completed' },
    { value: 'BLOCKED', label: 'Blocked / At Risk', desc: 'Paused due to dependency or issue' },
    { value: 'CANCELLED', label: 'Cancelled / Closed', desc: 'Closed or deemed unnecessary' }
  ];

  const dateRangeOptions = [
    { value: 'all', label: 'All Dates (Full History)' },
    { value: 'today', label: 'Today (Due or Created Today)' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' }
  ];

  const toggleArrayOption = (key: 'departments' | 'priorities' | 'statuses', item: string) => {
    setLocalFilters(prev => {
      const list = prev[key];
      const exists = list.includes(item);
      return {
        ...prev,
        [key]: exists ? list.filter(i => i !== item) : [...list, item]
      };
    });
  };

  const handleSelectAll = () => {
    if (activeTab === 'department') {
      const allSelected = localFilters.departments.length === departmentList.length;
      setLocalFilters(prev => ({ ...prev, departments: allSelected ? [] : [...departmentList] }));
    } else if (activeTab === 'priority') {
      const allSelected = localFilters.priorities.length === priorityOptions.length;
      setLocalFilters(prev => ({ ...prev, priorities: allSelected ? [] : priorityOptions.map(p => p.value) }));
    } else if (activeTab === 'status') {
      const allSelected = localFilters.statuses.length === statusOptions.length;
      setLocalFilters(prev => ({ ...prev, statuses: allSelected ? [] : statusOptions.map(s => s.value) }));
    } else if (activeTab === 'date_range') {
      setLocalFilters(prev => ({ ...prev, dateRange: 'all' }));
    }
  };

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    setLocalFilters(initialTaskFiltersState);
    onReset();
    onClose();
  };

  return (
    <div className="filter-modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="filter-reports-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        
        {/* Modal Header */}
        <div className="filter-modal-header" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 className="filter-modal-title" style={{ fontSize: '1.15rem' }}>Filter Tasks</h2>
          </div>
          <button 
            className="filter-modal-close-btn" 
            onClick={onClose}
            title="Close filter modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body with 2-Column Split */}
        <div className="filter-modal-body" style={{ minHeight: '360px' }}>
          
          {/* Left Column: Filter Sidebar */}
          <div className="filter-sidebar">
            <div className="filter-sidebar-title" style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Filter By
            </div>

            <button 
              type="button"
              className={`filter-nav-item ${activeTab === 'department' ? 'active' : ''}`}
              onClick={() => setActiveTab('department')}
            >
              <span>Department</span>
              {localFilters.departments.length > 0 && (
                <span className="filter-nav-count-badge" style={{ backgroundColor: '#0E7490', color: '#ffffff' }}>
                  {localFilters.departments.length}
                </span>
              )}
            </button>

            <button 
              type="button"
              className={`filter-nav-item ${activeTab === 'priority' ? 'active' : ''}`}
              onClick={() => setActiveTab('priority')}
            >
              <span>Priority</span>
              {localFilters.priorities.length > 0 && (
                <span className="filter-nav-count-badge" style={{ backgroundColor: '#0E7490', color: '#ffffff' }}>
                  {localFilters.priorities.length}
                </span>
              )}
            </button>

            <button 
              type="button"
              className={`filter-nav-item ${activeTab === 'status' ? 'active' : ''}`}
              onClick={() => setActiveTab('status')}
            >
              <span>Status</span>
              {localFilters.statuses.length > 0 && (
                <span className="filter-nav-count-badge" style={{ backgroundColor: '#0E7490', color: '#ffffff' }}>
                  {localFilters.statuses.length}
                </span>
              )}
            </button>

            <button 
              type="button"
              className={`filter-nav-item ${activeTab === 'date_range' ? 'active' : ''}`}
              onClick={() => setActiveTab('date_range')}
            >
              <span>Timeline / Date</span>
              {localFilters.dateRange !== 'all' && (
                <span className="filter-nav-count-badge" style={{ backgroundColor: '#0E7490', color: '#ffffff' }}>1</span>
              )}
            </button>
          </div>

          {/* Right Column: Content Panel */}
          <div className="filter-content-panel" style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: '400px' }}>
            
            <div className="filter-content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span className="filter-content-title" style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>
                {activeTab === 'department' && 'Filter by Department'}
                {activeTab === 'priority' && 'Filter by Priority'}
                {activeTab === 'status' && 'Filter by Overall Status'}
                {activeTab === 'date_range' && 'Filter by Date Range'}
              </span>

              {activeTab !== 'date_range' && (
                <button 
                  type="button" 
                  className="filter-select-all-btn"
                  onClick={handleSelectAll}
                  style={{ fontSize: '0.78rem', color: '#0E7490', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Select All
                </button>
              )}
            </div>

            {/* TAB 1: Department */}
            {activeTab === 'department' && (
              <div className="filter-items-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {departmentList.map(dept => {
                  const isChecked = localFilters.departments.includes(dept);
                  return (
                    <div 
                      key={dept} 
                      onClick={() => toggleArrayOption('departments', dept)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', backgroundColor: isChecked ? '#ECFEFF' : 'transparent', transition: 'all 0.15s ease' }}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: isChecked ? '1.5px solid #0E7490' : '1.5px solid #cbd5e1',
                        backgroundColor: isChecked ? '#0E7490' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: '0.88rem', color: isChecked ? '#0E7490' : '#334155', fontWeight: isChecked ? 700 : 500 }}>
                        {dept}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 2: Priority */}
            {activeTab === 'priority' && (
              <div className="filter-items-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {priorityOptions.map(opt => {
                  const isChecked = localFilters.priorities.includes(opt.value);
                  return (
                    <div 
                      key={opt.value} 
                      onClick={() => toggleArrayOption('priorities', opt.value)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', backgroundColor: isChecked ? '#ECFEFF' : 'transparent', transition: 'all 0.15s ease' }}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: isChecked ? '1.5px solid #0E7490' : '1.5px solid #cbd5e1',
                        backgroundColor: isChecked ? '#0E7490' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: opt.color }} />
                          <span style={{ fontSize: '0.88rem', color: isChecked ? '#0E7490' : '#334155', fontWeight: isChecked ? 700 : 600 }}>
                            {opt.label}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{opt.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 3: Status */}
            {activeTab === 'status' && (
              <div className="filter-items-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {statusOptions.map(opt => {
                  const isChecked = localFilters.statuses.includes(opt.value);
                  return (
                    <div 
                      key={opt.value} 
                      onClick={() => toggleArrayOption('statuses', opt.value)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', backgroundColor: isChecked ? '#ECFEFF' : 'transparent', transition: 'all 0.15s ease' }}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: isChecked ? '1.5px solid #0E7490' : '1.5px solid #cbd5e1',
                        backgroundColor: isChecked ? '#0E7490' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {isChecked && <Check size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.88rem', color: isChecked ? '#0E7490' : '#334155', fontWeight: isChecked ? 700 : 600 }}>
                          {opt.label}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{opt.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 4: Date Range */}
            {activeTab === 'date_range' && (
              <div className="filter-items-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dateRangeOptions.map(opt => {
                  const isChecked = localFilters.dateRange === opt.value;
                  return (
                    <div 
                      key={opt.value} 
                      onClick={() => setLocalFilters(prev => ({ ...prev, dateRange: opt.value as any }))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: isChecked ? '1.5px solid #0E7490' : '1px solid #e2e8f0',
                        backgroundColor: isChecked ? '#ECFEFF' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: isChecked ? '5px solid #0E7490' : '1.5px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        flexShrink: 0
                      }} />
                      <span style={{ fontSize: '0.88rem', color: isChecked ? '#0E7490' : '#334155', fontWeight: isChecked ? 700 : 500 }}>
                        {opt.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>

        {/* Modal Footer */}
        <div className="filter-modal-footer" style={{ padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
          <button 
            type="button"
            className="filter-reset-btn"
            onClick={handleReset}
            style={{ padding: '7px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer' }}
          >
            Reset
          </button>
          <button 
            type="button"
            className="filter-apply-btn"
            onClick={handleApply}
            style={{ padding: '7px 22px', borderRadius: '8px', backgroundColor: '#0E7490', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(14, 116, 144, 0.35)' }}
          >
            Apply Filters
          </button>
        </div>

      </div>
    </div>
  );
};
