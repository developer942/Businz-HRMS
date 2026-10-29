import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useHRMS } from '../../context/HRMSContext';

// Dashboard stays eager; all feature routes load on demand to keep mobile startup lean.
import { Dashboard } from '../dashboard/Dashboard';
import { MobileBottomNav } from './MobileBottomNav';
import { isCeoOrHrUser } from '../../services/authService';

const EmployeeList = lazy(() => import('../employees/EmployeeList').then(m => ({ default: m.EmployeeList })));
const FaceAttendance = lazy(() => import('../attendance/FaceAttendance').then(m => ({ default: m.FaceAttendance })));
const LeaveManagement = lazy(() => import('../leave/LeaveManagement').then(m => ({ default: m.LeaveManagement })));
const ShiftManagement = lazy(() => import('../shift/ShiftManagement').then(m => ({ default: m.ShiftManagement })));
const TaskManagement = lazy(() => import('../tasks/TaskManagement').then(m => ({ default: m.TaskManagement })));
const ExpenseManagement = lazy(() => import('../finance/ExpenseManagement').then(m => ({ default: m.ExpenseManagement })));
const AttendanceReportsView = lazy(() => import('../attendance/AttendanceReportsView').then(m => ({ default: m.AttendanceReportsView })));
const UserProfile = lazy(() => import('../profile/UserProfile').then(m => ({ default: m.UserProfile })));
const AccountsPaymentDashboard = lazy(() => import('../finance/AccountsPaymentDashboard').then(m => ({ default: m.AccountsPaymentDashboard })));
const AIAssistantWidget = lazy(() => import('../ai/AIAssistantWidget').then(m => ({ default: m.AIAssistantWidget })));

// Secondary heavy modules.
const GpsGeofencePortal = lazy(() => import('../attendance/GpsGeofencePortal').then(m => ({ default: m.GpsGeofencePortal })));
const OvertimeManagementModule = lazy(() => import('../overtime/OvertimeManagementModule').then(m => ({ default: m.OvertimeManagementModule })));
const PerformanceTracking = lazy(() => import('../performance/PerformanceTracking').then(m => ({ default: m.PerformanceTracking })));
const RecruitmentPipeline = lazy(() => import('../recruitment/RecruitmentPipeline').then(m => ({ default: m.RecruitmentPipeline })));
const PayrollManagement = lazy(() => import('../payroll/PayrollManagement').then(m => ({ default: m.PayrollManagement })));
const AdvanceSalaryManagement = lazy(() => import('../payroll/AdvanceSalaryManagement').then(m => ({ default: m.AdvanceSalaryManagement })));
const Organization = lazy(() => import('../organization/Organization').then(m => ({ default: m.Organization })));
const AssetManagement = lazy(() => import('../assets/AssetManagement').then(m => ({ default: m.AssetManagement })));
const Settings = lazy(() => import('../settings/Settings').then(m => ({ default: m.Settings })));
const TrackingModule = lazy(() => import('../tracking/TrackingModule').then(m => ({ default: m.TrackingModule })));
const CustomerModule = lazy(() => import('../customer/CustomerModule').then(m => ({ default: m.CustomerModule })));
const WhatsAppCRMModule = lazy(() => import('../whatsapp-crm/WhatsAppCRMModule').then(m => ({ default: m.WhatsAppCRMModule })));
const PettyCashManagement = lazy(() => import('../petty-cash/PettyCashManagement').then(m => ({ default: m.PettyCashManagement })));

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

    // AI Assistant restricted strictly to HR / CEO roles (Super Admin, CEO, HR)
    const isHrOrCeo = isCeoOrHrUser(currentUser);
    const showChatBot = isHrOrCeo;

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
            case 'face_attendance':
                return <FaceAttendance key="daily" mode="daily" />;
            case 'attendance_log':
                return <FaceAttendance key="log" mode="log" />;
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
            case 'petty_cash':
                return <PettyCashManagement />;
            case 'accounts_payment':
                return <AccountsPaymentDashboard />;
            case 'reports':
                return <AttendanceReportsView />;
            case 'organization':
                return <Organization />;
            case 'assets':
                return <AssetManagement />;
            case 'settings':
                return <Settings onLogout={onLogout} />;
            case 'profile':
                return <UserProfile onLogout={onLogout} isEmbedded={false} />;
            case 'tracking':
                return <TrackingModule />;
            case 'customer_data':
                return <CustomerModule />;
            case 'whatsapp_crm':
                return <WhatsAppCRMModule />;
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
                onLogout={onLogout}
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
                    <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.88rem', fontWeight: 600 }}>Loading...</div>}>
                        {renderModuleView()}
                    </Suspense>
                </main>
            </div>

            {/* Multilingual AI HRMS Assistant Floating Widget (CEO & HR roles) */}
            {showChatBot && (
                <Suspense fallback={null}>
                    <AIAssistantWidget hideDesktopTrigger={!isMobile && activeModule !== 'dashboard'} />
                </Suspense>
            )}

            {/* Role-based Mobile Bottom Navigation (Hidden on desktop > 1024px via CSS) */}
            <MobileBottomNav onOpenSidebar={() => setIsMobileOpen(true)} />
        </div>
    );
};
