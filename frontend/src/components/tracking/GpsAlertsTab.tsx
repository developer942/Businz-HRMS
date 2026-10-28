import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Clock, MapPin, Search, Filter, Phone, Check } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { TrackingAlert } from '../../types/tracking';
import { StandardTablePagination } from '../common/StandardTablePagination';

export const GpsAlertsTab: React.FC = () => {
  const { trackingAlerts, resolveTrackingAlert } = useHRMS();

  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | 'Resolved'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination (Strictly [5, 10])
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const filteredAlerts = useMemo(() => {
    return trackingAlerts.filter((alt) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        alt.employeeName.toLowerCase().includes(q) ||
        alt.department.toLowerCase().includes(q) ||
        alt.alertType.toLowerCase().includes(q) ||
        (alt.lastKnownLocation && alt.lastKnownLocation.toLowerCase().includes(q));
      const matchStatus = statusFilter === 'All' || alt.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [trackingAlerts, searchQuery, statusFilter]);

  const paginatedAlerts = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return filteredAlerts;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredAlerts.slice(start, start + pageSize);
  }, [filteredAlerts, currentPage, pageSize]);

  const openCount = trackingAlerts.filter((a) => a.status === 'Open').length;
  const resolvedCount = trackingAlerts.filter((a) => a.status === 'Resolved').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
          GPS Signal & Telemetry Alerts
        </h2>
        <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '3px' }}>
          Monitors GPS signal dropouts, permission revocations, and location delays beyond configurable thresholds.
        </p>
      </div>

      {/* Metric Cards Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '18px 20px',
            border: '1px solid #E7ECF3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>Open GPS Alerts</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: openCount > 0 ? '#EF4444' : '#0B1A2D', marginTop: '4px' }}>
              {openCount}
            </div>
          </div>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: openCount > 0 ? '#FEE2E2' : '#F1F5F9', color: openCount > 0 ? '#EF4444' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} />
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '18px 20px',
            border: '1px solid #E7ECF3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>Resolved Incidents</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
              {resolvedCount}
            </div>
          </div>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '18px 20px',
            border: '1px solid #E7ECF3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>Alert Threshold</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0E7490', marginTop: '6px' }}>
              15 Minutes Outage
            </div>
          </div>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#ECFEFF', color: '#0E7490', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={22} />
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
              placeholder="Search alert by staff or reason..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{ border: 'none', outline: 'none', fontSize: '0.82rem', width: '220px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {(['All', 'Open', 'Resolved'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setStatusFilter(tab);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: statusFilter === tab ? '1px solid #0E7490' : '1px solid #CBD5E1',
                  backgroundColor: statusFilter === tab ? '#0E7490' : '#FFFFFF',
                  color: statusFilter === tab ? '#FFFFFF' : '#475569',
                  transition: 'all 0.15s'
                }}
              >
                {tab}
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
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Alert Condition</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Issue Started</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Last Known Location</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Missing Duration</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '12px 20px', fontWeight: 700, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAlerts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    No alerts found for the selected filter.
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

                  return (
                    <tr
                      key={alt.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: isOpen ? '#FEF2F2' : 'transparent',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      {/* Employee */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 700, color: '#0B1A2D' }}>{alt.employeeName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {alt.employeeId} • {alt.department}
                        </div>
                      </td>

                      {/* Alert Condition */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontWeight: 700,
                            color: isOpen ? '#DC2626' : '#64748B',
                            fontSize: '0.8rem'
                          }}
                        >
                          <AlertTriangle size={14} />
                          <span>{alt.alertType}</span>
                        </span>
                      </td>

                      {/* Issue Started */}
                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {startTimeFormatted}
                      </td>

                      {/* Last Known Location */}
                      <td style={{ padding: '14px 16px', color: '#0B1A2D', fontWeight: 600 }}>
                        {alt.lastKnownLocation || '—'}
                      </td>

                      {/* Missing Duration */}
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

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            backgroundColor: isOpen ? '#FEE2E2' : '#DCFCE7',
                            color: isOpen ? '#DC2626' : '#16A34A'
                          }}
                        >
                          {alt.status}
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
                              gap: '4px'
                            }}
                          >
                            <Check size={12} />
                            <span>Mark Resolved</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Closed</span>
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
