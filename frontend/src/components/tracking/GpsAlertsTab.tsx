import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Clock, MapPin, Search, Check } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { TrackingAlert } from '../../types/tracking';
import { StandardTablePagination } from '../common/StandardTablePagination';

export const GpsAlertsTab: React.FC = () => {
  const { trackingAlerts, resolveTrackingAlert } = useHRMS();

  const [filterType, setFilterType] = useState<'All' | 'Active' | 'Offline' | 'Weak' | 'Permission' | 'Resolved'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination (Strictly [5, 10])
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Compute 5 Operational Summary Counts
  const activeCount = trackingAlerts.filter((a) => a.status === 'Open').length;
  const offlineCount = trackingAlerts.filter((a) => a.alertType.includes('Offline') || a.alertType.includes('Lost') || a.alertType.includes('Dropout')).length;
  const weakSignalCount = trackingAlerts.filter((a) => a.alertType.includes('Weak') || a.alertType.includes('Accuracy') || a.alertType.includes('Delay') || a.alertType.includes('Stale')).length;
  const permissionCount = trackingAlerts.filter((a) => a.alertType.includes('Permission') || a.alertType.includes('Revoked') || a.alertType.includes('Disabled')).length;
  const resolvedCount = trackingAlerts.filter((a) => a.status === 'Resolved').length;

  const filteredAlerts = useMemo(() => {
    return trackingAlerts.filter((alt) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        alt.employeeName.toLowerCase().includes(q) ||
        alt.department.toLowerCase().includes(q) ||
        alt.alertType.toLowerCase().includes(q) ||
        (alt.lastKnownLocation && alt.lastKnownLocation.toLowerCase().includes(q));

      const matchType =
        filterType === 'All'
          ? true
          : filterType === 'Active'
          ? alt.status === 'Open'
          : filterType === 'Resolved'
          ? alt.status === 'Resolved'
          : filterType === 'Offline'
          ? alt.alertType.includes('Offline') || alt.alertType.includes('Lost') || alt.alertType.includes('Dropout')
          : filterType === 'Weak'
          ? alt.alertType.includes('Weak') || alt.alertType.includes('Accuracy') || alt.alertType.includes('Delay') || alt.alertType.includes('Stale')
          : filterType === 'Permission'
          ? alt.alertType.includes('Permission') || alt.alertType.includes('Revoked') || alt.alertType.includes('Disabled')
          : true;

      return matchSearch && matchType;
    });
  }, [trackingAlerts, searchQuery, filterType]);

  const paginatedAlerts = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return filteredAlerts;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredAlerts.slice(start, start + pageSize);
  }, [filteredAlerts, currentPage, pageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
          GPS Signal & Telemetry Alerts
        </h2>
        <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '3px' }}>
          Operational monitoring of location timeouts, weak accuracy, device permission drops, and missing GPS telemetry.
        </p>
      </div>

      {/* 5 Summary KPI Count Pills (Clickable to Filter) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
        {/* Metric 1: Active Issues */}
        <div
          onClick={() => {
            setFilterType((prev) => (prev === 'Active' ? 'All' : 'Active'));
            setCurrentPage(1);
          }}
          title="Click to filter active issues"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: filterType === 'Active' ? '2px solid #EF4444' : '1px solid #E7ECF3',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>Active Issues</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: activeCount > 0 ? '#FEE2E2' : '#F1F5F9', color: activeCount > 0 ? '#EF4444' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={15} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: activeCount > 0 ? '#EF4444' : '#0F172A' }}>
            {activeCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: activeCount > 0 ? '#EF4444' : '#10B981', fontWeight: 600, marginTop: '2px' }}>
            {activeCount > 0 ? 'Requires Action' : 'All Clear'}
          </div>
        </div>

        {/* Metric 2: GPS Offline */}
        <div
          onClick={() => {
            setFilterType((prev) => (prev === 'Offline' ? 'All' : 'Offline'));
            setCurrentPage(1);
          }}
          title="Click to filter offline dropouts"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: filterType === 'Offline' ? '2px solid #D97706' : '1px solid #E7ECF3',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>GPS Offline</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={15} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A' }}>
            {offlineCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
            Signal Dropouts
          </div>
        </div>

        {/* Metric 3: Weak Signal */}
        <div
          onClick={() => {
            setFilterType((prev) => (prev === 'Weak' ? 'All' : 'Weak'));
            setCurrentPage(1);
          }}
          title="Click to filter weak signal/accuracy alerts"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: filterType === 'Weak' ? '2px solid #F59E0B' : '1px solid #E7ECF3',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>Weak Signal</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#FFFBEB', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={15} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A' }}>
            {weakSignalCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
            Low Accuracy / Delay
          </div>
        </div>

        {/* Metric 4: Permission Issues */}
        <div
          onClick={() => {
            setFilterType((prev) => (prev === 'Permission' ? 'All' : 'Permission'));
            setCurrentPage(1);
          }}
          title="Click to filter permission revocations"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: filterType === 'Permission' ? '2px solid #DC2626' : '1px solid #E7ECF3',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>Permission Drops</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={15} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A' }}>
            {permissionCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
            Denied / Location Off
          </div>
        </div>

        {/* Metric 5: Resolved Issues */}
        <div
          onClick={() => {
            setFilterType((prev) => (prev === 'Resolved' ? 'All' : 'Resolved'));
            setCurrentPage(1);
          }}
          title="Click to filter resolved issues"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: filterType === 'Resolved' ? '2px solid #16A34A' : '1px solid #E7ECF3',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 650, color: '#64748B' }}>Resolved Issues</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#16A34A' }}>
            {resolvedCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 600, marginTop: '2px' }}>
            Reconnected & Fixed
          </div>
        </div>
      </div>

      {/* Main Alert Log Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}
      >
        {/* Table Filter Bar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E7ECF3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#FAFCFE'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 12px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF'
            }}
          >
            <Search size={15} color="#94A3B8" />
            <input
              type="text"
              placeholder="Search alert by staff, dept or reason..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{ border: 'none', outline: 'none', fontSize: '0.82rem', width: '240px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['All', 'Active', 'Offline', 'Weak', 'Permission', 'Resolved'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setFilterType(tab);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: filterType === tab ? '1px solid #0E7490' : '1px solid #CBD5E1',
                  backgroundColor: filterType === tab ? '#0E7490' : '#FFFFFF',
                  color: filterType === tab ? '#FFFFFF' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab === 'Active' ? 'Active Issues' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 20px', fontWeight: 700 }}>Employee</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Alert Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Alert Start Time</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Last Valid Location</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Outage Duration</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Resolution Status</th>
                <th style={{ padding: '12px 20px', fontWeight: 700, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAlerts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    <div style={{ maxWidth: '300px', margin: '0 auto' }}>
                      <CheckCircle2 size={36} color="#16A34A" style={{ margin: '0 auto 10px auto', display: 'block' }} />
                      <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.94rem' }}>No GPS Alerts</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                        All tracked devices are reporting valid telemetry without interruptions.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedAlerts.map((alt) => {
                  const isOpen = alt.status === 'Open';
                  const startTimeFormatted = new Date(alt.issueStartTime).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  });

                  // Meaningful operational colors
                  const isSevere = alt.alertType.includes('Permission') || alt.alertType.includes('Disabled') || alt.alertType.includes('Offline');
                  const alertBadgeColor = isOpen ? (isSevere ? '#DC2626' : '#D97706') : '#16A34A';
                  const alertBgColor = isOpen ? (isSevere ? '#FEF2F2' : '#FFFBEB') : '#F0FDF4';

                  return (
                    <tr
                      key={alt.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: isOpen ? (isSevere ? '#FFF5F5' : '#FFFDF5') : 'transparent',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isOpen ? (isSevere ? '#FFF5F5' : '#FFFDF5') : 'transparent')}
                    >
                      {/* Employee */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 700, color: '#0B1A2D' }}>{alt.employeeName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {alt.employeeId} • {alt.department}
                        </div>
                      </td>

                      {/* Alert Type */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 700,
                            color: alertBadgeColor,
                            fontSize: '0.78rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: alertBgColor
                          }}
                        >
                          <AlertTriangle size={13} />
                          <span>{alt.alertType}</span>
                        </span>
                      </td>

                      {/* Alert Start Time */}
                      <td style={{ padding: '14px 16px', color: '#475569', fontWeight: 600 }}>
                        {startTimeFormatted}
                      </td>

                      {/* Last Valid Location (clamped 2 lines) */}
                      <td style={{ padding: '14px 16px', maxWidth: '220px' }}>
                        <div
                          title={alt.lastKnownLocation || 'Unknown Location'}
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            color: '#0B1A2D',
                            lineHeight: 1.35
                          }}
                        >
                          {alt.lastKnownLocation || '—'}
                        </div>
                      </td>

                      {/* Outage Duration */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            backgroundColor: isOpen ? '#FEE2E2' : '#F1F5F9',
                            color: isOpen ? '#B91C1C' : '#475569',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}
                        >
                          {alt.durationMinutes ? `${alt.durationMinutes} mins` : '—'}
                        </span>
                      </td>

                      {/* Resolution Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: 750,
                            backgroundColor: isOpen ? '#FEE2E2' : '#DCFCE7',
                            color: isOpen ? '#DC2626' : '#16A34A',
                            border: isOpen ? '1px solid #FECACA' : '1px solid #BBF7D0'
                          }}
                        >
                          {isOpen ? 'Active Issue' : 'Resolved'}
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        {isOpen ? (
                          <button
                            type="button"
                            onClick={() => resolveTrackingAlert(alt.id)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#16A34A',
                              color: '#FFFFFF',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 1px 3px rgba(22, 163, 74, 0.25)'
                            }}
                          >
                            <Check size={12} />
                            <span>Mark Resolved</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.76rem', color: '#94A3B8', fontWeight: 600 }}>Resolved</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <StandardTablePagination
          currentPage={currentPage}
          totalEntries={filteredAlerts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10]}
        />
      </div>
    </div>
  );
};
