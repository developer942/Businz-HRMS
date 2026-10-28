import React, { useState, useMemo } from 'react';
import { Search, Filter, Edit2, Trash2, MapPin, Eye, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment } from '../../types/tracking';
import { StandardFloatingActionBar } from '../common/StandardFloatingActionBar';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { AssignFieldDutyModal } from './AssignFieldDutyModal';
import { EmployeeFieldActivityModal } from './EmployeeFieldActivityModal';
import { formatTimeAmPm } from '../../services/trackingEngine';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export const FieldAssignmentsTab: React.FC = () => {
  const { fieldAssignments, cancelFieldAssignment, tripSessions, departments: orgDepartments } = useHRMS();

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dutyTypeFilter, setDutyTypeFilter] = useState<string>('All');

  // Modal states
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [editingAssignment, setEditingAssignment] = useState<FieldAssignment | undefined>(undefined);
  const [inspectingAssignment, setInspectingAssignment] = useState<FieldAssignment | null>(null);

  // Pagination (Restricted strictly to [5, 10] per design system specification)
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Interactive Row Selection
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  // Departments for filter: include Organization departments even before assignments exist.
  const departments = useMemo(() => {
    const set = new Set<string>();
    orgDepartments.forEach((d) => {
      if (d.name?.trim()) set.add(d.name.trim());
    });
    fieldAssignments.forEach((a) => {
      if (a.department?.trim()) set.add(a.department.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orgDepartments, fieldAssignments]);

  // Filtered Assignments
  const filteredAssignments = useMemo(() => {
    return fieldAssignments.filter((item) => {
      const matchSearch =
        item.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.customerSiteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = departmentFilter === 'All' || item.department === departmentFilter;
      const matchStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchDuty = dutyTypeFilter === 'All' || item.dutyType === dutyTypeFilter;
      return matchSearch && matchDept && matchStatus && matchDuty;
    });
  }, [fieldAssignments, searchQuery, departmentFilter, statusFilter, dutyTypeFilter]);

  // Paginated Slices (on mobile screens, show all assignments without pagination slicing)
  const paginatedData = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return filteredAssignments;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredAssignments.slice(start, start + pageSize);
  }, [filteredAssignments, currentPage, pageSize]);

  // Row selection helpers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allCurrentIds = paginatedData.map((d) => d.id);
      setSelectedRowIds((prev) => Array.from(new Set([...prev, ...allCurrentIds])));
    } else {
      const currentIds = new Set(paginatedData.map((d) => d.id));
      setSelectedRowIds((prev) => prev.filter((id) => !currentIds.has(id)));
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRowIds((prev) => [...prev, id]);
    } else {
      setSelectedRowIds((prev) => prev.filter((rowId) => rowId !== id));
    }
  };

  const allPageRowsSelected = paginatedData.length > 0 && paginatedData.every((d) => selectedRowIds.includes(d.id));

  // Bulk actions
  const handleBulkCancel = () => {
    if (window.confirm(`Are you sure you want to cancel the ${selectedRowIds.length} selected field assignments?`)) {
      selectedRowIds.forEach((id) => cancelFieldAssignment(id));
      setSelectedRowIds([]);
    }
  };

  const handleBulkEdit = () => {
    if (selectedRowIds.length > 0) {
      const first = fieldAssignments.find((a) => a.id === selectedRowIds[0]);
      if (first) {
        setEditingAssignment(first);
        setIsAssignModalOpen(true);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header & Quick Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
            Field Duty Assignments
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '3px', marginBottom: 0 }}>
            Schedule and configure client site visits, geofence radius bounds, and tracking parameters.
          </p>
        </div>
      </div>

      {/* Main Content Card with Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}
      >
        {/* Table Filters Toolbar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E7ECF3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#FAFCFE'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 12px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF'
            }}
          >
            <Search size={15} color="#94A3B8" />
            <input
              type="text"
              placeholder="Search assignment ID, employee, site..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{ border: 'none', outline: 'none', fontSize: '0.82rem', width: '220px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '7px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155' }}
            >
              <option value="All">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={dutyTypeFilter}
              onChange={(e) => {
                setDutyTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '7px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155' }}
            >
              <option value="All">All Duty Types</option>
              <option value="Site Visit">Site Visit</option>
              <option value="Customer Visit">Customer Visit</option>
              <option value="Vendor Visit">Vendor Visit</option>
              <option value="Travel">Travel</option>
              <option value="Field Work">Field Work</option>
              <option value="Other">Other</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '7px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155' }}
            >
              <option value="All">All Statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Standard Table View */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ width: '40px', padding: '12px 14px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allPageRowsSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    style={{ accentColor: '#0E7490', cursor: 'pointer', width: '15px', height: '15px' }}
                  />
                </th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Employee</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Department</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Duty Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Customer / Site</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Schedule</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Time Window</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Attendance Type</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Tracking</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '48px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    No field assignments found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => {
                  const isSelected = selectedRowIds.includes(item.id);

                  let statusBadgeColor = '#64748B';
                  let statusBg = '#F1F5F9';
                  if (item.status === 'Active') {
                    statusBadgeColor = '#0E7490';
                    statusBg = '#ECFEFF';
                  } else if (item.status === 'Scheduled') {
                    statusBadgeColor = '#8B5CF6';
                    statusBg = '#EDE9FE';
                  } else if (item.status === 'Completed') {
                    statusBadgeColor = '#16A34A';
                    statusBg = '#DCFCE7';
                  } else if (item.status === 'Cancelled') {
                    statusBadgeColor = '#EF4444';
                    statusBg = '#FEE2E2';
                  }

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: isSelected ? '#ECFEFF' : 'transparent',
                        borderLeft: isSelected ? '4px solid #0E7490' : '4px solid transparent',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '14px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectRow(item.id, e.target.checked)}
                          style={{ accentColor: '#0E7490', cursor: 'pointer', width: '15px', height: '15px' }}
                        />
                      </td>

                      {/* Employee */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {item.employeeAvatar ? (
                            <img
                              src={item.employeeAvatar}
                              alt={item.employeeName}
                              style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: '#0E7490',
                                color: '#FFFFFF',
                                fontWeight: 700,
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {item.employeeName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 700, color: '#0B1A2D' }}>{item.employeeName}</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{item.employeeId}</div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td style={{ padding: '14px 14px', color: '#334155', fontWeight: 600 }}>
                        {item.department}
                      </td>

                      {/* Duty Type */}
                      <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: item.dutyType === 'Site Visit' ? '#FEF3C7' : '#F1F5F9',
                            color: item.dutyType === 'Site Visit' ? '#B45309' : '#334155',
                            whiteSpace: 'nowrap',
                            display: 'inline-block'
                          }}
                        >
                          {item.dutyType}
                        </span>
                      </td>

                      {/* Customer / Site */}
                      <td style={{ padding: '14px 16px', maxWidth: '220px' }}>
                        <div style={{ fontWeight: 700, color: '#0B1A2D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.customerSiteName}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.siteAddress}
                        </div>
                      </td>

                      {/* Schedule */}
                      <td style={{ padding: '14px 14px', fontSize: '0.8rem', color: '#334155' }}>
                        <div>{formatDateDDMMYYYY(item.startDate)}</div>
                        {item.scheduleType !== 'One Day' && (
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>to {formatDateDDMMYYYY(item.endDate)}</div>
                        )}
                      </td>

                      {/* Time Window */}
                      <td style={{ padding: '14px 14px', fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                        {formatTimeAmPm(item.startTime)} – {formatTimeAmPm(item.endTime)}
                      </td>

                      {/* Attendance Type */}
                      <td style={{ padding: '14px 14px', fontSize: '0.8rem' }}>
                        <span
                          style={{
                            color: item.attendanceType === 'Site Geofence' ? '#0E7490' : '#475569',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {item.attendanceType === 'Site Geofence' ? `Geofence (${item.allowedRadiusMeters}m)` : 'Flexible Field'}
                        </span>
                      </td>

                      {/* Tracking / Travel KM */}
                      <td style={{ padding: '14px 14px', fontSize: '0.75rem' }}>
                        <div style={{ color: item.trackingRequired ? '#0E7490' : '#94A3B8', fontWeight: 700 }}>
                          {item.trackingRequired ? 'GPS ON' : 'GPS OFF'}
                        </div>
                        <div style={{ color: item.travelKmRequired ? '#F39C12' : '#94A3B8', fontWeight: 600 }}>
                          {item.travelKmRequired ? 'KM Track' : 'No KM'}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 14px' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: statusBg,
                            color: statusBadgeColor
                          }}
                        >
                          {item.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setInspectingAssignment(item)}
                            title="Inspect Activity"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#0E7490',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Eye size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingAssignment(item);
                              setIsAssignModalOpen(true);
                            }}
                            title="Edit Assignment"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#475569',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Edit2 size={13} />
                          </button>

                          {item.status !== 'Cancelled' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Cancel field assignment ${item.id}?`)) {
                                  cancelFieldAssignment(item.id);
                                }
                              }}
                              title="Cancel Assignment"
                              style={{
                                padding: '5px 8px',
                                borderRadius: '6px',
                                border: '1px solid #FEE2E2',
                                background: '#FFFFFF',
                                color: '#EF4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <XCircle size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standardized Pagination Footer (Strictly [5, 10] per design system) */}
        <StandardTablePagination
          currentPage={currentPage}
          totalEntries={filteredAssignments.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10]}
        />
      </div>

      {/* Floating Action Bar for Selected Rows */}
      {selectedRowIds.length > 0 && (
        <StandardFloatingActionBar
          selectedCount={selectedRowIds.length}
          onEdit={handleBulkEdit}
          onDelete={handleBulkCancel}
          onClearSelection={() => setSelectedRowIds([])}
        />
      )}

      {/* Create / Edit Modal */}
      {isAssignModalOpen && (
        <AssignFieldDutyModal
          initialData={editingAssignment}
          onClose={() => {
            setIsAssignModalOpen(false);
            setEditingAssignment(undefined);
          }}
        />
      )}

      {/* Inspection Modal */}
      {inspectingAssignment && (
        <EmployeeFieldActivityModal
          assignment={inspectingAssignment}
          trip={tripSessions.find((t) => t.assignmentId === inspectingAssignment.id)}
          onClose={() => setInspectingAssignment(null)}
        />
      )}
    </div>
  );
};
