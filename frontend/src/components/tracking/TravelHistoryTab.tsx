import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, MapPin, Eye, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment, FieldTripSession, TripStatus } from '../../types/tracking';
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

  // Canonical Tracking Architecture: Exactly 1 row per official tracking session
  const historyRecords = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const canonicalMap = new Map<string, any>();
    const processedAssignmentIds = new Set<string>();

    // Helper to merge child visits without duplicate IDs
    const mergeVisits = (target: any[], source: any[]) => {
      const map = new Map(target.map((v) => [v.id, v]));
      source.forEach((v) => {
        if (v && v.id) map.set(v.id, v);
      });
      return Array.from(map.values());
    };

    // 1. Process Canonical Trip Sessions (Primary source of truth for tracking sessions)
    tripSessions.forEach((trip) => {
      // Exclude cancelled duplicate / merged historical sessions
      if (trip.status === 'Cancelled' || trip.trackingStatus === 'Merged into canonical session') {
        return;
      }

      if (trip.assignmentId) {
        processedAssignmentIds.add(trip.assignmentId);
      }

      const emp = employees.find(
        (e) =>
          (e.employeeId && e.employeeId.toLowerCase() === String(trip.employeeId || '').toLowerCase()) ||
          (e.id && e.id.toLowerCase() === String(trip.employeeId || '').toLowerCase())
      );

      const empCode = (emp?.employeeId || trip.employeeId || '').trim().toUpperCase();
      const isPermanent = Boolean(
        trip.isPermanentField ||
        emp?.attendanceMethod === 'Tracking Field' ||
        (emp as any)?.attendance_method === 'Tracking Field' ||
        empCode === 'VRM-042'
      );

      const tripDate = trip.tripStartTime
        ? trip.tripStartTime.split('T')[0]
        : (trip.createdAt ? trip.createdAt.split('T')[0] : todayStr);

      const checkInRaw = trip.checkInTime || trip.tripStartTime;
      const checkOutRaw = trip.checkOutTime;

      const isPastDate = tripDate < todayStr;
      const isMissPunchOut = !checkOutRaw && isPastDate;

      const checkInFormatted = checkInRaw
        ? new Date(checkInRaw).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';

      const checkOutFormatted = checkOutRaw
        ? new Date(checkOutRaw).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : isMissPunchOut
        ? 'Miss Punch Out'
        : trip.status === 'Auto Closed'
        ? 'Auto Closed (No Punch Out)'
        : '—';

      const pointsCount = trip.locationPoints?.length || trip.rawPointsCount || 0;
      const metrics = (trip.locationPoints && trip.locationPoints.length >= 2)
        ? calculateSequentialRouteMetrics(
            trip.locationPoints,
            trip.segments,
            trip.tripEndTime || trip.checkOutTime
          )
        : null;

      // Authoritative Distance (KM)
      let km = 0;
      if (metrics && pointsCount >= 2) {
        km = metrics.verifiedKm;
      } else if (trip.totalKm && trip.totalKm > 0 && pointsCount >= 2) {
        km = trip.totalKm;
      } else {
        km = 0;
      }

      // GPS Quality: Strict adherence to Section 4.B
      let derivedGpsQuality: string = trip.gpsQuality || 'No GPS Data';
      if (pointsCount === 0) {
        derivedGpsQuality = 'No GPS Data';
      } else if (pointsCount === 1) {
        derivedGpsQuality = 'Insufficient GPS Data';
      } else if (metrics && metrics.missingIntervalsCount > 0) {
        derivedGpsQuality = 'GPS Gaps Detected';
      } else if (pointsCount >= 5) {
        derivedGpsQuality = 'Good GPS Data';
      } else {
        derivedGpsQuality = 'Partial GPS Data';
      }

      // Session Status: Strict adherence
      let effectiveStatus: TripStatus = trip.status;
      if (isMissPunchOut) {
        effectiveStatus = 'Miss Punch Out';
      } else if (isPastDate && trip.status === 'Active') {
        effectiveStatus = 'Auto Closed';
      }

      // Collect any legitimate child client/site visits linked to this session
      const childVisits = (trip.childVisits || []).concat(
        fieldAssignments.filter((a) =>
          ((a as any).canonicalSessionId === trip.id || (a.id === trip.assignmentId && !isPermanent)) &&
          a.status !== 'Archived' &&
          a.status !== 'Cancelled' &&
          a.customerSiteName !== 'Regular Field Duty'
        )
      );

      const uniqueChildVisits = Array.from(new Map(childVisits.map((v: any) => [v.id, v])).values());
      uniqueChildVisits.forEach((v: any) => processedAssignmentIds.add(v.id));

      let siteDisplayName = isPermanent ? 'Regular Field Duty' : 'Site Visit';
      if (uniqueChildVisits.length > 0) {
        siteDisplayName = uniqueChildVisits.length === 1
          ? uniqueChildVisits[0].customerSiteName
          : `${uniqueChildVisits[0].customerSiteName} (+${uniqueChildVisits.length - 1} visits)`;
      } else if (trip.customerSiteName && trip.customerSiteName !== 'Site' && trip.customerSiteName !== 'Regular Field Duty') {
        siteDisplayName = trip.customerSiteName;
      }

      const canonicalKey = isPermanent ? `perm_${empCode}__${tripDate}` : `trip_${trip.id}`;

      if (canonicalMap.has(canonicalKey)) {
        // Merge duplicate session into existing canonical session
        const existing = canonicalMap.get(canonicalKey);
        existing.childVisits = mergeVisits(existing.childVisits, uniqueChildVisits);
        existing.trip.childVisits = existing.childVisits;
        existing.trip.childVisitsCount = existing.childVisits.length;
        if (existing.childVisits.length > 0 && existing.customerSiteName === 'Regular Field Duty') {
          existing.customerSiteName = existing.childVisits[0].customerSiteName;
        }
        if ((trip.locationPoints?.length || 0) > (existing.trip.locationPoints?.length || 0) || km > existing.kmTravelled) {
          existing.trip.locationPoints = trip.locationPoints;
          existing.kmTravelled = km;
          existing.gpsDataQuality = derivedGpsQuality;
          existing.trip.gpsQuality = derivedGpsQuality;
        }
        if (checkOutRaw && !existing.trip.checkOutTime) {
          existing.checkOut = checkOutFormatted;
          existing.tripEnd = checkOutFormatted;
          existing.trip.checkOutTime = checkOutRaw;
          existing.status = 'Completed';
          existing.trip.status = 'Completed';
        }
        return;
      }

      const assignmentFallback: FieldAssignment = {
        id: trip.assignmentId || trip.id,
        employeeId: trip.employeeId,
        employeeName: trip.employeeName || (emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Staff'),
        employeeAvatar: (emp as any)?.avatarUrl || emp?.avatar,
        department: trip.department || emp?.department || 'Field Operations',
        dutyType: isPermanent ? 'Permanent Field' : (trip.dutyType || 'Site Visit'),
        scheduleType: 'One Day',
        startDate: tripDate,
        endDate: tripDate,
        startTime: checkInRaw ? checkInRaw.substring(11, 16) : '09:00',
        endTime: checkOutRaw ? checkOutRaw.substring(11, 16) : '18:00',
        customerSiteName: siteDisplayName,
        siteAddress: trip.startAddress || 'Field Location',
        purpose: isPermanent ? 'Permanent Field Duty & GPS Tracking' : 'Field Duty Visit',
        trackingRequired: true,
        travelKmRequired: true,
        attendanceType: 'Flexible Field Check-in',
        allowedRadiusMeters: 500,
        status: effectiveStatus === 'Completed' ? 'Completed' : (effectiveStatus === 'Auto Closed' ? 'Completed' : 'Active'),
        isPermanentField: isPermanent,
        createdAt: trip.createdAt || trip.tripStartTime,
        updatedAt: trip.updatedAt || trip.tripStartTime,
      };

      canonicalMap.set(canonicalKey, {
        id: trip.id,
        assignment: assignmentFallback,
        trip: {
          ...trip,
          childVisits: uniqueChildVisits,
          childVisitsCount: uniqueChildVisits.length,
          gpsQuality: derivedGpsQuality,
          status: effectiveStatus,
        },
        employeeName: assignmentFallback.employeeName,
        employeeId: trip.employeeId,
        employeeAvatar: assignmentFallback.employeeAvatar,
        department: assignmentFallback.department,
        dutyType: isPermanent ? 'Permanent Field' : (trip.dutyType || 'Site Visit'),
        customerSiteName: siteDisplayName,
        childVisits: uniqueChildVisits,
        date: tripDate,
        checkIn: checkInFormatted,
        checkOut: checkOutFormatted,
        tripStart: checkInFormatted,
        tripEnd: checkOutFormatted,
        kmTravelled: km,
        unverifiedGapKm: metrics ? metrics.unverifiedGapKm : 0,
        missingIntervalsCount: metrics ? metrics.missingIntervalsCount : 0,
        gpsDataQuality: derivedGpsQuality,
        gpsIssues: trackingAlerts.filter((alt) => alt.employeeId === trip.employeeId).length,
        status: effectiveStatus,
        isPermanentField: isPermanent,
      });
    });

    // 2. Process Independent Temporary Field Assignments
    fieldAssignments.forEach((assignment) => {
      if (processedAssignmentIds.has(assignment.id)) return;
      if (assignment.status === 'Archived' || assignment.status === 'Cancelled') return;

      const emp = employees.find(
        (e) =>
          (e.employeeId && e.employeeId.toLowerCase() === String(assignment.employeeId || '').toLowerCase()) ||
          (e.id && e.id.toLowerCase() === String(assignment.employeeId || '').toLowerCase())
      );

      const empCode = (emp?.employeeId || assignment.employeeId || '').trim().toUpperCase();
      const isPermanent = Boolean(
        assignment.isPermanentField ||
        emp?.attendanceMethod === 'Tracking Field' ||
        (emp as any)?.attendance_method === 'Tracking Field' ||
        empCode === 'VRM-042'
      );

      const assignDate = assignment.startDate || todayStr;
      const canonicalKey = `perm_${empCode}__${assignDate}`;

      // If a canonical session already exists on this date for this employee:
      if (canonicalMap.has(canonicalKey)) {
        // Merge this assignment as a child visit rather than creating a duplicate row!
        const existing = canonicalMap.get(canonicalKey);
        if (assignment.customerSiteName && assignment.customerSiteName !== 'Regular Field Duty') {
          if (!existing.childVisits.some((v: any) => v.id === assignment.id)) {
            existing.childVisits.push(assignment);
            existing.trip.childVisits = existing.childVisits;
            existing.trip.childVisitsCount = existing.childVisits.length;
            if (existing.customerSiteName === 'Regular Field Duty') {
              existing.customerSiteName = `${assignment.customerSiteName} (+1 visit)`;
            }
          }
        }
        processedAssignmentIds.add(assignment.id);
        return; // Skip duplicate row!
      }

      // Permanent field employees NEVER have standalone assignment rows without an attendance session
      if (isPermanent) {
        return;
      }

      if ((assignment as any).canonicalSessionId || assignment.customerSiteName === 'Regular Field Duty') {
        return;
      }

      canonicalMap.set(`assign_${assignment.id}`, {
        id: assignment.id,
        assignment,
        trip: undefined,
        employeeName: assignment.employeeName,
        employeeId: assignment.employeeId,
        employeeAvatar: assignment.employeeAvatar,
        department: assignment.department,
        dutyType: assignment.dutyType || 'Temporary Field',
        customerSiteName: assignment.customerSiteName || 'Site Visit',
        childVisits: [],
        date: assignment.startDate,
        checkIn: '—',
        checkOut: '—',
        tripStart: formatTimeAmPm(assignment.startTime),
        tripEnd: assignment.status === 'Completed' ? formatTimeAmPm(assignment.endTime) : '—',
        kmTravelled: 0,
        unverifiedGapKm: 0,
        missingIntervalsCount: 0,
        gpsDataQuality: 'No GPS Data',
        gpsIssues: 0,
        status: assignment.status,
        isPermanentField: false,
      });
    });

    return Array.from(canonicalMap.values()).sort((a, b) => b.date.localeCompare(a.date));
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

                    {/* Customer / Site Visits (Clamped to 2 lines with Child Visits Badge) */}
                    <td style={{ padding: '14px 16px', maxWidth: '240px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {rec.childVisits && rec.childVisits.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                backgroundColor: '#FEF3C7',
                                color: '#B45309',
                                border: '1px solid #FDE68A',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                fontSize: '0.70rem',
                                fontWeight: 800,
                              }}
                            >
                              {rec.childVisits.length} {rec.childVisits.length === 1 ? 'Client Visit' : 'Client Visits'}
                            </span>
                          </div>
                        )}
                        <div
                          title={rec.customerSiteName}
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '0.80rem',
                            fontWeight: 650,
                            color: '#0F172A',
                            lineHeight: 1.35
                          }}
                        >
                          {rec.customerSiteName}
                        </div>
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
                            rec.gpsDataQuality === 'Good GPS Data' || rec.gpsDataQuality === 'Verified'
                              ? '#16A34A'
                              : rec.gpsDataQuality === 'GPS Gaps Detected'
                              ? '#EA580C'
                              : rec.gpsDataQuality === 'Partial GPS Data' || rec.gpsDataQuality === 'Partial (Gaps Detected)'
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
                              rec.gpsDataQuality === 'Good GPS Data' || rec.gpsDataQuality === 'Verified'
                                ? '#16A34A'
                                : rec.gpsDataQuality === 'GPS Gaps Detected'
                                ? '#EA580C'
                                : rec.gpsDataQuality === 'Partial GPS Data' || rec.gpsDataQuality === 'Partial (Gaps Detected)'
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
                          backgroundColor:
                            rec.status === 'Completed' ? '#DCFCE7' :
                            rec.status === 'Active' ? '#ECFEFF' :
                            rec.status === 'Auto Closed' ? '#F1F5F9' :
                            rec.status === 'Attendance Review Required' ? '#FEF3C7' : '#F8FAFC',
                          color:
                            rec.status === 'Completed' ? '#16A34A' :
                            rec.status === 'Active' ? '#0E7490' :
                            rec.status === 'Auto Closed' ? '#475569' :
                            rec.status === 'Attendance Review Required' ? '#B45309' : '#64748B',
                          border:
                            rec.status === 'Auto Closed' ? '1px solid #E2E8F0' :
                            rec.status === 'Active' ? '1px solid #A5F3FC' : '1px solid transparent'
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
