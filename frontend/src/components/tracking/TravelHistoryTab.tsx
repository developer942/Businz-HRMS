import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, MapPin, Eye, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { EmployeeFieldActivityModal } from './EmployeeFieldActivityModal';
import { formatKm, formatTimeAmPm } from '../../services/trackingEngine';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { DateInput } from '../common/DateInput';

export const TravelHistoryTab: React.FC = () => {
  const { fieldAssignments, tripSessions, employees, trackingAlerts, departments: orgDepartments } = useHRMS();

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('All');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedDuty, setSelectedDuty] = useState<string>('All');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');

  // Inspection modal
  const [selectedInspection, setSelectedInspection] = useState<{
    assignment: FieldAssignment;
    trip?: FieldTripSession;
  } | null>(null);

  // Pagination (Strictly [5, 10])
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Departments list: include Organization departments even before travel history exists.
  const departments = useMemo(() => {
    const s = new Set<string>();
    orgDepartments.forEach((d) => {
      if (d.name?.trim()) s.add(d.name.trim());
    });
    fieldAssignments.forEach((a) => {
      if (a.department?.trim()) s.add(a.department.trim());
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [orgDepartments, fieldAssignments]);

  // Combine trips with assignments
  const historyRecords = useMemo(() => {
    return fieldAssignments.map((assignment) => {
      const trip = tripSessions.find((t) => t.assignmentId === assignment.id) ||
                   tripSessions.find((t) => t.employeeId === assignment.employeeId);

      const checkInFormatted = trip?.checkInTime
        ? new Date(trip.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';

      const checkOutFormatted = trip?.checkOutTime
        ? new Date(trip.checkOutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';

      const tripStartFormatted = trip?.tripStartTime
        ? new Date(trip.tripStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : formatTimeAmPm(assignment.startTime);

      const tripEndFormatted = trip?.tripEndTime
        ? new Date(trip.tripEndTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : (assignment.status === 'Completed' ? formatTimeAmPm(assignment.endTime) : '—');

      const km = trip?.totalKm || 0;
      const issues = trackingAlerts.filter((alt) => alt.assignmentId === assignment.id || alt.employeeId === assignment.employeeId).length;

      return {
        id: assignment.id,
        assignment,
        trip,
        employeeName: assignment.employeeName,
        employeeId: assignment.employeeId,
        employeeAvatar: assignment.employeeAvatar,
        department: assignment.department,
        dutyType: assignment.dutyType,
        customerSiteName: assignment.customerSiteName,
        date: assignment.startDate,
        checkIn: checkInFormatted,
        checkOut: checkOutFormatted,
        tripStart: tripStartFormatted,
        tripEnd: tripEndFormatted,
        kmTravelled: km,
        gpsIssues: issues,
        status: trip?.status || assignment.status
      };
    });
  }, [fieldAssignments, tripSessions, trackingAlerts]);

  // Filtered
  const filtered = useMemo(() => {
    return historyRecords.filter((rec) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        rec.employeeName.toLowerCase().includes(q) ||
        rec.customerSiteName.toLowerCase().includes(q) ||
        rec.department.toLowerCase().includes(q);
      const matchEmp = selectedEmployee === 'All' || rec.employeeId === selectedEmployee;
      const matchDept = selectedDept === 'All' || rec.department === selectedDept;
      const matchDuty = selectedDuty === 'All' || rec.dutyType === selectedDuty;
      const matchStart = !startDateFilter || rec.date >= startDateFilter;
      const matchEnd = !endDateFilter || rec.date <= endDateFilter;
      return matchSearch && matchEmp && matchDept && matchDuty && matchStart && matchEnd;
    });
  }, [historyRecords, searchQuery, selectedEmployee, selectedDept, selectedDuty, startDateFilter, endDateFilter]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
          Field Travel History & Route Audit
        </h2>
        <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '3px' }}>
          Historical inspection log of completed field duties, GPS route tracks, and travel reimbursement distances.
        </p>
      </div>

      {/* Main Table Container */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}
      >
        {/* Filters Bar */}
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
              placeholder="Search history by employee or site..."
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
              value={selectedEmployee}
              onChange={(e) => {
                setSelectedEmployee(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155' }}
            >
              <option value="All">All Employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.employeeId || e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>

            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155' }}
            >
              <option value="All">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={selectedDuty}
              onChange={(e) => {
                setSelectedDuty(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155' }}
            >
              <option value="All">All Duty Types</option>
              <option value="Site Visit">Site Visit</option>
              <option value="Customer Visit">Customer Visit</option>
              <option value="Vendor Visit">Vendor Visit</option>
              <option value="Travel">Travel</option>
              <option value="Field Work">Field Work</option>
            </select>

            <DateInput
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '6px 8px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
              title="Start Date"
            />
          </div>
        </div>

        {/* Table View */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employee</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Date</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Duty Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Customer / Site</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Check In</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Check Out</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Trip Start</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Trip End</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>KM Travelled</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>GPS Issues</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    No travel history records found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((rec) => (
                  <tr
                    key={rec.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Employee */}
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {rec.employeeAvatar ? (
                          <img
                            src={rec.employeeAvatar}
                            alt={rec.employeeName}
                            style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '50%',
                              backgroundColor: '#0E7490',
                              color: '#FFFFFF',
                              fontWeight: 700,
                              fontSize: '11px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {rec.employeeName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 700, color: '#0B1A2D' }}>{rec.employeeName}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{rec.department}</div>
                        </div>
                      </div>
                    </td>

                    {/* Date */}
                    <td style={{ padding: '14px 14px', color: '#334155' }}>
                      {formatDateDDMMYYYY(rec.date)}
                    </td>

                    {/* Duty Type */}
                    <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          backgroundColor: rec.dutyType === 'Site Visit' ? '#FEF3C7' : '#F1F5F9',
                          color: rec.dutyType === 'Site Visit' ? '#B45309' : '#334155',
                          whiteSpace: 'nowrap',
                          display: 'inline-block'
                        }}
                      >
                        {rec.dutyType}
                      </span>
                    </td>

                    {/* Customer / Site */}
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0B1A2D', maxWidth: '200px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rec.customerSiteName}
                      </div>
                    </td>

                    {/* Check In */}
                    <td style={{ padding: '14px 14px', color: '#475569' }}>
                      {rec.checkIn}
                    </td>

                    {/* Check Out */}
                    <td style={{ padding: '14px 14px', color: '#475569' }}>
                      {rec.checkOut}
                    </td>

                    {/* Trip Start */}
                    <td style={{ padding: '14px 14px', color: '#475569' }}>
                      {rec.tripStart}
                    </td>

                    {/* Trip End */}
                    <td style={{ padding: '14px 14px', color: '#475569' }}>
                      {rec.tripEnd}
                    </td>

                    {/* KM Travelled */}
                    <td style={{ padding: '14px 14px', fontWeight: 800, color: '#0E7490' }}>
                      {formatKm(rec.kmTravelled)}
                    </td>

                    {/* GPS Issues */}
                    <td style={{ padding: '14px 14px' }}>
                      {rec.gpsIssues > 0 ? (
                        <span style={{ color: '#EF4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.78rem' }}>
                          <AlertTriangle size={12} /> {rec.gpsIssues} Issues
                        </span>
                      ) : (
                        <span style={{ color: '#16A34A', fontSize: '0.78rem' }}>Clean</span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 14px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          backgroundColor: rec.status === 'Completed' ? '#DCFCE7' : '#ECFEFF',
                          color: rec.status === 'Completed' ? '#16A34A' : '#0E7490'
                        }}
                      >
                        {rec.status}
                      </span>
                    </td>

                    {/* Action: View Route */}
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedInspection({ assignment: rec.assignment, trip: rec.trip })}
                        title="View Route"
                        aria-label="View Route"
                        style={{
                          backgroundColor: '#FFFFFF',
                          color: '#0E7490',
                          border: '1px solid #A5F3FC',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ECFEFF')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                      >
                        <MapPin size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Standard Pagination Footer */}
        <StandardTablePagination
          currentPage={currentPage}
          totalEntries={filtered.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10]}
        />
      </div>

      {/* Route & Telemetry Modal */}
      {selectedInspection && (
        <EmployeeFieldActivityModal
          assignment={selectedInspection.assignment}
          trip={selectedInspection.trip}
          onClose={() => setSelectedInspection(null)}
        />
      )}
    </div>
  );
};
