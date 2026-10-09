import React, { useState, useMemo } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  FileText, 
  Search, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Eye, 
  Filter, 
  Building,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { TaskAssigneeStatus, isTaskAssignedByMe } from '../../types/tasks';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

interface DailyTaskReportManagementProps {
  onSelectTask: (taskId: string) => void;
}

interface FlatDailyReportItem {
  id: string;
  taskId: string;
  taskNumber: string;
  taskTitle: string;
  taskCategory: string;
  taskStartDate?: string;
  priority: string;
  department: string;
  assignedBy: string;
  assignedTo: string;
  isAssignedByMe: boolean;
  isAssignedToMe: boolean;
  reportDate: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar?: string;
  workDoneToday: string;
  planForTomorrow?: string;
  blockersOrIssues?: string;
  hoursSpent?: number;
  processStatus: TaskAssigneeStatus;
  submittedAt: string;
}

export const DailyTaskReportManagement: React.FC<DailyTaskReportManagementProps> = ({ onSelectTask }) => {
  const { currentUser, enhancedTasks, departments } = useHRMS();

  const isSuperAdmin = currentUser.role === 'Super Admin' || currentUser.role === 'ERP Administrator';
  const isCEO = isSuperAdmin || currentUser.role === 'CEO' || currentUser.designation === 'CEO' || currentUser.employeeId === 'EMP-000';
  const isHR = currentUser.role === 'HR Manager' || currentUser.role === 'HR Admin' || (currentUser as any).department?.toLowerCase().includes('hr');
  const isManager = currentUser.role === 'Department Manager' || currentUser.role === 'Department Head' || currentUser.role === 'Manager';
  const isEmployee = currentUser.role === 'Employee' || currentUser.role === 'Assignee' || (!isCEO && !isHR && !isManager && !isSuperAdmin);
  const isBroadAccess = isCEO || isHR;

  const currentEmpId = currentUser.employeeId || currentUser.id || 'EMP-001';
  const currentEmpName = (currentUser.name || '').trim().toLowerCase();

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [reportScope, setReportScope] = useState<'assigned_to_me' | 'assigned_by_me' | 'all'>(isBroadAccess ? 'all' : 'assigned_to_me');

  // Pagination & Selection
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);

  // Flatten reports from enhanced tasks
  const allReports: FlatDailyReportItem[] = useMemo(() => {
    const list: FlatDailyReportItem[] = [];

    enhancedTasks.forEach(task => {
      if (task.dailyReports && task.dailyReports.length > 0) {
        task.dailyReports.forEach(r => {
          const isAssigned = task.assignees.some(a => 
            a.employeeId === currentEmpId || 
            a.employeeId === currentUser.id || 
            (currentEmpName && a.employeeName.toLowerCase().includes(currentEmpName))
          );
          const isAssigner = isTaskAssignedByMe(task, currentUser);

          // Employee visibility check:
          // If employee, see reports on tasks assigned to them, submitted by them, or assigned by them
          if (isEmployee) {
            const isReporter = r.employeeId === currentEmpId || (currentEmpName && r.employeeName.toLowerCase().includes(currentEmpName));
            if (!isAssigned && !isReporter && !isAssigner) return;
          } else if (isManager && currentUser.department && !isCEO && !isHR) {
            if (task.department !== currentUser.department) return;
          }

          list.push({
            id: r.id,
            taskId: task.id,
            taskNumber: task.taskNumber,
            taskTitle: task.title,
            taskCategory: task.taskCategory,
            taskStartDate: task.startDate || task.taskDate,
            priority: task.priority,
            department: task.department,
            assignedBy: task.assignedBy || task.createdBy || 'Not specified',
            assignedTo: task.assignees?.map(a => a.employeeName).filter(Boolean).join(', ') || task.responsiblePersonName || 'Not assigned',
            isAssignedByMe: isAssigner,
            isAssignedToMe: isAssigned,
            reportDate: r.reportDate,
            employeeId: r.employeeId,
            employeeName: r.employeeName,
            employeeAvatar: r.employeeAvatar,
            workDoneToday: r.workDoneToday,
            planForTomorrow: r.planForTomorrow,
            blockersOrIssues: r.blockersOrIssues,
            hoursSpent: r.hoursSpent,
            processStatus: r.processStatus,
            submittedAt: r.submittedAt
          });
        });
      }
    });

    return list.sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());
  }, [enhancedTasks, isEmployee, isManager, isCEO, isHR, currentEmpId, currentEmpName, currentUser]);

  const scopeCounts = useMemo(() => ({
    all: allReports.length,
    assigned_to_me: allReports.filter(r => r.isAssignedToMe).length,
    assigned_by_me: allReports.filter(r => r.isAssignedByMe).length
  }), [allReports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return allReports.filter(r => {
      if (reportScope === 'assigned_to_me' && !r.isAssignedToMe) return false;
      if (reportScope === 'assigned_by_me' && !r.isAssignedByMe) return false;

      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesSearch = 
          r.taskNumber.toLowerCase().includes(q) ||
          r.taskTitle.toLowerCase().includes(q) ||
          r.employeeName.toLowerCase().includes(q) ||
          r.assignedBy.toLowerCase().includes(q) ||
          r.assignedTo.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.workDoneToday.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Department
      if (selectedDept !== 'All' && r.department !== selectedDept) {
        return false;
      }

      // Status
      if (selectedStatus !== 'All' && r.processStatus !== selectedStatus) {
        return false;
      }

      // Date
      if (selectedDate && r.reportDate !== selectedDate) {
        return false;
      }

      return true;
    });
  }, [allReports, reportScope, searchTerm, selectedDept, selectedStatus, selectedDate]);

  // Pagination Slice
  const totalPages = Math.ceil(filteredReports.length / pageSize) || 1;
  const validCurrentPage = Math.min(currentPage, totalPages);
  const paginatedReports = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return filteredReports.slice(startIndex, startIndex + pageSize);
  }, [filteredReports, validCurrentPage, pageSize]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedReportIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllOnPage = () => {
    const pageIds = paginatedReports.map(r => r.id);
    const allSelected = pageIds.every(id => selectedReportIds.includes(id));
    if (allSelected) {
      setSelectedReportIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedReportIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedDept('All');
    setSelectedStatus('All');
    setSelectedDate('');
    setReportScope(isBroadAccess ? 'all' : 'assigned_to_me');
    setCurrentPage(1);
  };

  const showAssignedByColumn = reportScope !== 'assigned_by_me';
  const showAssignedToColumn = reportScope !== 'assigned_to_me';
  const columnCount = 9 + (showAssignedByColumn ? 1 : 0) + (showAssignedToColumn ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* 2. Filter Bar */}
      <div style={{ 
        background: '#FFFFFF', 
        borderRadius: '14px', 
        padding: '14px 18px', 
        border: '1px solid #E7ECF3', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
            {[
              { id: 'assigned_to_me', label: 'Assigned to Me', count: scopeCounts.assigned_to_me },
              { id: 'assigned_by_me', label: 'Assigned by Me', count: scopeCounts.assigned_by_me },
              { id: 'all', label: 'All', count: scopeCounts.all }
            ].map(scope => {
              const active = reportScope === scope.id;
              return (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => { setReportScope(scope.id as typeof reportScope); setCurrentPage(1); }}
                  style={{
                    height: '30px',
                    border: active ? '1px solid #0E7490' : '1px solid transparent',
                    background: active ? '#0E7490' : 'transparent',
                    color: active ? '#FFFFFF' : '#334155',
                    borderRadius: '8px',
                    padding: '0 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <span>{scope.label}</span>
                  <span style={{
                    minWidth: '20px',
                    height: '18px',
                    padding: '0 6px',
                    borderRadius: '99px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? 'rgba(255,255,255,0.22)' : '#E2E8F0',
                    color: active ? '#FFFFFF' : '#475569',
                    fontSize: '0.68rem',
                    lineHeight: 1
                  }}>
                    {scope.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '240px', maxWidth: '340px', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input 
              type="text"
              placeholder="Search by task, reporter, or notes..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="form-control"
              style={{ fontSize: '0.8rem', paddingLeft: '32px', height: '36px', borderRadius: '8px' }}
            />
          </div>

          {/* Department Filter */}
          {!isEmployee && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
                Dept:
              </label>
              <select
                value={selectedDept}
                onChange={e => { setSelectedDept(e.target.value); setCurrentPage(1); }}
                className="form-select"
                style={{ fontSize: '0.8rem', height: '36px', borderRadius: '8px', minWidth: '130px' }}
              >
                <option value="All">All Depts</option>
                {departments.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Workflow Stage Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
              Stage:
            </label>
            <select
              value={selectedStatus}
              onChange={e => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
              className="form-select"
              style={{ fontSize: '0.8rem', height: '36px', borderRadius: '8px', minWidth: '130px' }}
            >
              <option value="All">All Stages</option>
              <option value="Pending">Pending</option>
              <option value="In Process">In Process</option>
              <option value="Under Review">Under Review</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {/* Date Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
              Date:
            </label>
            <input 
              type="date"
              value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); setCurrentPage(1); }}
              className="form-control"
              style={{ fontSize: '0.8rem', height: '36px', borderRadius: '8px', width: '145px' }}
            />
          </div>

          {(searchTerm || selectedDept !== 'All' || selectedStatus !== 'All' || selectedDate || reportScope !== (isBroadAccess ? 'all' : 'assigned_to_me')) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.76rem', height: '36px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '8px' }}
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>

        <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>
          Showing <strong>{filteredReports.length}</strong> reports
        </div>
      </div>

      {/* 4. Data Table Container per AGENTS.md */}
      <div style={{ 
        background: '#FFFFFF', 
        borderRadius: '16px', 
        border: '1px solid #E7ECF3', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        overflow: 'hidden'
      }}>
        {paginatedReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: '#94A3B8' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <FileText size={40} color="#0E7490" style={{ opacity: 0.35 }} />
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1E293B' }}>No daily reports match your filters</span>
              <span style={{ fontSize: '0.82rem', color: '#64748B' }}>Reports submitted by assigned persons will appear here</span>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', margin: 0, fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                  <th style={{ width: '40px', padding: '12px 14px', textAlign: 'center' }}>
                    <input 
                      type="checkbox"
                      checked={paginatedReports.length > 0 && paginatedReports.every(r => selectedReportIds.includes(r.id))}
                      onChange={handleSelectAllOnPage}
                      style={{ accentColor: '#0E7490', cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', whiteSpace: 'nowrap' }}>Report Date</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', whiteSpace: 'nowrap' }}>Task Number</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B' }}>Task Title</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', whiteSpace: 'nowrap' }}>Reporter / Employee</th>
                  {showAssignedByColumn && (
                    <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', whiteSpace: 'nowrap' }}>Assigned By</th>
                  )}
                  {showAssignedToColumn && (
                    <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', whiteSpace: 'nowrap' }}>Assigned To</th>
                  )}
                  <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', whiteSpace: 'nowrap' }}>Department</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', minWidth: '220px' }}>Work Completed Today</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', whiteSpace: 'nowrap' }}>Workflow Stage</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '0.78rem', color: '#1E293B', textAlign: 'right', whiteSpace: 'nowrap' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.map(item => {
                  const isSelected = selectedReportIds.includes(item.id);
                  return (
                    <tr 
                      key={item.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: isSelected ? '#ECFEFF' : undefined,
                        borderLeft: isSelected ? '4px solid #0E7490' : undefined,
                        transition: 'background-color 0.12s ease'
                      }}
                    >
                      <td style={{ textAlign: 'center', padding: '12px 14px', verticalAlign: 'middle' }}>
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          style={{ accentColor: '#0E7490', cursor: 'pointer' }}
                        />
                      </td>

                      {/* Date */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', background: '#F8FAFC', padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                          {formatDateDDMMYYYY(item.reportDate)}
                        </span>
                      </td>

                      {/* Task Number */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span 
                          onClick={() => onSelectTask(item.taskId)}
                          style={{ 
                            fontFamily: 'monospace',
                            fontSize: '0.8rem', 
                            fontWeight: 700, 
                            color: '#0E7490', 
                            background: '#ECFEFF', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            border: '1px solid #CFFAFE',
                            cursor: 'pointer'
                          }}
                          title="Click to view full task details"
                        >
                          {item.taskNumber}
                        </span>
                      </td>

                      {/* Task Title */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        <div 
                          onClick={() => onSelectTask(item.taskId)}
                          style={{ fontWeight: 600, color: '#0F172A', cursor: 'pointer', fontSize: '0.84rem' }}
                          title="Click to view full task details"
                        >
                          {item.taskTitle}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                          <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            {item.taskCategory}
                          </span>
                          {item.taskStartDate && (
                            <span style={{ fontSize: '0.68rem', color: '#0E7490', fontWeight: 600, background: '#ECFEFF', padding: '1px 6px', borderRadius: '4px', border: '1px solid #CFFAFE' }}>
                              Start: {formatDateDDMMYYYY(item.taskStartDate)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Reporter / Employee */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item.employeeAvatar ? (
                            <img 
                              src={item.employeeAvatar} 
                              alt={item.employeeName} 
                              style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{ 
                              width: '26px', 
                              height: '26px', 
                              borderRadius: '50%', 
                              background: '#0E7490', 
                              color: '#fff', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 700
                            }}>
                              {item.employeeName.charAt(0)}
                            </div>
                          )}
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                            {item.employeeName}
                          </span>
                        </div>
                      </td>

                      {showAssignedByColumn && (
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                            {item.assignedBy}
                          </span>
                        </td>
                      )}

                      {showAssignedToColumn && (
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                          <span
                            title={item.assignedTo}
                            style={{
                              display: 'inline-block',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              verticalAlign: 'middle',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: '#1E293B'
                            }}
                          >
                            {item.assignedTo}
                          </span>
                        </td>
                      )}

                      {/* Department */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                          {item.department}
                        </span>
                      </td>

                      {/* Work Completed Today */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.45 }}>
                          {item.workDoneToday}
                        </div>
                        {item.planForTomorrow && (
                          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                            <strong>Tomorrow:</strong> {item.planForTomorrow}
                          </div>
                        )}
                        {item.blockersOrIssues && (
                          <div style={{ fontSize: '0.72rem', color: '#DC2626', marginTop: '3px' }}>
                            <strong>Blocker:</strong> {item.blockersOrIssues}
                          </div>
                        )}
                      </td>

                      {/* Workflow Stage */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          background: 
                            item.processStatus === 'Completed' ? '#DCFCE7' :
                            item.processStatus === 'In Process' || item.processStatus === 'In Progress' ? '#ECFEFF' :
                            item.processStatus === 'Under Review' ? '#FEF3C7' : '#F1F5F9',
                          color: 
                            item.processStatus === 'Completed' ? '#166534' :
                            item.processStatus === 'In Process' || item.processStatus === 'In Progress' ? '#0E7490' :
                            item.processStatus === 'Under Review' ? '#92400E' : '#475569',
                          border: 
                            item.processStatus === 'Completed' ? '1px solid #BBF7D0' :
                            item.processStatus === 'In Process' || item.processStatus === 'In Progress' ? '1px solid #CFFAFE' :
                            item.processStatus === 'Under Review' ? '1px solid #FDE68A' : '1px solid #E2E8F0'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor:
                              item.processStatus === 'Completed' ? '#22C55E' :
                              item.processStatus === 'In Process' || item.processStatus === 'In Progress' ? '#0E7490' :
                              item.processStatus === 'Under Review' ? '#F59E0B' : '#94A3B8'
                          }} />
                          {item.processStatus}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => onSelectTask(item.taskId)}
                          title="View Task"
                          aria-label="View Task"
                          style={{
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            background: '#0E7490',
                            border: '1px solid #0E7490',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(14, 116, 144, 0.2)',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#0891B2';
                            e.currentTarget.style.borderColor = '#0891B2';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = '#0E7490';
                            e.currentTarget.style.borderColor = '#0E7490';
                          }}
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      )}

        {/* Standardized AGENTS.md Pagination Footer */}
        {filteredReports.length > 0 && (
          <StandardTablePagination
            currentPage={validCurrentPage}
            totalEntries={filteredReports.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[5, 10]}
          />
        )}
      </div>

      {/* Floating Action Bar per AGENTS.md */}
      <StandardFloatingActionBar
        selectedCount={selectedReportIds.length}
        onClearSelection={() => setSelectedReportIds([])}
      />
    </div>
  );
};
