import React, { useEffect, useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { ModuleName } from '../../types/hrms';
import {
  LayoutDashboard,
  ScanFace,
  CalendarDays,
  CheckSquare,
  User,
  Users,
  FileText,
  CheckCircle2,
  Settings,
  Layers
} from 'lucide-react';

interface NavItem {
  key: string;
  label: string;
  icon: React.ElementType;
  targetModule: ModuleName;
  badge?: number;
  action?: () => void;
}

interface MobileBottomNavProps {
  onOpenSidebar?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenSidebar }) => {
  const { 
    currentUser, 
    activeModule, 
    setActiveModule, 
    setActiveSettingsTab,
    tasks = [],
    leaveRequests = [],
    resetToDashboard
  } = useHRMS();

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [hasOpenModal, setHasOpenModal] = useState(false);

  // Monitor viewport resize to hide bottom nav when mobile virtual keyboard is active
  useEffect(() => {
    const handleViewportChange = () => {
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.innerHeight * 0.75;
        setIsKeyboardVisible(isKeyboard);
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, []);

  // Monitor DOM for open modals / fullscreen wizards to avoid overlapping action buttons
  useEffect(() => {
    const checkModalState = () => {
      const modalElements = document.querySelectorAll(
        '.onboarding-fullscreen-modal, .modal-backdrop, .modal-overlay, .dialog-overlay, .profile-drawer'
      );
      let isOpen = false;
      modalElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (
          style.display !== 'none' && 
          style.visibility !== 'hidden' && 
          style.opacity !== '0' &&
          (el as HTMLElement).offsetWidth > 0
        ) {
          isOpen = true;
        }
      });
      setHasOpenModal(isOpen);
    };

    const observer = new MutationObserver(checkModalState);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    checkModalState();

    return () => observer.disconnect();
  }, []);

  const role = currentUser?.role || 'Employee';
  const designation = (currentUser?.designation || '').toLowerCase();
  const isSuperAdmin = role === 'Super Admin' || role === 'ERP Administrator';
  const isCEO = !isSuperAdmin && (role === 'CEO' || designation === 'ceo');
  const isHR = role === 'HR Admin' || role === 'HR Manager' || role === 'HR';
  const isAccounts = role === 'Finance Manager' || (currentUser?.department && currentUser.department.toLowerCase().includes('account'));

  const pendingTasksCount = tasks.filter(t => t.status !== 'Completed').length;
  const pendingLeavesCount = (isSuperAdmin || isHR || isCEO) 
    ? leaveRequests.filter(l => l.status === 'Pending').length 
    : 0;

  // Build role-specific navigation items according to requirements
  const getNavItems = (): NavItem[] => {
    if (isSuperAdmin) {
      // Super Admin: Home | Users | Modules | Settings | Profile
      return [
        {
          key: 'home',
          label: 'Home',
          icon: LayoutDashboard,
          targetModule: 'dashboard',
          action: () => {
            resetToDashboard?.();
            setActiveModule('dashboard');
          }
        },
        {
          key: 'users',
          label: 'Users',
          icon: Users,
          targetModule: 'employees'
        },
        {
          key: 'modules',
          label: 'Modules',
          icon: Layers,
          targetModule: activeModule,
          action: () => {
            if (onOpenSidebar) {
              onOpenSidebar();
            } else {
              setActiveModule('settings');
            }
          }
        },
        {
          key: 'settings',
          label: 'Settings',
          icon: Settings,
          targetModule: 'settings'
        },
        {
          key: 'profile',
          label: 'Profile',
          icon: User,
          targetModule: 'profile',
          action: () => {
            setActiveModule('settings');
            setActiveSettingsTab('my_profile');
          }
        }
      ];
    }

    if (isCEO) {
      // CEO: Home | Approvals | Employees | Reports | Profile
      return [
        {
          key: 'home',
          label: 'Home',
          icon: LayoutDashboard,
          targetModule: 'dashboard',
          action: () => {
            resetToDashboard?.();
            setActiveModule('dashboard');
          }
        },
        {
          key: 'approvals',
          label: 'Approvals',
          icon: CheckCircle2,
          targetModule: 'leaves',
          badge: pendingLeavesCount > 0 ? pendingLeavesCount : undefined
        },
        {
          key: 'employees',
          label: 'Employees',
          icon: Users,
          targetModule: 'employees'
        },
        {
          key: 'reports',
          label: 'Reports',
          icon: FileText,
          targetModule: 'reports'
        },
        {
          key: 'profile',
          label: 'Profile',
          icon: User,
          targetModule: 'profile',
          action: () => {
            setActiveModule('settings');
            setActiveSettingsTab('my_profile');
          }
        }
      ];
    }

    // Default for Employee, HR, and Accounts: Home | Attendance | Leave | Tasks | Profile
    return [
      {
        key: 'home',
        label: 'Home',
        icon: LayoutDashboard,
        targetModule: 'dashboard',
        action: () => {
          resetToDashboard?.();
          setActiveModule('dashboard');
        }
      },
      {
        key: 'attendance',
        label: 'Attendance',
        icon: ScanFace,
        targetModule: 'face_attendance'
      },
      {
        key: 'leave',
        label: 'Leave',
        icon: CalendarDays,
        targetModule: 'leaves'
      },
      {
        key: 'tasks',
        label: 'Tasks',
        icon: CheckSquare,
        targetModule: 'tasks',
        badge: pendingTasksCount > 0 ? pendingTasksCount : undefined
      },
      {
        key: 'profile',
        label: 'Profile',
        icon: User,
        targetModule: 'profile',
        action: () => {
          setActiveModule('settings');
          setActiveSettingsTab('my_profile');
        }
      }
    ];
  };

  const navItems = getNavItems();

  // If virtual keyboard is open or a modal dialog is displayed, hide bottom nav
  if (isKeyboardVisible || hasOpenModal) {
    return null;
  }

  const handleNavClick = (item: NavItem) => {
    if (item.action) {
      item.action();
    } else {
      setActiveModule(item.targetModule);
    }
    // Scroll to top smoothly on navigation
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isItemActive = (item: NavItem) => {
    if (item.key === 'profile') {
      return activeModule === 'profile' || (activeModule === 'settings' && item.targetModule === 'profile');
    }
    if (item.key === 'modules') {
      return false;
    }
    return activeModule === item.targetModule;
  };

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      <div className="mobile-bottom-nav-inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item);

          return (
            <button
              key={item.key}
              type="button"
              className={`mobile-bottom-nav-item ${active ? 'active' : ''}`}
              onClick={() => handleNavClick(item)}
              aria-current={active ? 'page' : undefined}
              title={item.label}
            >
              <div className="mobile-bottom-nav-icon-wrapper">
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="mobile-bottom-nav-badge">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
