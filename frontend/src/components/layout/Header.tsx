import React, { useState, useRef, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Bell, 
  Plus, 
  ChevronDown, 
  Menu, 
  LogOut, 
  User,
  UserPlus,
  Clock,
  CalendarPlus,
  CheckSquare,
  Receipt,
  Banknote,
  X,
  CheckCheck
} from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export type QuickAddType = 'employee' | 'leave' | 'task' | 'expense' | 'overtime' | 'shift' | 'advance_salary';

interface HeaderProps {
  toggleSidebar: () => void;
  isSidebarCollapsed: boolean;
  onLogout?: () => void;
  onOpenQuickAdd: (type: QuickAddType) => void;
}

export const Header: React.FC<HeaderProps> = ({
  toggleSidebar,
  onLogout,
  onOpenQuickAdd
}) => {
  const { 
    currentUser, 
    activeModule,
    businessSettings,
    notifications, 
    markNotificationRead, 
    markAllNotificationsRead,
    searchQuery, 
    setSearchQuery,
    setActiveModule,
    setActiveSettingsTab
  } = useHRMS();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showQuickAddMenu, setShowQuickAddMenu] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const quickAddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setShowNotifications(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
      if (quickAddRef.current && !quickAddRef.current.contains(target)) {
        setShowQuickAddMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifications(false);
        setShowProfileMenu(false);
        setShowQuickAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Role resolution for Quick Add options
  const userRole = (currentUser?.role as string) || '';
  const isSuperAdminOrCEO = 
    userRole === 'Super Admin' || 
    userRole === 'CEO' || 
    userRole === 'Management' || 
    userRole === 'ERP Administrator' ||
    currentUser?.designation === 'CEO' || 
    currentUser?.employeeId === 'EMP-000' ||
    (currentUser?.designation && currentUser.designation.toLowerCase().includes('ceo')) || 
    (currentUser?.designation && currentUser.designation.toLowerCase().includes('director'));

  const isHR = 
    userRole === 'HR Admin' || 
    userRole === 'HR Manager' || 
    userRole === 'HR' || 
    (currentUser?.department && currentUser.department.toLowerCase().includes('hr')) ||
    (currentUser?.designation && currentUser.designation.toLowerCase().includes('hr'));

  const isManager = 
    userRole === 'Manager' || 
    userRole === 'Department Manager' || 
    userRole === 'Department Head' || 
    userRole === 'Team Lead' || 
    userRole.toLowerCase().includes('manager') || 
    userRole.toLowerCase().includes('lead');

  const isAdminOrHR = isSuperAdminOrCEO || isHR;
  const isGeneralEmployee = !isAdminOrHR && !isManager;

  const unreadCount = notifications.filter(n => !n.read).length;

  const getModuleTitle = (mod: string): string => {
    switch (mod) {
      case 'dashboard': return 'Dashboard';
      case 'employees': return 'Employee Directory';
      case 'organization': return 'Organization';
      case 'face_attendance': return 'Live Face Attendance';
      case 'attendance': return 'Attendance Management';
      case 'leaves': return currentUser.role === 'Employee' ? 'Leave Request' : 'Leave Management';
      case 'shifts': return currentUser.role === 'Employee' ? 'My Shift' : 'Shift Management';
      case 'overtime': return currentUser.role === 'Employee' ? 'My Overtime Requests' : 'Overtime Management';
      case 'tasks': return 'Tasks';
      case 'performance': return 'Performance';
      case 'notifications': return 'Notifications';
      case 'recruitment': return currentUser.role === 'Employee' ? 'Referral Portal' : 'Recruitment';
      case 'finance': return 'Finance & Expenses';
      case 'payroll': return 'Payroll';
      case 'advance_salary': return currentUser.role === 'Employee' ? 'My Advance Salary' : 'Advance Salary Management';
      case 'reports': return 'Attendance Reports';
      case 'assets': return currentUser.role === 'Employee' ? 'My Assets' : 'Asset Management';
      case 'settings': return 'Settings';
      case 'profile': return 'My Profile';
      case 'tracking': return currentUser.role === 'Employee' ? 'My Field Duty & Tracking' : 'Field Duty & GPS Tracking';
      default: return 'Dashboard';
    }
  };

  const userInitial = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U';

  return (
    <header className="hrms-header">
      <div className="header-left">
        <button 
          className="sidebar-toggle-btn"
          onClick={toggleSidebar}
          title="Toggle Sidebar"
          aria-label="Toggle Sidebar"
        >
          <Menu size={18} />
        </button>

        {/* Breadcrumb Title */}
        <div className="header-breadcrumb">
          <span className="header-module-title">
            {getModuleTitle(activeModule)}
          </span>
        </div>
      </div>

      <div className="header-right">
        {/* Quick Add Menu */}
        <div ref={quickAddRef} style={{ position: 'relative' }}>
          <button 
            className="header-quick-add-btn"
            onClick={() => {
              setShowQuickAddMenu(prev => !prev);
              setShowNotifications(false);
              setShowProfileMenu(false);
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span className="quick-add-text">Quick Add</span>
            <ChevronDown size={13} strokeWidth={2.5} className="quick-add-chevron" />
          </button>

          {showQuickAddMenu && (
            <>
              <div 
                style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
                onClick={() => setShowQuickAddMenu(false)} 
              />
              <div className="card" style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '215px',
                maxWidth: 'calc(100vw - 32px)',
                padding: '6px',
                zIndex: 50,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}>
                {/* 1. ADMIN & HR ACTIONS (CEO, Super Admin, HR Manager, HR Admin) */}
                {isAdminOrHR && (
                  <>
                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('employee'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#ECFEFF', color: '#0E7490', flexShrink: 0 }}>
                        <UserPlus size={14} />
                      </span>
                      <span>Onboard Employee</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('shift'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#FEF3C7', color: '#D97706', flexShrink: 0 }}>
                        <Clock size={14} />
                      </span>
                      <span>Add Shift Schedule</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('task'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#EFF6FF', color: '#2563EB', flexShrink: 0 }}>
                        <CheckSquare size={14} />
                      </span>
                      <span>Assign Task</span>
                    </button>
                  </>
                )}

                {/* 2. MANAGER / TEAM LEAD ACTIONS */}
                {isManager && !isAdminOrHR && (
                  <>
                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('task'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#EFF6FF', color: '#2563EB', flexShrink: 0 }}>
                        <CheckSquare size={14} />
                      </span>
                      <span>Assign Team Task</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('shift'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#FEF3C7', color: '#D97706', flexShrink: 0 }}>
                        <Clock size={14} />
                      </span>
                      <span>Manage Shift Roster</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('leave'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#ECFDF5', color: '#059669', flexShrink: 0 }}>
                        <CalendarPlus size={14} />
                      </span>
                      <span>Apply Leave</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('advance_salary'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#F0FDF4', color: '#16A34A', flexShrink: 0 }}>
                        <Banknote size={14} />
                      </span>
                      <span>Advance Salary / Loan</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('expense'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#FAF5FF', color: '#9333EA', flexShrink: 0 }}>
                        <Receipt size={14} />
                      </span>
                      <span>Submit Expense Claim</span>
                    </button>
                  </>
                )}

                {/* 3. STANDARD EMPLOYEE ACTIONS */}
                {isGeneralEmployee && (
                  <>
                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('leave'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#ECFDF5', color: '#059669', flexShrink: 0 }}>
                        <CalendarPlus size={14} />
                      </span>
                      <span>Apply Leave</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('shift'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#FEF3C7', color: '#D97706', flexShrink: 0 }}>
                        <Clock size={14} />
                      </span>
                      <span>Request Shift Swap</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('advance_salary'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#F0FDF4', color: '#16A34A', flexShrink: 0 }}>
                        <Banknote size={14} />
                      </span>
                      <span>Request Advance Salary</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('expense'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#FAF5FF', color: '#9333EA', flexShrink: 0 }}>
                        <Receipt size={14} />
                      </span>
                      <span>Submit Expense Claim</span>
                    </button>

                    <button
                      type="button"
                      className="dropdown-menu-item"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onOpenQuickAdd('task'); 
                        setShowQuickAddMenu(false); 
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#EFF6FF', color: '#2563EB', flexShrink: 0 }}>
                        <CheckSquare size={14} />
                      </span>
                      <span>Create Personal Task</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>


        {/* Notifications Circle Action Button (Matches Reference Bell Icon Button) */}
        <div ref={notificationsRef} style={{ position: 'relative' }}>
          <button 
            className="header-action-circle-btn" 
            onClick={() => {
              setShowNotifications(prev => !prev);
              setShowQuickAddMenu(false);
              setShowProfileMenu(false);
            }}
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={18} strokeWidth={2.2} />
            {unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="card" style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: '360px',
              maxWidth: 'calc(100vw - 32px)',
              padding: '16px',
              zIndex: 100,
              boxShadow: 'var(--shadow-xl)',
              maxHeight: '440px',
              overflowY: 'auto',
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #E2E8F0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0B1A2D', margin: 0 }}>
                  Notifications ({notifications.length})
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAllNotificationsRead();
                      }}
                      style={{
                        fontSize: '0.72rem',
                        color: '#0E7490',
                        fontWeight: 700,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                      title="Mark all notifications as read"
                    >
                      <CheckCheck size={13} /> Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748B',
                      padding: '2px 4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: '4px'
                    }}
                    title="Close notifications"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {notifications.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No notifications</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {notifications.map(n => (
                    <div 
                      key={n.id}
                      onClick={() => {
                        markNotificationRead(n.id);
                        setShowNotifications(false);
                        const targetMod = n.link || (
                          n.category === 'Leave' ? 'leaves' :
                          n.category === 'Shift' ? 'shifts' :
                          n.category === 'Task' ? 'tasks' :
                          n.category === 'Payroll' ? 'payroll' :
                          n.category === 'Attendance' ? 'attendance' : undefined
                        );
                        if (targetMod && typeof setActiveModule === 'function') {
                          setActiveModule(targetMod as any);
                        }
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: n.read ? '#ffffff' : '#ECFEFF',
                        border: n.read ? '1px solid #E2E8F0' : '1px solid #A5F3FC',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = n.read ? '#F8FAFC' : '#E0F2FE';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = n.read ? '#ffffff' : '#ECFEFF';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 750, color: '#0B1A2D' }}>
                          {n.title}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: '#64748B' }}>{formatDateDDMMYYYY(n.createdAt || new Date())}</span>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.35 }}>{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile Pill with White Avatar (Matches Reference Header) */}
        <div ref={profileMenuRef} style={{ position: 'relative' }}>
          <div 
            className="user-profile-btn" 
            onClick={() => {
              setShowProfileMenu(prev => !prev);
              setShowQuickAddMenu(false);
              setShowNotifications(false);
            }}
          >
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.name} className="user-avatar" />
            ) : (
              <div className="user-avatar-circle">
                {userInitial}
              </div>
            )}
            <div className="user-info">
              <span className="user-name">{currentUser.name}</span>
              <span className="user-role-label">
                {currentUser.designation || (currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role)}
              </span>
            </div>
            <ChevronDown className="user-chevron" size={14} color="#FFFFFF" strokeWidth={2.4} style={{ opacity: 0.85 }} />
          </div>

          {showProfileMenu && (
            <>
              <div 
                style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
                onClick={() => setShowProfileMenu(false)} 
              />
              <div className="card" style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '220px',
                maxWidth: 'calc(100vw - 32px)',
                padding: '8px',
                zIndex: 50,
                boxShadow: 'var(--shadow-xl)',
                backgroundColor: '#ffffff',
                borderRadius: '14px'
              }}>
                <div style={{ padding: '6px 10px 10px', borderBottom: '1px solid #E2E8F0', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0B1A2D' }}>{currentUser.name}</div>
                  <div style={{ fontSize: '0.74rem', color: '#0E7490', fontWeight: 700 }}>{currentUser.designation || (currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{currentUser.email}</div>
                </div>

                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => { 
                    setActiveModule('settings'); 
                    setActiveSettingsTab('my_profile');
                    setShowProfileMenu(false); 
                  }}
                >
                  <User size={16} /> My Profile
                </button>

                <div style={{ borderTop: '1px solid #E2E8F0', margin: '4px 0' }} />
                <button
                  type="button"
                  className="dropdown-menu-item danger"
                  onClick={() => { 
                    setShowProfileMenu(false); 
                    if (onLogout) onLogout(); 
                  }}
                >
                  <LogOut size={16} /> Log Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
