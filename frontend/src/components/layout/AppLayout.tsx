import React, { useState, useEffect, Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useHRMS } from '../../context/HRMSContext';

// Dashboard stays eager; all feature routes load on demand to keep mobile startup lean.
import { Dashboard } from '../dashboard/Dashboard';
import { MobileBottomNav } from './MobileBottomNav';
import { isCeoOrHrUser } from '../../services/authService';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { ModuleLoadingFallback } from '../common/ModuleLoadingFallback';

const EmployeeList = lazyWithRetry(() => import('../employees/EmployeeList'), 'EmployeeList');
const FaceAttendance = lazyWithRetry(() => import('../attendance/FaceAttendance'), 'FaceAttendance');
const LeaveManagement = lazyWithRetry(() => import('../leave/LeaveManagement'), 'LeaveManagement');
const ShiftManagement = lazyWithRetry(() => import('../shift/ShiftManagement'), 'ShiftManagement');
const TaskManagement = lazyWithRetry(() => import('../tasks/TaskManagement'), 'TaskManagement');
const ExpenseManagement = lazyWithRetry(() => import('../finance/ExpenseManagement'), 'ExpenseManagement');
const AttendanceReportsView = lazyWithRetry(() => import('../attendance/AttendanceReportsView'), 'AttendanceReportsView');
const UserProfile = lazyWithRetry(() => import('../profile/UserProfile'), 'UserProfile');
const AccountsPaymentDashboard = lazyWithRetry(() => import('../finance/AccountsPaymentDashboard'), 'AccountsPaymentDashboard');
const AIAssistantWidget = lazyWithRetry(() => import('../ai/AIAssistantWidget'), 'AIAssistantWidget');

// Secondary heavy modules.
const GpsGeofencePortal = lazyWithRetry(() => import('../attendance/GpsGeofencePortal'), 'GpsGeofencePortal');
const OvertimeManagementModule = lazyWithRetry(() => import('../overtime/OvertimeManagementModule'), 'OvertimeManagementModule');
const PerformanceTracking = lazyWithRetry(() => import('../performance/PerformanceTracking'), 'PerformanceTracking');
const RecruitmentPipeline = lazyWithRetry(() => import('../recruitment/RecruitmentPipeline'), 'RecruitmentPipeline');
const PayrollManagement = lazyWithRetry(() => import('../payroll/PayrollManagement'), 'PayrollManagement');
const AdvanceSalaryManagement = lazyWithRetry(() => import('../payroll/AdvanceSalaryManagement'), 'AdvanceSalaryManagement');
const Organization = lazyWithRetry(() => import('../organization/Organization'), 'Organization');
const AssetManagement = lazyWithRetry(() => import('../assets/AssetManagement'), 'AssetManagement');
const Settings = lazyWithRetry(() => import('../settings/Settings'), 'Settings');
const TrackingModule = lazyWithRetry(() => import('../tracking/TrackingModule'), 'TrackingModule');
const CustomerModule = lazyWithRetry(() => import('../customer/CustomerModule'), 'CustomerModule');
const WhatsAppCRMModule = lazyWithRetry(() => import('../whatsapp-crm/WhatsAppCRMModule'), 'WhatsAppCRMModule');
const PettyCashManagement = lazyWithRetry(() => import('../petty-cash/PettyCashManagement'), 'PettyCashManagement');

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

    // Idle background preloading of frequently accessed modules to eliminate loading delays
    useEffect(() => {
        const idleCallback = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1500));
        const handle = idleCallback(() => {
            void import('../employees/EmployeeList');
            void import('../leave/LeaveManagement');
            void import('../attendance/AttendanceReportsView');
            void import('../petty-cash/PettyCashManagement');
            void import('../finance/ExpenseManagement');
            void import('../payroll/PayrollManagement');
        });
        return () => {
            if ((window as any).cancelIdleCallback) {
                (window as any).cancelIdleCallback(handle);
            }
        };
    }, []);

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
                    <ErrorBoundary fallbackTitle={`Error loading ${activeModule}`} onReset={() => setActiveModule('dashboard')}>
                        <Suspense fallback={<ModuleLoadingFallback />}>
                            {renderModuleView()}
                        </Suspense>
                    </ErrorBoundary>
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
