import React, { useState, useRef, useEffect } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { ModuleName } from '../../types/hrms';
import { 
  LayoutDashboard, 
  Users, 
  ScanFace, 
  CalendarCheck, 
  CalendarDays, 
  Clock, 
  TrendingUp, 
  CheckSquare, 
  Briefcase, 
  IndianRupee, 
  CreditCard, 
  Settings as SettingsIcon,
  Laptop,
  ChevronsLeft,
  ChevronsRight,
  Banknote,
  Wallet,
  Timer,
  Search,
  MapPin,
  Pin,
  PinOff,
  X,
  MessageSquare,
  Receipt,
  ChevronRight,
  Bell,
  LogOut,
  Contact2
} from 'lucide-react';
import { pettyCashService } from '../../services/pettyCashService';

interface SidebarProps {
  isCollapsed?: boolean;
  toggleSidebar?: () => void;
  isPinned?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onTogglePin?: () => void;
  onHoverChange?: (hovered: boolean) => void;
  onLogout?: () => void;
}

interface MenuItem {
  id: ModuleName;
  label: string;
  icon: React.ElementType;
  section: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isCollapsed = true, 
  toggleSidebar, 
  isPinned = false, 
  isMobileOpen = false,
  onCloseMobile,
  onTogglePin,
  onHoverChange,
  onLogout
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
    onHoverChange?.(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isSearchActive) {
        setIsHovered(false);
        onHoverChange?.(false);
      }
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const effectiveExpanded = isMobileOpen || isPinned || isHovered || isSearchActive;
  const effectiveCollapsed = !effectiveExpanded;

  const { 
    activeModule, 
    setActiveModule, 
    hasPermission, 
    currentUser,
    businessSettings,
    tasks = [],
    enhancedTasks = [],
    notifications = [],
    leaveRequests = [],
    loanRecords = [],
    expenses = [],
    overtimeRequests = [],
    missedPunchRequests = [],
    shiftRequests = [],
    candidates = [],
    trackingAlerts = []
  } = useHRMS();

  const [searchFilter, setSearchFilter] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Active Petty Cash Custodian detection for sidebar RBAC isolation
  const [activeCustodianId, setActiveCustodianId] = useState<string | null>(null);
  useEffect(() => {
    pettyCashService.getActiveCustodianAccount().then((acc) => {
      if (acc) {
        setActiveCustodianId(acc.custodian_id || acc.custodian_employee_id);
      }
    }).catch(() => {});
  }, []);

  // Keyboard shortcut (⌘K / Ctrl+K) to quickly focus sidebar search, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchActive(true);
        setIsHovered(true);
        onHoverChange?.(true);
        setTimeout(() => searchInputRef.current?.focus(), 60);
      } else if (e.key === 'Escape' && isSearchActive) {
        setIsSearchActive(false);
        setSearchFilter('');
        searchInputRef.current?.blur();
        if (!isPinned) {
          setIsHovered(false);
          onHoverChange?.(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchActive, isPinned, onHoverChange]);

  const handleSearchBlur = () => {
    if (!searchFilter.trim() && !isPinned) {
      setTimeout(() => {
        setIsSearchActive(false);
        setIsHovered(false);
        onHoverChange?.(false);
      }, 150);
    }
  };

  const isHRorAdmin = 
    currentUser.role === 'Super Admin' || 
    currentUser.role === 'Admin' || 
    currentUser.role === 'CEO' || 
    currentUser.role === 'HR Admin' || 
    currentUser.role === 'HR Manager' || 
    currentUser.role === 'HR' || 
    currentUser.role === 'Management' || 
    currentUser.role === 'ERP Administrator' ||
    (currentUser.department && (currentUser.department.toLowerCase() === 'hr' || currentUser.department.toLowerCase() === 'human resources')) ||
    (currentUser.designation && currentUser.designation.toLowerCase().includes('hr')) ||
    currentUser.designation === 'CEO' ||
    (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo'));

  const isAccountsStaff = 
    currentUser.role === 'Finance Manager' ||
    (currentUser.department && (currentUser.department.toLowerCase().includes('accounts') || currentUser.department.toLowerCase().includes('finance'))) ||
    (currentUser.designation && (currentUser.designation.toLowerCase().includes('account') || currentUser.designation.toLowerCase().includes('finance')));

  // Standardized VRM Enterprise Sidebar Menu
  const menuStructure: MenuItem[] = [
    // Organization & Staffing
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'ORGANIZATION' },
    { id: 'employees', label: 'Employee Directory', icon: Users, section: 'ORGANIZATION' },

    // Time & Attendance
    { id: 'face_attendance', label: 'Live Face Attendance', icon: ScanFace, section: 'TIME & ATTENDANCE' },
    { id: 'attendance', label: 'Attendance Management', icon: CalendarCheck, section: 'TIME & ATTENDANCE' },
    { 
      id: 'leaves', 
      label: (currentUser.role === 'Employee' && !isHRorAdmin) ? 'Leave Request' : 'Leave Management', 
      icon: CalendarDays, 
      section: 'TIME & ATTENDANCE' 
    },
    { 
      id: 'shifts', 
      label: (currentUser.role === 'Employee' && !isHRorAdmin) ? 'My Shift' : 'Shift Management', 
      icon: Clock, 
      section: 'TIME & ATTENDANCE' 
    },

    { id: 'tasks', label: 'Tasks', icon: CheckSquare, section: 'WORKFLOW & OPS' },
    { id: 'tracking', label: 'Tracking', icon: MapPin, section: 'WORKFLOW & OPS' },
    { id: 'customer_data', label: 'Contact Card Scanner', icon: Contact2, section: 'WORKFLOW & OPS' },
    { id: 'whatsapp_crm', label: 'WhatsApp CRM', icon: MessageSquare, section: 'WORKFLOW & OPS' },
    { 
      id: 'performance', 
      label: (currentUser.role === 'Employee' && !isHRorAdmin) ? 'My Performance' : 'Performance', 
      icon: TrendingUp, 
      section: 'WORKFLOW & OPS' 
    },
    { 
      id: 'recruitment', 
      label: (currentUser.role === 'Employee' && !isHRorAdmin) ? 'Referral Portal' : 'Recruitment', 
      icon: Briefcase, 
      section: 'WORKFLOW & OPS' 
    },

    // Finance & Payroll
    { 
      id: 'accounts_payment', 
      label: 'Payment Disbursement', 
      icon: Receipt, 
      section: 'FINANCE & PAYROLL' 
    },
    { 
      id: 'finance', 
      label: (currentUser.role === 'Employee' || isAccountsStaff) && !isHRorAdmin ? 'My Expenses' : 'Finance & Expenses', 
      icon: IndianRupee, 
      section: 'FINANCE & PAYROLL' 
    },
    { 
      id: 'payroll', 
      label: (currentUser.role === 'Employee' || isAccountsStaff) && !isHRorAdmin ? 'My Payslip' : 'Payroll', 
      icon: CreditCard, 
      section: 'FINANCE & PAYROLL' 
    },
    { 
      id: 'advance_salary', 
      label: (currentUser.role === 'Employee' || isAccountsStaff) && !isHRorAdmin ? 'My Advance Salary' : 'Advance Salary Management', 
      icon: Banknote, 
      section: 'FINANCE & PAYROLL' 
    },
    {
      id: 'petty_cash',
      label: (currentUser.role === 'Employee' || isAccountsStaff) && !isHRorAdmin ? 'My Petty Cash Desk' : 'Petty Cash',
      icon: Wallet,
      section: 'FINANCE & PAYROLL'
    },

    // Workspace & Reports
    { 
      id: 'assets', 
      label: (currentUser.role === 'Employee' && !isHRorAdmin) ? 'My Assets' : 'Asset Management', 
      icon: Laptop, 
      section: 'WORKSPACE & REPORTS' 
    },

    // System & Config
    { id: 'settings', label: 'Settings', icon: SettingsIcon, section: 'SYSTEM & CONFIG' },
  ];

  const isCEO = 
    currentUser.role === 'CEO' || 
    currentUser.role === 'Super Admin' || 
    currentUser.designation === 'CEO' || 
    (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo')) || 
    currentUser.employeeId === 'EMP-000' ||
    currentUser.employeeId === 'VRM-001';

  const myEmpId = (currentUser.employeeId || currentUser.id || '').trim().toLowerCase();
  const myEmail = (currentUser.email || '').trim().toLowerCase();
  const isDeptManager = currentUser.role === 'Department Manager' || currentUser.role === 'Department Head';

  // Dynamic live count calculations for badges across Tasks, Requests & Operations
  // 1. Tasks: Unfinished/active tasks (assigned to user, or company-wide for management)
  const allAvailableTasks = (enhancedTasks && enhancedTasks.length > 0) ? enhancedTasks : (tasks as any[]);
  const pendingTasksCount = (() => {
    if (!allAvailableTasks || allAvailableTasks.length === 0) return 0;
    if (isCEO || currentUser.role === 'Super Admin' || isHRorAdmin) {
      return allAvailableTasks.filter(t => {
        const status = (t as any).overallStatus || (t as any).status || '';
        return status !== 'Completed' && status !== 'COMPLETED' && status !== 'CLOSED' && status !== 'Cancelled' && status !== 'CANCELLED';
      }).length;
    }
    if (isDeptManager && currentUser.department) {
      const myDept = currentUser.department.toLowerCase();
      return allAvailableTasks.filter(t => {
        const status = (t as any).overallStatus || (t as any).status || '';
        const matchesDept = ((t as any).department || '').toLowerCase() === myDept || (t as any).responsiblePersonId?.toLowerCase() === myEmpId;
        return matchesDept && status !== 'Completed' && status !== 'COMPLETED' && status !== 'CLOSED';
      }).length;
    }
    // Employee role: Tasks where user is an assignee or responsible person
    return allAvailableTasks.filter(t => {
      const status = (t as any).overallStatus || (t as any).status || '';
      if (status === 'Completed' || status === 'COMPLETED' || status === 'CLOSED' || status === 'CANCELLED') return false;
      const isResponsible = (t as any).responsiblePersonId?.toLowerCase() === myEmpId;
      const isAssignee = (t as any).assignees?.some((a: any) => 
        (a.employeeId?.toLowerCase() === myEmpId || a.employeeEmail?.toLowerCase() === myEmail) &&
        a.individualStatus !== 'Completed'
      );
      const isLegacyAssigned = (t as any).assignedEmployeeId?.toLowerCase() === myEmpId || (t as any).assignedTo?.toLowerCase() === myEmpId;
      return isResponsible || isAssignee || isLegacyAssigned;
    }).length;
  })();

  // 2. Leaves: Pending leave requests requiring action / awaiting decision
  const pendingLeavesCount = (() => {
    if (!leaveRequests || leaveRequests.length === 0) return 0;
    if (isCEO || currentUser.role === 'Super Admin' || isHRorAdmin) {
      return leaveRequests.filter(l => l.status === 'Pending').length;
    }
    if (isDeptManager && currentUser.department) {
      const myDept = currentUser.department.toLowerCase();
      return leaveRequests.filter(l => 
        l.status === 'Pending' && 
        ((l.department || '').toLowerCase() === myDept || (l as any).reportingManagerId?.toLowerCase() === myEmpId)
      ).length;
    }
    // Employee: their own pending submitted requests
    return leaveRequests.filter(l => 
      l.status === 'Pending' && 
      (l.employeeId?.toLowerCase() === myEmpId || (l as any).employeeEmail?.toLowerCase() === myEmail)
    ).length;
  })();

  // 3. Attendance: Pending attendance regularisations (missed punch) + overtime claims
  const pendingAttendanceCount = (() => {
    const pendingMissed = (missedPunchRequests || []).filter(r => r.status === 'Pending');
    const pendingOt = (overtimeRequests || []).filter(r => r.status === 'Pending Approval');
    
    if (isCEO || currentUser.role === 'Super Admin' || isHRorAdmin) {
      return pendingMissed.length + pendingOt.length;
    }
    if (isDeptManager && currentUser.department) {
      const myDept = currentUser.department.toLowerCase();
      return pendingMissed.filter(r => (r.department || '').toLowerCase() === myDept).length +
             pendingOt.filter(r => (r.department || '').toLowerCase() === myDept).length;
    }
    return pendingMissed.filter(r => r.employeeId?.toLowerCase() === myEmpId).length +
           pendingOt.filter(r => r.employeeId?.toLowerCase() === myEmpId).length;
  })();

  // 4. Shifts: Pending shift change / swap requests
  const pendingShiftsCount = (() => {
    if (!shiftRequests || shiftRequests.length === 0) return 0;
    if (isCEO || currentUser.role === 'Super Admin' || isHRorAdmin) {
      return shiftRequests.filter(s => s.status === 'Pending').length;
    }
    return shiftRequests.filter(s => s.status === 'Pending' && s.employeeId?.toLowerCase() === myEmpId).length;
  })();

  // 5. Finance & Expenses: Pending expense claims
  const pendingExpensesCount = (() => {
    if (!expenses || expenses.length === 0) return 0;
    if (isCEO || currentUser.role === 'Super Admin' || isAccountsStaff || isHRorAdmin) {
      return expenses.filter(e => 
        e.status === 'Pending Manager' || 
        e.status === 'Pending Finance'
      ).length;
    }
    if (isDeptManager && currentUser.department) {
      const myDept = currentUser.department.toLowerCase();
      return expenses.filter(e => 
        e.status === 'Pending Manager' && 
        (e.department || '').toLowerCase() === myDept
      ).length;
    }
    return expenses.filter(e => 
      (e.status === 'Pending Manager' || e.status === 'Pending Finance') &&
      e.employeeId?.toLowerCase() === myEmpId
    ).length;
  })();

  // 6. Payment Disbursement: Approved claims/loans awaiting disbursement
  const pendingDisbursementsCount = (isAccountsStaff || isCEO || currentUser.role === 'Super Admin')
    ? (
        (expenses || []).filter(e => e.status === 'Approved').length +
        (loanRecords || []).filter(l => l.status === 'Approved').length
      )
    : 0;

  // 7. Advance Salary: Pending loan/advance requests
  const pendingLoansCount = (() => {
    if (!loanRecords || loanRecords.length === 0) return 0;
    if (isCEO || currentUser.role === 'Super Admin' || isHRorAdmin || isAccountsStaff) {
      return loanRecords.filter(l => l.status === 'Pending').length;
    }
    return loanRecords.filter(l => l.status === 'Pending' && l.employeeId?.toLowerCase() === myEmpId).length;
  })();

  // 8. Recruitment: Active candidates in pipeline (applied/screening/interview)
  const pendingRecruitmentCount = (isCEO || currentUser.role === 'Super Admin' || isHRorAdmin)
    ? (candidates || []).filter(c => c.stage === 'Applied' || c.stage === 'Screening' || c.stage === 'Interview').length
    : 0;

  // 9. Tracking: Open tracking alerts
  const openTrackingAlertsCount = (trackingAlerts || []).filter(a => a.status === 'Open').length;

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  const getItemBadge = (id: ModuleName): number | null => {
    if (id === 'tasks' && pendingTasksCount > 0) return pendingTasksCount;
    if (id === 'leaves' && pendingLeavesCount > 0) return pendingLeavesCount;
    if (id === 'attendance' && pendingAttendanceCount > 0) return pendingAttendanceCount;
    if (id === 'shifts' && pendingShiftsCount > 0) return pendingShiftsCount;
    if (id === 'finance' && pendingExpensesCount > 0) return pendingExpensesCount;
    if (id === 'accounts_payment' && pendingDisbursementsCount > 0) return pendingDisbursementsCount;
    if (id === 'advance_salary' && pendingLoansCount > 0) return pendingLoansCount;
    if (id === 'recruitment' && pendingRecruitmentCount > 0) return pendingRecruitmentCount;
    if (id === 'tracking' && openTrackingAlertsCount > 0) return openTrackingAlertsCount;
    if (id === 'notifications' && unreadNotificationsCount > 0) return unreadNotificationsCount;
    return null;
  };

  // Filter menu items by search query and RBAC permissions
  const filteredItems = menuStructure.filter(item => {
    // CEO and Super Admin have unrestricted access to all modules except the employee face punching station
    if (isCEO) {
      if (item.id === 'face_attendance') return false;
      if (!searchFilter.trim()) return true;
      const query = searchFilter.toLowerCase().trim();
      return item.label.toLowerCase().includes(query) || item.section.toLowerCase().includes(query);
    }

    // Hide Employee directory and Attendance Management modules for standard Employee role AND Accounts role
    if ((currentUser.role === 'Employee' || isAccountsStaff) && !isHRorAdmin && (item.id === 'employees' || item.id === 'attendance')) {
      return false;
    }

    // Accounts role: Normal employee features + payment disbursement desk.
    // STRICTLY NO access to Employee Directory, Attendance Management, Executive Reports, HRMS Settings, Customer Data, or WhatsApp CRM
    if (isAccountsStaff && !isCEO) {
      if (['employees', 'attendance', 'reports', 'settings', 'customer_data', 'whatsapp_crm'].includes(item.id)) {
        return false;
      }
    }

    // Restrict Accounts Payment Disbursement strictly to Accounts staff and CEO
    if (item.id === 'accounts_payment' && !(isCEO || isAccountsStaff)) {
      return false;
    }

    // Restrict Petty Cash exclusively to CEO, Accounts, and the assigned Custodian
    if (item.id === 'petty_cash') {
      const isCustodian =
        Boolean(activeCustodianId) &&
        (currentUser.id === activeCustodianId || currentUser.employeeId === activeCustodianId);
      if (!(isCEO || isAccountsStaff || isCustodian)) {
        return false;
      }
    }

    // Check RBAC permission for this module
    if (!hasPermission(item.id, 'view')) {
      return false;
    }

    if (!searchFilter.trim()) return true;

    const query = searchFilter.toLowerCase().trim();
    return item.label.toLowerCase().includes(query) || item.section.toLowerCase().includes(query);
  });

  // Track sections to place thin divider lines between categories
  let renderedSections = new Set<string>();

  const brandInitial = (businessSettings?.businessName || 'Businz').charAt(0).toUpperCase() + '.';

  if (isMobileOpen) {
    return (
      <aside className="hrms-sidebar mobile-open">
        <div className="sidebar-mobile-content">
          {/* Header */}
          <div className="sidebar-mobile-header">
            <div 
              className="sidebar-mobile-brand"
              onClick={() => {
                setActiveModule('dashboard');
                onCloseMobile?.();
              }}
              style={{ cursor: 'pointer' }}
            >
              <img 
                src={businessSettings?.logoUrl || "/logo.png"} 
                alt="Logo" 
                className="sidebar-mobile-logo" 
              />
              <span className="sidebar-mobile-brand-title">
                {businessSettings?.businessName || 'BUSINZ'} <span style={{ color: '#0E7490' }}>HRMS</span>
              </span>
            </div>
            <button 
              type="button" 
              className="sidebar-mobile-close-btn"
              onClick={onCloseMobile}
              aria-label="Close Menu"
            >
              <X size={20} strokeWidth={2.4} />
            </button>
          </div>

          {/* User Profile Snippet Card (Matches Reference Mockup) */}
          <div 
            className="sidebar-mobile-user-card"
            onClick={() => {
              setActiveModule('profile');
              onCloseMobile?.();
            }}
          >
            <div className="sidebar-mobile-user-avatar">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name} />
              ) : (
                <span>{(currentUser.name || 'U').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="sidebar-mobile-user-info">
              <div className="sidebar-mobile-user-name">{currentUser.name}</div>
              <div className="sidebar-mobile-user-role">
                {currentUser.designation || (currentUser.role === 'Super Admin' ? 'CEO' : currentUser.role)}
              </div>
            </div>
            <ChevronRight size={18} color="#94A3B8" />
          </div>

          {/* Search Box */}
          <div className="sidebar-mobile-search-box" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search 
              size={16} 
              color="#64748B" 
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                zIndex: 2
              }}
            />
            <input 
              type="text"
              placeholder="Search menu..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="sidebar-mobile-search-input"
              style={{
                paddingLeft: '42px',
                paddingRight: searchFilter ? '36px' : '14px',
                boxSizing: 'border-box'
              }}
            />
            {searchFilter && (
              <button 
                type="button" 
                onClick={() => setSearchFilter('')} 
                className="sidebar-mobile-search-clear"
                aria-label="Clear Search"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 2
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="sidebar-mobile-nav">
            {filteredItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = activeModule === item.id;
              const badgeCount = getItemBadge(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-mobile-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveModule(item.id);
                    onCloseMobile?.();
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    <IconComponent size={19} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="sidebar-mobile-nav-label">{item.label}</span>
                  </div>
                  {badgeCount !== null && (
                    <span className={`sidebar-mobile-badge ${isActive ? 'badge-on-active' : ''}`}>
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* OTHER Section */}
          <div className="sidebar-mobile-other-section">
            <div className="sidebar-mobile-section-heading">OTHER</div>
            <button
              type="button"
              className="sidebar-mobile-other-item"
              onClick={() => {
                setActiveModule('notifications' as any);
                onCloseMobile?.();
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <Bell size={18} strokeWidth={2.2} color="#475569" />
                <span>Notifications</span>
              </div>
              {unreadNotificationsCount > 0 && (
                <span className="sidebar-mobile-badge-red">{unreadNotificationsCount}</span>
              )}
            </button>

            <button
              type="button"
              className="sidebar-mobile-other-item logout"
              onClick={() => {
                onCloseMobile?.();
                if (onLogout) onLogout();
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <LogOut size={18} strokeWidth={2.2} />
                <span>Logout</span>
              </div>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside 
      className={`hrms-sidebar ${effectiveCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Top Company Card */}
      {effectiveExpanded ? (
        <div className="sidebar-top-card">
          <div 
            className="sidebar-brand-wrapper" 
            onClick={() => {
              setActiveModule('dashboard');
              onCloseMobile?.();
            }} 
            title="Go to Dashboard"
          >
            <img 
              src={businessSettings?.logoUrl || "/logo.png"} 
              alt={`${businessSettings?.businessName || 'Businz'} Logo`} 
              className="sidebar-logo-img" 
              style={{ width: '40px', height: '40px', objectFit: 'contain', border: 'none', background: 'transparent', padding: 0 }}
            />
            <div className="sidebar-brand-details">
              <div className="sidebar-brand-title">
                {businessSettings?.businessName || 'Businz'}
              </div>
              <div className="sidebar-brand-subtitle">
                Enterprise Edition
              </div>
            </div>
          </div>
          {isMobileOpen && onCloseMobile ? (
            <button 
              className="sidebar-mobile-close-btn"
              onClick={onCloseMobile}
              title="Close Menu"
              aria-label="Close Menu"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          ) : onTogglePin && (
            <button 
              className={`sidebar-pin-btn ${isPinned ? 'pinned' : ''}`}
              onClick={onTogglePin}
              title={isPinned ? 'Unpin Sidebar (Auto-fold on mouse leave)' : 'Pin Sidebar Open'}
              aria-label={isPinned ? 'Unpin Sidebar' : 'Pin Sidebar'}
            >
              {isPinned ? <PinOff size={15} strokeWidth={2.2} /> : <Pin size={15} strokeWidth={2.2} />}
            </button>
          )}
        </div>
      ) : (
        <div className="sidebar-top-collapsed">
          <div 
            onClick={() => {
              setActiveModule('dashboard');
              onCloseMobile?.();
            }} 
            title="Enterprise Dashboard (Hover to expand)"
            style={{ 
              cursor: 'pointer', 
              width: '44px', 
              height: '44px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: 0, 
              backgroundColor: 'transparent', 
              border: 'none', 
              boxShadow: 'none' 
            }}
          >
            <img 
              src={businessSettings?.logoUrl || "/logo.png"} 
              alt="Logo" 
              style={{ width: '40px', height: '40px', objectFit: 'contain', border: 'none', background: 'transparent' }} 
            />
          </div>
        </div>
      )}

      {/* Search Bar (Full input when expanded, compact 2nd icon button when collapsed) */}
      {effectiveExpanded ? (
        <div className="sidebar-search-box">
          <Search size={16} color="#64748B" strokeWidth={2.2} />
          <input 
            ref={searchInputRef}
            type="text"
            className="sidebar-search-input"
            placeholder="Search"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            onBlur={handleSearchBlur}
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => {
                setSearchFilter('');
                searchInputRef.current?.focus();
              }}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: '#94A3B8',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        /* 2nd Item in Collapsed Sidebar */
        <div className="sidebar-search-collapsed-wrapper">
          <button 
            type="button"
            className={`sidebar-search-collapsed-btn ${searchFilter ? 'has-filter' : ''}`}
            onClick={() => {
              setIsSearchActive(true);
              setIsHovered(true);
              onHoverChange?.(true);
              setTimeout(() => {
                searchInputRef.current?.focus();
              }, 60);
            }}
            title="Search (⌘K / Ctrl+K)"
            aria-label="Search"
          >
            <Search size={17} color={searchFilter ? '#0E7490' : '#475569'} strokeWidth={2.2} />
            {searchFilter && <span className="nav-item-dot-badge" style={{ top: '6px', right: '6px' }} />}
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className="sidebar-nav">
        {filteredItems.map((item) => {
          const isNewSection = effectiveExpanded && !renderedSections.has(item.section);
          const isFirstSection = renderedSections.size === 0;

          if (isNewSection) {
            renderedSections.add(item.section);
          }

          const IconComponent = item.icon;
          const isActive = activeModule === item.id;
          const badgeCount = getItemBadge(item.id);

          return (
            <React.Fragment key={item.id}>
              {isNewSection && (
                <>
                  {!isFirstSection && <div className="sidebar-section-divider" />}
                  <div className="nav-section-title">{item.section}</div>
                </>
              )}
              <a
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveModule(item.id);
                  onCloseMobile?.();
                }}
                title={effectiveCollapsed ? item.label : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
                  <span className="nav-icon">
                    <IconComponent size={18} strokeWidth={2.2} />
                  </span>
                  {effectiveExpanded && (
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>
                  )}
                </div>

                {effectiveExpanded && badgeCount !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="nav-item-badge">{badgeCount}</span>
                  </div>
                )}
                {effectiveCollapsed && badgeCount !== null && (
                  <span className="nav-item-dot-badge" title={`${badgeCount} pending`} />
                )}
              </a>
            </React.Fragment>
          );
        })}
      </nav>
    </aside>
  );
};
