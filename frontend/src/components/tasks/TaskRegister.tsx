import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHRMS } from '../../context/HRMSContext';
import {
  Search,
  Eye,
  RotateCcw,
  Trash2,
  X,
  SlidersHorizontal,
  ClipboardList
} from 'lucide-react';
import {
  EnhancedTask,
  TaskPriority,
  OverallTaskStatus,
  TaskCategory,
  computeDueStatus
} from '../../types/tasks';
import {
  formatDateDDMMYYYY,
  formatShortDateDayMonth,
  formatDateDayMonthYear
} from '../../utils/dateUtils';
import { preventSpaceEnterPropagation } from '../../utils/keyboardUtils';

interface Props {
  onViewTask: (taskId: string) => void;
  externalStatusFilter?: string;
  externalDueFilter?: string;
  onClearExternalFilters?: () => void;
}

const TASK_CATEGORIES: TaskCategory[] = [
  'HR Operations',
  'Payroll & Compliance',
  'Sales & Field Visit',
  'Accounts & Finance',
  'Recruitment & Onboarding',
  'IT & Asset Support',
  'Audit & Documentation',
  'General Administration'
];

export const TaskRegister: React.FC<Props> = ({
  onViewTask,
  externalStatusFilter = 'All',
  externalDueFilter = 'All',
  onClearExternalFilters
}) => {
  const { enhancedTasks, departments, employees, deleteEnhancedTask, currentUser } = useHRMS();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('All');
  const [selectedAssignedBy, setSelectedAssignedBy] = useState<string>('All');
  const [selectedPriority, setSelectedPriority] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>(externalStatusFilter);
  const [selectedDueStatus, setSelectedDueStatus] = useState<string>(externalDueFilter);
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilterCategory, setActiveFilterCategory] = useState<
    'department' | 'priority' | 'status' | 'dueStatus' | 'type' | 'category' | 'assignee' | 'assignedBy'
  >('department');

  const [tempDepartment, setTempDepartment] = useState<string>('All');
  const [tempPriority, setTempPriority] = useState<string>('All');
  const [tempStatus, setTempStatus] = useState<string>('All');
  const [tempDueStatus, setTempDueStatus] = useState<string>('All');
  const [tempType, setTempType] = useState<string>('All');
  const [tempCategory, setTempCategory] = useState<string>('All');
  const [tempAssignee, setTempAssignee] = useState<string>('All');
  const [tempAssignedBy, setTempAssignedBy] = useState<string>('All');

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  const isManagerOrAdmin = useMemo(() => {
    return (
      currentUser.role === 'Super Admin' ||
      currentUser.role === 'CEO' ||
      currentUser.role === 'HR' ||
      currentUser.role === 'Manager'
    );
  }, [currentUser.role]);

  useEffect(() => {
    setSelectedStatus(externalStatusFilter);
  }, [externalStatusFilter]);

  useEffect(() => {
    setSelectedDueStatus(externalDueFilter);
  }, [externalDueFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    selectedDepartment,
    selectedAssignee,
    selectedAssignedBy,
    selectedPriority,
    selectedStatus,
    selectedDueStatus,
    selectedType,
    selectedCategory
  ]);

  const openFilterModal = () => {
    setTempDepartment(selectedDepartment);
    setTempPriority(selectedPriority);
    setTempStatus(selectedStatus);
    setTempDueStatus(selectedDueStatus);
    setTempType(selectedType);
    setTempCategory(selectedCategory);
    setTempAssignee(selectedAssignee);
    setTempAssignedBy(selectedAssignedBy);
    setShowFilterModal(true);
  };

  const handleApplyModalFilters = () => {
    setSelectedDepartment(tempDepartment);
    setSelectedPriority(tempPriority);
    setSelectedStatus(tempStatus);
    setSelectedDueStatus(tempDueStatus);
    setSelectedType(tempType);
    setSelectedCategory(tempCategory);
    setSelectedAssignee(tempAssignee);
    setSelectedAssignedBy(tempAssignedBy);
    setShowFilterModal(false);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDepartment('All');
    setSelectedAssignee('All');
    setSelectedAssignedBy('All');
    setSelectedPriority('All');
    setSelectedStatus('All');
    setSelectedDueStatus('All');
    setSelectedType('All');
    setSelectedCategory('All');

    setTempDepartment('All');
    setTempPriority('All');
    setTempStatus('All');
    setTempDueStatus('All');
    setTempType('All');
    setTempCategory('All');
    setTempAssignee('All');
    setTempAssignedBy('All');

    if (onClearExternalFilters) onClearExternalFilters();
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedDepartment !== 'All') count++;
    if (selectedPriority !== 'All') count++;
    if (selectedStatus !== 'All') count++;
    if (selectedDueStatus !== 'All') count++;
    if (selectedType !== 'All') count++;
    if (selectedCategory !== 'All') count++;
    if (selectedAssignee !== 'All') count++;
    if (selectedAssignedBy !== 'All') count++;
    return count;
  }, [
    selectedDepartment,
    selectedPriority,
    selectedStatus,
    selectedDueStatus,
    selectedType,
    selectedCategory,
    selectedAssignee,
    selectedAssignedBy
  ]);

  const filteredTasks = useMemo(() => {
    return enhancedTasks.filter(task => {
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesId = task.taskNumber.toLowerCase().includes(q);
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesDept = task.department.toLowerCase().includes(q);
        const matchesAssignee = task.assignees.some(a => a.employeeName.toLowerCase().includes(q));
        if (!matchesId && !matchesTitle && !matchesDept && !matchesAssignee) return false;
      }

      if (selectedDepartment !== 'All' && task.department !== selectedDepartment) return false;
      if (selectedAssignee !== 'All') {
        const hasEmp =
          task.assignees.some(a => a.employeeId === selectedAssignee) ||
          task.responsiblePersonId === selectedAssignee;
        if (!hasEmp) return false;
      }
      if (selectedAssignedBy !== 'All' && task.assignedByName !== selectedAssignedBy) return false;
      if (selectedPriority !== 'All' && task.priority !== selectedPriority) return false;

      if (selectedStatus !== 'All') {
        if (selectedStatus === 'IN PROGRESS') {
          if (
            task.overallStatus !== 'IN PROGRESS' &&
            task.overallStatus !== 'PARTIALLY COMPLETED' &&
            task.overallStatus !== 'UNDER REVIEW' &&
            task.overallStatus !== 'REOPENED'
          ) {
            return false;
          }
        } else if (selectedStatus === 'COMPLETED') {
          if (task.overallStatus !== 'COMPLETED' && task.overallStatus !== 'CLOSED') return false;
        } else if (task.overallStatus !== selectedStatus) {
          return false;
        }
      }

      if (selectedDueStatus !== 'All') {
        const currentDue = computeDueStatus(task.dueDate, task.overallStatus);
        if (currentDue !== selectedDueStatus) return false;
      }

      if (selectedType !== 'All' && task.assignmentType !== selectedType) return false;
      if (selectedCategory !== 'All' && task.taskCategory !== selectedCategory) return false;

      return true;
    });
  }, [
    enhancedTasks,
    searchQuery,
    selectedDepartment,
    selectedAssignee,
    selectedAssignedBy,
    selectedPriority,
    selectedStatus,
    selectedDueStatus,
    selectedType,
    selectedCategory
  ]);

  const totalEntries = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedTasks = filteredTasks.slice(startIndex, startIndex + rowsPerPage);

  const toggleSelectAll = () => {
    const visibleIds = paginatedTasks.map(t => t.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTaskIds.includes(id));
    if (allVisibleSelected) {
      setSelectedTaskIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedTaskIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectRow = (id: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    setSelectedTaskIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handleBulkEdit = () => {
    if (selectedTaskIds.length > 0) {
      onViewTask(selectedTaskIds[0]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedTaskIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedTaskIds.length} selected task(s)?`)) {
      selectedTaskIds.forEach(id => {
        deleteEnhancedTask?.(id);
      });
      setSelectedTaskIds([]);
    }
  };

  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setJumpPageInput('');
    }
  };

  const getPriorityBadgeStyle = (p: TaskPriority) => {
    switch (p) {
      case 'Urgent':
        return { bg: '#FEE2E2', color: '#DC2626', label: 'Urgent' };
      case 'High':
        return { bg: '#FEF3C7', color: '#D97706', label: 'High' };
      case 'Medium':
        return { bg: '#EFF6FF', color: '#2563EB', label: 'Medium' };
      default:
        return { bg: '#DCFCE7', color: '#15803D', label: 'Low' };
    }
  };

  const getStatusDisplay = (s: OverallTaskStatus) => {
    if (s === 'COMPLETED' || s === 'CLOSED') {
      return { bg: '#DCFCE7', color: '#15803D', label: 'Completed', showDot: false };
    }
    if (s === 'IN PROGRESS' || s === 'PARTIALLY COMPLETED' || s === 'UNDER REVIEW' || s === 'REOPENED') {
      return { bg: '#E0F2FE', color: '#0284C7', label: 'In Progress', showDot: false };
    }
    return { bg: '#E0F2FE', color: '#0E7490', label: 'Open', showDot: true };
  };

  const uniqueAssigners = useMemo(() => {
    const names = new Set<string>();
    enhancedTasks.forEach(t => {
      const n = t.assignedByName || t.assignedBy;
      if (n) names.add(n);
    });
    return Array.from(names);
  }, [enhancedTasks]);

  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safeCurrentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const allVisibleSelected =
    paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id));

  return (
    <div className="task-register-container" style={{ width: '100%' }}>
      {/* ============================================================ */}
      {/* DESKTOP FILTER BAR (Clean Single-Row Toolbar)                */}
      {/* ============================================================ */}
      <div
        className="desktop-only-block"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '12px 14px',
          marginBottom: '14px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap'
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Search task ID, title, department, or member..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={preventSpaceEnterPropagation}
              style={{
                width: '100%',
                height: '38px',
                paddingLeft: '36px',
                paddingRight: '12px',
                fontSize: '0.82rem',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Department Filter */}
          <select
            value={selectedDepartment}
            onChange={e => setSelectedDepartment(e.target.value)}
            style={{
              height: '38px',
              padding: '0 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <option value="All">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={e => setSelectedPriority(e.target.value)}
            style={{
              height: '38px',
              padding: '0 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <option value="All">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            style={{
              height: '38px',
              padding: '0 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <option value="All">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CLOSED">Closed</option>
          </select>

          {/* Advanced Filter Trigger */}
          <button
            type="button"
            onClick={openFilterModal}
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: '10px',
              border: activeFiltersCount > 0 ? '1px solid #0E7490' : '1px solid #E2E8F0',
              background: activeFiltersCount > 0 ? '#ECFEFF' : '#F8FAFC',
              color: activeFiltersCount > 0 ? '#0E7490' : '#334155',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <SlidersHorizontal size={14} />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span
                style={{
                  background: '#0E7490',
                  color: '#FFFFFF',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.68rem',
                  fontWeight: 800
                }}
              >
                {activeFiltersCount}
              </span>
            )}
          </button>

          {(activeFiltersCount > 0 || searchQuery.trim() !== '') && (
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                height: '38px',
                padding: '0 12px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#64748B',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* MOBILE SEARCH + FILTER BAR (Clean & Minimal)                 */}
      {/* ============================================================ */}
      <div className="mobile-only-block" style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={preventSpaceEnterPropagation}
              style={{
                width: '100%',
                height: '40px',
                paddingLeft: '36px',
                paddingRight: searchQuery ? '30px' : '12px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                fontSize: '0.84rem',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={openFilterModal}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              border: activeFiltersCount > 0 ? '1px solid #0E7490' : '1px solid #E2E8F0',
              background: activeFiltersCount > 0 ? '#ECFEFF' : '#FFFFFF',
              color: activeFiltersCount > 0 ? '#0E7490' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              position: 'relative'
            }}
            title="Filter Tasks"
          >
            <SlidersHorizontal size={16} />
            {activeFiltersCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {activeFiltersCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {selectedDepartment !== 'All' && (
              <span className="mobile-ref-filter-chip">
                {selectedDepartment}
                <button type="button" className="mobile-ref-filter-chip-clear" onClick={() => setSelectedDepartment('All')}>
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedPriority !== 'All' && (
              <span className="mobile-ref-filter-chip">
                {selectedPriority}
                <button type="button" className="mobile-ref-filter-chip-clear" onClick={() => setSelectedPriority('All')}>
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedStatus !== 'All' && (
              <span className="mobile-ref-filter-chip">
                {selectedStatus}
                <button type="button" className="mobile-ref-filter-chip-clear" onClick={() => setSelectedStatus('All')}>
                  <X size={12} />
                </button>
              </span>
            )}
            <button type="button" className="mobile-filter-reset-all-btn" onClick={handleResetFilters}>
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* DESKTOP TABLE VIEW (Clean & Fitted — Zero Clumsy Overflow)   */}
      {/* ============================================================ */}
      <div
        className="desktop-only-block"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
        }}
      >
        {filteredTasks.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px'
              }}
            >
              <ClipboardList size={24} />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
              No Tasks Found
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748B', maxWidth: '340px' }}>
              No tasks match your current filters. Adjust your search or reset filters to view all tasks.
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table className="hrms-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ width: '40px', textAlign: 'center', padding: '12px 8px' }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      style={{ accentColor: '#0E7490', width: '15px', height: '15px', cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ width: '125px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Task ID
                  </th>
                  <th style={{ width: '28%', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Task &amp; Department
                  </th>
                  <th style={{ width: '19%', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Assigned To
                  </th>
                  <th style={{ width: '125px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Due Date
                  </th>
                  <th style={{ width: '95px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Priority
                  </th>
                  <th style={{ width: '140px', padding: '12px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Status
                  </th>
                  <th style={{ width: '80px', padding: '12px 12px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map((task: EnhancedTask) => {
                  const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
                  const pStyle = getPriorityBadgeStyle(task.priority);
                  const sStyle = getStatusDisplay(task.overallStatus);
                  const isSelected = selectedTaskIds.includes(task.id);

                  return (
                    <tr
                      key={task.id}
                      onClick={() => onViewTask(task.id)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 0.12s ease'
                      }}
                    >
                      <td
                        style={{
                          textAlign: 'center',
                          padding: '12px 8px',
                          borderLeft: isSelected ? '4px solid #0E7490' : '4px solid transparent'
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => toggleSelectRow(task.id, e)}
                          style={{ accentColor: '#0E7490', width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            color: '#0E7490',
                            letterSpacing: '0.01em'
                          }}
                        >
                          {task.taskNumber}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px', minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: '#0F172A',
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {task.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.74rem',
                            color: '#64748B',
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {task.department} {task.taskCategory ? `• ${task.taskCategory}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px', minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#1E293B',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {task.responsiblePersonName}
                        </div>
                        <div style={{ fontSize: '0.71rem', color: '#64748B', marginTop: '2px' }}>
                          {task.assignees.length > 1
                            ? `Team (${task.assignees.filter((a: any) => a.individualStatus === 'Completed').length}/${task.assignees.length} done)`
                            : `By ${task.assignedByName || task.assignedBy}`}
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: dueStatus === 'Overdue' ? '#DC2626' : '#334155'
                          }}
                        >
                          {formatDateDayMonthYear(task.dueDate)}
                        </div>
                        {dueStatus === 'Overdue' && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#DC2626' }}>Overdue</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span
                          style={{
                            background: pStyle.bg,
                            color: pStyle.color,
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            display: 'inline-block'
                          }}
                        >
                          {pStyle.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span
                          style={{
                            background: sStyle.bg,
                            color: sStyle.color,
                            fontWeight: 700,
                            fontSize: '0.73rem',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {sStyle.showDot && (
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: sStyle.color
                              }}
                            />
                          )}
                          {sStyle.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onViewTask(task.id);
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            background: '#F8FAFC',
                            color: '#0E7490',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Eye size={13} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Standardized Pagination Footer */}
        <div
          className="standard-pagination-footer"
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #E7ECF3',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            background: '#FAFCFF'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: '#64748B' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={e => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="form-control"
                style={{
                  width: '62px',
                  height: '30px',
                  padding: '2px 6px',
                  fontSize: '0.78rem',
                  borderRadius: '6px'
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
            <span>
              Showing <strong>{totalEntries === 0 ? 0 : startIndex + 1}</strong> to{' '}
              <strong>{Math.min(startIndex + rowsPerPage, totalEntries)}</strong> of <strong>{totalEntries}</strong>{' '}
              entries
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage(1)}
                style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '28px' }}
              >
                &lt;&lt;
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '28px' }}
              >
                &lt;
              </button>
              {getPageNumbers().map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCurrentPage(num)}
                  className="btn btn-sm"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    minWidth: '30px',
                    backgroundColor: num === safeCurrentPage ? '#0E7490' : '#FFFFFF',
                    color: num === safeCurrentPage ? '#FFFFFF' : '#1E293B',
                    border: num === safeCurrentPage ? '1px solid #0E7490' : '1px solid #E2E8F0',
                    fontWeight: num === safeCurrentPage ? 700 : 500
                  }}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '28px' }}
              >
                &gt;
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '28px' }}
              >
                &gt;&gt;
              </button>
            </div>

            <form onSubmit={handleJumpToPage} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Go to page</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={e => setJumpPageInput(e.target.value)}
                onKeyDown={preventSpaceEnterPropagation}
                className="form-control"
                style={{
                  width: '48px',
                  height: '30px',
                  padding: '2px 6px',
                  fontSize: '0.78rem',
                  textAlign: 'center',
                  borderRadius: '6px'
                }}
              />
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 10px', fontSize: '0.75rem', height: '30px' }}
              >
                Go &rsaquo;
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MOBILE CARD LIST (Matches Reference Image Screen 1)          */}
      {/* Top: TSK-2026-011 | High                                     */}
      {/* Middle: HRMS Corrections                                     */}
      {/* Bottom: Developer • Due 17 Nov | • Open                      */}
      {/* ============================================================ */}
      <div
        className="mobile-only-block"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          paddingBottom: '12px'
        }}
      >
        {filteredTasks.length === 0 ? (
          <div className="mobile-empty-state">
            <div className="mobile-empty-icon">
              <ClipboardList size={18} />
            </div>
            <div className="mobile-empty-title">No Tasks Found</div>
            <div className="mobile-empty-desc">Adjust your search or filters to view task records.</div>
          </div>
        ) : (
          filteredTasks.map((task: EnhancedTask) => {
            const pStyle = getPriorityBadgeStyle(task.priority);
            const sStyle = getStatusDisplay(task.overallStatus);
            const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);

            return (
              <div
                key={task.id}
                onClick={() => onViewTask(task.id)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                {/* Row 1: Task ID (left) + Priority Badge (right) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: '#0E7490',
                      letterSpacing: '0.01em'
                    }}
                  >
                    {task.taskNumber}
                  </span>
                  <span
                    style={{
                      background: pStyle.bg,
                      color: pStyle.color,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2.5px 9px',
                      borderRadius: '6px',
                      lineHeight: 1.2
                    }}
                  >
                    {pStyle.label}
                  </span>
                </div>

                {/* Row 2: Task Title */}
                <div
                  style={{
                    fontSize: '0.96rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    lineHeight: 1.3
                  }}
                >
                  {task.title}
                </div>

                {/* Row 3: Department • Due 17 Nov (left) + Status Pill (right) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginTop: '2px'
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      color: dueStatus === 'Overdue' ? '#DC2626' : '#64748B',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {task.department || 'General'} • Due {formatShortDateDayMonth(task.dueDate)}
                  </span>

                  <span
                    style={{
                      background: sStyle.bg,
                      color: sStyle.color,
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      padding: '3.5px 10px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      flexShrink: 0
                    }}
                  >
                    {sStyle.showDot && (
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: sStyle.color
                        }}
                      />
                    )}
                    {sStyle.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================ */}
      {/* FLOATING BULK ACTION BAR (Desktop)                           */}
      {/* ============================================================ */}
      {selectedTaskIds.length > 0 && (
        <div
          className="floating-action-bar"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1E293B',
            color: '#FFFFFF',
            padding: '10px 20px',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
            zIndex: 1000
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#CFFAFE' }}>
            {selectedTaskIds.length} Selected
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <button
            type="button"
            onClick={handleBulkEdit}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600
            }}
          >
            <span>✏️ Edit Info</span>
          </button>
          {isManagerOrAdmin && (
            <>
              <span style={{ color: '#475569' }}>|</span>
              <button
                type="button"
                onClick={handleBulkDelete}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FCA5A5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600
                }}
              >
                <Trash2 size={14} />
                <span>🗑️ Delete</span>
              </button>
            </>
          )}
          <span style={{ color: '#475569' }}>|</span>
          <button
            type="button"
            onClick={() => setSelectedTaskIds([])}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '2px'
            }}
            title="Clear Selection"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* FILTER MODAL                                                 */}
      {/* ============================================================ */}
      {showFilterModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="filter-modal-overlay" onClick={() => setShowFilterModal(false)}>
            <div className="filter-reports-modal" onClick={e => e.stopPropagation()}>
              <div className="filter-modal-header">
                <div className="filter-modal-title">Filter Tasks</div>
                <button className="filter-modal-close-btn" onClick={() => setShowFilterModal(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="filter-modal-body">
                <div className="filter-sidebar">
                  <div className="filter-sidebar-title">Filter By</div>
                  {[
                    { id: 'department', label: 'Department', active: tempDepartment !== 'All' },
                    { id: 'priority', label: 'Priority', active: tempPriority !== 'All' },
                    { id: 'status', label: 'Task Status', active: tempStatus !== 'All' },
                    { id: 'dueStatus', label: 'Due Status', active: tempDueStatus !== 'All' },
                    { id: 'type', label: 'Assignment Type', active: tempType !== 'All' },
                    { id: 'category', label: 'Task Category', active: tempCategory !== 'All' },
                    { id: 'assignee', label: 'Team Member', active: tempAssignee !== 'All' },
                    { id: 'assignedBy', label: 'Assigned By', active: tempAssignedBy !== 'All' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`filter-nav-item ${activeFilterCategory === cat.id ? 'active' : ''}`}
                      onClick={() => setActiveFilterCategory(cat.id as any)}
                    >
                      <span>{cat.label}</span>
                      {cat.active && (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: '#0E7490',
                            marginLeft: 'auto'
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>

                <div className="filter-content-pane">
                  {activeFilterCategory === 'department' && (
                    <div>
                      <div className="filter-pane-title">Select Department</div>
                      <div className="filter-radio-list">
                        <label className="filter-radio-item">
                          <input
                            type="radio"
                            name="deptFilter"
                            checked={tempDepartment === 'All'}
                            onChange={() => setTempDepartment('All')}
                          />
                          <span>All Departments</span>
                        </label>
                        {departments.map(d => (
                          <label key={d.id} className="filter-radio-item">
                            <input
                              type="radio"
                              name="deptFilter"
                              checked={tempDepartment === d.name}
                              onChange={() => setTempDepartment(d.name)}
                            />
                            <span>{d.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterCategory === 'priority' && (
                    <div>
                      <div className="filter-pane-title">Select Priority</div>
                      <div className="filter-radio-list">
                        {['All', 'Low', 'Medium', 'High', 'Urgent'].map(p => (
                          <label key={p} className="filter-radio-item">
                            <input
                              type="radio"
                              name="priorityFilter"
                              checked={tempPriority === p}
                              onChange={() => setTempPriority(p)}
                            />
                            <span>{p === 'All' ? 'All Priorities' : p}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterCategory === 'status' && (
                    <div>
                      <div className="filter-pane-title">Select Task Status</div>
                      <div className="filter-radio-list">
                        {[
                          { val: 'All', label: 'All Statuses' },
                          { val: 'OPEN', label: 'Open' },
                          { val: 'IN PROGRESS', label: 'In Progress' },
                          { val: 'COMPLETED', label: 'Completed' },
                          { val: 'CLOSED', label: 'Closed' }
                        ].map(s => (
                          <label key={s.val} className="filter-radio-item">
                            <input
                              type="radio"
                              name="statusFilter"
                              checked={tempStatus === s.val}
                              onChange={() => setTempStatus(s.val)}
                            />
                            <span>{s.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterCategory === 'dueStatus' && (
                    <div>
                      <div className="filter-pane-title">Select Due Status</div>
                      <div className="filter-radio-list">
                        {['All', 'On Track', 'Due Today', 'Overdue', 'Completed'].map(ds => (
                          <label key={ds} className="filter-radio-item">
                            <input
                              type="radio"
                              name="dueFilter"
                              checked={tempDueStatus === ds}
                              onChange={() => setTempDueStatus(ds)}
                            />
                            <span>{ds === 'All' ? 'All Due States' : ds}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterCategory === 'type' && (
                    <div>
                      <div className="filter-pane-title">Select Assignment Type</div>
                      <div className="filter-radio-list">
                        {['All', 'Individual', 'Team'].map(tp => (
                          <label key={tp} className="filter-radio-item">
                            <input
                              type="radio"
                              name="typeFilter"
                              checked={tempType === tp}
                              onChange={() => setTempType(tp)}
                            />
                            <span>{tp === 'All' ? 'All Assignment Types' : `${tp} Assignment`}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterCategory === 'category' && (
                    <div>
                      <div className="filter-pane-title">Select Task Category</div>
                      <div className="filter-radio-list">
                        <label className="filter-radio-item">
                          <input
                            type="radio"
                            name="catFilter"
                            checked={tempCategory === 'All'}
                            onChange={() => setTempCategory('All')}
                          />
                          <span>All Categories</span>
                        </label>
                        {TASK_CATEGORIES.map(c => (
                          <label key={c} className="filter-radio-item">
                            <input
                              type="radio"
                              name="catFilter"
                              checked={tempCategory === c}
                              onChange={() => setTempCategory(c)}
                            />
                            <span>{c}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterCategory === 'assignee' && (
                    <div>
                      <div className="filter-pane-title">Select Team Member</div>
                      <div className="filter-radio-list">
                        <label className="filter-radio-item">
                          <input
                            type="radio"
                            name="empFilter"
                            checked={tempAssignee === 'All'}
                            onChange={() => setTempAssignee('All')}
                          />
                          <span>All Employees</span>
                        </label>
                        {employees.map(emp => (
                          <label key={emp.id} className="filter-radio-item">
                            <input
                              type="radio"
                              name="empFilter"
                              checked={tempAssignee === emp.employeeId}
                              onChange={() => setTempAssignee(emp.employeeId)}
                            />
                            <span>
                              {emp.firstName} {emp.lastName} ({emp.department})
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterCategory === 'assignedBy' && (
                    <div>
                      <div className="filter-pane-title">Select Assigned By</div>
                      <div className="filter-radio-list">
                        <label className="filter-radio-item">
                          <input
                            type="radio"
                            name="assignerFilter"
                            checked={tempAssignedBy === 'All'}
                            onChange={() => setTempAssignedBy('All')}
                          />
                          <span>Anyone</span>
                        </label>
                        {uniqueAssigners.map(name => (
                          <label key={name} className="filter-radio-item">
                            <input
                              type="radio"
                              name="assignerFilter"
                              checked={tempAssignedBy === name}
                              onChange={() => setTempAssignedBy(name)}
                            />
                            <span>{name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="filter-modal-footer">
                <button
                  type="button"
                  className="filter-reset-btn"
                  onClick={() => {
                    setTempDepartment('All');
                    setTempPriority('All');
                    setTempStatus('All');
                    setTempDueStatus('All');
                    setTempType('All');
                    setTempCategory('All');
                    setTempAssignee('All');
                    setTempAssignedBy('All');
                  }}
                >
                  Reset All
                </button>
                <div className="filter-footer-actions">
                  <button type="button" className="filter-cancel-btn" onClick={() => setShowFilterModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="filter-apply-btn" onClick={handleApplyModalFilters}>
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
