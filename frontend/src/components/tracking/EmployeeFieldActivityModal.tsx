import React, { useEffect, useState, useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2, Navigation, Clock, MapPin } from 'lucide-react';
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

  const routePoints: [number, number][] = (trip?.locationPoints || []).map((pt) => [
    pt.latitude,
    pt.longitude,
  ]);

  const lastPoint =
    trip?.locationPoints && trip.locationPoints.length > 0
      ? trip.locationPoints[trip.locationPoints.length - 1]
      : null;

  const centerLat = lastPoint?.latitude || trip?.startLat || assignment.siteLat || 13.0827;
  const centerLng = lastPoint?.longitude || trip?.startLng || assignment.siteLng || 80.2707;

  // Build markers
  const markers: MapMarkerItem[] = [];

  if (trip?.startLat && trip?.startLng) {
    markers.push({
      id: 'start-point',
      lat: trip.startLat,
      lng: trip.startLng,
      title: 'Trip Start (A)',
      subtitle: trip.startAddress,
      iconType: 'start',
    });
  }

  if (assignment.siteLat && assignment.siteLng) {
    markers.push({
      id: 'site-point',
      lat: assignment.siteLat,
      lng: assignment.siteLng,
      title: `Assigned Site: ${assignment.customerSiteName}`,
      subtitle: assignment.siteAddress,
      iconType: 'site',
    });
  }

  if (trip?.status === 'Completed' && (lastPoint || (trip.endLat && trip.endLng))) {
    const endLat = lastPoint?.latitude || trip.endLat!;
    const endLng = lastPoint?.longitude || trip.endLng!;
    markers.push({
      id: 'end-point',
      lat: endLat,
      lng: endLng,
      title: 'Last Recorded Destination (B)',
      subtitle: trip.endAddress || 'Trip End',
      iconType: 'end',
    });
  }

  if (lastPoint && trip?.status === 'Active') {
    markers.push({
      id: 'live-employee',
      lat: lastPoint.latitude,
      lng: lastPoint.longitude,
      title: assignment.employeeName,
      avatar: assignment.employeeAvatar,
      iconType: 'employee',
      pulse: true,
      popupHtml: `
        <div style="font-family: var(--font-primary, sans-serif); padding: 4px;">
          <strong style="color: #0E7490; font-size: 13px;">${assignment.employeeName}</strong>
          <div style="font-size: 11px; color: #64748B;">Speed: ${Math.round(lastPoint.speed || 0)} km/h</div>
          <div style="font-size: 11px; color: #64748B;">Accuracy: ±${Math.round(lastPoint.accuracy || 10)}m</div>
        </div>
      `,
    });
  }

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

  const tripStartFormatted = trip?.tripStartTime
    ? new Date(trip.tripStartTime).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : 'Not Started';

  const tripEndFormatted =
    trip?.tripEndTime || trip?.checkOutTime
      ? new Date((trip.tripEndTime || trip.checkOutTime)!).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : trip?.status === 'Active'
      ? 'In Progress'
      : '—';

  const lastGpsFormatted =
    lastPoint?.recordedAt || trip?.lastGpsUpdate
      ? new Date((lastPoint?.recordedAt || trip?.lastGpsUpdate)!).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : 'None';

  const pointCount = (trip?.locationPoints || []).filter((p) => !p.isRejected).length;
  const hasGaps = metrics.missingIntervalsCount > 0 || metrics.unverifiedDistanceMeters > 0;
  const legacyKm =
    trip?.legacyStoredKm !== undefined && Math.abs(trip.legacyStoredKm - metrics.verifiedKm) >= 0.05
      ? trip.legacyStoredKm
      : undefined;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '12px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '940px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.22)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FFFFFF',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {assignment.employeeAvatar ? (
              <img
                src={assignment.employeeAvatar}
                alt={assignment.employeeName}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '1.5px solid #CBD5E1',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: '42px',
                  height: '42px',
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
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  {assignment.employeeName}
                </h2>
                <span style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>
                  {assignment.employeeId} · {assignment.department}
                </span>
                <span
                  style={{
                    backgroundColor: '#F1F5F9',
                    color: '#334155',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {assignment.dutyType}
                </span>
              </div>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: '#64748B',
                  margin: '2px 0 0 0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {formatDateDDMMYYYY(assignment.startDate)} • {assignment.customerSiteName} ({assignment.siteAddress})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#475569',
              flexShrink: 0,
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Incomplete GPS Warning Banner when gaps exist */}
          {hasGaps && (
            <div
              style={{
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.78rem', color: '#92400E', lineHeight: 1.45 }}>
                <div style={{ fontWeight: 800, color: '#78350F', marginBottom: '2px' }}>
                  Incomplete GPS Trace Detected ({metrics.missingIntervalsCount} Missing Interval
                  {metrics.missingIntervalsCount > 1 ? 's' : ''} · {formatDurationMinutes(metrics.missingDurationSeconds)} Unrecorded)
                </div>
                <div>
                  GPS updates paused while the mobile browser was backgrounded, locked, or had no signal. Unrecorded straight-line gaps (
                  <strong>{metrics.unverifiedGapKm.toFixed(2)} KM</strong>) are shown as dotted amber markers and are{' '}
                  <strong>excluded from Verified Travel KM</strong>.
                  {legacyKm !== undefined && (
                    <span>
                      {' '}
                      (Recalculated from legacy stored value of <strong>{legacyKm.toFixed(2)} KM</strong>).
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Road-Matched Map */}
          <TrackingMap
            center={[centerLat, centerLng]}
            zoom={13}
            height="390px"
            markers={markers}
            routePoints={routePoints}
            detailedPoints={trip?.locationPoints || []}
            segments={metrics.segments}
            stops={trip?.stops || []}
            circle={circleConfig}
            showPlaybackControls={pointCount > 1}
          />

          {/* Compact Telemetry Summary Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
              gap: '10px',
              backgroundColor: '#F8FAFC',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
            }}
          >
            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Trip Start
              </div>
              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A', marginTop: '3px' }}>
                {tripStartFormatted}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Last GPS Update
              </div>
              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A', marginTop: '3px' }}>
                {lastGpsFormatted}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Trip End
              </div>
              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A', marginTop: '3px' }}>
                {tripEndFormatted}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Recorded GPS Points
              </div>
              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A', marginTop: '3px' }}>
                {pointCount} {pointCount === 1 ? 'Point' : 'Points'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Verified Travel KM
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1D4ED8', marginTop: '3px' }}>
                {formatKm(metrics.verifiedKm)}
              </div>
              {metrics.unverifiedGapKm > 0 && (
                <div style={{ fontSize: '0.66rem', color: '#B45309', fontWeight: 600, marginTop: '1px' }}>
                  Unverified Gap: {formatKm(metrics.unverifiedGapKm)}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                GPS Data Quality
              </div>
              <div style={{ marginTop: '4px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color:
                      metrics.gpsDataQuality === 'Verified'
                        ? '#16A34A'
                        : metrics.gpsDataQuality === 'Partial (Gaps Detected)'
                        ? '#D97706'
                        : '#64748B',
                  }}
                >
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor:
                        metrics.gpsDataQuality === 'Verified'
                          ? '#16A34A'
                          : metrics.gpsDataQuality === 'Partial (Gaps Detected)'
                          ? '#D97706'
                          : '#94A3B8',
                    }}
                  />
                  {metrics.gpsDataQuality}
                </span>
              </div>
            </div>
          </div>

          {/* Duty & Segment Breakdown */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              fontSize: '0.76rem',
              color: '#475569',
            }}
          >
            <div>
              <strong>Schedule:</strong> {formatDateDDMMYYYY(assignment.startDate)} (
              {formatTimeAmPm(assignment.startTime)} – {formatTimeAmPm(assignment.endTime)}) •{' '}
              <strong>Purpose:</strong> {assignment.purpose}
            </div>
            <div>
              <strong>Missing Intervals:</strong>{' '}
              {metrics.missingIntervalsCount > 0
                ? `${metrics.missingIntervalsCount} (${formatDurationMinutes(metrics.missingDurationSeconds)})`
                : '0 (Continuous)'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#FAFCFE',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '10px',
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.84rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
