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

  // Asia/Kolkata business date calculation
  const todayStr = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }, []);

  // Selected assignment for EmployeeFieldActivityModal
  const [selectedAssignment, setSelectedAssignment] = useState<FieldAssignment | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<FieldTripSession | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dutyTypeFilter, setDutyTypeFilter] = useState<'All' | 'Permanent Field' | 'Temporary Field'>('All');

  // Compute Today's field assignments (Asia/Kolkata business date, excluding Archived/Cancelled)
  const todayAssignments = useMemo(() => {
    return fieldAssignments.filter(a => {
      if (a.status === 'Cancelled' || a.status === 'Archived') return false;
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

      // Find today's attendance record (Asia/Kolkata date)
      const todayAtt = attendanceRecords.find(a => {
        const aEmp = String(a.employeeId || '').toLowerCase();
        const matches = aEmp === empKey || aEmp === String(emp.employeeId || '').toLowerCase() || aEmp === String(emp.id || '').toLowerCase();
        const recDate = a.date || a.shiftDate;
        return matches && recDate && recDate.startsWith(todayStr);
      });

      // Find any ongoing ACTIVE trip session today or valid ongoing overnight shift
      const activeTrip = tripSessions.find(t => {
        const tEmp = String(t.employeeId || '').toLowerCase();
        const matches = tEmp === empKey || tEmp === String(emp.employeeId || '').toLowerCase() || tEmp === String(emp.id || '').toLowerCase();
        if (!matches) return false;
        // Never include previous-day Auto Closed or Closed trips
        if (t.status === 'Auto Closed' || t.status === 'Cancelled') return false;
        const isStartedToday = t.tripStartTime && t.tripStartTime.startsWith(todayStr);
        return (t.status === 'Active' && isStartedToday) || (t.status === 'Active' && todayAtt?.checkIn);
      });

      // Strict Rule: Permanent Field configuration alone must NOT classify an employee as actively working.
      // Only display if employee has an active trip today, attendance punch today, or scheduled site visit today.
      const isPunchedInToday = Boolean(todayAtt?.checkIn && todayAtt.checkIn !== '--:--');
      if (!isPunchedInToday && !activeTrip && !siteAssign) return;

      const trip = activeTrip;

      const checkInFormatted = todayAtt?.checkIn
        ? (todayAtt.checkIn.includes('T')
            ? new Date(todayAtt.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
            : todayAtt.checkIn)
        : trip?.checkInTime
          ? new Date(trip.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
          : undefined;

      const lastUpdatedFormatted = trip?.lastGpsUpdate
        ? calculateRelativeTime(trip.lastGpsUpdate)
        : '—';

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

      const accurate = deriveAccurateGpsStatus({
        tripStatus: isCheckedOut ? 'Completed' : (trip?.status || (isPunchedInToday ? 'Active' : 'Stopped')),
        trackingStatus: trip?.trackingStatus || (isPunchedInToday ? 'Stationary' : 'Pending GPS Fix'),
        lastGpsUpdate: trip?.lastGpsUpdate,
      });

      const customerSiteName = siteAssign?.customerSiteName || 
        (trip?.customerSiteName && trip.customerSiteName !== 'Site' && trip.customerSiteName !== 'Assigned Site'
          ? trip.customerSiteName 
          : 'Regular Field Duty');

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
                          row.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          row.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = departmentFilter === 'All' || row.department === departmentFilter;
      const matchStatus =
        statusFilter === 'All' ? true :
        statusFilter === 'Travelling' ? (row.trackingStatus === 'Travelling' || row.gpsStatus === 'Travelling') :
        statusFilter === 'Stationary' ? (row.trackingStatus === 'Stationary' || row.trackingStatus === 'On Site' || row.gpsStatus === 'Stationary' || row.trackingStatus === 'Idle') :
        statusFilter === 'Issues' ? (row.gpsStatus === 'GPS Weak' || row.gpsStatus === 'GPS Disabled' || row.gpsStatus === 'Permission Denied' || row.gpsStatus === 'Offline' || row.gpsStatus === 'GPS Lost' || row.gpsStatus === 'Stale Location') :
        row.trackingStatus === statusFilter;
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

  // Compute 5 KPI values from actual data (Strict Unique Employee Count)
  const fieldEmployeesToday = new Set(tableData.map(r => r.employeeId)).size;
  const currentlyTravelling = tableData.filter(r => r.trackingStatus === 'Travelling' || r.gpsStatus === 'Travelling').length;
  const atSiteOrStationary = tableData.filter(r => r.trackingStatus === 'Stationary' || r.trackingStatus === 'On Site' || r.gpsStatus === 'Stationary' || r.trackingStatus === 'Idle').length;
  const totalKmToday = tableData.reduce((acc, curr) => acc + (curr.travelKm || 0), 0);
  const openGpsAlertsCount = trackingAlerts.filter(a => a.status === 'Open').length;
  const gpsIssuesEmployees = tableData.filter(r => 
    r.gpsStatus === 'GPS Weak' || r.gpsStatus === 'GPS Disabled' || r.gpsStatus === 'Permission Denied' || r.gpsStatus === 'Offline' || r.gpsStatus === 'GPS Lost' || r.gpsStatus === 'Stale Location'
  ).length;
  const totalGpsIssues = Math.max(openGpsAlertsCount, gpsIssuesEmployees);

  const isFilterActive = searchQuery !== '' || departmentFilter !== 'All' || statusFilter !== 'All' || dutyTypeFilter !== 'All';

  const handleClearFilters = () => {
    setSearchQuery('');
    setDepartmentFilter('All');
    setStatusFilter('All');
    setDutyTypeFilter('All');
  };

  const handleOpenDetail = (assignmentId: string) => {
    const assignment = fieldAssignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    const trip = tripSessions.find(t => t.assignmentId === assignmentId) ||
                 tripSessions.find(t => t.employeeId === assignment.employeeId);
    setSelectedAssignment(assignment);
    setSelectedTrip(trip);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top 5 KPI Summary Cards (Clean, clickable to filter, Apple HIG / Modern Material style) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '12px'
        }}
      >
        {/* Card 1: Field Employees Today */}
        <div
          onClick={() => {
            setStatusFilter('All');
            setDutyTypeFilter('All');
          }}
          title="Click to view all field employees"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: (statusFilter === 'All' && !isFilterActive) ? '2px solid #0E7490' : '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>
              Field Employees Today
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
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
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
            {fieldEmployeesToday}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#0E7490', fontWeight: 600, marginTop: '4px' }}>
            Active Workforce
          </div>
        </div>

        {/* Card 2: Currently Travelling */}
        <div
          onClick={() => setStatusFilter(prev => prev === 'Travelling' ? 'All' : 'Travelling')}
          title="Click to filter employees currently moving"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: statusFilter === 'Travelling' ? '2px solid #16A34A' : '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>
              Currently Travelling
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
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
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
            {currentlyTravelling}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 600, marginTop: '4px' }}>
            In Transit & Moving
          </div>
        </div>

        {/* Card 3: At Site / Stationary */}
        <div
          onClick={() => setStatusFilter(prev => prev === 'Stationary' ? 'All' : 'Stationary')}
          title="Click to filter employees at site or stationary"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: statusFilter === 'Stationary' ? '2px solid #0E7490' : '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>
              At Site / Stationary
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                backgroundColor: '#F0FDFA',
                color: '#0D9488',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <MapPin size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
            {atSiteOrStationary}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#0D9488', fontWeight: 600, marginTop: '4px' }}>
            Stationary at Location
          </div>
        </div>

        {/* Card 4: Total Travel KM */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>
              Total Travel KM
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                backgroundColor: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0E7490', lineHeight: 1.1 }}>
            {formatKm(totalKmToday)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>
            Verified Traveled Distance
          </div>
        </div>

        {/* Card 5: GPS Issues */}
        <div
          onClick={() => setStatusFilter(prev => prev === 'Issues' ? 'All' : 'Issues')}
          title="Click to filter employees with GPS issues or weak signal"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: statusFilter === 'Issues' ? '2px solid #EF4444' : '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>
              GPS Issues
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                backgroundColor: totalGpsIssues > 0 ? '#FEE2E2' : '#F1F5F9',
                color: totalGpsIssues > 0 ? '#EF4444' : '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalGpsIssues > 0 ? '#EF4444' : '#0F172A', lineHeight: 1.1 }}>
            {totalGpsIssues}
          </div>
          <div style={{ fontSize: '0.72rem', color: totalGpsIssues > 0 ? '#EF4444' : '#10B981', fontWeight: 600, marginTop: '4px' }}>
            {totalGpsIssues > 0 ? 'Needs Attention' : 'All Signals Healthy'}
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
                placeholder="Search employee, site, ID..."
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
              <option value="Stationary">At Site / Stationary</option>
              <option value="Issues">GPS Issues</option>
              <option value="Completed">Completed</option>
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
              <option value="All">All Field Types</option>
              <option value="Permanent Field">Permanent Field</option>
              <option value="Temporary Field">Temporary Field</option>
            </select>

            {isFilterActive && (
              <button
                type="button"
                onClick={handleClearFilters}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#F8FAFC',
                  color: '#64748B',
                  fontSize: '0.78rem',
                  fontWeight: 650,
                  cursor: 'pointer'
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table Content (Desktop Table + Mobile Cards) */}
        <div className="hidden sm:block" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 20px', fontWeight: 700 }}>Employee</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Department</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Field Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Current / Last Location</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Punch In</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Travel KM</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tracking Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Last Updated</th>
                <th style={{ padding: '12px 20px', fontWeight: 700, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    <div style={{ maxWidth: '320px', margin: '0 auto' }}>
                      <Users size={36} color="#CBD5E1" style={{ margin: '0 auto 10px auto', display: 'block' }} />
                      <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.94rem' }}>No Field Employees Found</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                        {isFilterActive ? 'Try adjusting your filters or search query.' : 'No personnel currently active on field duty today.'}
                      </div>
                      {isFilterActive && (
                        <button
                          type="button"
                          onClick={handleClearFilters}
                          style={{
                            marginTop: '12px',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: '1px solid #0E7490',
                            backgroundColor: '#ECFEFF',
                            color: '#0E7490',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isTravelling = row.trackingStatus === 'Travelling';
                  const isStationary = row.trackingStatus === 'Stationary' || row.trackingStatus === 'On Site';

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
                              style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                backgroundColor: '#0E7490',
                                color: '#FFFFFF',
                                fontWeight: 750,
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {row.employeeName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 750, color: '#0F172A' }}>{row.employeeName}</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{row.employeeId}</div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td style={{ padding: '14px 16px', color: '#334155', fontWeight: 600 }}>
                        {row.department}
                      </td>

                      {/* Field Type */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: row.isPermanentField ? '#ECFEFF' : '#FEF3C7',
                            color: row.isPermanentField ? '#0E7490' : '#B45309',
                            border: row.isPermanentField ? '1px solid #A5F3FC' : '1px solid #FDE68A',
                            whiteSpace: 'nowrap',
                            display: 'inline-block'
                          }}
                        >
                          {row.isPermanentField ? 'Permanent Field' : `Temporary (${row.dutyType})`}
                        </span>
                      </td>

                      {/* Current or Last Known Location (2-line clamp with tooltip) */}
                      <td style={{ padding: '14px 16px', maxWidth: '240px' }}>
                        <div
                          title={row.customerSiteName}
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
                          {row.customerSiteName}
                        </div>
                      </td>

                      {/* Punch In */}
                      <td style={{ padding: '14px 16px', color: '#475569', fontWeight: 600 }}>
                        {row.checkInTime || '—'}
                      </td>

                      {/* Travel KM */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0E7490' }}>
                        <div>{formatKm(row.travelKm || 0)}</div>
                        {(row.travelKm || 0) === 0 && (
                          <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>
                            Insufficient Fixes
                          </div>
                        )}
                      </td>

                      {/* Tracking Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: isTravelling ? '#ECFEFF' : isStationary ? '#F0FDFA' : '#F1F5F9',
                            color: isTravelling ? '#0E7490' : isStationary ? '#0D9488' : '#64748B',
                            border: isTravelling ? '1px solid #A5F3FC' : isStationary ? '1px solid #99F6E4' : '1px solid #E2E8F0'
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: isTravelling ? '#0E7490' : isStationary ? '#0D9488' : '#94A3B8'
                            }}
                          />
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

        {/* Mobile Cards View (Visible on screens <= 640px) */}
        <div className="block sm:hidden" style={{ padding: '12px' }}>
          {filteredRows.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8' }}>
              <Users size={32} color="#CBD5E1" style={{ margin: '0 auto 8px auto', display: 'block' }} />
              <div style={{ fontWeight: 700, color: '#334155' }}>No field employees found</div>
            </div>
          ) : (
            filteredRows.map((row) => (
              <div
                key={row.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px',
                  marginBottom: '10px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: '#0E7490',
                        color: '#FFFFFF',
                        fontWeight: 750,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {row.employeeName.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 750, fontSize: '0.88rem', color: '#0F172A' }}>{row.employeeName}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{row.employeeId} · {row.department}</div>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      backgroundColor: row.isPermanentField ? '#ECFEFF' : '#FEF3C7',
                      color: row.isPermanentField ? '#0E7490' : '#B45309'
                    }}
                  >
                    {row.isPermanentField ? 'Permanent' : 'Temporary'}
                  </span>
                </div>

                <div style={{ fontSize: '0.78rem', color: '#334155', marginBottom: '8px', lineHeight: 1.35 }}>
                  <MapPin size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} color="#0E7490" />
                  <strong>Location:</strong> {row.customerSiteName}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.74rem', borderTop: '1px solid #F1F5F9', paddingTop: '8px', marginBottom: '10px' }}>
                  <div>
                    <span style={{ color: '#64748B' }}>Punch In:</span> <strong>{row.checkInTime || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Travel KM:</span> <strong style={{ color: '#0E7490' }}>{formatKm(row.travelKm || 0)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Status:</span> <strong>{row.trackingStatus}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Updated:</span> <strong>{row.lastUpdated}</strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenDetail(row.assignmentId || row.id)}
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
                  <span>View Full Details & Route</span>
                </button>
              </div>
            ))
          )}
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
