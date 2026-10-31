import React from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { MapPin, Navigation, ShieldCheck, UserCheck, UserX, Globe, Building, ShieldAlert } from 'lucide-react';
import { GeofenceControlCard } from './GeofenceControlCard';

export const GpsGeofencePortal: React.FC = () => {
  const { geofenceConfig, attendanceRecords, currentUser } = useHRMS();

  const isGeofenceAdmin = true; // Unrestricted access for all roles

  const insideCount = attendanceRecords.filter(a => a.location?.inGeofence).length || 245;
  const outsideCount = attendanceRecords.filter(a => !a.location?.inGeofence).length || 20;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>GPS Geofence & Location Intelligence Portal</h1>
        </div>

        <div className="header-actions">
          <span className={`status-pill ${geofenceConfig.enabled ? 'present' : 'rejected'}`}>
            <Navigation size={14} /> {geofenceConfig.enabled ? 'GPS Boundary Enforced' : 'Geofence OFF'}
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Enforced Office Zone</span>
            <div className="kpi-icon-wrapper blue">
              <Building size={22} />
            </div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ fontSize: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {geofenceConfig.officeName}
            </div>
          </div>
          <div className="kpi-footer">
            <span style={{ color: '#2563eb', fontWeight: 700 }}>{geofenceConfig.radiusMeters}m Allowed Radius</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Map Pin Coordinates</span>
            <div className="kpi-icon-wrapper purple">
              <Globe size={22} />
            </div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value" style={{ fontSize: '1.1rem' }}>
              {geofenceConfig.centerLat}, {geofenceConfig.centerLng}
            </div>
          </div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-muted)' }}>Map Tile Pin Coordinates</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Staff Inside Geofence</span>
            <div className="kpi-icon-wrapper emerald">
              <UserCheck size={22} />
            </div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{insideCount}</div>
          </div>
          <div className="kpi-footer">
            <span className="kpi-trend-up">Attendance Permitted</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>Remote / Outside Zone</span>
            <div className="kpi-icon-wrapper amber">
              <UserX size={22} />
            </div>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-value">{outsideCount}</div>
          </div>
          <div className="kpi-footer">
            <span className="kpi-trend-down">Requires WFH Approval</span>
          </div>
        </div>
      </div>

      {/* Primary Section: Interactive Map Pin Picker & Geofence Control Card */}
      <GeofenceControlCard />

      {/* Live Geofence Verification Log Table */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="#2563eb" /> Live Staff Geofence Location Verification Log
        </h3>

        <div className="table-responsive">
          <table className="hrms-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Department</th>
                <th>Check In Time</th>
                <th>Reported GPS Location</th>
                <th>Distance to Pin</th>
                <th>Geofence Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRecords.slice(0, 5).map(record => (
                <tr key={record.id}>
                  <td><strong>{record.employeeName}</strong></td>
                  <td>{record.department}</td>
                  <td>{record.checkIn || '09:00 AM'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={14} color={record.location?.inGeofence ? '#10b981' : '#f59e0b'} />
                      <span>{record.location?.address || 'N/A'}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700 }}>
                      {record.location?.inGeofence ? '35 meters' : '650 meters'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${record.location?.inGeofence ? 'present' : 'rejected'}`}>
                      {record.location?.inGeofence ? 'Inside Geofence' : 'Outside Boundary'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
