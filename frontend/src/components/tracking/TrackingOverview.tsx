import React, { useState, useMemo } from 'react';
import {
  Users,
  Navigation,
  AlertTriangle,
  MapPin,
  Eye,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment, FieldTripSession, TodayFieldEmployeeItem } from '../../types/tracking';
import { formatKm, calculateSequentialRouteMetrics, deriveAccurateGpsStatus } from '../../services/trackingEngine';
import { EmployeeFieldActivityModal } from './EmployeeFieldActivityModal';

export interface TrackingOverviewProps {
  onOpenAssignModal?: () => void;
}

export const TrackingOverview: React.FC<TrackingOverviewProps> = () => {
  const { fieldAssignments, tripSessions, trackingAlerts, departments: orgDepartments, employees, attendanceRecords } = useHRMS();

  const todayStr = new Date().toISOString().split('T')[0];

  // Selected assignment for EmployeeFieldActivityModal
  const [selectedAssignment, setSelectedAssignment] = useState<FieldAssignment | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<FieldTripSession | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dutyTypeFilter, setDutyTypeFilter] = useState<'All' | 'Permanent Field' | 'Temporary Field'>('All');

  // Compute Today's field assignments
  const todayAssignments = useMemo(() => {
    return fieldAssignments.filter(a => {
      if (a.status === 'Cancelled') return false;
      if (a.scheduleType === 'One Day') return a.startDate === todayStr;
      if (a.scheduleType === 'Date Range') return todayStr >= a.startDate && todayStr <= a.endDate;
      if (a.scheduleType === 'Weekly') {
        const startDay = new Date(a.startDate).getDay();
        return new Date().getDay() === startDay && todayStr >= a.startDate && todayStr <= a.endDate;
      }
      return todayStr >= a.startDate && todayStr <= a.endDate;
    });
  }, [fieldAssignments, todayStr]);

  // Merge with active/today trips (Strict Canonical Employee Deduplication: 1 row per employee)
  const tableData: TodayFieldEmployeeItem[] = useMemo(() => {
    const employeeMap = new Map<string, TodayFieldEmployeeItem>();

    // 1. Process Permanent Field Employees (Tracking Field mode)
    employees.forEach(emp => {
      const isPermField = emp.attendanceMethod === 'Tracking Field' || (emp as any).attendance_method === 'Tracking Field';
      if (!isPermField) return;

      const empCode = emp.employeeId || emp.id;
      const empKey = String(emp.id || emp.employeeId).toLowerCase();

      // Find any site visit assignment scheduled for this employee today
      const siteAssign = todayAssignments.find(a => {
        const aEmp = String(a.employeeId || '').toLowerCase();
        return aEmp === empKey || aEmp === String(emp.employeeId || '').toLowerCase() || aEmp === String(emp.id || '').toLowerCase();
      });

      // Find any trip session for this employee today or currently active
      const trip = tripSessions.find(t => {
        const tEmp = String(t.employeeId || '').toLowerCase();
        const matches = tEmp === empKey || tEmp === String(emp.employeeId || '').toLowerCase() || tEmp === String(emp.id || '').toLowerCase();
        return matches && (t.status === 'Active' || (t.tripStartTime && t.tripStartTime.startsWith(todayStr)));
      });

      // Find today's attendance record
      const todayAtt = attendanceRecords.find(a => {
        const aEmp = String(a.employeeId || '').toLowerCase();
        const matches = aEmp === empKey || aEmp === String(emp.employeeId || '').toLowerCase() || aEmp === String(emp.id || '').toLowerCase();
        const recDate = a.date || a.shiftDate;
        return matches && recDate && recDate.startsWith(todayStr);
      });

      // Only display if employee has an active/today trip, attendance punch today, or site visit assignment
      if (!todayAtt && !trip && !siteAssign) return;

      const checkInFormatted = todayAtt?.checkIn
        ? (todayAtt.checkIn.includes('T')
            ? new Date(todayAtt.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
            : todayAtt.checkIn)
        : trip?.checkInTime
          ? new Date(trip.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
          : undefined;

      const lastUpdatedFormatted = trip?.lastGpsUpdate
        ? calculateRelativeTime(trip.lastGpsUpdate)
        : 'Just now';

      const pointsCount = trip?.locationPoints?.length || 0;
      const metrics = trip
        ? calculateSequentialRouteMetrics(
            trip.locationPoints || [],
            trip.segments,
            trip.tripEndTime || trip.checkOutTime
          )
        : null;

      const travelKm = (metrics && pointsCount >= 2) ? metrics.verifiedKm : (trip?.totalKm || 0);
      const isCheckedOut = Boolean(todayAtt?.checkOut && todayAtt.checkOut !== '--:--') || trip?.status === 'Completed';
      const isPunchedIn = Boolean(todayAtt?.checkIn && todayAtt.checkIn !== '--:--');

      const accurate = deriveAccurateGpsStatus({
        tripStatus: isCheckedOut ? 'Completed' : (trip?.status || (isPunchedIn ? 'Active' : 'Stopped')),
        trackingStatus: trip?.trackingStatus || (isPunchedIn ? 'Stationary' : 'Pending GPS Fix'),
        lastGpsUpdate: trip?.lastGpsUpdate,
      });

      const customerSiteName = siteAssign?.customerSiteName || 
        (trip?.customerSiteName && trip.customerSiteName !== 'Site' ? trip.customerSiteName : 'Regular Field Duty');

      const lastLocPoint = trip?.locationPoints && trip.locationPoints.length > 0
        ? trip.locationPoints[trip.locationPoints.length - 1]
        : null;

      employeeMap.set(empKey, {
        id: trip?.id || siteAssign?.id || `perm-${emp.id}-${todayStr}`,
        assignmentId: siteAssign?.id || trip?.assignmentId || `perm-assign-${emp.id}-${todayStr}`,
        employeeId: empCode,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        employeeAvatar: (emp as any).avatarUrl || emp.avatar,
        department: emp.department || siteAssign?.department || 'Field Operations',
        dutyType: 'Permanent Field',
        customerSiteName,
        checkInTime: checkInFormatted,
        travelKm,
        gpsStatus: accurate.gpsStatus,
        trackingStatus: accurate.trackingStatus,
        lastUpdated: lastUpdatedFormatted,
        currentLat: lastLocPoint?.latitude || trip?.startLat || siteAssign?.siteLat,
        currentLng: lastLocPoint?.longitude || trip?.startLng || siteAssign?.siteLng,
        activeTripId: trip?.id,
        isPermanentField: true
      });
    });

    // 2. Process Temporary Field Assignments (excluding employees already processed as Permanent Field)
    todayAssignments.forEach(assignment => {
      const empUuidOrCode = String(assignment.employeeId || '').toLowerCase();
      // Check if this employee was already mapped as Permanent Field
      const alreadyMapped = Array.from(employeeMap.keys()).some(k => k === empUuidOrCode);
      if (alreadyMapped) return;

      // Also verify if the employee profile is Permanent Field
      const empProfile = employees.find(e => 
        String(e.employeeId || '').toLowerCase() === empUuidOrCode || 
        String(e.id || '').toLowerCase() === empUuidOrCode
      );
      if (empProfile && (empProfile.attendanceMethod === 'Tracking Field' || (empProfile as any).attendance_method === 'Tracking Field')) {
        return; // Handled under Permanent Field
      }

      const trip = tripSessions.find(t => t.assignmentId === assignment.id) ||
                   tripSessions.find(t => String(t.employeeId || '').toLowerCase() === empUuidOrCode && t.status === 'Active');

      const checkInFormatted = trip?.checkInTime
        ? new Date(trip.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : undefined;

      const lastUpdatedFormatted = trip?.lastGpsUpdate
        ? calculateRelativeTime(trip.lastGpsUpdate)
        : 'Just now';

      const pointsCount = trip?.locationPoints?.length || 0;
      const metrics = trip
        ? calculateSequentialRouteMetrics(
            trip.locationPoints || [],
            trip.segments,
            trip.tripEndTime || trip.checkOutTime
          )
        : null;

      const travelKm = (metrics && pointsCount >= 2) ? metrics.verifiedKm : (trip?.totalKm || 0);

      const accurate = deriveAccurateGpsStatus({
        tripStatus: trip?.status || (assignment.status === 'Active' ? 'Active' : 'Stopped'),
        trackingStatus: trip?.trackingStatus || (assignment.status === 'Active' ? 'Travelling' : 'Idle'),
        lastGpsUpdate: trip?.lastGpsUpdate,
      });

      employeeMap.set(empUuidOrCode, {
        id: assignment.id,
        assignmentId: assignment.id,
        employeeId: assignment.employeeId,
        employeeName: assignment.employeeName,
        employeeAvatar: assignment.employeeAvatar,
        department: assignment.department,
        dutyType: assignment.dutyType,
        customerSiteName: assignment.customerSiteName,
        checkInTime: checkInFormatted,
        travelKm,
        gpsStatus: accurate.gpsStatus,
        trackingStatus: accurate.trackingStatus,
        lastUpdated: lastUpdatedFormatted,
        currentLat: trip?.startLat || assignment.siteLat,
        currentLng: trip?.startLng || assignment.siteLng,
        activeTripId: trip?.id,
        isPermanentField: false
      });
    });

    return Array.from(employeeMap.values());
  }, [todayAssignments, tripSessions, employees, attendanceRecords, todayStr]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return tableData.filter(row => {
      const matchSearch = row.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          row.customerSiteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          row.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = departmentFilter === 'All' || row.department === departmentFilter;
      const matchStatus = statusFilter === 'All' || row.trackingStatus === statusFilter;
      const matchDutyType =
        dutyTypeFilter === 'All' ||
        (dutyTypeFilter === 'Permanent Field' && row.isPermanentField) ||
        (dutyTypeFilter === 'Temporary Field' && !row.isPermanentField);
      return matchSearch && matchDept && matchStatus && matchDutyType;
    });
  }, [tableData, searchQuery, departmentFilter, statusFilter, dutyTypeFilter]);

  // Departments for filter: show Organization departments even when today's table is empty.
  const departments = useMemo(() => {
    const set = new Set<string>();
    orgDepartments.forEach(d => {
      if (d.name?.trim()) set.add(d.name.trim());
    });
    tableData.forEach(r => {
      if (r.department?.trim()) set.add(r.department.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orgDepartments, tableData]);

  // Compute 4 KPI values from actual data (Strict Unique Employee Count)
  const fieldEmployeesToday = new Set(tableData.map(r => r.employeeId)).size;
  const currentlyTravelling = tableData.filter(r => r.trackingStatus === 'Travelling' || r.gpsStatus === 'Travelling' || r.gpsStatus === 'Active').length;
  const openGpsAlertsCount = trackingAlerts.filter(a => a.status === 'Open').length;
  const totalKmToday = tableData.reduce((acc, curr) => acc + (curr.travelKm || 0), 0);

  const handleOpenDetail = (assignmentId: string) => {
    const assignment = fieldAssignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    const trip = tripSessions.find(t => t.assignmentId === assignmentId) ||
                 tripSessions.find(t => t.employeeId === assignment.employeeId);
    setSelectedAssignment(assignment);
    setSelectedTrip(trip);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top KPI Cards (Simple, clean, high contrast) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}
      >
        {/* KPI 1: Field Employees Today */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            padding: '12px 16px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B' }}>
              Field Employees Today
            </span>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Users size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', lineHeight: 1.1 }}>
            {fieldEmployeesToday}
          </div>
        </div>

        {/* KPI 2: Currently Travelling */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            padding: '12px 16px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B' }}>
              Currently Travelling
            </span>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: '#DCFCE7',
                color: '#16A34A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Navigation size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', lineHeight: 1.1 }}>
            {currentlyTravelling}
          </div>
        </div>

        {/* KPI 3: GPS Issues */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            padding: '12px 16px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B' }}>
              GPS Issues
            </span>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: openGpsAlertsCount > 0 ? '#FEE2E2' : '#F1F5F9',
                color: openGpsAlertsCount > 0 ? '#EF4444' : '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: openGpsAlertsCount > 0 ? '#EF4444' : '#0B1A2D', lineHeight: 1.1 }}>
            {openGpsAlertsCount}
          </div>
        </div>

        {/* KPI 4: Total KM Today */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            padding: '12px 16px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B' }}>
              Total KM Today
            </span>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <MapPin size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0E7490', lineHeight: 1.1 }}>
            {formatKm(totalKmToday)}
          </div>
        </div>
      </div>

      {/* Today's Field Employees Section */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}
      >
        {/* Table Header Controls */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E7ECF3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
              Today's Field Employees
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
              Live telemetry status of all staff currently deployed on field duty and travel.
            </p>
          </div>

          {/* Search & Filter Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF'
              }}
            >
              <Search size={15} color="#94A3B8" />
              <input
                type="text"
                placeholder="Search employee or site..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.82rem', width: '180px' }}
              />
            </div>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.82rem',
                backgroundColor: '#FFFFFF',
                color: '#334155'
              }}
            >
              <option value="All">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.82rem',
                backgroundColor: '#FFFFFF',
                color: '#334155'
              }}
            >
              <option value="All">All Statuses</option>
              <option value="Travelling">Travelling</option>
              <option value="Tracking Active">Tracking Active</option>
              <option value="On Site">On Site</option>
              <option value="Interrupted">Interrupted</option>
              <option value="Completed">Completed</option>
              <option value="Tracking Completed">Tracking Completed</option>
            </select>

            <select
              value={dutyTypeFilter}
              onChange={(e) => setDutyTypeFilter(e.target.value as any)}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.82rem',
                backgroundColor: '#FFFFFF',
                color: '#0E7490',
                fontWeight: 650
              }}
            >
              <option value="All">All Employees</option>
              <option value="Permanent Field">Permanent Field Employees</option>
              <option value="Temporary Field">Temporary Field Assignments</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 20px', fontWeight: 700 }}>Employee</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Department</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Duty Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Customer / Site</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Check In</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Travel KM</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>GPS Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tracking Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Last Updated</th>
                <th style={{ padding: '12px 20px', fontWeight: 700, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    No field duty records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isGpsActive = row.gpsStatus === 'GPS Active';
                  const isTravelling = row.trackingStatus === 'Travelling';

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Employee */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {row.employeeAvatar ? (
                            <img
                              src={row.employeeAvatar}
                              alt={row.employeeName}
                              style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '50%',
                                backgroundColor: '#0E7490',
                                color: '#FFFFFF',
                                fontWeight: 700,
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                justifySelf: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {row.employeeName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 700, color: '#0B1A2D' }}>{row.employeeName}</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{row.employeeId}</div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td style={{ padding: '14px 16px', color: '#334155', fontWeight: 600 }}>
                        {row.department}
                      </td>

                      {/* Duty Type */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: row.isPermanentField || row.dutyType === 'Permanent Field' ? '#ECFEFF' : (row.dutyType === 'Site Visit' ? '#FEF3C7' : '#F1F5F9'),
                            color: row.isPermanentField || row.dutyType === 'Permanent Field' ? '#0E7490' : (row.dutyType === 'Site Visit' ? '#B45309' : '#334155'),
                            border: row.isPermanentField || row.dutyType === 'Permanent Field' ? '1px solid #A5F3FC' : '1px solid transparent',
                            whiteSpace: 'nowrap',
                            display: 'inline-block'
                          }}
                        >
                          {row.isPermanentField || row.dutyType === 'Permanent Field' ? 'Permanent Field' : `Temporary Field (${row.dutyType})`}
                        </span>
                      </td>

                      {/* Customer / Site */}
                      <td style={{ padding: '14px 16px', color: '#0B1A2D', fontWeight: 600 }}>
                        {row.customerSiteName}
                      </td>

                      {/* Check In */}
                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {row.checkInTime || '—'}
                      </td>

                      {/* Travel KM */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0E7490' }}>
                        <div>{formatKm(row.travelKm || 0)}</div>
                        {(row.travelKm || 0) === 0 && (
                          <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>
                            Insufficient GPS Data
                          </div>
                        )}
                      </td>

                      {/* GPS Status */}
                      <td style={{ padding: '14px 16px' }}>
                        {(() => {
                          const status = row.gpsStatus;
                          const isGreen = status === 'Active' || status === 'Travelling' || status === 'GPS Active';
                          const isAmber = status === 'GPS Weak' || status === 'Stale Location' || status === 'Stationary';
                          const isRed = status === 'GPS Disabled' || status === 'Permission Denied' || status === 'Offline' || status === 'GPS Lost';
                          const color = isGreen ? '#16A34A' : isAmber ? (status === 'Stationary' ? '#0E7490' : '#D97706') : isRed ? '#EF4444' : '#64748B';
                          const dotColor = isGreen ? '#22C55E' : isAmber ? (status === 'Stationary' ? '#0E7490' : '#F59E0B') : isRed ? '#EF4444' : '#94A3B8';

                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                color
                              }}
                            >
                              <span style={{ color: dotColor, fontSize: '10px' }}>●</span> {status}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Tracking Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '3px 9px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: isTravelling ? '#ECFEFF' : '#F1F5F9',
                            color: isTravelling ? '#0E7490' : '#64748B',
                            border: isTravelling ? '1px solid #A5F3FC' : '1px solid transparent'
                          }}
                        >
                          {row.trackingStatus}
                        </span>
                      </td>

                      {/* Last Updated */}
                      <td style={{ padding: '14px 16px', fontSize: '0.78rem', color: '#64748B' }}>
                        {row.lastUpdated}
                      </td>

                      {/* Action View */}
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(row.assignmentId || row.id)}
                          style={{
                            backgroundColor: '#FFFFFF',
                            color: '#0E7490',
                            border: '1px solid #A5F3FC',
                            borderRadius: '8px',
                            padding: '5px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s'
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
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Field Activity Detail Modal */}
      {selectedAssignment && (
        <EmployeeFieldActivityModal
          assignment={selectedAssignment}
          trip={selectedTrip}
          onClose={() => {
            setSelectedAssignment(null);
            setSelectedTrip(undefined);
          }}
        />
      )}
    </div>
  );
};

function calculateRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins <= 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
  } catch {
    return 'Recently';
  }
}
