import React, { useState, useMemo } from 'react';
import { Navigation, Users, Search, MapPin, Gauge, ShieldAlert, CheckCircle2, ChevronRight, Eye } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { TrackingMap, MapMarkerItem } from './TrackingMap';
import { formatKm } from '../../services/trackingEngine';
import { EmployeeFieldActivityModal } from './EmployeeFieldActivityModal';

export const LiveTrackingTab: React.FC = () => {
  const { fieldAssignments, tripSessions } = useHRMS();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [inspectingAssignment, setInspectingAssignment] = useState<FieldAssignment | null>(null);

  // Filter ONLY employees whose tracking is currently ACTIVE
  const activeTripsWithAssignments = useMemo(() => {
    return tripSessions
      .filter((trip) => trip.status === 'Active')
      .map((trip) => {
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
          travelKmRequired: true
        } as FieldAssignment;

        const lastPoint = trip.locationPoints && trip.locationPoints.length > 0
          ? trip.locationPoints[trip.locationPoints.length - 1]
          : null;

        const currentLat = lastPoint?.latitude || trip.startLat;
        const currentLng = lastPoint?.longitude || trip.startLng;

        return {
          trip,
          assignment,
          lastPoint,
          currentLat,
          currentLng
        };
      });
  }, [tripSessions, fieldAssignments]);

  const filteredActiveList = useMemo(() => {
    return activeTripsWithAssignments.filter(({ trip, assignment }) => {
      const q = searchQuery.toLowerCase();
      return (
        trip.employeeName.toLowerCase().includes(q) ||
        trip.customerSiteName.toLowerCase().includes(q) ||
        trip.department.toLowerCase().includes(q)
      );
    });
  }, [activeTripsWithAssignments, searchQuery]);

  // Selected or first center
  const activeFocus = selectedEmpId 
    ? activeTripsWithAssignments.find(x => x.trip.employeeId === selectedEmpId)
    : activeTripsWithAssignments[0];

  const mapCenter: [number, number] = activeFocus
    ? [activeFocus.currentLat, activeFocus.currentLng]
    : [13.0827, 80.2707];

  // Build markers for all active employees
  const markers: MapMarkerItem[] = useMemo(() => {
    return activeTripsWithAssignments.map(({ trip, assignment, currentLat, currentLng, lastPoint }) => {
      const isSelected = selectedEmpId === trip.employeeId;
      const tripStartFormatted = new Date(trip.tripStartTime).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const lastGpsFormatted = trip.lastGpsUpdate
        ? new Date(trip.lastGpsUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : 'Just now';

      const popupHtml = `
        <div style="font-family: var(--font-primary, sans-serif); min-width: 220px; padding: 4px 0;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
            <strong style="color: #0B1A2D; font-size: 13px;">${assignment.employeeName}</strong>
            <span style="font-size: 10px; background: #ECFEFF; color: #0E7490; font-weight: 700; padding: 2px 6px; border-radius: 9999px;">
              ${assignment.department}
            </span>
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Duty:</strong> ${assignment.dutyType} — ${assignment.customerSiteName}
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Current KM:</strong> <span style="color: #0E7490; font-weight: 800;">${formatKm(trip.totalKm)}</span>
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Trip Start:</strong> ${tripStartFormatted}
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 3px;">
            <strong>Last Update:</strong> ${lastGpsFormatted}
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; margin-top: 6px; color: ${trip.gpsStatus === 'GPS Active' ? '#16A34A' : '#EF4444'};">
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
        pulse: true,
        popupHtml
      };
    });
  }, [activeTripsWithAssignments, selectedEmpId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
            Live Field Staff Tracking
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '3px' }}>
            Real-time GPS telemetry showing only personnel with currently active tracking assignments.
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
              fontWeight: 700,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Navigation size={14} />
            <span>{activeTripsWithAssignments.length} Live in Field</span>
          </div>
        </div>
      </div>

      {/* Main Layout: Left/Bottom Employee List + Large Interactive Map */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: '16px',
          alignItems: 'stretch'
        }}
        className="live-tracking-grid"
      >
        {/* Left Side: Active Employees List */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: '600px'
          }}
        >
          {/* Search Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E7ECF3', backgroundColor: '#FAFCFE' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF'
              }}
            >
              <Search size={14} color="#94A3B8" />
              <input
                type="text"
                placeholder="Search active staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.8rem', width: '100%' }}
              />
            </div>
          </div>

          {/* List Content */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
            {filteredActiveList.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                No active tracking sessions found.
              </div>
            ) : (
              filteredActiveList.map(({ trip, assignment, currentLat, currentLng }) => {
                const isSelected = selectedEmpId === trip.employeeId;
                const isGpsActive = trip.gpsStatus === 'GPS Active';

                return (
                  <div
                    key={trip.id}
                    onClick={() => setSelectedEmpId(trip.employeeId)}
                    style={{
                      padding: '12px',
                      borderRadius: '12px',
                      border: isSelected ? '1.5px solid #0E7490' : '1px solid #F1F5F9',
                      backgroundColor: isSelected ? '#ECFEFF' : '#FFFFFF',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {assignment.employeeAvatar ? (
                          <img
                            src={assignment.employeeAvatar}
                            alt={assignment.employeeName}
                            style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '30px',
                              height: '30px',
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
                            {assignment.employeeName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0B1A2D' }}>
                            {assignment.employeeName}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            {assignment.department}
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: isGpsActive ? '#16A34A' : '#EF4444'
                        }}
                      >
                        ● {trip.trackingStatus || (isGpsActive ? 'Tracking Active' : 'GPS Unavailable')}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.74rem', color: '#475569', marginBottom: '4px' }}>
                      <strong>Duty:</strong> {assignment.dutyType === 'Permanent Field' || (assignment as any).isPermanentField ? 'Permanent Field' : assignment.dutyType} • {assignment.customerSiteName || 'Regular Field Duty'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0E7490' }}>
                        {formatKm(trip.totalKm)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingAssignment(assignment);
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          fontSize: '0.72rem',
                          color: '#0E7490',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Eye size={12} />
                        <span>Inspect</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Map */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E7ECF3',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            minHeight: '600px',
            position: 'relative'
          }}
        >
          <TrackingMap
            center={mapCenter}
            zoom={12}
            height="600px"
            markers={markers}
          />

          {/* Quick Legend Overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(4px)',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
              zIndex: 1000,
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0E7490', fontWeight: 700 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0E7490' }} />
              Live Field Staff
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16A34A', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
              GPS Active
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#EF4444', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
              GPS Interrupted
            </span>
          </div>
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
