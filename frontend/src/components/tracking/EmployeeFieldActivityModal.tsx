import React, { useEffect, useState, useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2, Navigation, Clock, MapPin, ChevronRight, Activity, ShieldCheck, HelpCircle } from 'lucide-react';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { TrackingMap, MapMarkerItem } from './TrackingMap';
import {
  formatKm,
  formatTimeAmPm,
  calculateSequentialRouteMetrics,
  matchTripSegmentsToRoads,
  RouteMetricsSummary,
} from '../../services/trackingEngine';
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
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

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

  const routePoints: [number, number][] = (trip?.locationPoints || [])
    .filter(p => !p.isRejected)
    .map((pt) => [pt.latitude, pt.longitude]);

  const pointCount = routePoints.length;

  const lastPoint =
    trip?.locationPoints && trip.locationPoints.length > 0
      ? trip.locationPoints[trip.locationPoints.length - 1]
      : null;

  const centerLat = lastPoint?.latitude || trip?.startLat || assignment.siteLat || 13.0827;
  const centerLng = lastPoint?.longitude || trip?.startLng || assignment.siteLng || 80.2707;

  // Build clean Apple Maps / Google Maps markers
  const markers: MapMarkerItem[] = [];

  // Start Point (Green A)
  if (trip?.startLat && trip?.startLng) {
    markers.push({
      id: 'start-point',
      lat: trip.startLat,
      lng: trip.startLng,
      title: 'Tracking Start (A)',
      subtitle: trip.startAddress || 'Attendance Punch In Location',
      iconType: 'start',
    });
  } else if (lastPoint) {
    markers.push({
      id: 'start-point-fallback',
      lat: lastPoint.latitude,
      lng: lastPoint.longitude,
      title: 'Tracking Start (A)',
      subtitle: 'Recorded GPS Location',
      iconType: 'start',
    });
  }

  // Child Customer / Site Visits (Orange Pins)
  if (trip?.childVisits && trip.childVisits.length > 0) {
    trip.childVisits.forEach((visit, idx) => {
      if (visit.siteLat && visit.siteLng) {
        markers.push({
          id: `child-visit-${visit.id || idx}`,
          lat: visit.siteLat,
          lng: visit.siteLng,
          title: `Client Visit: ${visit.customerSiteName}`,
          subtitle: visit.siteAddress,
          iconType: 'site',
        });
      }
    });
  } else if (assignment.siteLat && assignment.siteLng && !assignment.isPermanentField) {
    markers.push({
      id: 'site-point',
      lat: assignment.siteLat,
      lng: assignment.siteLng,
      title: `Assigned Site: ${assignment.customerSiteName}`,
      subtitle: assignment.siteAddress,
      iconType: 'site',
    });
  }

  // End Point (Red B) if completed or auto closed, or Live marker if active
  if (trip?.status === 'Active' && lastPoint) {
    markers.push({
      id: 'live-employee',
      lat: lastPoint.latitude,
      lng: lastPoint.longitude,
      title: assignment.employeeName,
      avatar: assignment.employeeAvatar,
      iconType: 'employee',
      pulse: true,
      popupHtml: `
        <div style="font-family: inherit; padding: 4px;">
          <strong style="color: #0E7490; font-size: 13px;">${assignment.employeeName}</strong>
          <div style="font-size: 11px; color: #64748B;">Live Location</div>
          <div style="font-size: 11px; color: #64748B;">Speed: ${Math.round(lastPoint.speed || 0)} km/h</div>
        </div>
      `,
    });
  } else if (trip?.status === 'Completed' || trip?.status === 'Auto Closed') {
    if (trip?.endLat && trip?.endLng) {
      markers.push({
        id: 'end-point',
        lat: trip.endLat,
        lng: trip.endLng,
        title: trip.status === 'Completed' ? 'Punch Out Destination (B)' : 'Tracking Cutoff (B)',
        subtitle: trip.endAddress || (trip.status === 'Completed' ? 'Trip Completed' : 'Auto Closed Cutoff'),
        iconType: 'end',
      });
    } else if (lastPoint && pointCount > 1) {
      markers.push({
        id: 'end-point-last',
        lat: lastPoint.latitude,
        lng: lastPoint.longitude,
        title: trip.status === 'Completed' ? 'Last Recorded Destination (B)' : 'Tracking Cutoff (B)',
        subtitle: trip.status === 'Completed' ? 'Trip Completed' : 'Auto Closed Cutoff',
        iconType: 'end',
      });
    }
  }

  // Geofence circle
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

  // Formatted Timestamps
  const punchInTime = trip?.checkInTime
    ? new Date(trip.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : trip?.tripStartTime
    ? new Date(trip.tripStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : 'Not Recorded';

  const punchOutTime = trip?.checkOutTime
    ? new Date(trip.checkOutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : trip?.status === 'Auto Closed'
    ? 'Auto Closed'
    : trip?.status === 'Active'
    ? 'Active Now'
    : '—';

  // Total Duration
  const dutyDuration = useMemo(() => {
    if (!trip?.tripStartTime) return '—';
    const startMs = new Date(trip.checkInTime || trip.tripStartTime).getTime();
    const endMs = trip.checkOutTime || trip.tripEndTime
      ? new Date((trip.checkOutTime || trip.tripEndTime)!).getTime()
      : (trip.status === 'Active' ? Date.now() : startMs);
    const diffSec = Math.max(0, Math.round((endMs - startMs) / 1000));
    return formatDurationMinutes(diffSec);
  }, [trip]);

  // GPS Quality determination
  const gpsQuality = useMemo(() => {
    if (pointCount === 0) return 'No GPS Data';
    if (pointCount === 1) return 'Insufficient GPS Data';
    if (metrics.missingIntervalsCount > 0) return 'GPS Gaps Detected';
    if (pointCount >= 5) return 'Good GPS Data';
    return 'Partial GPS Data';
  }, [pointCount, metrics.missingIntervalsCount]);

  const isPermanent = Boolean(assignment.isPermanentField || trip?.isPermanentField);
  const effectiveStatus = trip?.status || assignment.status;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
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
          maxWidth: '960px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Apple Maps / Google Maps Minimal Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            {assignment.employeeAvatar ? (
              <img
                src={assignment.employeeAvatar}
                alt={assignment.employeeName}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #E2E8F0',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '16px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  {assignment.employeeName}
                </h2>
                <span style={{ fontSize: '0.80rem', color: '#64748B', fontWeight: 600 }}>
                  {assignment.employeeId} • {assignment.department}
                </span>
                <span
                  style={{
                    backgroundColor: isPermanent ? '#ECFEFF' : '#FEF3C7',
                    color: isPermanent ? '#0E7490' : '#B45309',
                    border: isPermanent ? '1px solid #A5F3FC' : '1px solid #FDE68A',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    padding: '2px 9px',
                    borderRadius: '9999px',
                  }}
                >
                  {isPermanent ? 'Permanent Field' : 'Temporary Field'}
                </span>
                <span
                  style={{
                    backgroundColor:
                      effectiveStatus === 'Completed' ? '#DCFCE7' :
                      effectiveStatus === 'Active' ? '#ECFEFF' :
                      effectiveStatus === 'Auto Closed' ? '#F1F5F9' : '#FEF3C7',
                    color:
                      effectiveStatus === 'Completed' ? '#16A34A' :
                      effectiveStatus === 'Active' ? '#0E7490' :
                      effectiveStatus === 'Auto Closed' ? '#475569' : '#B45309',
                    border:
                      effectiveStatus === 'Auto Closed' ? '1px solid #E2E8F0' : '1px solid transparent',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    padding: '2px 9px',
                    borderRadius: '9999px',
                  }}
                >
                  {effectiveStatus}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                {formatDateDDMMYYYY(assignment.startDate)}
              </div>
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

        {/* Travel Summary Bar (Clean Apple / Google Maps 5 Key Metrics) */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#FAFCFE',
            borderBottom: '1px solid #F1F5F9',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Recorded Travel
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0E7490', marginTop: '1px' }}>
              {pointCount >= 2 ? formatKm(metrics.verifiedKm) : '0.00 KM'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Punch In
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 750, color: '#1E293B', marginTop: '2px' }}>
              {punchInTime}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Punch Out
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 750, color: '#1E293B', marginTop: '2px' }}>
              {punchOutTime}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Duty Duration
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 750, color: '#1E293B', marginTop: '2px' }}>
              {dutyDuration}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              GPS Quality
            </div>
            <div style={{ marginTop: '3px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.74rem',
                  fontWeight: 750,
                  color:
                    gpsQuality === 'Good GPS Data' ? '#16A34A' :
                    gpsQuality === 'GPS Gaps Detected' ? '#EA580C' :
                    gpsQuality === 'Partial GPS Data' ? '#D97706' : '#64748B'
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
                      gpsQuality === 'Partial GPS Data' ? '#D97706' : '#94A3B8'
                  }}
                />
                {gpsQuality}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Body: Map + Chronological Timeline */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Missing / Partial GPS Notice */}
          {pointCount < 2 && (
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.80rem',
                color: '#475569',
              }}
            >
              <HelpCircle size={16} color="#64748B" style={{ flexShrink: 0 }} />
              <div>
                {pointCount === 0
                  ? 'No GPS points recorded for this duty session. Initial punch-in location only.'
                  : '1 GPS location recorded. Continuous route line is not drawn for single stationary points.'}
              </div>
            </div>
          )}

          {/* Large Map Area (60-70% visual weight) */}
          <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #E2E8F0', position: 'relative' }}>
            <TrackingMap
              center={[centerLat, centerLng]}
              zoom={14}
              height="440px"
              markers={markers}
              routePoints={routePoints}
              detailedPoints={trip?.locationPoints || []}
              segments={metrics.segments}
              stops={trip?.stops || []}
              circle={circleConfig}
              showPlaybackControls={pointCount > 1}
              autoFitBounds={pointCount > 1}
            />

            {/* Clean Map Legend Overlay (Minimal Apple Maps style) */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                backdropFilter: 'blur(8px)',
                padding: '6px 12px',
                borderRadius: '10px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#334155',
                zIndex: 1000,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#16A34A', display: 'inline-block' }} />
                Start (A)
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '14px', height: '3px', backgroundColor: '#1D4ED8', display: 'inline-block', borderRadius: '2px' }} />
                Travel Route
              </span>
              {(trip?.childVisits?.length || 0) > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#D97706', display: 'inline-block' }} />
                  Client Visits
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: effectiveStatus === 'Active' ? '#0E7490' : '#DC2626', display: 'inline-block' }} />
                {effectiveStatus === 'Active' ? 'Live Position' : 'End (B)'}
              </span>
            </div>
          </div>

          {/* Technical GPS Diagnostics (Collapsible) */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: '#F8FAFC',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#475569',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={14} color="#0E7490" />
                <span>GPS Telemetry & Sync Details ({pointCount} points recorded)</span>
              </span>
              <span style={{ color: '#0E7490', fontSize: '0.74rem' }}>
                {showTechnicalDetails ? 'Hide Details' : 'View Details'}
              </span>
            </button>

            {showTechnicalDetails && (
              <div style={{ padding: '12px 16px', fontSize: '0.76rem', color: '#64748B', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', backgroundColor: '#FFFFFF' }}>
                <div><strong>Raw Points Received:</strong> {trip?.rawPointsCount || pointCount}</div>
                <div><strong>Accepted Points:</strong> {trip?.acceptedPointsCount || pointCount}</div>
                <div><strong>Filtered Stationary Drift:</strong> {trip?.rejectedPointsCount || 0}</div>
                <div><strong>Unverified Gaps:</strong> {metrics.missingIntervalsCount > 0 ? `${metrics.missingIntervalsCount} (${formatKm(metrics.unverifiedGapKm)})` : 'None'}</div>
              </div>
            )}
          </div>

          {/* Chronological Travel & Activity Event Timeline (Clean Apple/Google style) */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              padding: '16px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <strong style={{ fontSize: '0.86rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} color="#0E7490" />
                <span>Chronological Event Timeline</span>
              </strong>
              <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                {formatDateDDMMYYYY(assignment.startDate)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', position: 'relative' }}>
              {/* Event 1: Attendance Punch In */}
              <div style={{ display: 'flex', gap: '12px', position: 'relative', paddingBottom: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, border: '2px solid #16A34A', zIndex: 2 }}>
                    A
                  </div>
                  <div style={{ width: '2px', backgroundColor: '#E2E8F0', flex: 1, marginTop: '2px' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '0.80rem', color: '#16A34A' }}>Attendance Punch In & Tracking Started</strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>{punchInTime}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                    {trip?.startAddress || assignment.siteAddress || 'Authorized Field Location'}
                  </div>
                </div>
              </div>

              {/* Event 2: Legitimate Child Client Visits (if any) */}
              {(trip?.childVisits || []).map((visit, idx) => (
                <div key={visit.id || idx} style={{ display: 'flex', gap: '12px', position: 'relative', paddingBottom: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, border: '2px solid #D97706', zIndex: 2 }}>
                      {idx + 1}
                    </div>
                    <div style={{ width: '2px', backgroundColor: '#E2E8F0', flex: 1, marginTop: '2px' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.80rem', color: '#D97706' }}>
                        Client Visit #{idx + 1}: {visit.customerSiteName}
                      </strong>
                      <span style={{ fontSize: '0.70rem', color: '#B45309', fontWeight: 700, backgroundColor: '#FFFBEB', padding: '1px 6px', borderRadius: '4px' }}>
                        {visit.purpose || 'Official Visit'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                      {visit.siteAddress || 'Client Site'}
                    </div>
                  </div>
                </div>
              ))}

              {/* Event 3: GPS Gaps (if any recorded evidence) */}
              {metrics.missingIntervalsCount > 0 && (
                <div style={{ display: 'flex', gap: '12px', position: 'relative', paddingBottom: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, border: '2px solid #DC2626', zIndex: 2 }}>
                      !
                    </div>
                    <div style={{ width: '2px', backgroundColor: '#E2E8F0', flex: 1, marginTop: '2px' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.80rem', color: '#B91C1C' }}>
                        GPS Interval Gap ({metrics.missingIntervalsCount} {metrics.missingIntervalsCount === 1 ? 'Gap' : 'Gaps'})
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: '#B91C1C', fontWeight: 700 }}>
                        {formatDurationMinutes(metrics.missingDurationSeconds)} unrecorded
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                      Straight-line gap ({metrics.unverifiedGapKm.toFixed(2)} KM) excluded from confirmed travel distance.
                    </div>
                  </div>
                </div>
              )}

              {/* Event 4: Punch Out or Auto Closed */}
              <div style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      backgroundColor: effectiveStatus === 'Completed' ? '#FEE2E2' : (effectiveStatus === 'Active' ? '#ECFEFF' : '#F1F5F9'),
                      color: effectiveStatus === 'Completed' ? '#DC2626' : (effectiveStatus === 'Active' ? '#0E7490' : '#475569'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 800,
                      border: `2px solid ${effectiveStatus === 'Completed' ? '#DC2626' : (effectiveStatus === 'Active' ? '#0E7490' : '#94A3B8')}`,
                      zIndex: 2,
                    }}
                  >
                    B
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong
                      style={{
                        fontSize: '0.80rem',
                        color: effectiveStatus === 'Completed' ? '#DC2626' : (effectiveStatus === 'Active' ? '#0E7490' : '#475569'),
                      }}
                    >
                      {effectiveStatus === 'Completed' ? 'Attendance Punch Out & Tracking Stopped' : (effectiveStatus === 'Active' ? 'Active Tracking Session In Progress' : 'Tracking Cutoff Reached (Auto Closed)')}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>{punchOutTime}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                    {trip?.endAddress || (lastPoint ? `Last GPS Coordinates: ${lastPoint.latitude.toFixed(4)}, ${lastPoint.longitude.toFixed(4)}` : 'Destination Location')}
                  </div>
                </div>
              </div>
            </div>
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
              padding: '9px 24px',
              borderRadius: '12px',
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
