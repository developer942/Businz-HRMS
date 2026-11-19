import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building,
  Calendar,
  Wifi,
  WifiOff,
  Crosshair,
  ArrowRight,
  LogOut,
  Send
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { formatTimeAmPm } from '../../services/trackingEngine';
import { defaultLocationProvider, OfflineTrackingStorage } from '../../services/trackingLocationProvider';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export interface EmployeeDutyTabProps {
  onGoToTripTab: () => void;
}

export const EmployeeDutyTab: React.FC<EmployeeDutyTabProps> = ({ onGoToTripTab }) => {
  const {
    currentUser,
    fieldAssignments,
    tripSessions,
    fieldCheckIn,
    fieldCheckOut,
    startTrip,
    endTrip
  } = useHRMS();

  // Network & GPS status
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isGpsEnabled, setIsGpsEnabled] = useState<boolean>(true);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const currentEmployeeKeys = [
    currentUser.employeeId,
    currentUser.id,
    currentUser.name
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Find employee's active or scheduled assignment today
  const todayStr = new Date().toISOString().split('T')[0];
  const myAssignment = fieldAssignments.find((a) => {
    const assignmentKeys = [a.employeeId, a.employeeName].map((value) => String(value || '').trim().toLowerCase());
    const matchEmp = assignmentKeys.some((key) => currentEmployeeKeys.includes(key));
    if (!matchEmp || a.status === 'Cancelled') return false;
    if (a.scheduleType === 'One Day') return a.startDate === todayStr;
    if (a.scheduleType === 'Date Range') return todayStr >= a.startDate && todayStr <= a.endDate;
    return todayStr >= a.startDate && todayStr <= a.endDate;
  });

  // Find active or completed trip for this assignment
  const activeTrip = tripSessions.find(
    (t) => t.assignmentId === myAssignment?.id && t.status === 'Active'
  );

  const completedTrip = tripSessions.find(
    (t) => t.assignmentId === myAssignment?.id && t.status === 'Completed'
  );

  const isCheckedIn = Boolean(activeTrip?.checkInTime || completedTrip?.checkInTime || myAssignment?.status === 'Active');

  const reverseGeocodeLiveCoords = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2200);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' }, signal: controller.signal }
      );
      clearTimeout(timer);
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data?.display_name) return String(data.display_name).trim();
      return null;
    } catch {
      return null;
    }
  };

  // Handle Field Check-in
  const handleFieldCheckIn = async () => {
    if (!myAssignment) return;
    setIsProcessing(true);
    setFeedbackMessage(null);

    try {
      const position = await defaultLocationProvider.getCurrentPosition();
      setIsGpsEnabled(true);
      const resolvedAddr =
        (await reverseGeocodeLiveCoords(position.lat, position.lng)) ||
        myAssignment.siteAddress ||
        myAssignment.customerSiteName;

      const res = fieldCheckIn(
        myAssignment.id,
        position.lat,
        position.lng,
        resolvedAddr
      );

      if (res.success) {
        setFeedbackMessage({ type: 'success', text: res.message });
      } else {
        setFeedbackMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setIsGpsEnabled(false);
      setFeedbackMessage({
        type: 'error',
        text: 'GPS Location unavailable. Please enable device location permissions.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Start Trip
  const handleStartTrip = async () => {
    if (!myAssignment) return;
    setIsProcessing(true);
    setFeedbackMessage(null);

    try {
      const position = await defaultLocationProvider.getCurrentPosition();
      setIsGpsEnabled(true);
      const resolvedAddr =
        (await reverseGeocodeLiveCoords(position.lat, position.lng)) ||
        myAssignment.siteAddress ||
        myAssignment.customerSiteName ||
        'Current Location';
      const trip = startTrip(myAssignment.id, position.lat, position.lng, resolvedAddr);
      setFeedbackMessage({ type: 'success', text: trip.status === 'Active' ? 'Trip initiated! GPS location tracking is now active.' : 'Trip is ready.' });
      onGoToTripTab();
    } catch (err: any) {
      setIsGpsEnabled(false);
      // Fallback: start trip with site coordinates if browser geolocation fails
      try {
        startTrip(myAssignment.id, myAssignment.siteLat || 13.0827, myAssignment.siteLng || 80.2707, 'Current Location');
        onGoToTripTab();
      } catch (tripErr: any) {
        setFeedbackMessage({ type: 'error', text: tripErr?.message || 'Unable to start trip for this assignment.' });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Field Check-out
  const handleFieldCheckOut = () => {
    if (!myAssignment) return;
    if (window.confirm('Confirm Field Duty Check-Out? This will complete your assigned field duties for today.')) {
      fieldCheckOut(myAssignment.id);
      setFeedbackMessage({ type: 'success', text: 'Field duty completed successfully. Tracking has ended.' });
    }
  };

  const handleRequestLocation = async () => {
    try {
      await defaultLocationProvider.getCurrentPosition();
      setIsGpsEnabled(true);
      setFeedbackMessage({ type: 'success', text: 'Location access successfully enabled.' });
    } catch {
      alert('Please open your browser or device settings to allow location access.');
    }
  };

  if (!myAssignment) {
    return (
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '48px 24px', textAlign: 'center', border: '1px solid #E7ECF3' }}>
        <CheckCircle2 size={42} color="#0E7490" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0B1A2D' }}>No Active Field Duty Today</h3>
        <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '400px', margin: '8px auto 0' }}>
          You have no scheduled field duties or client site visits for today. Continue with standard office geofence attendance.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px', margin: '0 auto' }}>
      {/* GPS Interruption Alert Banner */}
      {!isGpsEnabled && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1.5px solid #FCA5A5',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#991B1B' }}>
                GPS OFF — Tracking Interrupted
              </div>
              <p style={{ fontSize: '0.78rem', color: '#B91C1C', margin: '2px 0 0 0' }}>
                Location tracking is required during your active Field Duty. Please enable GPS to continue tracking.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestLocation}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.82rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            ENABLE LOCATION
          </button>
        </div>
      )}

      {!myAssignment ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid #E7ECF3',
            padding: '48px 24px',
            textAlign: 'center',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            <MapPin size={28} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800, color: '#1E293B' }}>
            No Field Duty Assigned Today
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            You do not have any active or scheduled field assignments for today. When a supervisor assigns you to a customer site or client duty, it will appear here with live tracking.
          </p>
        </div>
      ) : (
        /* Main Duty Card */
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)',
            overflow: 'hidden'
          }}
        >
          {/* Card Header Strip */}
          <div
          style={{
            padding: '18px 24px',
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
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                fontWeight: 800,
                fontSize: '0.75rem',
                padding: '4px 12px',
                borderRadius: '9999px',
                border: '1px solid #A5F3FC',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                display: 'inline-block'
              }}
            >
              {myAssignment.dutyType}
            </span>

            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748B' }}>
              {formatDateDDMMYYYY(myAssignment.startDate)}
            </span>
          </div>

          {/* Active status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0B1A2D' }}>Tracking:</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: activeTrip ? '#16A34A' : '#0E7490',
                fontWeight: 800,
                fontSize: '0.82rem'
              }}
            >
              ● {activeTrip ? 'ACTIVE' : myAssignment.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Card Body Details */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
              {myAssignment.customerSiteName}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#64748B', marginTop: '6px' }}>
              <MapPin size={15} color="#0E7490" />
              <span>{myAssignment.siteAddress}</span>
            </div>
          </div>

          {/* Duty Schedule Window */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0'
            }}
          >
            <Clock size={18} color="#0E7490" />
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Duty Approved Timing
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0B1A2D', marginTop: '2px' }}>
                {formatTimeAmPm(myAssignment.startTime)} — {formatTimeAmPm(myAssignment.endTime)}
              </div>
            </div>
          </div>

          {/* Purpose */}
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Purpose of Visit / Duty
            </div>
            <p style={{ fontSize: '0.88rem', color: '#334155', marginTop: '4px', lineHeight: 1.5 }}>
              {myAssignment.purpose}
            </p>
          </div>

          {/* System Telemetry Health Badges */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              borderTop: '1px solid #F1F5F9',
              paddingTop: '16px'
            }}
          >
            <div
              style={{
                textAlign: 'center',
                padding: '10px',
                borderRadius: '10px',
                backgroundColor: isGpsEnabled ? '#DCFCE7' : '#FEE2E2',
                border: isGpsEnabled ? '1px solid #86EFAC' : '1px solid #FCA5A5'
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>GPS</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isGpsEnabled ? '#16A34A' : '#DC2626', marginTop: '2px' }}>
                {isGpsEnabled ? '✓ ON' : '⚠ OFF'}
              </div>
            </div>

            <div
              style={{
                textAlign: 'center',
                padding: '10px',
                borderRadius: '10px',
                backgroundColor: isOnline ? '#DCFCE7' : '#FEF3C7',
                border: isOnline ? '1px solid #86EFAC' : '1px solid #FCD34D'
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>Internet</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isOnline ? '#16A34A' : '#D97706', marginTop: '2px' }}>
                {isOnline ? '✓ Connected' : 'Offline Sync'}
              </div>
            </div>

            <div
              style={{
                textAlign: 'center',
                padding: '10px',
                borderRadius: '10px',
                backgroundColor: activeTrip ? '#ECFEFF' : '#F1F5F9',
                border: activeTrip ? '1px solid #A5F3FC' : '1px solid #CBD5E1'
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>Tracking</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: activeTrip ? '#0E7490' : '#475569', marginTop: '2px' }}>
                {activeTrip ? '✓ Active' : 'Idle'}
              </div>
            </div>
          </div>

          {/* Feedback banner */}
          {feedbackMessage && (
            <div
              style={{
                backgroundColor: feedbackMessage.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                border: feedbackMessage.type === 'success' ? '1px solid #86EFAC' : '1px solid #FCA5A5',
                color: feedbackMessage.type === 'success' ? '#166534' : '#991B1B',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {feedbackMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{feedbackMessage.text}</span>
            </div>
          )}

          {/* Action Buttons Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            {/* 1. Field Check-in Button */}
            {!isCheckedIn && (
              <button
                type="button"
                onClick={handleFieldCheckIn}
                disabled={isProcessing}
                style={{
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '14px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(14, 116, 144, 0.3)'
                }}
              >
                <Crosshair size={18} />
                <span>{isProcessing ? 'Verifying Location...' : 'FIELD CHECK IN'}</span>
              </button>
            )}

            {/* 2. Start Trip Button */}
            {isCheckedIn && !activeTrip && myAssignment.travelKmRequired && (
              <button
                type="button"
                onClick={handleStartTrip}
                disabled={isProcessing}
                style={{
                  backgroundColor: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '14px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                <Navigation size={18} />
                <span>START TRIP</span>
              </button>
            )}

            {/* 3. Active Trip Notice & Go to Trip Tab */}
            {activeTrip && (
              <div
                style={{
                  backgroundColor: '#ECFEFF',
                  border: '1.5px solid #A5F3FC',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0E7490' }}>
                    Trip In Progress
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#155E75', marginTop: '2px' }}>
                    Distance: <strong>{activeTrip.totalKm.toFixed(2)} KM</strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onGoToTripTab}
                  style={{
                    backgroundColor: '#0E7490',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '8px 16px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>View Trip Map</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* 4. Field Check-out Button */}
            {isCheckedIn && myAssignment.status !== 'Completed' && (
              <button
                type="button"
                onClick={handleFieldCheckOut}
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#EF4444',
                  border: '1px solid #FCA5A5',
                  borderRadius: '12px',
                  padding: '11px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <LogOut size={16} />
                <span>FIELD CHECK OUT</span>
              </button>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
