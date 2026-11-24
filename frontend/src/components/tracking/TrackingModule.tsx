import React, { useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Navigation,
  History,
  AlertTriangle,
  Briefcase,
  Route,
  Clock,
  Plus
} from 'lucide-react';
import { useHRMS } from '../../context/HRMSContext';
import { TrackingOverview } from './TrackingOverview';
import { FieldAssignmentsTab } from './FieldAssignmentsTab';
import { LiveTrackingTab } from './LiveTrackingTab';
import { TravelHistoryTab } from './TravelHistoryTab';
import { GpsAlertsTab } from './GpsAlertsTab';
import { EmployeeDutyTab } from './EmployeeDutyTab';
import { EmployeeTripTab } from './EmployeeTripTab';
import { EmployeeHistoryTab } from './EmployeeHistoryTab';
import { AssignFieldDutyModal } from './AssignFieldDutyModal';

export type CeoHrTab = 'overview' | 'assignments' | 'live' | 'history' | 'alerts';
export type EmployeeTab = 'duty' | 'trip' | 'history';

export const TrackingModule: React.FC = () => {
  const { currentUser, trackingAlerts } = useHRMS();

  const isCeoOrHr =
    currentUser.role === 'Super Admin' ||
    currentUser.role === 'HR Admin' ||
    currentUser.role === 'HR Manager' ||
    currentUser.role === 'CEO';

  // Active tabs
  const [ceoTab, setCeoTab] = useState<CeoHrTab>('overview');
  const [empTab, setEmpTab] = useState<EmployeeTab>('duty');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);

  const openGpsAlerts = trackingAlerts.filter((a) => a.status === 'Open').length;

  return (
    <div className="tracking-module-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Page Header (H1 Title & Clearly Labeled Primary Action) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.025em' }}>
            Field Duty & GPS Tracking
          </h1>
          <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '3px', marginBottom: 0 }}>
            {isCeoOrHr
              ? 'Real-time employee location, attendance-linked tracking, verified routes, and duty schedules.'
              : 'Your personal field duty schedule, live trip telemetry, and attendance verification.'}
          </p>
        </div>

        {isCeoOrHr && (
          <button
            type="button"
            onClick={() => setIsAssignModalOpen(true)}
            title="Assign Field Duty"
            aria-label="Assign Field Duty"
            style={{
              backgroundColor: '#0E7490',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              padding: '9px 18px',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(14, 116, 144, 0.25)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0891B2';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0E7490';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Assign Field Duty</span>
          </button>
        )}
      </div>

      {/* Modern Segmented Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '2px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {isCeoOrHr ? (
          // CEO / HR Tabs: [Overview, Field Assignments, Live Tracking, Travel History, GPS Alerts]
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#F1F5F9',
              padding: '4px',
              borderRadius: '14px'
            }}
          >
            <button
              type="button"
              onClick={() => setCeoTab('overview')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: ceoTab === 'overview' ? '#FFFFFF' : 'transparent',
                color: ceoTab === 'overview' ? '#0E7490' : '#64748B',
                fontWeight: ceoTab === 'overview' ? 750 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: ceoTab === 'overview' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <LayoutDashboard size={16} strokeWidth={ceoTab === 'overview' ? 2.2 : 1.8} />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setCeoTab('assignments')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: ceoTab === 'assignments' ? '#FFFFFF' : 'transparent',
                color: ceoTab === 'assignments' ? '#0E7490' : '#64748B',
                fontWeight: ceoTab === 'assignments' ? 750 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: ceoTab === 'assignments' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <ClipboardList size={16} strokeWidth={ceoTab === 'assignments' ? 2.2 : 1.8} />
              <span>Field Assignments</span>
            </button>

            <button
              type="button"
              onClick={() => setCeoTab('live')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: ceoTab === 'live' ? '#FFFFFF' : 'transparent',
                color: ceoTab === 'live' ? '#0E7490' : '#64748B',
                fontWeight: ceoTab === 'live' ? 750 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: ceoTab === 'live' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Navigation size={16} strokeWidth={ceoTab === 'live' ? 2.2 : 1.8} />
              <span>Live Tracking</span>
            </button>

            <button
              type="button"
              onClick={() => setCeoTab('history')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: ceoTab === 'history' ? '#FFFFFF' : 'transparent',
                color: ceoTab === 'history' ? '#0E7490' : '#64748B',
                fontWeight: ceoTab === 'history' ? 750 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: ceoTab === 'history' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <History size={16} strokeWidth={ceoTab === 'history' ? 2.2 : 1.8} />
              <span>Travel History</span>
            </button>

            <button
              type="button"
              onClick={() => setCeoTab('alerts')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: ceoTab === 'alerts' ? '#FFFFFF' : 'transparent',
                color: ceoTab === 'alerts' ? '#0E7490' : '#64748B',
                fontWeight: ceoTab === 'alerts' ? 750 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: ceoTab === 'alerts' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <AlertTriangle size={16} strokeWidth={ceoTab === 'alerts' ? 2.2 : 1.8} />
              <span>GPS Alerts</span>
              {openGpsAlerts > 0 && (
                <span
                  style={{
                    backgroundColor: ceoTab === 'alerts' ? '#FEE2E2' : '#EF4444',
                    color: ceoTab === 'alerts' ? '#DC2626' : '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: '9999px',
                    minWidth: '18px',
                    textAlign: 'center'
                  }}
                >
                  {openGpsAlerts}
                </span>
              )}
            </button>
          </div>
        ) : (
          // Employee Tabs: [My Duty, My Trip, My History]
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#F1F5F9',
              padding: '4px',
              borderRadius: '14px'
            }}
          >
            <button
              type="button"
              onClick={() => setEmpTab('duty')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: empTab === 'duty' ? '#FFFFFF' : 'transparent',
                color: empTab === 'duty' ? '#0E7490' : '#64748B',
                fontWeight: empTab === 'duty' ? 750 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: empTab === 'duty' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Briefcase size={16} strokeWidth={empTab === 'duty' ? 2.2 : 1.8} />
              <span>My Duty</span>
            </button>

            <button
              type="button"
              onClick={() => setEmpTab('trip')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: empTab === 'trip' ? '#FFFFFF' : 'transparent',
                color: empTab === 'trip' ? '#0E7490' : '#64748B',
                fontWeight: empTab === 'trip' ? 750 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: empTab === 'trip' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Route size={16} strokeWidth={empTab === 'trip' ? 2.2 : 1.8} />
              <span>My Trip</span>
            </button>

            <button
              type="button"
              onClick={() => setEmpTab('history')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: empTab === 'history' ? '#FFFFFF' : 'transparent',
                color: empTab === 'history' ? '#0E7490' : '#64748B',
                fontWeight: empTab === 'history' ? 750 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: empTab === 'history' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Clock size={16} strokeWidth={empTab === 'history' ? 2.2 : 1.8} />
              <span>My History</span>
            </button>
          </div>
        )}
      </div>

      {/* Tab Views */}
      {isCeoOrHr ? (
        <>
          {ceoTab === 'overview' && <TrackingOverview onOpenAssignModal={() => setIsAssignModalOpen(true)} />}
          {ceoTab === 'assignments' && <FieldAssignmentsTab />}
          {ceoTab === 'live' && <LiveTrackingTab />}
          {ceoTab === 'history' && <TravelHistoryTab />}
          {ceoTab === 'alerts' && <GpsAlertsTab />}
        </>
      ) : (
        <>
          {empTab === 'duty' && <EmployeeDutyTab onGoToTripTab={() => setEmpTab('trip')} />}
          {empTab === 'trip' && <EmployeeTripTab onTripEnded={() => setEmpTab('duty')} />}
          {empTab === 'history' && <EmployeeHistoryTab />}
        </>
      )}

      {/* Field Duty Assignment Modal */}
      {isAssignModalOpen && (
        <AssignFieldDutyModal onClose={() => setIsAssignModalOpen(false)} />
      )}
    </div>
  );
};
