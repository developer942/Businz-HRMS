import React, { useEffect, useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { ModuleName } from '../../types/hrms';
import { isCeoOrHrUser } from '../../services/authService';
import {
  Home,
  ScanFace,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  Users,
  FileText,
  CheckCircle2,
  Receipt,
  CreditCard,
  Bot,
  History
} from 'lucide-react';

interface NavItem {
  key: string;
  label: string;
  title?: string;
  icon: React.ElementType;
  targetModule?: ModuleName;
  badge?: number;
  action?: () => void;
}

interface MobileBottomNavProps {
  onOpenSidebar?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = () => {
  const {
    currentUser,
    activeModule,
    setActiveModule,
    hasPermission,
    tasks = [],
    leaveRequests = [],
    expenses = [],
    loanRecords = [],
    resetToDashboard
  } = useHRMS();

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isChatBotOpen, setIsChatBotOpen] = useState(false);

  // Monitor viewport resize to hide bottom nav only when virtual keyboard is actively open on an input
  useEffect(() => {
    const handleViewportChange = () => {
      if (window.visualViewport) {
        const activeTag = document.activeElement?.tagName;
        const isInputFocused =
          activeTag === 'INPUT' ||
          activeTag === 'TEXTAREA' ||
          activeTag === 'SELECT' ||
          (document.activeElement as HTMLElement | null)?.isContentEditable === true;
        const isKeyboard = isInputFocused && window.visualViewport.height < window.innerHeight * 0.72;
        setIsKeyboardVisible(isKeyboard);
        document.body.classList.toggle('mobile-keyboard-open', isKeyboard);
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      document.body.classList.remove('mobile-keyboard-open');
    };
  }, []);

  // Synchronize active indicator with BUSINZ Chat Bot open/close status
  useEffect(() => {
    const handleChatState = (e: Event) => {
      const customEvent = e as CustomEvent<{ isOpen?: boolean }>;
      setIsChatBotOpen(Boolean(customEvent?.detail?.isOpen));
    };
    window.addEventListener('vrm-ai-chatbot-state-change', handleChatState);
    return () => window.removeEventListener('vrm-ai-chatbot-state-change', handleChatState);
  }, []);

  const role = (currentUser?.role || 'Employee').trim();
  const designation = (currentUser?.designation || '').trim().toLowerCase();
  const department = (currentUser?.department || '').trim().toLowerCase();

  const isHR =
    role === 'HR Admin' ||
    role === 'HR Manager' ||
    role === 'HR' ||
    (role !== 'CEO' &&
      role !== 'Super Admin' &&
      (department === 'hr' ||
        department.includes('human resource') ||
        designation.includes('hr') ||
        designation.includes('human resource')));

  const isAccounts =
    !isHR &&
    (role === 'Finance Manager' ||
      (role as string) === 'Accounts' ||
      (role !== 'CEO' &&
        role !== 'Super Admin' &&
        (department.includes('account') ||
          department.includes('finance') ||
          designation.includes('account') ||
          designation.includes('finance'))));

  const isCEO =
    !isHR &&
    !isAccounts &&
    (role === 'Super Admin' ||
      role === 'CEO' ||
      role === 'Management' ||
      role === 'ERP Administrator' ||
      designation === 'ceo' ||
      designation.includes('chief executive') ||
      designation.includes('managing director') ||
      currentUser?.employeeId === 'EMP-000');

  const pendingTasksCount = tasks.filter(t => t.status !== 'Completed').length;
  const pendingLeavesCount = (isCEO || isHR)
    ? leaveRequests.filter(l => l.status === 'Pending').length
    : 0;
  const pendingDisbursementsCount = isAccounts
    ? (expenses.filter(e => e.status === 'Approved').length + loanRecords.filter(l => l.status === 'Approved').length)
    : 0;

  // Build role-specific navigation items according to Phase 8 requirements
  const getNavItems = (): NavItem[] => {
    const homeTab: NavItem = {
      key: 'home',
      label: 'Home',
      icon: Home,
      targetModule: 'dashboard',
      action: () => {
        resetToDashboard?.();
        setActiveModule('dashboard');
      }
    };

    const chatBotTab: NavItem = {
      key: 'chatbot',
      label: 'Chat Bot',
      title: 'BUSINZ Chat Bot',
      icon: Bot,
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-vrm-ai-chatbot'));
      }
    };

    if (isCEO) {
      // CEO: 1. Home, 2. Approvals, 3. Employees, 4. Reports, 5. Chat Bot
      return [
        homeTab,
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
        chatBotTab
      ];
    }

    if (isHR) {
      // HR: 1. Home, 2. Employees, 3. Attendance, 4. Leave, 5. Chat Bot
      return [
        homeTab,
        {
          key: 'employees',
          label: 'Employees',
          icon: Users,
          targetModule: 'employees'
        },
        {
          key: 'attendance',
          label: 'Attendance',
          icon: CalendarCheck,
          targetModule: 'attendance'
        },
        {
          key: 'leave',
          label: 'Leave',
          icon: CalendarDays,
          targetModule: 'leaves',
          badge: pendingLeavesCount > 0 ? pendingLeavesCount : undefined
        },
        chatBotTab
      ];
    }

    if (isAccounts) {
      // ACCOUNTS: 1. Home, 2. Attendance, 3. Payments, 4. Claims, 5. Tasks
      return [
        homeTab,
        {
          key: 'attendance',
          label: 'Attendance',
          icon: ScanFace,
          targetModule: 'face_attendance'
        },
        {
          key: 'payments',
          label: 'Payments',
          icon: CreditCard,
          targetModule: 'accounts_payment',
          badge: pendingDisbursementsCount > 0 ? pendingDisbursementsCount : undefined
        },
        {
          key: 'claims',
          label: 'Claims',
          icon: Receipt,
          targetModule: 'finance'
        },
        {
          key: 'tasks',
          label: 'Tasks',
          icon: CheckSquare,
          targetModule: 'tasks',
          badge: pendingTasksCount > 0 ? pendingTasksCount : undefined
        }
      ];
    }

    // EMPLOYEE (Strictly 5 items): 1. Home, 2. Attendance, 3. Leave, 4. Tasks, 5. Attendance Log
    return [
      homeTab,
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
        key: 'attendance_log',
        label: 'Attendance Log',
        icon: History,
        targetModule: 'attendance_log'
      }
    ];
  };

  // Show only navigation items permitted for the authenticated role
  const navItems = getNavItems().filter((item) => {
    if (item.key === 'chatbot') {
      return isCeoOrHrUser(currentUser);
    }
    if (item.targetModule) {
      return hasPermission(item.targetModule, 'view');
    }
    return true;
  });

  if (isKeyboardVisible) {
    return null;
  }

  const handleNavClick = (item: NavItem) => {
    if (item.key !== 'chatbot' && isChatBotOpen) {
      window.dispatchEvent(new CustomEvent('close-vrm-ai-chatbot'));
    }
    if (item.action) {
      item.action();
    } else if (item.targetModule) {
      setActiveModule(item.targetModule);
    }
    if (item.key !== 'chatbot') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isItemActive = (item: NavItem) => {
    if (item.key === 'chatbot') {
      return isChatBotOpen;
    }
    if (isChatBotOpen) {
      return false;
    }
    if (item.key === 'attendance' && isHR) {
      return activeModule === 'attendance' || activeModule === 'face_attendance';
    }
    return Boolean(item.targetModule && activeModule === item.targetModule);
  };

  return (
    <nav
      className="mobile-bottom-nav"
      aria-label="Mobile Navigation"
      data-role={isCEO ? 'CEO' : isHR ? 'HR' : isAccounts ? 'Accounts' : 'Employee'}
    >
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
              aria-label={item.title || item.label}
              title={item.title || item.label}
            >
              <div className="mobile-bottom-nav-icon-wrapper">
                <Icon size={19} strokeWidth={active ? 2.4 : 2} />
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
