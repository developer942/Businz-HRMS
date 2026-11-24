import React, { useState, useMemo, useEffect } from 'react';
import {
  Navigation,
  Users,
  Search,
  MapPin,
  Gauge,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  Eye,
  Filter,
  Clock,
  Compass,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { TrackingMap, MapMarkerItem } from './TrackingMap';
import { formatKm, calculateSequentialRouteMetrics } from '../../services/trackingEngine';
import { EmployeeFieldActivityModal } from './EmployeeFieldActivityModal';

export const LiveTrackingTab: React.FC = () => {
  const { fieldAssignments, tripSessions, departments } = useHRMS();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedDuty, setSelectedDuty] = useState<string>('All');
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [inspectingAssignment, setInspectingAssignment] = useState<FieldAssignment | null>(null);

  // Extract unique active trips (strictly 1 active trip session per employee)
  const activeTripsWithAssignments = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const seenEmpIds = new Set<string>();
    const result: Array<{
      trip: FieldTripSession;
      assignment: FieldAssignment;
      lastPoint: any;
      currentLat: number;
      currentLng: number;
      isStationary: boolean;
      speedKmh: number;
      accuracy: number;
      heading: number;
    }> = [];

    tripSessions
      .filter((trip) => {
        if (trip.status !== 'Active') return false;
        const isToday =
          trip.tripStartTime &&
          (trip.tripStartTime.startsWith(today) ||
            new Date(trip.tripStartTime).toDateString() === new Date().toDateString());
        return isToday;
      })
      .forEach((trip) => {
        const empKey = String(trip.employeeId || '').toLowerCase();
        if (seenEmpIds.has(empKey)) return;
        seenEmpIds.add(empKey);

        const assignment = fieldAssignments.find((a) => a.id === trip.assignmentId) || {
          id: trip.assignmentId,
          employeeId: trip.employeeId,
          employeeName: trip.employeeName,
          department: trip.department,
          dutyType: trip.dutyType,
          customerSiteName: trip.customerSiteName,
          siteAddress: 'Assigned Site',
          status: 'Active',
          attendanceType: 'Site Geofence',
          allowedRadiusMeters: 200,
          trackingRequired: true,
          travelKmRequired: true,
        } as FieldAssignment;

        const lastPoint =
          trip.locationPoints && trip.locationPoints.length > 0
            ? trip.locationPoints[trip.locationPoints.length - 1]
            : null;

        const currentLat = lastPoint?.latitude || trip.startLat || 13.0827;
        const currentLng = lastPoint?.longitude || trip.startLng || 80.2707;
        const speedKmh = Math.round(lastPoint?.speed || 0);
        const accuracy = Math.round(lastPoint?.accuracy || 15);
        const heading = lastPoint?.heading || 0;
        const isStationary = speedKmh < 3;

        result.push({
          trip,
          assignment,
          lastPoint,
          currentLat,
          currentLng,
          isStationary,
          speedKmh,
          accuracy,
          heading,
        });
      });

    return result;
  }, [tripSessions, fieldAssignments]);

  // Filtered active list
  const filteredActiveList = useMemo(() => {
    return activeTripsWithAssignments.filter(({ trip, assignment }) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        trip.employeeName.toLowerCase().includes(q) ||
        (trip.employeeId || '').toLowerCase().includes(q) ||
        (trip.customerSiteName || '').toLowerCase().includes(q) ||
        (trip.department || '').toLowerCase().includes(q);

      const matchesDept = selectedDept === 'All' || assignment.department === selectedDept;
      const matchesDuty =
        selectedDuty === 'All' ||
        (selectedDuty === 'Permanent Field'
          ? assignment.dutyType === 'Permanent Field' || (assignment as any).isPermanentField
          : assignment.dutyType === selectedDuty);

      return matchesSearch && matchesDept && matchesDuty;
    });
  }, [activeTripsWithAssignments, searchQuery, selectedDept, selectedDuty]);

  // Active focused employee
  const activeFocus = useMemo(() => {
    if (selectedEmpId) {
      return activeTripsWithAssignments.find((x) => x.trip.employeeId === selectedEmpId) || null;
    }
    return activeTripsWithAssignments[0] || null;
  }, [selectedEmpId, activeTripsWithAssignments]);

  const mapCenter: [number, number] = useMemo(() => {
    if (activeFocus) {
      return [activeFocus.currentLat, activeFocus.currentLng];
    }
    return [13.0827, 80.2707];
  }, [activeFocus]);

  // Route metrics for the selected active trip
  const selectedTripMetrics = useMemo(() => {
    if (!activeFocus?.trip) return null;
    return calculateSequentialRouteMetrics(
      activeFocus.trip.locationPoints || [],
      activeFocus.trip.segments || (activeFocus.trip as any).distanceSegments,
      activeFocus.trip.tripEndTime || activeFocus.trip.checkOutTime
    );
  }, [activeFocus]);

  // Map markers: if an employee is selected, focus on their start, live location and stops; otherwise show all active
  const markers: MapMarkerItem[] = useMemo(() => {
    if (activeFocus && selectedEmpId) {
      const list: MapMarkerItem[] = [];
      const { trip, assignment, currentLat, currentLng, lastPoint, speedKmh, accuracy, heading } = activeFocus;

      // Start Marker (Green A)
      if (trip.startLat && trip.startLng) {
        list.push({
          id: `start-${trip.id}`,
          lat: trip.startLat,
          lng: trip.startLng,
          title: 'Tracking Start (Punch In)',
          subtitle: trip.startAddress || 'Start Location',
          iconType: 'start',
        });
      }

      // Live Navigation Marker (Blue Navigation with heading arrow and accuracy circle)
      const lastGpsFormatted = trip.lastGpsUpdate
        ? new Date(trip.lastGpsUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
        : 'Just now';

      const popupHtml = `
        <div style="font-family: inherit; min-width: 210px; padding: 4px 0;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
            <strong style="color: #0F172A; font-size: 13px;">${assignment.employeeName}</strong>
            <span style="font-size: 10px; background: #ECFEFF; color: #0E7490; font-weight: 700; padding: 2px 6px; border-radius: 9999px;">
              ${assignment.department}
            </span>
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Duty:</strong> ${assignment.dutyType} · ${assignment.customerSiteName}
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Travel KM:</strong> <strong style="color: #0E7490;">${formatKm(selectedTripMetrics?.verifiedKm || trip.totalKm)}</strong>
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Speed:</strong> ${speedKmh} km/h · ±${accuracy}m accuracy
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Last Update:</strong> ${lastGpsFormatted}
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; margin-top: 6px; color: ${
            trip.gpsStatus === 'GPS Active' ? '#16A34A' : '#EF4444'
          };">
            ● ${trip.gpsStatus} (${trip.trackingStatus})
          </div>
        </div>
      `;

      list.push({
        id: trip.employeeId,
        lat: currentLat,
        lng: currentLng,
        title: assignment.employeeName,
        subtitle: assignment.customerSiteName,
        avatar: assignment.employeeAvatar,
        iconType: 'employee',
        heading,
        speed: speedKmh,
        accuracy,
        pulse: true,
        popupHtml,
      });

      return list;
    }

    // Default: show all active employees across the fleet
    return activeTripsWithAssignments.map(({ trip, assignment, currentLat, currentLng, speedKmh, accuracy, heading }) => {
      const isSelected = selectedEmpId === trip.employeeId;
      const tripStartFormatted = new Date(trip.tripStartTime).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const lastGpsFormatted = trip.lastGpsUpdate
        ? new Date(trip.lastGpsUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : 'Just now';

      const popupHtml = `
        <div style="font-family: inherit; min-width: 210px; padding: 4px 0;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
            <strong style="color: #0F172A; font-size: 13px;">${assignment.employeeName}</strong>
            <span style="font-size: 10px; background: #ECFEFF; color: #0E7490; font-weight: 700; padding: 2px 6px; border-radius: 9999px;">
              ${assignment.department}
            </span>
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Duty:</strong> ${assignment.dutyType} · ${assignment.customerSiteName}
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Travel KM:</strong> <strong style="color: #0E7490;">${formatKm(trip.totalKm)}</strong>
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Trip Start:</strong> ${tripStartFormatted}
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Last Fix:</strong> ${lastGpsFormatted}
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; margin-top: 6px; color: ${
            trip.gpsStatus === 'GPS Active' ? '#16A34A' : '#EF4444'
          };">
            ● ${trip.gpsStatus} (${trip.trackingStatus})
          </div>
        </div>
      `;

      return {
        id: trip.employeeId,
        lat: currentLat,
        lng: currentLng,
        title: assignment.employeeName,
        subtitle: assignment.customerSiteName,
        avatar: assignment.employeeAvatar,
        iconType: 'employee',
        heading,
        speed: speedKmh,
        accuracy,
        pulse: true,
        popupHtml,
      };
    });
  }, [activeTripsWithAssignments, selectedEmpId, activeFocus, selectedTripMetrics]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Live Field Staff Tracking
            </h2>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 10px',
                borderRadius: '9999px',
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#059669',
                fontSize: '0.72rem',
                fontWeight: 750,
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981', animation: 'ping 1.5s infinite' }} />
              Live Telemetry
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '2px', marginBottom: 0 }}>
            Authoritative real-time GPS tracking showing verified movement, travelled road routes, and field visits.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: '#ECFEFF',
              border: '1px solid #A5F3FC',
              color: '#0E7490',
              fontWeight: 750,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Navigation size={14} />
            <span>{activeTripsWithAssignments.length} Active in Field</span>
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left Employee List + Right Interactive Map */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 340px) 1fr',
          gap: '16px',
          alignItems: 'stretch',
        }}
        className="live-tracking-split-view"
      >
        {/* Left Sidebar: Active Personnel List */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: '660px',
          }}
        >
          {/* Search & Filter Header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '9px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
              }}
            >
              <Search size={14} color="#94A3B8" />
              <input
                type="text"
                placeholder="Search staff, ID, site..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.8rem', width: '100%', color: '#0F172A' }}
              />
            </div>

            {/* Filters Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 650,
                  padding: '5px 8px',
                  borderRadius: '7px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                }}
              >
                <option value="All">All Depts</option>
                {departments.map((d) => (
                  <option key={d.id || d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedDuty}
                onChange={(e) => setSelectedDuty(e.target.value)}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 650,
                  padding: '5px 8px',
                  borderRadius: '7px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                }}
              >
                <option value="All">All Duties</option>
                <option value="Permanent Field">Permanent Field</option>
                <option value="Site Visit">Site Visit</option>
              </select>
            </div>
          </div>

          {/* List Content */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '10px' }}>
            {filteredActiveList.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                <Users size={32} color="#CBD5E1" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                No active field personnel found matching filters.
              </div>
            ) : (
              filteredActiveList.map(({ trip, assignment, isStationary, speedKmh }) => {
                const isSelected = selectedEmpId === trip.employeeId;
                const isPermanent = assignment.dutyType === 'Permanent Field' || (assignment as any).isPermanentField;

                return (
                  <div
                    key={trip.id}
                    onClick={() => setSelectedEmpId(trip.employeeId)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid #0E7490' : '1px solid #F1F5F9',
                      backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(14, 116, 144, 0.12)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {assignment.employeeAvatar ? (
                          <img
                            src={assignment.employeeAvatar}
                            alt={assignment.employeeName}
                            style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '50%',
                              backgroundColor: '#0E7490',
                              color: '#FFFFFF',
                              fontWeight: 800,
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {assignment.employeeName.charAt(0)}
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {assignment.employeeName}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            {assignment.employeeId} · {assignment.department}
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 750,
                          padding: '2px 7px',
                          borderRadius: '9999px',
                          backgroundColor: isPermanent ? '#ECFEFF' : '#FEF3C7',
                          color: isPermanent ? '#0E7490' : '#B45309',
                          flexShrink: 0,
                        }}
                      >
                        {isPermanent ? 'Permanent' : 'Visit'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0' }}>
                      <span style={{ color: isStationary ? '#64748B' : '#0E7490', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isStationary ? '#94A3B8' : '#0E7490' }} />
                        {isStationary ? 'Stationary' : `Travelling · ${speedKmh} km/h`}
                      </span>
                      <strong style={{ color: '#0E7490', fontSize: '0.82rem' }}>
                        {formatKm(trip.totalKm)}
                      </strong>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Section: Large Interactive Road Map */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            overflow: 'hidden',
            minHeight: '660px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <TrackingMap
            center={mapCenter}
            zoom={selectedEmpId ? 14 : 12}
            height="100%"
            markers={markers}
            detailedPoints={selectedEmpId ? activeFocus?.trip?.locationPoints || [] : []}
            segments={selectedEmpId ? selectedTripMetrics?.segments || activeFocus?.trip?.segments : []}
            stops={selectedEmpId ? activeFocus?.trip?.stops || [] : []}
            showPlaybackControls={Boolean(selectedEmpId && activeFocus?.trip?.locationPoints && activeFocus.trip.locationPoints.length > 1)}
            showControls={true}
          />

          {/* Floating Selected Employee Detail Card */}
          {activeFocus && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(8px)',
                borderRadius: '14px',
                padding: '12px 16px',
                border: '1px solid #CBD5E1',
                boxShadow: '0 6px 18px rgba(15, 23, 42, 0.12)',
                maxWidth: '420px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '0.92rem', color: '#0F172A' }}>
                    {activeFocus.assignment.employeeName}
                  </strong>
                  <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                    {activeFocus.assignment.employeeId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectingAssignment(activeFocus.assignment)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid #0E7490',
                    backgroundColor: '#ECFEFF',
                    color: '#0E7490',
                    fontSize: '0.7rem',
                    fontWeight: 750,
                    cursor: 'pointer',
                  }}
                >
                  <Eye size={12} />
                  <span>Full History</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '0.72rem' }}>
                <div>
                  <div style={{ color: '#64748B', fontWeight: 600 }}>Travelled KM</div>
                  <strong style={{ color: '#0E7490', fontSize: '0.85rem' }}>
                    {formatKm(selectedTripMetrics?.verifiedKm || activeFocus.trip.totalKm)}
                  </strong>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontWeight: 600 }}>Current Speed</div>
                  <strong style={{ color: '#0F172A', fontSize: '0.85rem' }}>
                    {activeFocus.speedKmh} km/h
                  </strong>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontWeight: 600 }}>GPS Status</div>
                  <strong style={{ color: activeFocus.trip.gpsStatus === 'GPS Active' ? '#16A34A' : '#EF4444', fontSize: '0.82rem' }}>
                    ● {activeFocus.trip.gpsStatus}
                  </strong>
                </div>
              </div>

              <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0', fontSize: '0.7rem', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Duty: <strong>{activeFocus.assignment.dutyType}</strong></span>
                <span>Site: <strong>{activeFocus.assignment.customerSiteName}</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inspect Activity Modal */}
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
