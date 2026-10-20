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
  Timer,
  Search,
  MapPin,
  Pin,
  PinOff,
  X,
  Contact2
} from 'lucide-react';

interface SidebarProps {
  isCollapsed?: boolean;
  toggleSidebar?: () => void;
  isPinned?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onTogglePin?: () => void;
  onHoverChange?: (hovered: boolean) => void;
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
  onHoverChange
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
    notifications = [],
    leaveRequests = [],
    loanRecords = [],
    overtimeRequests = [],
    trackingAlerts = []
  } = useHRMS();

  const [searchFilter, setSearchFilter] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    { id: 'customer_data', label: 'Customer Data Collection', icon: Contact2, section: 'WORKFLOW & OPS' },
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
    { id: 'finance', label: 'Finance & Expenses', icon: IndianRupee, section: 'FINANCE & PAYROLL' },
    { id: 'payroll', label: 'Payroll', icon: CreditCard, section: 'FINANCE & PAYROLL' },
    { 
      id: 'advance_salary', 
      label: (currentUser.role === 'Employee' && !isHRorAdmin && !isAccountsStaff) ? 'My Advance Salary' : 'Advance Salary Management', 
      icon: Banknote, 
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

  // Dynamic live count calculations for badges (mirroring reference badge style)
  const pendingTasksCount = tasks.filter(t => t.status !== 'Completed').length;
  const unreadNotificationsCount = notifications.filter(n => !n.read).length;
  const pendingLeavesCount = (currentUser.role === 'Super Admin' || currentUser.role === 'HR Admin')
    ? leaveRequests.filter(l => l.status === 'Pending').length
    : 0;
  const pendingLoansCount = (currentUser.role === 'Super Admin' || currentUser.role === 'HR Admin')
    ? loanRecords.filter(l => l.status === 'Pending').length
    : 0;
  const isManagerOrAdmin = 
    currentUser.role === 'Super Admin' || 
    currentUser.role === 'HR Admin' || 
    currentUser.role === 'HR Manager' || 
    currentUser.role === 'CEO' || 
    currentUser.role === 'Department Manager' || 
    currentUser.role === 'Department Head';
  const pendingOtCount = isManagerOrAdmin
    ? overtimeRequests.filter(r => r.status === 'Pending Approval').length
    : 0;

  const getItemBadge = (id: ModuleName): number | null => {
    if (id === 'tasks' && pendingTasksCount > 0) return pendingTasksCount;
    if (id === 'notifications' && unreadNotificationsCount > 0) return unreadNotificationsCount;
    if (id === 'leaves' && pendingLeavesCount > 0) return pendingLeavesCount;
    if (id === 'advance_salary' && pendingLoansCount > 0) return pendingLoansCount;
    if (id === 'overtime' && pendingOtCount > 0) return pendingOtCount;
    if (id === 'tracking') {
      const openAlerts = trackingAlerts.filter(a => a.status === 'Open').length;
      return openAlerts > 0 ? openAlerts : null;
    }
    return null;
  };

  const isCEO = 
    currentUser.role === 'CEO' || 
    currentUser.role === 'Super Admin' || 
    currentUser.designation === 'CEO' || 
    (currentUser.designation && currentUser.designation.toLowerCase().includes('ceo')) || 
    currentUser.employeeId === 'EMP-000';

  // Filter menu items by search query and RBAC permissions
  const filteredItems = menuStructure.filter(item => {
    // CEO and Super Admin have unrestricted access to all modules except the employee face punching station
    if (isCEO) {
      if (item.id === 'face_attendance') return false;
      if (!searchFilter.trim()) return true;
      const query = searchFilter.toLowerCase().trim();
      return item.label.toLowerCase().includes(query) || item.section.toLowerCase().includes(query);
    }

    // Hide Employee directory and Attendance Management modules for standard Employee role
    if (currentUser.role === 'Employee' && (item.id === 'employees' || item.id === 'attendance')) {
      return false;
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
