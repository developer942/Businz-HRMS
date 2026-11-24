import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, MapPin, Eye, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { EmployeeFieldActivityModal } from './EmployeeFieldActivityModal';
import { formatKm, formatTimeAmPm, calculateSequentialRouteMetrics } from '../../services/trackingEngine';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { DateInput } from '../common/DateInput';

export const TravelHistoryTab: React.FC = () => {
  const { fieldAssignments, tripSessions, employees, trackingAlerts, departments: orgDepartments } = useHRMS();

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('All');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedDuty, setSelectedDuty] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
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

  // Combine trips with assignments (including permanent field employee trips)
  const historyRecords = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const records: any[] = [];
    const processedTripIds = new Set<string>();

    // 1. From Field Assignments
    fieldAssignments.forEach((assignment) => {
      const trip = tripSessions.find((t) => t.assignmentId === assignment.id);
      if (trip) processedTripIds.add(trip.id);

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

      const metrics = trip
        ? calculateSequentialRouteMetrics(
          trip.locationPoints || [],
          trip.segments,
          trip.tripEndTime || trip.checkOutTime
        )
        : null;

      const pointsCount = trip?.locationPoints?.length || 0;
      const km = (metrics && pointsCount >= 2) ? metrics.verifiedKm : (trip?.totalKm || 0);
      const unverifiedGapKm = metrics ? metrics.unverifiedGapKm : 0;
      const missingIntervalsCount = metrics ? metrics.missingIntervalsCount : 0;
      const gpsDataQuality = (pointsCount < 2 && Number(km) === 0)
        ? 'Insufficient GPS Data'
        : (metrics ? metrics.gpsDataQuality : 'Verified');
      const issues =
        trackingAlerts.filter(
          (alt) => alt.assignmentId === assignment.id || alt.employeeId === assignment.employeeId
        ).length + missingIntervalsCount;

      const isPastDate = assignment.startDate < todayStr;
      const effectiveStatus = (isPastDate && (trip?.status === 'Active' || assignment.status === 'Active'))
        ? 'Completed'
        : (trip?.status || assignment.status);

      records.push({
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
        unverifiedGapKm,
        missingIntervalsCount,
        gpsDataQuality,
        gpsIssues: issues,
        status: effectiveStatus,
        isPermanentField: Boolean(assignment.isPermanentField || trip?.isPermanentField)
      });
    });

    // 2. From Trip Sessions not covered by manual assignments (e.g. Permanent Field Employee automatic tracking trips)
    tripSessions.forEach((trip) => {
      if (processedTripIds.has(trip.id)) return;
      const emp = employees.find(e => e.employeeId === trip.employeeId || e.id === trip.employeeId);
      const assignmentFallback: FieldAssignment = {
        id: trip.assignmentId || trip.id,
        employeeId: trip.employeeId,
        employeeName: trip.employeeName || (emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Staff'),
        employeeAvatar: (emp as any)?.avatarUrl || emp?.avatar,
        department: trip.department || emp?.department || 'Field Operations',
        dutyType: trip.dutyType || 'Permanent Field',
        scheduleType: 'One Day',
        startDate: trip.tripStartTime ? trip.tripStartTime.split('T')[0] : '',
        endDate: trip.tripEndTime ? trip.tripEndTime.split('T')[0] : (trip.tripStartTime ? trip.tripStartTime.split('T')[0] : ''),
        startTime: '09:00',
        endTime: '18:00',
        customerSiteName: trip.customerSiteName || 'Regular Field Duty',
        siteAddress: trip.startAddress || 'Field Location',
        purpose: 'Permanent Field Duty & GPS Tracking',
        trackingRequired: true,
        travelKmRequired: true,
        attendanceType: 'Flexible Field Check-in',
        allowedRadiusMeters: 500,
        status: trip.status === 'Completed' ? 'Completed' : 'Active',
        isPermanentField: true,
        createdAt: trip.createdAt || trip.tripStartTime,
        updatedAt: trip.updatedAt || trip.tripStartTime,
      };

      const checkInRaw = trip.checkInTime;
      const checkOutRaw = trip.checkOutTime;
      const tripStartRaw = trip.tripStartTime;
      const tripEndRaw = trip.tripEndTime;

      const checkInFormatted = checkInRaw
        ? new Date(checkInRaw).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';
      const checkOutFormatted = checkOutRaw
        ? new Date(checkOutRaw).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';
      const tripStartFormatted = tripStartRaw
        ? new Date(tripStartRaw).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';
      const tripEndFormatted = tripEndRaw
        ? new Date(tripEndRaw).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';

      const metrics = calculateSequentialRouteMetrics(
        trip.locationPoints || [],
        trip.segments,
        trip.tripEndTime || trip.checkOutTime
      );

      const pointsCount = trip.locationPoints?.length || 0;
      const km = (metrics && pointsCount >= 2) ? metrics.verifiedKm : (trip.totalKm || 0);
      const unverifiedGapKm = metrics ? metrics.unverifiedGapKm : 0;
      const missingIntervalsCount = metrics ? metrics.missingIntervalsCount : 0;
      const gpsDataQuality = (pointsCount < 2 && Number(km) === 0)
        ? 'Insufficient GPS Data'
        : (metrics ? metrics.gpsDataQuality : 'Verified');
      const issues =
        trackingAlerts.filter(
          (alt) => alt.assignmentId === trip.assignmentId || alt.employeeId === trip.employeeId
        ).length + missingIntervalsCount;

      const isPastDate = Boolean(trip.tripStartTime && trip.tripStartTime.split('T')[0] < todayStr);
      const effectiveStatus = (isPastDate && trip.status === 'Active') ? 'Completed' : trip.status;

      records.push({
        id: trip.id,
        assignment: assignmentFallback,
        trip,
        employeeName: assignmentFallback.employeeName,
        employeeId: trip.employeeId,
        employeeAvatar: assignmentFallback.employeeAvatar,
        department: assignmentFallback.department,
        dutyType: trip.dutyType || 'Permanent Field',
        customerSiteName: assignmentFallback.customerSiteName,
        date: assignmentFallback.startDate,
        checkIn: checkInFormatted,
        checkOut: checkOutFormatted,
        tripStart: tripStartFormatted,
        tripEnd: tripEndFormatted,
        kmTravelled: km,
        unverifiedGapKm,
        missingIntervalsCount,
        gpsDataQuality,
        gpsIssues: issues,
        status: effectiveStatus,
        isPermanentField: true
      });
    });

    return records;
  }, [fieldAssignments, tripSessions, employees, trackingAlerts]);

  // Filtered
  const filtered = useMemo(() => {
    return historyRecords.filter((rec) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        rec.employeeName.toLowerCase().includes(q) ||
        rec.employeeId.toLowerCase().includes(q) ||
        rec.customerSiteName.toLowerCase().includes(q) ||
        rec.department.toLowerCase().includes(q);
      const matchEmp = selectedEmployee === 'All' || rec.employeeId === selectedEmployee;
      const matchDept = selectedDept === 'All' || rec.department === selectedDept;
      const matchDuty =
        selectedDuty === 'All'
          ? true
          : selectedDuty === 'Permanent Field'
          ? rec.isPermanentField
          : selectedDuty === 'Temporary Field'
          ? !rec.isPermanentField
          : rec.dutyType === selectedDuty;
      const matchStatus = statusFilter === 'All' || rec.status === statusFilter;
      const matchStart = !startDateFilter || rec.date >= startDateFilter;
      const matchEnd = !endDateFilter || rec.date <= endDateFilter;
      return matchSearch && matchEmp && matchDept && matchDuty && matchStatus && matchStart && matchEnd;
    });
  }, [historyRecords, searchQuery, selectedEmployee, selectedDept, selectedDuty, statusFilter, startDateFilter, endDateFilter]);

  const isFilterActive =
    searchQuery !== '' ||
    selectedEmployee !== 'All' ||
    selectedDept !== 'All' ||
    selectedDuty !== 'All' ||
    statusFilter !== 'All' ||
    startDateFilter !== '' ||
    endDateFilter !== '';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedEmployee('All');
    setSelectedDept('All');
    setSelectedDuty('All');
    setStatusFilter('All');
    setStartDateFilter('');
    setEndDateFilter('');
    setCurrentPage(1);
  };

  const paginatedData = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return filtered;
    }
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
        {/* Compact, Aligned Filters Bar */}
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
              placeholder="Search employee, ID, site..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{ border: 'none', outline: 'none', fontSize: '0.82rem', width: '200px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={selectedEmployee}
              onChange={(e) => {
                setSelectedEmployee(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155', backgroundColor: '#FFFFFF' }}
            >
              <option value="All">All Staff</option>
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
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155', backgroundColor: '#FFFFFF' }}
            >
              <option value="All">All Depts</option>
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
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155', backgroundColor: '#FFFFFF' }}
            >
              <option value="All">All Types</option>
              <option value="Permanent Field">Permanent Field</option>
              <option value="Temporary Field">Temporary Field</option>
              <option value="Site Visit">Site Visit</option>
              <option value="Customer Visit">Customer Visit</option>
              <option value="Travel">Travel</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.82rem', color: '#334155', backgroundColor: '#FFFFFF' }}
            >
              <option value="All">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Active">Active</option>
            </select>

            {/* Date Range with proper labels */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#FFFFFF', padding: '2px 6px', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>From:</span>
              <DateInput
                value={startDateFilter}
                onChange={(e) => {
                  setStartDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ padding: '4px 6px', border: 'none', fontSize: '0.8rem', outline: 'none' }}
                title="Start Date"
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>To:</span>
              <DateInput
                value={endDateFilter}
                onChange={(e) => {
                  setEndDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ padding: '4px 6px', border: 'none', fontSize: '0.8rem', outline: 'none' }}
                title="End Date"
              />
            </div>

            {isFilterActive && (
              <button
                type="button"
                onClick={handleClearFilters}
                style={{
                  padding: '7px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '0.78rem',
                  fontWeight: 650,
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Desktop Table View (10 Clean Consolidated Columns per Section 10) */}
        <div className="hidden sm:block" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employee</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Date</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Field Type</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Punch In</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Punch Out</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Travel KM</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Customer / Site Visits</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>GPS Quality</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    No travel history records found matching criteria.
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
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{rec.employeeId} · {rec.department}</div>
                        </div>
                      </div>
                    </td>

                    {/* Date */}
                    <td style={{ padding: '14px 14px', color: '#334155', fontWeight: 600 }}>
                      {formatDateDDMMYYYY(rec.date)}
                    </td>

                    {/* Field Type */}
                    <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          backgroundColor: rec.dutyType === 'Permanent Field' || rec.isPermanentField ? '#ECFEFF' : (rec.dutyType === 'Site Visit' ? '#FEF3C7' : '#F1F5F9'),
                          color: rec.dutyType === 'Permanent Field' || rec.isPermanentField ? '#0E7490' : (rec.dutyType === 'Site Visit' ? '#B45309' : '#334155'),
                          border: rec.dutyType === 'Permanent Field' || rec.isPermanentField ? '1px solid #A5F3FC' : '1px solid transparent',
                          whiteSpace: 'nowrap',
                          display: 'inline-block'
                        }}
                      >
                        {rec.dutyType === 'Permanent Field' || rec.isPermanentField ? 'Permanent Field' : rec.dutyType}
                      </span>
                    </td>

                    {/* Punch In */}
                    <td style={{ padding: '14px 14px', color: '#475569', fontWeight: 600 }}>
                      {rec.checkIn}
                    </td>

                    {/* Punch Out */}
                    <td style={{ padding: '14px 14px', color: '#475569', fontWeight: 600 }}>
                      {rec.checkOut}
                    </td>

                    {/* KM Travelled (Verified Road KM) */}
                    <td style={{ padding: '14px 14px' }}>
                      <div style={{ fontWeight: 800, color: '#0E7490' }}>
                        {formatKm(rec.kmTravelled)}
                      </div>
                      {rec.unverifiedGapKm > 0 && (
                        <div style={{ fontSize: '0.68rem', color: '#B45309', fontWeight: 600 }}>
                          Gap: {formatKm(rec.unverifiedGapKm)}
                        </div>
                      )}
                    </td>

                    {/* Customer / Site Visits (Clamped to 2 lines) */}
                    <td style={{ padding: '14px 16px', maxWidth: '220px' }}>
                      <div
                        title={rec.customerSiteName}
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: '0.82rem',
                          fontWeight: 650,
                          color: '#0F172A',
                          lineHeight: 1.35
                        }}
                      >
                        {rec.customerSiteName}
                      </div>
                    </td>

                    {/* GPS Data Quality */}
                    <td style={{ padding: '14px 14px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color:
                            rec.gpsDataQuality === 'Verified'
                              ? '#16A34A'
                              : rec.gpsDataQuality === 'Partial (Gaps Detected)'
                              ? '#D97706'
                              : '#64748B'
                        }}
                      >
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor:
                              rec.gpsDataQuality === 'Verified'
                                ? '#16A34A'
                                : rec.gpsDataQuality === 'Partial (Gaps Detected)'
                                ? '#D97706'
                                : '#94A3B8'
                          }}
                        />
                        {rec.gpsDataQuality}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 14px' }}>
                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: '9999px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          backgroundColor: rec.status === 'Completed' ? '#DCFCE7' : '#ECFEFF',
                          color: rec.status === 'Completed' ? '#16A34A' : '#0E7490'
                        }}
                      >
                        {rec.status}
                      </span>
                    </td>

                    {/* View Route Action */}
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedInspection({ assignment: rec.assignment, trip: rec.trip })}
                        style={{
                          backgroundColor: '#FFFFFF',
                          color: '#0E7490',
                          border: '1px solid #A5F3FC',
                          borderRadius: '8px',
                          padding: '6px 14px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#ECFEFF';
                          e.currentTarget.style.borderColor = '#0E7490';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#FFFFFF';
                          e.currentTarget.style.borderColor = '#A5F3FC';
                        }}
                      >
                        <Eye size={13} />
                        <span>View Route</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View for Travel History */}
        <div className="block sm:hidden" style={{ padding: '12px' }}>
          {paginatedData.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8' }}>
              No travel history records found.
            </div>
          ) : (
            paginatedData.map((rec) => (
              <div
                key={rec.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px',
                  marginBottom: '10px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 750, color: '#0F172A', fontSize: '0.88rem' }}>{rec.employeeName}</div>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{formatDateDDMMYYYY(rec.date)}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#334155', marginBottom: '8px' }}>
                  <strong>Site:</strong> {rec.customerSiteName}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.74rem', borderTop: '1px solid #F1F5F9', paddingTop: '8px', marginBottom: '10px' }}>
                  <div><span style={{ color: '#64748B' }}>In:</span> <strong>{rec.checkIn}</strong></div>
                  <div><span style={{ color: '#64748B' }}>Out:</span> <strong>{rec.checkOut}</strong></div>
                  <div><span style={{ color: '#64748B' }}>KM:</span> <strong style={{ color: '#0E7490' }}>{formatKm(rec.kmTravelled)}</strong></div>
                  <div><span style={{ color: '#64748B' }}>Quality:</span> <strong>{rec.gpsDataQuality}</strong></div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInspection({ assignment: rec.assignment, trip: rec.trip })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid #0E7490',
                    backgroundColor: '#ECFEFF',
                    color: '#0E7490',
                    fontSize: '0.8rem',
                    fontWeight: 750,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Eye size={14} />
                  <span>View Route Map & Playback</span>
                </button>
              </div>
            ))
          )}
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
