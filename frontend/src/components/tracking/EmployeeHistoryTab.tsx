import React, { useState, useMemo } from 'react';
import { MapPin, Eye, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { FieldAssignment, FieldTripSession } from '../../types/tracking';
import { StandardTablePagination } from '../common/StandardTablePagination';
import { EmployeeFieldActivityModal } from './EmployeeFieldActivityModal';
import { formatKm, formatTimeAmPm } from '../../services/trackingEngine';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export const EmployeeHistoryTab: React.FC = () => {
  const { currentUser, fieldAssignments, tripSessions } = useHRMS();

  const [inspectingAssignment, setInspectingAssignment] = useState<FieldAssignment | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // STRICTLY SCOPED to logged in employee only!
  const myRecords = useMemo(() => {
    return fieldAssignments
      .filter((a) => {
        return (
          a.employeeId === currentUser.employeeId ||
          a.employeeId === currentUser.id ||
          a.employeeName.toLowerCase().includes(currentUser.name.toLowerCase())
        );
      })
      .map((assignment) => {
        const trip = tripSessions.find((t) => t.assignmentId === assignment.id) ||
                     tripSessions.find((t) => t.employeeId === assignment.employeeId);

        const startTime = trip?.tripStartTime
          ? new Date(trip.tripStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
          : formatTimeAmPm(assignment.startTime);

        const endTime = trip?.tripEndTime
          ? new Date(trip.tripEndTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
          : (assignment.status === 'Completed' ? formatTimeAmPm(assignment.endTime) : '—');

        return {
          id: assignment.id,
          assignment,
          trip,
          date: assignment.startDate,
          dutyType: assignment.dutyType,
          customerSiteName: assignment.customerSiteName,
          siteAddress: assignment.siteAddress,
          startTime,
          endTime,
          kmTravelled: trip?.totalKm || 0,
          status: trip?.status || assignment.status
        };
      });
  }, [fieldAssignments, tripSessions, currentUser]);

  const paginatedData = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      return myRecords;
    }
    const start = (currentPage - 1) * pageSize;
    return myRecords.slice(start, start + pageSize);
  }, [myRecords, currentPage, pageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
          My Travel & Field History
        </h2>
        <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '3px' }}>
          Your personal duty assignments, logged travel distances, and verified field attendance history.
        </p>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 20px', fontWeight: 700 }}>Date</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Duty Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Customer / Site</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Start Time</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>End Time</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>KM Travelled</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '12px 20px', fontWeight: 700, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8' }}>
                    No field duty history records found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((rec) => (
                  <tr
                    key={rec.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '14px 20px', color: '#0B1A2D', fontWeight: 600 }}>
                      {formatDateDDMMYYYY(rec.date)}
                    </td>

                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          backgroundColor: rec.dutyType === 'Site Visit' ? '#FEF3C7' : '#F1F5F9',
                          color: rec.dutyType === 'Site Visit' ? '#B45309' : '#334155',
                          whiteSpace: 'nowrap',
                          display: 'inline-block'
                        }}
                      >
                        {rec.dutyType}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', maxWidth: '240px' }}>
                      <div style={{ fontWeight: 700, color: '#0B1A2D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rec.customerSiteName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rec.siteAddress}
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      {rec.startTime}
                    </td>

                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      {rec.endTime}
                    </td>

                    <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0E7490' }}>
                      {formatKm(rec.kmTravelled)}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          backgroundColor: rec.status === 'Completed' ? '#DCFCE7' : '#ECFEFF',
                          color: rec.status === 'Completed' ? '#16A34A' : '#0E7490'
                        }}
                      >
                        {rec.status}
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setInspectingAssignment(rec.assignment)}
                        title="View Route"
                        aria-label="View Route"
                        style={{
                          backgroundColor: '#FFFFFF',
                          color: '#0E7490',
                          border: '1px solid #A5F3FC',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ECFEFF')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                      >
                        <MapPin size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <StandardTablePagination
          currentPage={currentPage}
          totalEntries={myRecords.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10]}
        />
      </div>

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
