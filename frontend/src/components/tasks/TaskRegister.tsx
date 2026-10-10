import React, { useState, useMemo, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Search, 
  Filter, 
  FileText, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  User, 
  Building, 
  Layers, 
  CheckSquare, 
  Trash2, 
  AlertTriangle, 
  Link2,
  SlidersHorizontal,
  Sliders,
  Plus,
  X,
  Check,
  ListTodo,
  CheckCircle2,
  Clock,
  RotateCcw
} from 'lucide-react';
import { TaskItemEnhanced, TaskOverallStatus, TaskPriority, TaskAssigneeStatus, computeDueStatus } from '../../types/tasks';
import { TaskFilterModal, TaskFiltersState, initialTaskFiltersState } from './TaskFilterModal';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { StandardTablePagination } from '../common/StandardTablePagination';

interface TaskRegisterProps {
  onSelectTask: (taskId: string) => void;
  onOpenNewTask: () => void;
}

export const TaskRegister: React.FC<TaskRegisterProps> = ({ onSelectTask, onOpenNewTask }) => {
  const { 
    enhancedTasks, 
    employees, 
    departments, 
    currentUser, 
    deleteEnhancedTask,
    closeTask
  } = useHRMS();

  // Selection state for batch actions
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  const handleToggleTask = (id: string) => {
    setSelectedTaskIds(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id))) {
      setSelectedTaskIds(prev => prev.filter(id => !paginatedTasks.some(t => t.id === id)));
    } else {
      const pageIds = paginatedTasks.map(t => t.id);
      setSelectedTaskIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };



  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'pending' | 'in_progress' | 'today' | 'completed' | 'overdue'>('all');
  const [filterFromDate, setFilterFromDate] = useState<string>('');
  const [filterToDate, setFilterToDate] = useState<string>('');
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>('All');
  const [filterResponsible, setFilterResponsible] = useState<string>('All');
  const [filterDept, setFilterDept] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterSource, setFilterSource] = useState<string>('All');
  const [filterDueStatus, setFilterDueStatus] = useState<string>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');

  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Dedicated Filter Modal State
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [modalFilters, setModalFilters] = useState<TaskFiltersState>(initialTaskFiltersState);

  const activeModalFilterCount = 
    modalFilters.departments.length +
    modalFilters.priorities.length +
    modalFilters.statuses.length +
    modalFilters.sources.length +
    (modalFilters.dateRange !== 'all' ? 1 : 0);

  // Sorting & Pagination
  const [sortColumn, setSortColumn] = useState<string>('taskNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);



  // Column Visibility Customization
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    taskNumber: true,
    title: true,
    assignees: true,
    responsible: true,
    department: true,
    dueDate: true,
    priority: true,
    overallStatus: true
  });

  // Role scoping: Employees view assigned tasks; Managers view department tasks
  const isEmployee = currentUser.role === 'Employee' || currentUser.role === 'Assignee';
  const isManager = currentUser.role === 'Department Manager' || currentUser.role === 'Department Head' || currentUser.role === 'Manager';

  const roleScopedTasks = useMemo(() => {
    if (isEmployee) {
      return enhancedTasks.filter(t => 
        t.assignees.some(a => a.employeeId === (currentUser.employeeId || 'EMP-001')) ||
        t.responsiblePersonId === (currentUser.employeeId || 'EMP-001')
      );
    }
    if (isManager && currentUser.department) {
      return enhancedTasks.filter(t => t.department === currentUser.department);
    }
    return enhancedTasks;
  }, [enhancedTasks, currentUser, isEmployee, isManager]);

  // Comprehensive Filtering & Global Search
  const filteredTasks = useMemo(() => {
    return roleScopedTasks.filter(task => {
      // Global Search: Task No, Title, Employee Name, Department, MOM Number
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesNo = task.taskNumber.toLowerCase().includes(query);
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDept = task.department.toLowerCase().includes(query);
        const matchesMOM = Boolean(task.momId && task.momId.toLowerCase().includes(query));
        const matchesAssignee = task.assignees.some(a => a.employeeName.toLowerCase().includes(query));
        const matchesResp = task.responsiblePersonName.toLowerCase().includes(query);

        if (!matchesNo && !matchesTitle && !matchesDept && !matchesMOM && !matchesAssignee && !matchesResp) {
          return false;
        }
      }

      // Date Range Filters
      if (filterFromDate && task.dueDate && task.dueDate < filterFromDate) return false;
      if (filterToDate && task.dueDate && task.dueDate > filterToDate) return false;

      // Assignee Filter
      if (filterAssignedTo !== 'All') {
        const isAssigned = task.assignees.some(a => a.employeeId === filterAssignedTo);
        if (!isAssigned) return false;
      }

      // Responsible Person Filter
      if (filterResponsible !== 'All' && task.responsiblePersonId !== filterResponsible) return false;

      // Department Filter
      if (filterDept !== 'All' && task.department !== filterDept) return false;

      // Priority Filter
      if (filterPriority !== 'All' && task.priority !== filterPriority) return false;

      // Status Filter
      if (filterStatus !== 'All' && task.overallStatus !== filterStatus) return false;

      // Source Filter
      if (filterSource !== 'All' && task.sourceType !== filterSource) return false;

      // Modal Filters Integration
      if (modalFilters.departments.length > 0 && !modalFilters.departments.includes(task.department)) return false;
      if (modalFilters.priorities.length > 0 && !modalFilters.priorities.includes(task.priority)) return false;
      if (modalFilters.statuses.length > 0 && !modalFilters.statuses.includes(task.overallStatus)) return false;
      if (modalFilters.sources.length > 0 && !modalFilters.sources.includes(task.sourceType)) return false;

      // Due Status Filter
      if (filterDueStatus !== 'All') {
        const dueStat = computeDueStatus(task.dueDate, task.overallStatus);
        if (dueStat !== filterDueStatus) return false;
      }

      // Quick Pill Filter
      if (quickFilter !== 'all') {
        const today = new Date().toISOString().split('T')[0];
        const isCompleted = task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' || task.overallProgress === 100;
        if (quickFilter === 'pending') {
          if (isCompleted || !(task.overallStatus === 'OPEN' || task.overallProgress === 0 || task.assignees.some(a => a.individualStatus === 'Pending'))) return false;
        } else if (quickFilter === 'in_progress') {
          if (isCompleted || !(task.overallStatus === 'IN PROGRESS' || (task.overallProgress > 0 && task.overallProgress < 100) || task.assignees.some(a => a.individualStatus === 'In Progress' || a.individualStatus === 'In Process'))) return false;
        } else if (quickFilter === 'today') {
          if (isCompleted || task.dueDate !== today) return false;
        } else if (quickFilter === 'completed') {
          if (!isCompleted) return false;
        } else if (quickFilter === 'overdue') {
          if (isCompleted || computeDueStatus(task.dueDate, task.overallStatus) !== 'Overdue') return false;
        }
      }

      // Category Filter
      if (filterCategory !== 'All' && task.taskCategory !== filterCategory) return false;

      return true;
    });
  }, [
    roleScopedTasks,
    searchTerm,
    quickFilter,
    filterFromDate,
    filterToDate,
    filterAssignedTo,
    filterResponsible,
    filterDept,
    filterPriority,
    filterStatus,
    filterSource,
    filterDueStatus,
    filterCategory,
    modalFilters
  ]);

  // Sorting
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let valA: any = (a as any)[sortColumn] || '';
      let valB: any = (b as any)[sortColumn] || '';

      if (sortColumn === 'overallProgress') {
        valA = a.overallProgress;
        valB = b.overallProgress;
      } else if (sortColumn === 'assignees') {
        valA = a.assignees.length;
        valB = b.assignees.length;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredTasks, sortColumn, sortDirection]);

  // Auto-clamp page when filters change
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(sortedTasks.length / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [sortedTasks.length, pageSize, currentPage]);

  // Standard Paginated Tasks
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedTasks.slice(startIndex, startIndex + pageSize);
  }, [sortedTasks, currentPage, pageSize]);

  // Reset all filters
  const handleResetAllFilters = () => {
    setSearchTerm('');
    setQuickFilter('all');
    setFilterDept('All');
    setFilterStatus('All');
    setFilterPriority('All');
    setFilterAssignedTo('All');
    setFilterResponsible('All');
    setFilterSource('All');
    setFilterDueStatus('All');
    setFilterFromDate('');
    setFilterToDate('');
    setFilterCategory('All');
    setModalFilters(initialTaskFiltersState);
    setCurrentPage(1);
  };

  const hasActiveFilters = 
    searchTerm.trim() !== '' ||
    quickFilter !== 'all' ||
    filterDept !== 'All' ||
    filterStatus !== 'All' ||
    filterPriority !== 'All' ||
    filterAssignedTo !== 'All' ||
    filterResponsible !== 'All' ||
    filterSource !== 'All' ||
    filterDueStatus !== 'All' ||
    filterFromDate !== '' ||
    filterToDate !== '' ||
    filterCategory !== 'All' ||
    activeModalFilterCount > 0;

  // Format date cleanly as DD/MM/YYYY
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return formatDateDDMMYYYY(dateStr);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };



  return (
    <div className="task-register-container">

      {/* Unified Command & Filter Bar */}
      <div style={{ 
        padding: '14px 18px', 
        marginBottom: '20px', 
        borderRadius: '16px', 
        border: '1px solid #E7ECF3', 
        background: '#ffffff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)' 
      }}>
        <div className="task-filters-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', width: '100%', overflowX: 'auto', paddingBottom: '2px' }}>
          {/* Global Search Input */}
          <div style={{ position: 'relative', flex: '0 1 200px', minWidth: '150px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input 
              type="text"
              placeholder="Search by Task No, Title, Assignee, Dept..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{ 
                width: '100%',
                paddingLeft: '34px', 
                paddingRight: searchTerm ? '30px' : '10px',
                height: '38px', 
                fontSize: '0.82rem',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#1E293B',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchTerm && (
              <button 
                type="button"
                onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                style={{ 
                  position: 'absolute', 
                  right: '8px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  background: 'none', 
                  border: 'none', 
                  color: '#94A3B8', 
                  cursor: 'pointer', 
                  display: 'flex',
                  padding: 0
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div style={{ flex: '0 0 auto', width: '145px' }}>
            <select 
              value={filterDept} 
              onChange={e => { setFilterDept(e.target.value); setCurrentPage(1); }}
              style={{ 
                width: '100%',
                height: '38px', 
                fontSize: '0.82rem',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#334155',
                padding: '6px 10px',
                lineHeight: '22px',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'pointer'
              }}
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Overall Status Filter */}
          <div style={{ flex: '0 0 auto', width: '130px' }}>
            <select 
              value={filterStatus} 
              onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              style={{ 
                width: '100%',
                height: '38px', 
                fontSize: '0.82rem',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#334155',
                padding: '6px 10px',
                lineHeight: '22px',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'pointer'
              }}
            >
              <option value="All">All Statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="IN PROGRESS">IN PROGRESS</option>
              <option value="PARTIALLY COMPLETED">PARTIALLY COMPLETED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CLOSED">CLOSED</option>
              <option value="OVERDUE">OVERDUE</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div style={{ flex: '0 0 auto', width: '120px' }}>
            <select 
              value={filterPriority} 
              onChange={e => { setFilterPriority(e.target.value); setCurrentPage(1); }}
              style={{ 
                width: '100%',
                height: '38px', 
                fontSize: '0.82rem',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#334155',
                padding: '6px 10px',
                lineHeight: '22px',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'pointer'
              }}
            >
              <option value="All">All Priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* Action Buttons Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}>
            <button 
              type="button"
              onClick={() => setShowFilterModal(true)}
              style={{ 
                height: '38px', 
                padding: '0 12px', 
                borderRadius: '10px', 
                border: '1px solid #E2E8F0',
                background: activeModalFilterCount > 0 ? '#ECFEFF' : '#ffffff',
                color: activeModalFilterCount > 0 ? '#0E7490' : '#334155',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
              }}
            >
              <Filter size={15} color="#0E7490" />
              <span>Filter</span>
              <span style={{ 
                background: activeModalFilterCount > 0 ? '#0E7490' : '#F1F5F9', 
                color: activeModalFilterCount > 0 ? '#ffffff' : '#64748B', 
                fontSize: '0.68rem', 
                fontWeight: 700, 
                padding: '1px 6px', 
                borderRadius: '9999px' 
              }}>
                {activeModalFilterCount}
              </span>
            </button>

            <button 
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              style={{ 
                height: '38px', 
                padding: '0 12px', 
                borderRadius: '10px', 
                border: showAdvancedFilters ? '1px solid #0E7490' : '1px solid #E2E8F0',
                background: showAdvancedFilters ? '#ECFEFF' : '#ffffff',
                color: showAdvancedFilters ? '#0E7490' : '#334155',
                fontSize: '0.82rem', 
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
              }}
            >
              <SlidersHorizontal size={15} /> 
              <span>{showAdvancedFilters ? 'Hide Filters' : 'More Filters'}</span>
              {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                title="Reset all search and filter conditions"
                style={{
                  height: '38px',
                  padding: '0 10px',
                  borderRadius: '10px', 
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            )}

          </div>
        </div>

        {/* Collapsible Advanced Filters Drawer */}
        {showAdvancedFilters && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', 
            gap: '14px', 
            marginTop: '16px', 
            paddingTop: '16px', 
            borderTop: '1px solid #F1F5F9' 
          }}>
            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B', marginBottom: '5px', display: 'block' }}>Assigned To</label>
              <select 
                value={filterAssignedTo} 
                onChange={e => { setFilterAssignedTo(e.target.value); setCurrentPage(1); }}
                style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#334155', padding: '6px 10px', lineHeight: '20px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="All">All Assignees</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.employeeId}>{emp.firstName} {emp.lastName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B', marginBottom: '5px', display: 'block' }}>Responsible Person</label>
              <select 
                value={filterResponsible} 
                onChange={e => { setFilterResponsible(e.target.value); setCurrentPage(1); }}
                style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#334155', padding: '6px 10px', lineHeight: '20px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="All">All Responsible</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.employeeId}>{emp.firstName} {emp.lastName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B', marginBottom: '5px', display: 'block' }}>Source Type</label>
              <select 
                value={filterSource} 
                onChange={e => { setFilterSource(e.target.value); setCurrentPage(1); }}
                style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#334155', padding: '6px 10px', lineHeight: '20px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="All">All Sources</option>
                <option value="Direct">Direct</option>
                <option value="MOM">MOM Action Item</option>
                <option value="Project">Project Milestone</option>
                <option value="Audit">Audit Finding</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B', marginBottom: '5px', display: 'block' }}>Due Status</label>
              <select 
                value={filterDueStatus} 
                onChange={e => { setFilterDueStatus(e.target.value); setCurrentPage(1); }}
                style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#334155', padding: '6px 10px', lineHeight: '20px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="All">All Due Statuses</option>
                <option value="On Track">On Track</option>
                <option value="Due Today">Due Today</option>
                <option value="Due Tomorrow">Due Tomorrow</option>
                <option value="Overdue">Overdue</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B', marginBottom: '5px', display: 'block' }}>From Due Date</label>
              <input 
                type="date" 
                value={filterFromDate} 
                onChange={e => { setFilterFromDate(e.target.value); setCurrentPage(1); }}
                style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#334155', padding: '6px 10px', lineHeight: '20px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B', marginBottom: '5px', display: 'block' }}>To Due Date</label>
              <input 
                type="date" 
                value={filterToDate} 
                onChange={e => { setFilterToDate(e.target.value); setCurrentPage(1); }}
                style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#334155', padding: '6px 10px', lineHeight: '20px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Enterprise Task Register Table Container - Single Box Architecture */}
      <div style={{ 
        background: '#ffffff', 
        borderRadius: '16px', 
        border: '1px solid #E7ECF3',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        overflow: 'hidden'
      }}>
        <div style={{ 
          overflowX: 'auto', 
          width: '100%',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}>
          <table className="hrms-table" style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ width: '44px', minWidth: '44px', textAlign: 'center', padding: '14px 10px' }}>
                  <input
                    type="checkbox"
                    checked={paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.includes(t.id))}
                    onChange={handleToggleSelectAll}
                    style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                    aria-label="Select all tasks"
                  />
                </th>
                {visibleColumns.taskNumber && (
                  <th onClick={() => handleSort('taskNumber')} style={{ cursor: 'pointer', whiteSpace: 'nowrap', width: '120px', minWidth: '110px', padding: '14px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left' }}>
                    Task No {sortColumn === 'taskNumber' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </th>
                )}
                {visibleColumns.title && (
                  <th onClick={() => handleSort('title')} style={{ cursor: 'pointer', width: '22%', minWidth: '200px', padding: '14px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left' }}>
                    Task Title {sortColumn === 'title' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </th>
                )}
                {visibleColumns.assignees && (
                  <th style={{ width: '10%', minWidth: '100px', padding: '14px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    Assigned To
                  </th>
                )}
                {visibleColumns.responsible && (
                  <th style={{ width: '18%', minWidth: '150px', padding: '14px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    Responsible
                  </th>
                )}
                {visibleColumns.department && (
                  <th style={{ width: '13%', minWidth: '115px', padding: '14px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    Department
                  </th>
                )}
                {visibleColumns.dueDate && (
                  <th onClick={() => handleSort('dueDate')} style={{ cursor: 'pointer', width: '11%', minWidth: '105px', padding: '14px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    Due Date {sortColumn === 'dueDate' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </th>
                )}
                {visibleColumns.priority && (
                  <th onClick={() => handleSort('priority')} style={{ cursor: 'pointer', width: '10%', minWidth: '90px', padding: '14px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    Priority {sortColumn === 'priority' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </th>
                )}
                {visibleColumns.overallStatus && (
                  <th onClick={() => handleSort('overallStatus')} style={{ cursor: 'pointer', width: '16%', minWidth: '135px', padding: '14px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    Status {sortColumn === 'overallStatus' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedTasks.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '60px 16px', color: '#64748B' }}>
                    <CheckSquare size={42} style={{ opacity: 0.25, margin: '0 auto 12px' }} />
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>No tasks match current filters</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '6px', color: '#64748B' }}>Try clearing search keywords or preset filters</div>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetAllFilters}
                        style={{
                          marginTop: '14px',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: '1px solid #0E7490',
                          background: '#ECFEFF',
                          color: '#0E7490',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Reset All Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedTasks.map(task => {
                  const dueStatus = computeDueStatus(task.dueDate, task.overallStatus);
                  const isSelected = selectedTaskIds.includes(task.id);
                  const activeAssignee = task.assignees.find(a => a.latestRemark) || task.assignees[0];
                  const remark = activeAssignee?.latestRemark || task.updates?.[0]?.remarks;

                  return (
                    <tr 
                      key={task.id} 
                      style={{ 
                        cursor: 'pointer', 
                        transition: 'background-color 0.15s ease',
                        backgroundColor: isSelected ? '#ECFEFF' : undefined,
                        borderLeft: isSelected ? '4px solid #0E7490' : undefined
                      }}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button') || target.closest('input')) return;
                        onSelectTask(task.id);
                      }}
                    >
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '12px 10px', width: '44px', minWidth: '44px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleTask(task.id)}
                          style={{ accentColor: '#0E7490', cursor: 'pointer', width: '16px', height: '16px' }}
                          aria-label={`Select task ${task.taskNumber}`}
                        />
                      </td>

                      {visibleColumns.taskNumber && (
                        <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', padding: '12px 12px', textAlign: 'left', width: '120px', minWidth: '110px' }}>
                          <span style={{ 
                            fontWeight: 700, 
                            fontFamily: 'monospace', 
                            fontSize: '0.8rem', 
                            color: '#0E7490',
                            background: '#ECFEFF',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CFFAFE',
                            letterSpacing: '0.02em',
                            display: 'inline-block'
                          }}>
                            {task.taskNumber}
                          </span>
                        </td>
                      )}

                      {visibleColumns.title && (
                        <td style={{ verticalAlign: 'middle', padding: '12px 12px', textAlign: 'left', width: '22%', minWidth: '200px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#0F172A', marginBottom: '4px', lineHeight: 1.35 }}>
                            {task.title}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.69rem', color: '#64748B', background: '#F1F5F9', padding: '2px 7px', borderRadius: '5px', fontWeight: 600 }}>
                              {task.taskCategory}
                            </span>
                            {task.editedAt && (
                              <span style={{ fontSize: '0.69rem', color: '#475569', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 7px', borderRadius: '5px', fontWeight: 700 }}>
                                Edited
                              </span>
                            )}
                            {(() => {
                              const startDateStr = task.startDate || task.taskDate || (task.createdAt ? task.createdAt.split('T')[0] : '');
                              if (!startDateStr) return null;
                              return (
                                <span style={{ 
                                  fontSize: '0.69rem', 
                                  color: '#0E7490', 
                                  background: '#ECFEFF', 
                                  border: '1px solid #CFFAFE', 
                                  padding: '2px 7px', 
                                  borderRadius: '5px', 
                                  fontWeight: 600, 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '4px' 
                                }}>
                                  <Calendar size={11} /> Start: {formatDateDDMMYYYY(startDateStr)}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                      )}

                      {visibleColumns.assignees && (
                        <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '12px 12px', textAlign: 'left', width: '10%', minWidth: '100px' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {task.assignees.slice(0, 3).map((a, idx) => (
                              a.employeeAvatar ? (
                                <img 
                                  key={a.id || idx}
                                  src={a.employeeAvatar}
                                  alt={a.employeeName}
                                  title={`${a.employeeName} - ${a.individualStatus}`}
                                  style={{ 
                                    width: '28px', 
                                    height: '28px', 
                                    borderRadius: '50%', 
                                    border: '2px solid #fff', 
                                    marginLeft: idx > 0 ? '-7px' : '0',
                                    objectFit: 'cover',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                  }}
                                />
                              ) : (
                                <div 
                                  key={a.id || idx}
                                  title={`${a.employeeName} - ${a.individualStatus}`}
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    backgroundColor: ['#0E7490', '#3B82F6', '#6366F1', '#8B5CF6'][idx % 4],
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    border: '2px solid #fff',
                                    marginLeft: idx > 0 ? '-7px' : '0',
                                    flexShrink: 0,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                  }}
                                >
                                  {a.employeeName.charAt(0)}
                                </div>
                              )
                            ))}
                            {task.assignees.length > 3 && (
                              <span style={{ 
                                width: '26px', 
                                height: '26px', 
                                borderRadius: '50%', 
                                background: '#E2E8F0', 
                                color: '#475569', 
                                fontSize: '0.65rem', 
                                fontWeight: 700, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                marginLeft: '-7px',
                                border: '2px solid #fff'
                              }}>
                                +{task.assignees.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {visibleColumns.responsible && (
                        <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '12px 12px', textAlign: 'left', width: '18%', minWidth: '150px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                            {task.responsiblePersonName}
                          </span>
                        </td>
                      )}

                      {visibleColumns.department && (
                        <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '12px 12px', textAlign: 'left', width: '13%', minWidth: '115px' }}>
                          <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 500 }}>
                            {task.department}
                          </span>
                        </td>
                      )}

                      {visibleColumns.dueDate && (
                        <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '12px 12px', textAlign: 'left', width: '11%', minWidth: '105px' }}>
                          <span style={{ 
                            fontSize: '0.82rem', 
                            fontVariantNumeric: 'tabular-nums',
                            color: dueStatus === 'Overdue' ? '#DC2626' : '#334155', 
                            fontWeight: dueStatus === 'Overdue' ? 700 : 500,
                            background: dueStatus === 'Overdue' ? '#FEE2E2' : '#F8FAFC',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: dueStatus === 'Overdue' ? '1px solid #FECACA' : '1px solid #E2E8F0',
                            display: 'inline-block'
                          }}>
                            {formatDisplayDate(task.dueDate)}
                          </span>
                        </td>
                      )}

                      {visibleColumns.priority && (
                        <td style={{ verticalAlign: 'middle', textAlign: 'left', whiteSpace: 'nowrap', padding: '12px 12px', width: '10%', minWidth: '90px' }}>
                          <span style={{ 
                            fontSize: '0.72rem', 
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: '9999px',
                            display: 'inline-block',
                            letterSpacing: '0.03em',
                            background: 
                              task.priority === 'Urgent' ? '#FEE2E2' :
                              task.priority === 'High' ? '#FFEDD5' :
                              task.priority === 'Medium' ? '#EFF6FF' : '#DCFCE7',
                            color: 
                              task.priority === 'Urgent' ? '#DC2626' :
                              task.priority === 'High' ? '#C2410C' :
                              task.priority === 'Medium' ? '#2563EB' : '#15803D',
                            border: 
                              task.priority === 'Urgent' ? '1px solid #FECACA' :
                              task.priority === 'High' ? '1px solid #FED7AA' :
                              task.priority === 'Medium' ? '1px solid #BFDBFE' : '1px solid #BBF7D0'
                          }}>
                            {task.priority.toUpperCase()}
                          </span>
                        </td>
                      )}

                      {visibleColumns.overallStatus && (
                        <td style={{ verticalAlign: 'middle', textAlign: 'left', whiteSpace: 'nowrap', padding: '12px 12px', width: '16%', minWidth: '135px' }}>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 600, 
                            padding: '3px 9px', 
                            borderRadius: '9999px', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            whiteSpace: 'nowrap', 
                            letterSpacing: '0.01em',
                            background: 
                              task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' ? '#DCFCE7' :
                              task.overallStatus === 'OVERDUE' ? '#FEE2E2' :
                              task.overallStatus === 'IN PROGRESS' ? '#EFF6FF' : '#F1F5F9',
                            color: 
                              task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' ? '#15803D' :
                              task.overallStatus === 'OVERDUE' ? '#DC2626' :
                              task.overallStatus === 'IN PROGRESS' ? '#1D4ED8' : '#475569',
                            border: 
                              task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' ? '1px solid #BBF7D0' :
                              task.overallStatus === 'OVERDUE' ? '1px solid #FECACA' :
                              task.overallStatus === 'IN PROGRESS' ? '1px solid #BFDBFE' : '1px solid #E2E8F0'
                          }}>
                            <span style={{ 
                              width: '6px', 
                              height: '6px', 
                              borderRadius: '50%', 
                              flexShrink: 0,
                              backgroundColor: 
                                task.overallStatus === 'COMPLETED' || task.overallStatus === 'CLOSED' ? '#22C55E' :
                                task.overallStatus === 'OVERDUE' ? '#EF4444' :
                                task.overallStatus === 'IN PROGRESS' ? '#3B82F6' : '#94A3B8'
                            }} />
                            <span style={{ whiteSpace: 'nowrap' }}>
                              {task.overallStatus}
                            </span>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standardized AGENTS.md Pagination Footer */}
        <StandardTablePagination
          currentPage={currentPage}
          totalEntries={sortedTasks.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10]}
        />
      </div>

      {/* Floating Action Bar per AGENTS.md */}
      <StandardFloatingActionBar
        selectedCount={selectedTaskIds.length}
        onClearSelection={() => setSelectedTaskIds([])}
        onEdit={selectedTaskIds.length === 1 ? () => onSelectTask(selectedTaskIds[0]) : undefined}
        onDelete={() => {
          if (window.confirm(`Delete ${selectedTaskIds.length} selected task(s)?`)) {
            selectedTaskIds.forEach(id => deleteEnhancedTask(id));
            setSelectedTaskIds([]);
          }
        }}
      />


      {/* Task Filter Modal */}
      <TaskFilterModal 
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        currentFilters={modalFilters}
        onApply={(f) => { setModalFilters(f); setCurrentPage(1); }}
        onReset={() => { setModalFilters(initialTaskFiltersState); setCurrentPage(1); }}
      />


    </div>
  );
};
