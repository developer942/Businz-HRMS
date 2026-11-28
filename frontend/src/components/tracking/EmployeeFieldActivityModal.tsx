import React, { useEffect, useState, useMemo } from 'react';
import { X, Clock, MapPin, Activity, HelpCircle, Building2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { TrackingMap, MapMarkerItem } from './TrackingMap';
import {
  formatKm,
  formatTimeAmPm,
  calculateSequentialRouteMetrics,
  matchTripSegmentsToRoads,
  RouteMetricsSummary,
} from '../../services/trackingEngine';
import { calculateHaversineMeters } from '../../services/gpsAcquisitionService';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export interface EmployeeFieldActivityModalProps {
  assignment: FieldAssignment;
  trip?: FieldTripSession;
  onClose: () => void;
}

function formatDurationMinutes(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const totalMins = Math.max(1, Math.round(seconds / 60));
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export const EmployeeFieldActivityModal: React.FC<EmployeeFieldActivityModalProps> = ({
  assignment,
  trip,
  onClose,
}) => {
  const [matchedMetrics, setMatchedMetrics] = useState<RouteMetricsSummary | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  const baseMetrics = useMemo(() => {
    return calculateSequentialRouteMetrics(
      trip?.locationPoints || [],
      trip?.segments,
      trip?.tripEndTime || trip?.checkOutTime
    );
  }, [trip]);

  useEffect(() => {
    let cancelled = false;
    if (trip?.locationPoints && trip.locationPoints.length >= 2) {
      matchTripSegmentsToRoads(
        trip.locationPoints,
        trip.tripEndTime || trip.checkOutTime
      )
        .then((res) => {
          if (!cancelled) setMatchedMetrics(res);
        })
        .catch(() => {});
    } else {
      setMatchedMetrics(null);
    }
    return () => {
      cancelled = true;
    };
  }, [trip?.id, trip?.locationPoints?.length, trip?.tripEndTime, trip?.checkOutTime]);

  const metrics = matchedMetrics || baseMetrics;

  // Actual recorded valid GPS coordinates for route polyline
  const routePoints: [number, number][] = (trip?.locationPoints || [])
    .filter((p) => !p.isRejected)
    .map((pt) => [pt.latitude, pt.longitude]);

  const pointCount = routePoints.length;

  const lastPoint =
    trip?.locationPoints && trip.locationPoints.length > 0
      ? trip.locationPoints[trip.locationPoints.length - 1]
      : null;

  const firstPoint =
    trip?.locationPoints && trip.locationPoints.length > 0
      ? trip.locationPoints[0]
      : null;

  const isPermanent = Boolean(
    assignment.isPermanentField ||
    trip?.isPermanentField ||
    assignment.dutyType === 'Permanent Field'
  );

  const tripDate = (trip?.tripStartTime || trip?.createdAt || assignment.startDate || '').substring(0, 10);
  const todayStr = new Date().toISOString().substring(0, 10);
  const isPastDate = tripDate !== '' && tripDate < todayStr;
  const isToday = tripDate === todayStr;

  // Accurate Status & Punch Out detection
  const hasActualPunchOut = Boolean(trip?.checkOutTime);
  const isAutoClosed = trip?.status === 'Auto Closed' || (isPastDate && trip?.status === 'Active');
  const isMissPunchOut = !hasActualPunchOut && isPastDate;

  let sessionStatusLabel: string = trip?.status || assignment.status || 'Active';
  if (isMissPunchOut) {
    sessionStatusLabel = 'Miss Punch Out';
  } else if (trip?.status === 'Auto Closed') {
    sessionStatusLabel = 'Auto Closed (No Punch Out)';
  } else if (trip?.status === 'Completed') {
    sessionStatusLabel = 'Completed';
  } else if (trip?.status === 'Active') {
    sessionStatusLabel = isToday ? 'Active Now' : 'Auto Closed (No Punch Out)';
  }

  // Authoritative Timestamps
  const punchInTime = trip?.checkInTime
    ? new Date(trip.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : trip?.tripStartTime
    ? new Date(trip.tripStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : 'Not Recorded';

  const punchOutTimeDisplay = hasActualPunchOut
    ? new Date(trip!.checkOutTime!).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : isMissPunchOut || isAutoClosed
    ? 'Miss Punch Out'
    : isToday && trip?.status === 'Active'
    ? 'Active Now'
    : 'Not Recorded';

  // Honestly calculated duty duration
  const dutyDuration = useMemo(() => {
    if (!trip?.tripStartTime && !trip?.checkInTime) return '—';
    const startMs = new Date(trip.checkInTime || trip.tripStartTime).getTime();
    if (hasActualPunchOut) {
      const endMs = new Date(trip!.checkOutTime!).getTime();
      return formatDurationMinutes(Math.max(0, Math.round((endMs - startMs) / 1000)));
    }
    if (isToday && trip?.status === 'Active') {
      return formatDurationMinutes(Math.max(0, Math.round((Date.now() - startMs) / 1000)));
    }
    if (trip?.lastGpsUpdate || lastPoint?.recordedAt) {
      const endMs = new Date(trip?.lastGpsUpdate || lastPoint!.recordedAt).getTime();
      const diffSec = Math.max(0, Math.round((endMs - startMs) / 1000));
      if (diffSec >= 60) {
        return `${formatDurationMinutes(diffSec)} (cutoff)`;
      }
    }
    return 'Cutoff Reached';
  }, [trip, lastPoint, hasActualPunchOut, isToday]);

  // GPS Quality determination adhering strictly to requirement 4.B
  const gpsQuality = useMemo(() => {
    if (pointCount === 0) return 'No GPS Data';
    if (pointCount === 1) return 'Insufficient GPS Data';
    if (metrics.missingIntervalsCount > 0 || (trip?.unverifiedDistanceMeters || 0) > 0) return 'GPS Gaps Detected';
    if (pointCount >= 5) return 'Good GPS Data';
    return 'Partial GPS Data';
  }, [pointCount, metrics.missingIntervalsCount, trip?.unverifiedDistanceMeters]);

  // Center coordinate
  const centerLat = lastPoint?.latitude || trip?.startLat || assignment.siteLat || 13.0827;
  const centerLng = lastPoint?.longitude || trip?.startLng || assignment.siteLng || 80.2707;

  // --------------------------------------------------------------------------
  // MARKERS GENERATION (Strictly deduplicated, no overlapping icons)
  // --------------------------------------------------------------------------
  const markers: MapMarkerItem[] = useMemo(() => {
    const list: MapMarkerItem[] = [];

    // 1. Green A Marker: Punch In location
    const startLat = trip?.startLat || firstPoint?.latitude || assignment.siteLat;
    const startLng = trip?.startLng || firstPoint?.longitude || assignment.siteLng;

    if (startLat && startLng) {
      list.push({
        id: 'marker-punch-in',
        lat: startLat,
        lng: startLng,
        title: 'Punch In (A)',
        subtitle: trip?.startAddress || 'Attendance Punch In Location',
        iconType: 'start',
      });
    }

    // 2. Orange Marker: Customer / Site Visits
    // Child visits from canonical session
    const childVisits: any[] = [
      ...((trip?.childVisits as any[]) || []),
      ...(assignment.customerSiteName && assignment.customerSiteName !== 'Regular Field Duty' && !isPermanent
        ? [{
            id: assignment.id,
            customerSiteName: assignment.customerSiteName,
            siteAddress: assignment.siteAddress,
            siteLat: assignment.siteLat,
            siteLng: assignment.siteLng,
            purpose: assignment.purpose,
          }]
        : [])
    ];

    childVisits.forEach((visit: any, idx: number) => {
      const vLat = visit.siteLat;
      const vLng = visit.siteLng;
      if (vLat && vLng) {
        // Prevent overlapping if visit is at start point (< 35m)
        const distFromStart = startLat && startLng
          ? calculateHaversineMeters(startLat, startLng, vLat, vLng)
          : 999;

        if (distFromStart > 35) {
          list.push({
            id: `marker-visit-${visit.id || idx}`,
            lat: vLat,
            lng: vLng,
            title: visit.customerSiteName || `Client Visit #${idx + 1}`,
            subtitle: visit.siteAddress || 'Authorized Customer Location',
            iconType: 'site',
          });
        }
      }
    });

    // 3. Red B Marker: Punch Out location (or Last Known if Miss Punch Out)
    if (hasActualPunchOut && trip?.endLat && trip?.endLng) {
      list.push({
        id: 'marker-punch-out',
        lat: trip.endLat,
        lng: trip.endLng,
        title: 'Punch Out (B)',
        subtitle: trip.endAddress || 'Attendance Punch Out Location',
        iconType: 'end',
      });
    } else if (hasActualPunchOut && lastPoint && pointCount > 1) {
      list.push({
        id: 'marker-punch-out-last',
        lat: lastPoint.latitude,
        lng: lastPoint.longitude,
        title: 'Punch Out (B)',
        subtitle: trip?.endAddress || 'Attendance Punch Out Location',
        iconType: 'end',
      });
    } else if (isToday && trip?.status === 'Active' && lastPoint) {
      // Live employee position (ONLY if active right now today)
      // Check if employee is already sitting at a site marker to avoid overlapping
      const isAtSite = list.some(
        (m) => m.iconType === 'site' && calculateHaversineMeters(m.lat, m.lng, lastPoint.latitude, lastPoint.longitude) < 35
      );
      if (!isAtSite) {
        list.push({
          id: 'marker-live-employee',
          lat: lastPoint.latitude,
          lng: lastPoint.longitude,
          title: assignment.employeeName,
          avatar: assignment.employeeAvatar,
          iconType: 'employee',
          pulse: true,
        });
      }
    } else if ((isMissPunchOut || isAutoClosed) && lastPoint && pointCount > 1) {
      // Last known ping for Miss Punch Out / Auto Closed
      const distFromStart = startLat && startLng
        ? calculateHaversineMeters(startLat, startLng, lastPoint.latitude, lastPoint.longitude)
        : 999;

      if (distFromStart > 35) {
        list.push({
          id: 'marker-miss-punch-out',
          lat: lastPoint.latitude,
          lng: lastPoint.longitude,
          title: 'Last Known Location (Miss Punch Out)',
          subtitle: 'No punch out logged after shift ended',
          iconType: 'stale',
        });
      }
    }

    return list;
  }, [trip, firstPoint, lastPoint, assignment, pointCount, hasActualPunchOut, isToday, isMissPunchOut, isAutoClosed, isPermanent]);

  // Clean geofence circle only if explicitly required
  const circleConfig =
    assignment.attendanceType === 'Site Geofence' && assignment.siteLat && assignment.siteLng
      ? {
          lat: assignment.siteLat,
          lng: assignment.siteLng,
          radiusMeters: assignment.allowedRadiusMeters || 200,
          color: '#0E7490',
          fillColor: '#CFFAFE',
        }
      : undefined;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.70)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '1060px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* 1. MINIMAL CLEAN HEADER (Strictly required fields only)           */}
        {/* ================================================================= */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FFFFFF',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.20rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {assignment.employeeName}
              </h2>
              <span style={{ fontSize: '0.84rem', color: '#64748B', fontWeight: 600 }}>
                {assignment.employeeId} • {assignment.department || 'Operations'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Field Type Badge */}
              <span
                style={{
                  backgroundColor: isPermanent ? '#ECFEFF' : '#FEF3C7',
                  color: isPermanent ? '#0E7490' : '#B45309',
                  border: isPermanent ? '1px solid #A5F3FC' : '1px solid #FDE68A',
                  fontWeight: 750,
                  fontSize: '0.72rem',
                  padding: '2px 9px',
                  borderRadius: '9999px',
                }}
              >
                {isPermanent ? 'Permanent Field' : 'Temporary Field'}
              </span>

              {/* Date Badge */}
              <span
                style={{
                  backgroundColor: '#F8FAFC',
                  color: '#475569',
                  border: '1px solid #E2E8F0',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  padding: '2px 9px',
                  borderRadius: '9999px',
                }}
              >
                {formatDateDDMMYYYY(assignment.startDate)}
              </span>

              {/* Session Status Badge */}
              <span
                style={{
                  backgroundColor:
                    sessionStatusLabel === 'Completed' ? '#DCFCE7' :
                    sessionStatusLabel === 'Active Now' ? '#ECFEFF' :
                    sessionStatusLabel === 'Miss Punch Out' ? '#FEF3C7' : '#F1F5F9',
                  color:
                    sessionStatusLabel === 'Completed' ? '#16A34A' :
                    sessionStatusLabel === 'Active Now' ? '#0E7490' :
                    sessionStatusLabel === 'Miss Punch Out' ? '#B45309' : '#475569',
                  border:
                    sessionStatusLabel === 'Miss Punch Out' ? '1px solid #FDE68A' :
                    sessionStatusLabel === 'Active Now' ? '1px solid #A5F3FC' : '1px solid #E2E8F0',
                  fontWeight: 750,
                  fontSize: '0.72rem',
                  padding: '2px 10px',
                  borderRadius: '9999px',
                }}
              >
                {sessionStatusLabel}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#475569',
              transition: 'background 0.15s ease',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ================================================================= */}
        {/* 2. SUMMARY ROW (Strictly 5 Required Metrics)                      */}
        {/* ================================================================= */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#FAFCFE',
            borderBottom: '1px solid #F1F5F9',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          {/* Metric 1: Travel KM */}
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Travel KM
            </div>
            <div style={{ fontSize: '1.20rem', fontWeight: 800, color: '#0E7490', marginTop: '2px' }}>
              {pointCount >= 2 ? formatKm(metrics.verifiedKm) : '0.00 KM'}
            </div>
          </div>

          {/* Metric 2: Punch In */}
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Punch In
            </div>
            <div style={{ fontSize: '0.94rem', fontWeight: 750, color: '#1E293B', marginTop: '2px' }}>
              {punchInTime}
            </div>
          </div>

          {/* Metric 3: Punch Out / Miss Punch Out */}
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Punch Out
            </div>
            <div style={{ marginTop: '2px' }}>
              {hasActualPunchOut ? (
                <span style={{ fontSize: '0.94rem', fontWeight: 750, color: '#1E293B' }}>
                  {punchOutTimeDisplay}
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-block',
                    backgroundColor: isMissPunchOut ? '#FEF3C7' : '#F1F5F9',
                    color: isMissPunchOut ? '#B45309' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 750,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: isMissPunchOut ? '1px solid #FDE68A' : '1px solid #E2E8F0',
                  }}
                >
                  {isMissPunchOut ? 'Miss Punch Out' : 'Auto Closed (No Punch Out)'}
                </span>
              )}
            </div>
          </div>

          {/* Metric 4: Duty Duration */}
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Duty Duration
            </div>
            <div style={{ fontSize: '0.94rem', fontWeight: 750, color: '#1E293B', marginTop: '2px' }}>
              {dutyDuration}
            </div>
          </div>

          {/* Metric 5: GPS Quality */}
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              GPS Quality
            </div>
            <div style={{ marginTop: '3px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.76rem',
                  fontWeight: 750,
                  color:
                    gpsQuality === 'Good GPS Data' ? '#16A34A' :
                    gpsQuality === 'GPS Gaps Detected' ? '#EA580C' :
                    gpsQuality === 'Partial GPS Data' ? '#D97706' : '#64748B',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor:
                      gpsQuality === 'Good GPS Data' ? '#16A34A' :
                      gpsQuality === 'GPS Gaps Detected' ? '#EA580C' :
                      gpsQuality === 'Partial GPS Data' ? '#D97706' : '#94A3B8',
                  }}
                />
                {gpsQuality}
              </span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. MAIN FOCUS: MAP VIEW (Occupies majority visual space)           */}
        {/* ================================================================= */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Informative notice if route polyline is unavailable */}
          {pointCount < 2 && (
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.78rem',
                color: '#64748B',
              }}
            >
              <HelpCircle size={15} color="#0E7490" style={{ flexShrink: 0 }} />
              <span>
                {pointCount === 0
                  ? 'No GPS points recorded for this session. Showing initial attendance check-in location.'
                  : '1 GPS point recorded. Continuous travel route polyline is displayed when 2 or more sequential points exist.'}
              </span>
            </div>
          )}

          {/* Leaflet Map with Google Maps style polyline & essential controls */}
          <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #E2E8F0', position: 'relative' }}>
            <TrackingMap
              center={[centerLat, centerLng]}
              zoom={14}
              height="480px"
              markers={markers}
              routePoints={routePoints}
              detailedPoints={trip?.locationPoints || []}
              segments={metrics.segments}
              circle={circleConfig}
              showPlaybackControls={pointCount > 1}
              showControls={true}
              essentialControlsOnly={true}
              autoFitBounds={pointCount > 1}
            />
          </div>

          {/* =============================================================== */}
          {/* 4. CHILD CLIENT VISITS (If legitimate visits exist)             */}
          {/* =============================================================== */}
          {(trip?.childVisits && trip.childVisits.length > 0) && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={14} color="#D97706" />
                <span>Client & Site Visits During Session ({trip.childVisits.length})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                {trip.childVisits.map((visit: any, idx: number) => (
                  <div
                    key={visit.id || idx}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#FAFCFE',
                      border: '1px solid #F1F5F9',
                      borderRadius: '8px',
                      fontSize: '0.76rem',
                    }}
                  >
                    <div style={{ fontWeight: 750, color: '#D97706' }}>
                      Visit #{idx + 1}: {visit.customerSiteName}
                    </div>
                    {visit.siteAddress && (
                      <div style={{ color: '#64748B', marginTop: '2px', fontSize: '0.72rem' }}>
                        {visit.siteAddress}
                      </div>
                    )}
                    {visit.purpose && (
                      <div style={{ color: '#475569', marginTop: '2px', fontSize: '0.72rem' }}>
                        Purpose: {visit.purpose}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* 5. COLLAPSIBLE GPS DIAGNOSTICS                                  */}
          {/* =============================================================== */}
          <div style={{ border: '1px solid #F1F5F9', borderRadius: '10px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              style={{
                width: '100%',
                padding: '8px 14px',
                backgroundColor: '#F8FAFC',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#64748B',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={13} color="#0E7490" />
                <span>GPS Telemetry Details ({pointCount} points)</span>
              </span>
              <span style={{ color: '#0E7490', fontSize: '0.72rem' }}>
                {showTechnicalDetails ? 'Hide' : 'View'}
              </span>
            </button>

            {showTechnicalDetails && (
              <div style={{ padding: '10px 14px', fontSize: '0.74rem', color: '#64748B', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', backgroundColor: '#FFFFFF' }}>
                <div><strong>Raw GPS Points:</strong> {trip?.rawPointsCount || pointCount}</div>
                <div><strong>Accepted Points:</strong> {trip?.acceptedPointsCount || pointCount}</div>
                <div><strong>Filtered Drift:</strong> {trip?.rejectedPointsCount || 0}</div>
                <div><strong>GPS Gaps:</strong> {metrics.missingIntervalsCount > 0 ? `${metrics.missingIntervalsCount} (${formatKm(metrics.unverifiedGapKm)})` : 'None'}</div>
              </div>
            )}
          </div>
        </div>

        {/* Minimal Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #F1F5F9',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#FFFFFF',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 24px',
              borderRadius: '10px',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.84rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(14, 116, 144, 0.2)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
