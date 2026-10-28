import React from 'react';
import { X, Navigation, MapPin, Clock, Gauge, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { TrackingMap, MapMarkerItem } from './TrackingMap';
import { formatKm, formatTimeAmPm } from '../../services/trackingEngine';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export interface EmployeeFieldActivityModalProps {
  assignment: FieldAssignment;
  trip?: FieldTripSession;
  onClose: () => void;
}

export const EmployeeFieldActivityModal: React.FC<EmployeeFieldActivityModalProps> = ({
  assignment,
  trip,
  onClose
}) => {
  const routePoints: [number, number][] = (trip?.locationPoints || []).map((pt) => [pt.latitude, pt.longitude]);

  // Center coordinate
  const lastPoint = trip?.locationPoints && trip.locationPoints.length > 0
    ? trip.locationPoints[trip.locationPoints.length - 1]
    : null;

  const centerLat = lastPoint?.latitude || trip?.startLat || assignment.siteLat || 13.0827;
  const centerLng = lastPoint?.longitude || trip?.startLng || assignment.siteLng || 80.2707;

  // Build markers
  const markers: MapMarkerItem[] = [];

  // Start Marker
  if (trip?.startLat && trip?.startLng) {
    markers.push({
      id: 'start-point',
      lat: trip.startLat,
      lng: trip.startLng,
      title: 'Trip Start',
      subtitle: trip.startAddress,
      iconType: 'start'
    });
  }

  // Destination Site Marker
  if (assignment.siteLat && assignment.siteLng) {
    markers.push({
      id: 'site-point',
      lat: assignment.siteLat,
      lng: assignment.siteLng,
      title: assignment.customerSiteName,
      subtitle: assignment.siteAddress,
      iconType: 'site'
    });
  }

  // End Point Marker if completed
  if (trip?.status === 'Completed' && trip.endLat && trip.endLng) {
    markers.push({
      id: 'end-point',
      lat: trip.endLat,
      lng: trip.endLng,
      title: 'Trip Completed',
      subtitle: trip.endAddress,
      iconType: 'end'
    });
  }

  // Current Live Pin
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
          <div style="font-size: 11px; color: #64748B;">Accuracy: ${Math.round(lastPoint.accuracy || 10)}m</div>
        </div>
      `
    });
  }

  // Circle for Geofence
  const circleConfig = (assignment.attendanceType === 'Site Geofence' && assignment.siteLat && assignment.siteLng)
    ? {
        lat: assignment.siteLat,
        lng: assignment.siteLng,
        radiusMeters: assignment.allowedRadiusMeters || 200,
        color: '#0E7490',
        fillColor: '#CFFAFE'
      }
    : undefined;

  const checkInFormatted = trip?.checkInTime 
    ? new Date(trip.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : 'Not Recorded';

  const tripStartFormatted = trip?.tripStartTime
    ? new Date(trip.tripStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : 'Not Started';

  const lastGpsFormatted = trip?.lastGpsUpdate
    ? new Date(trip.lastGpsUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : 'None';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FAFCFE'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {assignment.employeeAvatar ? (
              <img
                src={assignment.employeeAvatar}
                alt={assignment.employeeName}
                style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #0E7490' }}
              />
            ) : (
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {assignment.employeeName.charAt(0)}
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
                  {assignment.employeeName}
                </h2>
                <span
                  style={{
                    backgroundColor: '#ECFEFF',
                    color: '#0E7490',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    padding: '3px 10px',
                    borderRadius: '9999px',
                    border: '1px solid #A5F3FC'
                  }}
                >
                  {assignment.department}
                </span>
                <span
                  style={{
                    backgroundColor: assignment.dutyType === 'Site Visit' ? '#FEF3C7' : '#F1F5F9',
                    color: assignment.dutyType === 'Site Visit' ? '#B45309' : '#475569',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    padding: '3px 10px',
                    borderRadius: '9999px',
                    whiteSpace: 'nowrap',
                    display: 'inline-block'
                  }}
                >
                  {assignment.dutyType}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '3px 0 0 0' }}>
                {assignment.customerSiteName} • {assignment.siteAddress}
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
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B'
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Map Section */}
          <div style={{ marginBottom: '20px' }}>
            <TrackingMap
              center={[centerLat, centerLng]}
              zoom={13}
              height="400px"
              markers={markers}
              routePoints={routePoints}
              detailedPoints={trip?.locationPoints || []}
              segments={trip?.segments || []}
              stops={trip?.stops || []}
              circle={circleConfig}
              showPlaybackControls={routePoints.length > 1}
            />
          </div>

          {/* Telemetry Metrics Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px',
              backgroundColor: '#F8FAFC',
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid #E2E8F0'
            }}
          >
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Check In
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0B1A2D', marginTop: '4px' }}>
                {checkInFormatted}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Trip Start
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0B1A2D', marginTop: '4px' }}>
                {tripStartFormatted}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Travel KM (Road)
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0E7490', marginTop: '4px' }}>
                {formatKm(trip?.totalKm || 0)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                Verified: {trip?.recordedDistanceMeters ? (trip.recordedDistanceMeters / 1000).toFixed(2) + ' KM' : formatKm(trip?.totalKm || 0)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Last GPS
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0B1A2D', marginTop: '4px' }}>
                {lastGpsFormatted}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Tracking
              </div>
              <div style={{ marginTop: '4px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: trip?.trackingStatus === 'Travelling' ? '#0E7490' : '#10B981'
                  }}
                >
                  ● {trip?.trackingStatus || assignment.status}
                </span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                GPS Status
              </div>
              <div style={{ marginTop: '4px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: trip?.gpsStatus === 'GPS Active' ? '#10B981' : '#EF4444'
                  }}
                >
                  {trip?.gpsStatus === 'GPS Active' ? '● GPS Active' : '⚠ GPS Lost'}
                </span>
              </div>
            </div>
          </div>

          {/* Assignment Purpose & Schedule Info */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
              <strong>Duty Schedule:</strong> {formatDateDDMMYYYY(assignment.startDate)} ({formatTimeAmPm(assignment.startTime)} – {formatTimeAmPm(assignment.endTime)})
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
              <strong>Purpose:</strong> {assignment.purpose}
            </div>
            {assignment.attendanceType === 'Site Geofence' && (
              <div style={{ fontSize: '0.78rem', color: '#0E7490' }}>
                <strong>Site Geofence:</strong> Enforced within {assignment.allowedRadiusMeters}m of site coordinates ({assignment.siteLat}, {assignment.siteLng})
              </div>
            )}
            {assignment.notes && (
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontStyle: 'italic' }}>
                Note: {assignment.notes}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#FAFCFE'
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
              fontSize: '0.88rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
