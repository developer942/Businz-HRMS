import React, { useState, useEffect, useRef } from 'react';
import {
  Navigation,
  Clock,
  MapPin,
  CheckCircle2,
  StopCircle,
  AlertTriangle,
  RotateCcw,
  Wifi,
  WifiOff,
  Maximize2,
  Camera,
  Upload,
  FileCheck,
  History,
  X
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { TrackingMap, MapMarkerItem } from './TrackingMap';
import { formatKm } from '../../services/trackingEngine';
import { defaultLocationProvider, OfflineTrackingStorage } from '../../services/trackingLocationProvider';

export interface EmployeeTripTabProps {
  onTripEnded?: () => void;
  onViewHistory?: () => void;
}

export const EmployeeTripTab: React.FC<EmployeeTripTabProps> = ({ onTripEnded, onViewHistory }) => {
  const {
    currentUser,
    fieldAssignments,
    tripSessions,
    recordLocationPoint,
    endTrip
  } = useHRMS();

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlinePendingCount, setOfflinePendingCount] = useState<number>(0);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [durationStr, setDurationStr] = useState<string>('00:00:00');
  const [showProofModal, setShowProofModal] = useState<boolean>(false);
  const [proofNote, setProofNote] = useState<string>('');
  const [proofImageName, setProofImageName] = useState<string>('');
  const [proofSuccess, setProofSuccess] = useState<boolean>(false);

  const currentEmployeeKeys = [
    currentUser.employeeId,
    currentUser.id,
    currentUser.name
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  // Find employee's active trip session. Never fall back to another user's trip.
  const activeTrip = tripSessions.find((t) => {
    const tripKeys = [t.employeeId, t.employeeName].map((value) => String(value || '').trim().toLowerCase());
    return t.status === 'Active' && tripKeys.some((key) => currentEmployeeKeys.includes(key));
  });

  const assignment = fieldAssignments.find((a) => a.id === activeTrip?.assignmentId);

  // Network state listener & offline sync
  useEffect(() => {
    const updateOnline = () => {
      setIsOnline(true);
      // Synchronize offline points to Supabase / store
      const offlinePts = OfflineTrackingStorage.getOfflinePoints();
      if (offlinePts.length > 0 && activeTrip) {
        const pointsForTrip = offlinePts.filter((pt) => pt.tripId === activeTrip.id);
        pointsForTrip.forEach((pt) => {
          recordLocationPoint(activeTrip.id, pt);
        });
        OfflineTrackingStorage.clearOfflinePoints(pointsForTrip.map((p) => p.id));
        setOfflinePendingCount(OfflineTrackingStorage.getOfflinePoints().length);
      }
    };

    const updateOffline = () => {
      setIsOnline(false);
      setOfflinePendingCount(OfflineTrackingStorage.getOfflinePoints().length);
    };

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOffline);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOffline);
    };
  }, [activeTrip?.id]);

  // Active visit elapsed time counter
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'Active') return;
    const startMs = new Date(activeTrip.tripStartTime).getTime();

    const updateTimer = () => {
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      const hours = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      setDurationStr(
        `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeTrip?.tripStartTime, activeTrip?.status]);

  // Setup battery-efficient location tracking when trip is active
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'Active') return;

    // Use watchPosition or timed interval (every 2-5 mins / on move)
    const id = defaultLocationProvider.watchPosition(
      (pos) => {
        const pointData = {
          assignmentId: activeTrip.assignmentId,
          employeeId: activeTrip.employeeId,
          recordedAt: new Date(pos.timestamp).toISOString(),
          latitude: pos.lat,
          longitude: pos.lng,
          accuracy: pos.accuracy,
          speed: pos.speed,
          heading: pos.heading,
          altitude: pos.altitude,
          source: 'browser_watch'
        };

        if (navigator.onLine) {
          recordLocationPoint(activeTrip.id, pointData);
        } else {
          // Offline storage
          OfflineTrackingStorage.saveOfflinePoint({
            ...pointData,
            id: `offline-pt-${Date.now()}`,
            tripId: activeTrip.id
          });
          setOfflinePendingCount(OfflineTrackingStorage.getOfflinePoints().length);
        }
      },
      (err) => {
        console.warn('GPS location tracking error:', err);
      }
    );

    setWatchId(id);

    return () => {
      if (id >= 0) defaultLocationProvider.clearWatch(id);
      setWatchId(null);
    };
  }, [activeTrip?.id]);

  const handleEndTrip = async () => {
    if (!activeTrip) return;
    if (window.confirm(`Are you sure you want to end your trip? Current logged distance: ${formatKm(activeTrip.totalKm)}`)) {
      if (watchId !== null) defaultLocationProvider.clearWatch(watchId);

      try {
        const pos = await defaultLocationProvider.getCurrentPosition();
        endTrip(activeTrip.id, pos.lat, pos.lng, 'Destination Reached');
      } catch {
        const lastPt = activeTrip.locationPoints[activeTrip.locationPoints.length - 1];
        endTrip(
          activeTrip.id,
          lastPt?.latitude || activeTrip.startLat,
          lastPt?.longitude || activeTrip.startLng,
          'Destination'
        );
      }

      if (onTripEnded) onTripEnded();
    }
  };

  if (!activeTrip) {
    return (
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '48px 24px',
          textAlign: 'center',
          border: '1px solid #E7ECF3',
          maxWidth: '600px',
          margin: '0 auto'
        }}
      >
        <Navigation size={42} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B1A2D' }}>No Active Trip in Progress</h3>
        <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '8px auto 0' }}>
          You do not have an active travel tracking session. Visit the <strong>My Duty</strong> tab to start your assigned trip.
        </p>
      </div>
    );
  }

  const routePoints: [number, number][] = activeTrip.locationPoints.map((pt) => [pt.latitude, pt.longitude]);
  const lastPoint = activeTrip.locationPoints[activeTrip.locationPoints.length - 1];
  const centerLat = lastPoint?.latitude || activeTrip.startLat;
  const centerLng = lastPoint?.longitude || activeTrip.startLng;

  const markers: MapMarkerItem[] = [
    {
      id: 'trip-start',
      lat: activeTrip.startLat,
      lng: activeTrip.startLng,
      title: 'Trip Start',
      subtitle: activeTrip.startAddress,
      iconType: 'start'
    },
    {
      id: 'current-pos',
      lat: centerLat,
      lng: centerLng,
      title: currentUser.name,
      avatar: currentUser.avatar,
      iconType: 'employee',
      pulse: true
    }
  ];

  if (assignment?.siteLat && assignment?.siteLng) {
    markers.push({
      id: 'assigned-site',
      lat: assignment.siteLat,
      lng: assignment.siteLng,
      title: assignment.customerSiteName,
      iconType: 'site'
    });
  }

  const tripStartTimeFormatted = new Date(activeTrip.tripStartTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '820px', margin: '0 auto' }}>
      {/* Offline sync banner if offline */}
      {!isOnline && (
        <div
          style={{
            backgroundColor: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: '12px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#92400E',
            fontSize: '0.82rem',
            fontWeight: 700
          }}
        >
          <WifiOff size={16} />
          <span>Offline — tracking data is safely cached locally and will sync automatically upon reconnection.</span>
        </div>
      )}

      {/* Active Trip Telemetry Card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)',
          overflow: 'hidden'
        }}
      >
        {/* Banner Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E7ECF3',
            backgroundColor: '#FAFCFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                backgroundColor: '#DCFCE7',
                color: '#166534',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
              TRIP ACTIVE
            </span>

            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0B1A2D' }}>
              {activeTrip.customerSiteName}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.78rem' }}>
            <span style={{ color: '#16A34A', fontWeight: 700 }}>GPS ✓</span>
            <span style={{ color: isOnline ? '#16A34A' : '#D97706', fontWeight: 700 }}>
              Internet {isOnline ? '✓' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Live Numbers Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '14px',
            padding: '16px 20px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E7ECF3'
          }}
        >
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Start Time
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0B1A2D', marginTop: '3px' }}>
              {tripStartTimeFormatted}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Visit Duration
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0B1A2D', marginTop: '2px', fontFamily: 'monospace' }}>
              {durationStr}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Travelled Distance
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0E7490', marginTop: '2px' }}>
              {formatKm(activeTrip.totalKm)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Reported GPS Accuracy
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: (lastPoint?.accuracy ?? 10) <= 20 ? '#16A34A' : '#D97706', marginTop: '4px' }}>
              ±{Math.round(lastPoint?.accuracy || 10)}m (High Accuracy)
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Tracking Engine
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0E7490', marginTop: '6px' }}>
              ● OSM FREE ENGINE
            </div>
          </div>
        </div>

        {/* Live Personal Route Map */}
        <div style={{ padding: '16px 20px' }}>
          <TrackingMap
            center={[centerLat, centerLng]}
            zoom={14}
            height="380px"
            markers={markers}
            routePoints={routePoints}
            detailedPoints={activeTrip.locationPoints}
            segments={activeTrip.segments || []}
            circle={assignment?.attendanceType === 'Site Geofence' && assignment?.siteLat && assignment?.siteLng ? {
              lat: assignment.siteLat,
              lng: assignment.siteLng,
              radiusMeters: assignment.allowedRadiusMeters || 200,
              color: '#0E7490',
              fillColor: '#CFFAFE'
            } : undefined}
          />
        </div>

        {/* Footer Actions: Proof, History, End Trip */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #E7ECF3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FAFCFE',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Add Visit Proof */}
            <button
              type="button"
              onClick={() => setShowProofModal(true)}
              style={{
                backgroundColor: proofSuccess ? '#DCFCE7' : '#FFFFFF',
                color: proofSuccess ? '#166534' : '#0E7490',
                border: '1px solid #A5F3FC',
                borderRadius: '10px',
                padding: '8px 14px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              {proofSuccess ? <FileCheck size={16} /> : <Camera size={16} />}
              <span>{proofSuccess ? 'Proof Attached ✓' : 'Add Visit Proof'}</span>
            </button>

            {/* Travel History */}
            {onViewHistory && (
              <button
                type="button"
                onClick={onViewHistory}
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                <History size={15} />
                <span>Travel History</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleEndTrip}
            style={{
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 24px',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
            }}
          >
            <StopCircle size={18} />
            <span>END TRIP</span>
          </button>
        </div>
      </div>

      {/* Visit Proof Modal */}
      {showProofModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Attach Field Visit Proof
              </h3>
              <button
                type="button"
                onClick={() => setShowProofModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '16px' }}>
              Upload a site visit photograph, signed delivery challan, or client sign-off note for <strong>{activeTrip.customerSiteName}</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Photo Input */}
              <label
                style={{
                  border: '2px dashed #CBD5E1',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: '#F8FAFC',
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setProofImageName(file.name);
                  }}
                />
                <Camera size={28} color="#0E7490" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                  {proofImageName ? proofImageName : 'Take Site Photo / Upload Image'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                  Tap to capture with mobile camera
                </div>
              </label>

              {/* Note Input */}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Site Visit Notes / Client Remarks
                </label>
                <textarea
                  rows={3}
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  placeholder="e.g. Met manager Mr. Suresh, completed inspection successfully."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Submit Proof Button */}
              <button
                type="button"
                onClick={() => {
                  setProofSuccess(true);
                  setShowProofModal(false);
                }}
                style={{
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  marginTop: '6px',
                }}
              >
                Save & Attach Proof
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
