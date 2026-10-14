import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useHRMS } from '../../context/HRMSContext';

// Import Module Views (to be built)
import { Dashboard } from '../dashboard/Dashboard';
import { EmployeeList } from '../employees/EmployeeList';
import { FaceAttendance } from '../attendance/FaceAttendance';
import { AttendanceList } from '../attendance/AttendanceList';
import { AttendanceManagementModule } from '../attendance/AttendanceManagementModule';
import { AttendanceHub } from '../attendance/AttendanceHub';
import { GpsGeofencePortal } from '../attendance/GpsGeofencePortal';
import { LeaveManagement } from '../leave/LeaveManagement';
import { ShiftManagement } from '../shift/ShiftManagement';
import { OvertimeManagementModule } from '../overtime/OvertimeManagementModule';
import { PerformanceTracking } from '../performance/PerformanceTracking';
import { TaskManagement } from '../tasks/TaskManagement';
import { RecruitmentPipeline } from '../recruitment/RecruitmentPipeline';
import { ExpenseManagement } from '../finance/ExpenseManagement';
import { PayrollManagement } from '../payroll/PayrollManagement';
import { AdvanceSalaryManagement } from '../payroll/AdvanceSalaryManagement';
import { ReportsAnalytics } from '../reports/ReportsAnalytics';
import { AttendanceReportsView } from '../attendance/AttendanceReportsView';
import { Organization } from '../organization/Organization';
import { AssetManagement } from '../assets/AssetManagement';
import { Settings } from '../settings/Settings';
import { UserProfile } from '../profile/UserProfile';
import { TrackingModule } from '../tracking/TrackingModule';
import { AIAssistantWidget } from '../ai/AIAssistantWidget';
import { isCeoOrHrUser } from '../../services/authService';

interface AppLayoutProps {
  onLogout?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ onLogout }) => {
  // Folded by default: expands automatically on cursor hover, folds on mouse leave
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => 
    typeof window !== 'undefined' ? window.innerWidth <= 1024 : false
  );
  const { activeModule, setActiveModule, hasPermission, currentUser, switchRole } = useHRMS();

  // AI Assistant restricted strictly to HR / CEO roles, and ONLY rendered on the CEO/HR Dashboard page
  const isHrOrCeo = isCeoOrHrUser(currentUser);
  const showChatBot = isHrOrCeo && activeModule === 'dashboard';

  // Quick Add modal states
  const [quickAddModal, setQuickAddModal] = useState<'employee' | 'leave' | 'wfh' | 'task' | 'expense' | 'overtime' | 'shift' | 'advance_salary' | null>(null);

  useEffect(() => {
    (window as any).__setModule = (mod: string) => setActiveModule(mod as any);
    (window as any).__switchRole = (role: string) => switchRole(role as any);
  }, [setActiveModule, switchRole]);

  // Monitor viewport resize for responsive mobile detection
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile sidebar on module change
  const handleSelectModule = (mod: any) => {
    setActiveModule(mod);
    if (isMobile) {
      setIsMobileOpen(false);
    }
  };

  const toggleSidebar = () => {
    if (isMobile) {
      setIsMobileOpen(prev => !prev);
    } else {
      setIsPinned(prev => !prev);
    }
  };

  const isExpanded = isMobile ? isMobileOpen : (isPinned || isHovered);

  const renderModuleView = () => {
    // RBAC Security Check
    if (!hasPermission(activeModule, 'view')) {
      return (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h2 style={{ fontSize: '1.4rem', color: 'var(--accent-rose)', marginBottom: '12px' }}>Access Restricted</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Your current role does not have permission to view the <strong>{activeModule}</strong> module.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
            Use the <strong>Role Switcher</strong> in the top header to change your role (e.g. to Super Admin) to access this page.
          </p>
        </div>
      );
    }

    switch (activeModule) {
      case 'dashboard':
        return <Dashboard />;
      case 'employees':
        return <EmployeeList openAddModal={quickAddModal === 'employee'} onCloseQuickAdd={() => setQuickAddModal(null)} />;
      case 'face_attendance': {
        const isCEO = 
          currentUser.role === 'CEO' || 
          currentUser.designation === 'CEO' || 
          (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo')) || 
          currentUser.employeeId === 'EMP-000';
        return isCEO ? (
          <AttendanceReportsView 
            title="Attendance Management" 
            subtitle="Executive attendance logs, muster roll verification, and departmental reports." 
          />
        ) : (
          <FaceAttendance />
        );
      }
      case 'attendance':
        return <AttendanceReportsView title="Attendance Management" subtitle="Real-time attendance logs, muster roll verification, and departmental reports." />;
      case 'gps_geofence':
        return <GpsGeofencePortal />;
      case 'leaves':
        return <LeaveManagement openApplyModal={quickAddModal === 'leave'} openWfhModal={quickAddModal === 'wfh'} onCloseQuickAdd={() => setQuickAddModal(null)} />;
      case 'shifts':
        return <ShiftManagement openAddModal={quickAddModal === 'shift'} onCloseQuickAdd={() => setQuickAddModal(null)} />;
      case 'overtime':
        return <OvertimeManagementModule openRequestModal={quickAddModal === 'overtime'} onCloseQuickAdd={() => setQuickAddModal(null)} />;
      case 'performance':
        return <PerformanceTracking />;
      case 'tasks':
        return <TaskManagement openAddModal={quickAddModal === 'task'} onCloseQuickAdd={() => setQuickAddModal(null)} />;
      case 'recruitment':
        return <RecruitmentPipeline />;
      case 'finance':
        return <ExpenseManagement openAddModal={quickAddModal === 'expense'} onCloseQuickAdd={() => setQuickAddModal(null)} />;
      case 'payroll':
        return <PayrollManagement />;
      case 'advance_salary':
        return <AdvanceSalaryManagement openAddModal={quickAddModal === 'advance_salary'} onCloseQuickAdd={() => setQuickAddModal(null)} />;
      case 'reports':
        return <AttendanceReportsView />;
      case 'organization':
        return <Organization />;
      case 'assets':
        return <AssetManagement />;
      case 'settings':
        return <Settings onLogout={onLogout} />;
      case 'profile':
        return <Settings onLogout={onLogout} initialSection="my_profile" />;
      case 'tracking':
        return <TrackingModule />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="hrms-layout">
      {/* Mobile Drawer Backdrop Overlay */}
      {isMobile && isMobileOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setIsMobileOpen(false)}
          aria-label="Close Sidebar Overlay"
        />
      )}

      <Sidebar 
        isCollapsed={!isExpanded} 
        isPinned={isPinned}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        onTogglePin={() => setIsPinned(prev => !prev)}
        onHoverChange={(hovered) => {
          if (!isMobile) setIsHovered(hovered);
        }}
        toggleSidebar={toggleSidebar} 
      />

      <div className={`hrms-main-wrapper ${!isExpanded ? 'sidebar-collapsed' : ''}`}>
        <Header 
          toggleSidebar={toggleSidebar} 
          isSidebarCollapsed={!isExpanded}
          onLogout={onLogout}
          onOpenQuickAdd={(type) => {
            if (type === 'employee') handleSelectModule('employees');
            if (type === 'leave') handleSelectModule('leaves');
            if (type === 'shift') handleSelectModule('shifts');
            if (type === 'task') handleSelectModule('tasks');
            if (type === 'expense') handleSelectModule('finance');
            if (type === 'overtime') handleSelectModule('overtime');
            if (type === 'advance_salary') handleSelectModule('advance_salary');
            setQuickAddModal(type);
          }}
        />

        <main className="hrms-content">
          {renderModuleView()}
        </main>
      </div>

      {/* Multilingual AI HRMS Assistant Floating Widget (CEO & HR on dashboard page only) */}
      {showChatBot && <AIAssistantWidget />}
    </div>
  );
};
