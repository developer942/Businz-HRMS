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
    <div className="tracking-module-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header (H1 Title & Main Action) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0B1A2D', margin: 0, letterSpacing: '-0.02em' }}>
            Tracking
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#64748B', marginTop: '4px', marginBottom: 0 }}>
            {isCeoOrHr
              ? 'Monitor field duty, site visits and employee travel.'
              : 'Your personal field duty schedule, live trip telemetry, and attendance.'}
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
              borderRadius: '10px',
              width: '38px',
              height: '38px',
              padding: 0,
              fontWeight: 650,
              fontSize: '0.80rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(14, 116, 144, 0.2)',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0891B2')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0E7490')}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Sub-navigation Tabs Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '4px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        {isCeoOrHr ? (
          // CEO / HR Tabs: [Overview, Field Assignments, Live Tracking, Travel History, GPS Alerts]
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setCeoTab('overview')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: ceoTab === 'overview' ? '#0E7490' : 'transparent',
                color: ceoTab === 'overview' ? '#FFFFFF' : '#475569',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <LayoutDashboard size={16} />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setCeoTab('assignments')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: ceoTab === 'assignments' ? '#0E7490' : 'transparent',
                color: ceoTab === 'assignments' ? '#FFFFFF' : '#475569',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <ClipboardList size={16} />
              <span>Field Assignments</span>
            </button>

            <button
              type="button"
              onClick={() => setCeoTab('live')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: ceoTab === 'live' ? '#0E7490' : 'transparent',
                color: ceoTab === 'live' ? '#FFFFFF' : '#475569',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <Navigation size={16} />
              <span>Live Tracking</span>
            </button>

            <button
              type="button"
              onClick={() => setCeoTab('history')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: ceoTab === 'history' ? '#0E7490' : 'transparent',
                color: ceoTab === 'history' ? '#FFFFFF' : '#475569',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <History size={16} />
              <span>Travel History</span>
            </button>

            <button
              type="button"
              onClick={() => setCeoTab('alerts')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: ceoTab === 'alerts' ? '#0E7490' : 'transparent',
                color: ceoTab === 'alerts' ? '#FFFFFF' : '#475569',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <AlertTriangle size={16} />
              <span>GPS Alerts</span>
              {openGpsAlerts > 0 && (
                <span
                  style={{
                    backgroundColor: ceoTab === 'alerts' ? '#FFFFFF' : '#EF4444',
                    color: ceoTab === 'alerts' ? '#0E7490' : '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '9999px'
                  }}
                >
                  {openGpsAlerts}
                </span>
              )}
            </button>
          </div>
        ) : (
          // Employee Tabs: [My Duty, My Trip, My History]
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setEmpTab('duty')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: empTab === 'duty' ? '#0E7490' : 'transparent',
                color: empTab === 'duty' ? '#FFFFFF' : '#475569',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <Briefcase size={16} />
              <span>My Duty</span>
            </button>

            <button
              type="button"
              onClick={() => setEmpTab('trip')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: empTab === 'trip' ? '#0E7490' : 'transparent',
                color: empTab === 'trip' ? '#FFFFFF' : '#475569',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <Route size={16} />
              <span>My Trip</span>
            </button>

            <button
              type="button"
              onClick={() => setEmpTab('history')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: empTab === 'history' ? '#0E7490' : 'transparent',
                color: empTab === 'history' ? '#FFFFFF' : '#475569',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <Clock size={16} />
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
