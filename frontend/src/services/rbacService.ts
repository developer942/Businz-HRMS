import {
  RBACDataResponse,
  RoleDefinition,
  ModuleDefinition,
  RolePermissionConfig,
  PermissionAuditLog,
  PermissionAction,
  DataAccessLevel,
} from '../types/rbac';
import { API_BASE_URL } from '../config/api';

const API_BASE = `${API_BASE_URL}/rbac`;
const STORAGE_KEY = 'vrm_hrms_rbac_store_v1';

// Standard 16 core modules
export const DEFAULT_CORE_MODULES: ModuleDefinition[] = [
  { id: 'mod-1', key: 'dashboard', name: 'Dashboard', category: 'Executive', isCustom: false, description: 'Executive KPIs, analytics cards, and operational widgets' },
  { id: 'mod-2', key: 'employees', name: 'Employees', category: 'HR Core', isCustom: false, description: 'Staff directory, onboarding records, profiles & designations' },
  { id: 'mod-3', key: 'attendance', name: 'Attendance', category: 'Time & Attendance', isCustom: false, description: 'Daily biometric punches, timesheets & regularization' },
  { id: 'mod-4', key: 'shift', name: 'Shift', category: 'Time & Attendance', isCustom: false, description: 'Roster scheduling, shift rotation & grace policies' },
  { id: 'mod-5', key: 'leave', name: 'Leave', category: 'Time & Attendance', isCustom: false, description: 'Leave quota management, requests & multi-tier approvals' },
  { id: 'mod-6', key: 'tasks', name: 'Tasks', category: 'Operations', isCustom: false, description: 'Delegated assignments, subtasks, deadlines & checklists' },
  { id: 'mod-7', key: 'payroll', name: 'Payroll', category: 'Finance', isCustom: false, description: 'Salary calculations, payslips, EPF/ESIC statutory rules' },
  { id: 'mod-8', key: 'advance_salary', name: 'Advance Salary', category: 'Finance', isCustom: false, description: 'Salary advances, loan policies & monthly EMI deductions' },
  { id: 'mod-9', key: 'expenses', name: 'Expenses', category: 'Finance', isCustom: false, description: 'Reimbursement claims, TaDa travel allowance & receipts' },
  { id: 'mod-10', key: 'performance', name: 'Performance', category: 'HR Core', isCustom: false, description: 'Quarterly appraisals, KPI scorecards & achievement reviews' },
  { id: 'mod-11', key: 'site_visit', name: 'Site Visit', category: 'Field Force', isCustom: false, description: 'Client site check-ins, field verification & geo-tagging' },
  { id: 'mod-12', key: 'gps_tracking', name: 'GPS Tracking', category: 'Field Force', isCustom: false, description: 'Real-time live location, route history & travel trails' },
  { id: 'mod-13', key: 'reports', name: 'Reports', category: 'Executive', isCustom: false, description: 'Master audit sheets, exportable compliance & MIS reports' },
  { id: 'mod-14', key: 'documents', name: 'Documents', category: 'HR Core', isCustom: false, description: 'Contracts, KYC files, policy documents & certificates' },
  { id: 'mod-15', key: 'notifications', name: 'Notifications', category: 'System', isCustom: false, description: 'System alerts, broadcast announcements & push alerts' },
  { id: 'mod-16', key: 'settings', name: 'Settings', category: 'System', isCustom: false, description: 'System configurations, company identity & policy engines' },
];

export const ALL_PERMISSION_ACTIONS: { id: PermissionAction; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'create', label: 'Create' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
  { id: 'approve', label: 'Approve' },
  { id: 'reject', label: 'Reject' },
  { id: 'assign', label: 'Assign' },
  { id: 'export', label: 'Export / Download' },
];

export const SPECIAL_PERMISSIONS_LIST = [
  { key: 'view_salary', label: 'View Salary', category: 'Payroll' as const, description: 'View compensation structure and monthly remuneration' },
  { key: 'edit_salary', label: 'Edit Salary', category: 'Payroll' as const, description: 'Modify wage components, CTC and bonus structures' },
  { key: 'process_payroll', label: 'Process Payroll', category: 'Payroll' as const, description: 'Trigger monthly batch payroll calculations' },
  { key: 'approve_payroll', label: 'Approve Payroll', category: 'Payroll' as const, description: 'Final sign-off and disbursal approval for payroll batches' },

  { key: 'view_employee_documents', label: 'View Employee Documents', category: 'Documents' as const, description: 'Inspect identity cards, KYC and contracts' },
  { key: 'upload_documents', label: 'Upload Documents', category: 'Documents' as const, description: 'Attach new confidential records and certificates' },

  { key: 'edit_attendance', label: 'Edit Attendance', category: 'Attendance' as const, description: 'Manually alter punch records, overtime and timesheets' },
  { key: 'approve_attendance_regularization', label: 'Approve Attendance Regularization', category: 'Attendance' as const, description: 'Sanction employee miss-punch and regularization requests' },

  { key: 'approve_leave', label: 'Approve Leave', category: 'Leave' as const, description: 'Approve applied leave applications' },
  { key: 'reject_leave', label: 'Reject Leave', category: 'Leave' as const, description: 'Decline leave applications with reason' },

  { key: 'create_tasks', label: 'Create Tasks', category: 'Tasks' as const, description: 'Spawn new actionable assignments and work tickets' },
  { key: 'assign_tasks', label: 'Assign Tasks', category: 'Tasks' as const, description: 'Delegate tasks to team members or departments' },
  { key: 'view_all_tasks', label: 'View All Tasks', category: 'Tasks' as const, description: 'Global task board visibility across all departments' },

  { key: 'approve_salary_advance', label: 'Approve Advance Salary', category: 'Advance Salary' as const, description: 'Authorize loan & advance applications up to policy cap' },

  { key: 'view_gps_location', label: 'View GPS Location', category: 'Tracking' as const, description: 'View current coordinates and check-in positions' },
  { key: 'view_travel_history', label: 'View Employee Travel History', category: 'Tracking' as const, description: 'Inspect historical breadcrumbs and odometer calculations' },

  { key: 'view_reports', label: 'View Reports', category: 'Reports' as const, description: 'Access standard business analytics and dashboards' },
  { key: 'export_reports', label: 'Export Reports', category: 'Reports' as const, description: 'Download CSV/Excel/PDF consolidated reports' },

  { key: 'manage_employees', label: 'Manage Employees', category: 'Administration' as const, description: 'Add, archive, terminate and edit employee records' },
  { key: 'manage_roles', label: 'Manage Roles', category: 'Administration' as const, description: 'Create, modify and duplicate organizational roles' },
  { key: 'manage_permissions', label: 'Manage Permissions', category: 'Administration' as const, description: 'Adjust module permissions and data access levels' },
  { key: 'manage_hrms_settings', label: 'Manage HRMS Settings', category: 'Administration' as const, description: 'Modify enterprise policies, time shifts and company details' },
];

export const INITIAL_DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: 'role-ceo',
    name: 'CEO',
    description: 'Chief Executive Officer with comprehensive administrative authority and organizational visibility.',
    department: 'Executive Board',
    status: 'Active',
    isDefault: true,
    userCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-hr',
    name: 'HR',
    description: 'Human Resources Administrator overseeing employee profiles, payroll processing, leaves and compliance.',
    department: 'Human Resources',
    status: 'Active',
    isDefault: true,
    userCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-admin',
    name: 'Admin',
    description: 'System Administrator with control over software configurations, user roles, security policies and logs.',
    department: 'IT & Administration',
    status: 'Active',
    isDefault: true,
    userCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-manager',
    name: 'Manager',
    description: 'Departmental Manager managing direct reports, approving team leaves, attendance and reviewing performance.',
    department: 'Operations & Engineering',
    status: 'Active',
    isDefault: true,
    userCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-team-leader',
    name: 'Team Leader',
    description: 'Frontline leader monitoring daily task assignments, team shift rosters and shift attendance.',
    department: 'Operations',
    status: 'Active',
    isDefault: true,
    userCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-employee',
    name: 'Employee',
    description: 'Standard staff member with self-service access to punches, payslips, leave applications and personal data.',
    department: 'General Staff',
    status: 'Active',
    isDefault: true,
    userCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const getStoredStore = (): RBACDataResponse | null => {
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
};

const saveStoredStore = (data: RBACDataResponse): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to cache RBAC data in localStorage', err);
  }
};

export const getInitialRBACState = (): RBACDataResponse => {
  const cached = getStoredStore();
  if (cached) return cached;

  const allActions: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'assign', 'export'];

  // CEO
  const ceoModules: Record<string, PermissionAction[]> = {};
  DEFAULT_CORE_MODULES.forEach(m => {
    ceoModules[m.key] = [...allActions];
  });

  // HR (No CEO Financial Approval Privileges)
  const hrModules: Record<string, PermissionAction[]> = {};
  DEFAULT_CORE_MODULES.forEach(m => {
    if (['expenses', 'advance_salary', 'payroll'].includes(m.key)) {
      // HR can view, create and export, but CANNOT approve financial requests
      hrModules[m.key] = ['view', 'create', 'export'];
    } else if (['employees', 'attendance', 'shift', 'leave', 'tasks', 'reports', 'documents', 'notifications', 'dashboard'].includes(m.key)) {
      hrModules[m.key] = [...allActions];
    } else {
      hrModules[m.key] = ['view'];
    }
  });

  // Admin
  const adminModules: Record<string, PermissionAction[]> = {};
  DEFAULT_CORE_MODULES.forEach(m => {
    adminModules[m.key] = ['view', 'create', 'edit', 'delete', 'export'];
  });
  adminModules['settings'] = [...allActions];
  adminModules['documents'] = [...allActions];

  // Manager
  const managerModules: Record<string, PermissionAction[]> = {
    dashboard: ['view'],
    employees: ['view'],
    attendance: ['view', 'create', 'edit', 'approve', 'reject'],
    shift: ['view', 'edit', 'assign'],
    leave: ['view', 'create', 'approve', 'reject'],
    tasks: ['view', 'create', 'edit', 'assign'],
    performance: ['view', 'create', 'edit', 'approve'],
    site_visit: ['view', 'approve', 'reject'],
    gps_tracking: ['view'],
    reports: ['view', 'export'],
    documents: ['view'],
    notifications: ['view'],
  };

  // Team Leader
  const tlModules: Record<string, PermissionAction[]> = {
    dashboard: ['view'],
    attendance: ['view', 'create', 'edit'],
    shift: ['view'],
    leave: ['view', 'approve'],
    tasks: ['view', 'create', 'edit', 'assign'],
    performance: ['view'],
    site_visit: ['view'],
    notifications: ['view'],
  };

  // Employee
  const empModules: Record<string, PermissionAction[]> = {
    dashboard: ['view'],
    attendance: ['view', 'create'],
    shift: ['view'],
    leave: ['view', 'create'],
    tasks: ['view', 'edit'],
    payroll: ['view', 'export'],
    advance_salary: ['view', 'create'],
    expenses: ['view', 'create'],
    documents: ['view'],
    notifications: ['view'],
  };

  // Accounts (Normal employee features + CEO-approved payment distribution & ledger)
  const accountsModules: Record<string, PermissionAction[]> = {
    dashboard: ['view'],
    attendance: ['view', 'create'], // Self punching
    shift: ['view'],
    leave: ['view', 'create'], // Self leaves
    tasks: ['view', 'edit'], // Self tasks
    payroll: ['view', 'export'], // Self payslips
    advance_salary: ['view', 'create', 'export'], // Disburse approved advances
    expenses: ['view', 'create', 'export'], // Disburse approved claims
    petty_cash: ['view', 'create', 'export'], // Disburse funding
    documents: ['view'],
    notifications: ['view'],
  };

  const initialData: RBACDataResponse = {
    roles: [
      ...INITIAL_DEFAULT_ROLES,
      {
        id: 'role-accounts',
        name: 'Finance Manager',
        description: 'Accounts & Finance staff responsible for disbursement of CEO-approved financial requests, ledger tracking and payment recording.',
        department: 'Accounts & Finance',
        status: 'Active',
        isDefault: true,
        userCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    modules: DEFAULT_CORE_MODULES,
    permissionsByRole: {
      'role-ceo': {
        roleId: 'role-ceo',
        roleName: 'CEO',
        dataAccess: 'all',
        modulePermissions: ceoModules,
        specialPermissions: SPECIAL_PERMISSIONS_LIST.map(s => s.key),
        updatedAt: new Date().toISOString(),
        updatedBy: 'System',
      },
      'role-hr': {
        roleId: 'role-hr',
        roleName: 'HR',
        dataAccess: 'all',
        modulePermissions: hrModules,
        specialPermissions: [
          'view_salary',
          'edit_salary',
          'process_payroll',
          'view_employee_documents',
          'upload_documents',
          'edit_attendance',
          'approve_attendance_regularization',
          'approve_leave',
          'reject_leave',
          'create_tasks',
          'assign_tasks',
          'view_all_tasks',
          'view_reports',
          'export_reports',
          'manage_employees',
        ],
        updatedAt: new Date().toISOString(),
        updatedBy: 'System',
      },
      'role-accounts': {
        roleId: 'role-accounts',
        roleName: 'Finance Manager',
        dataAccess: 'own',
        modulePermissions: accountsModules,
        specialPermissions: [
          'view_reports',
          'export_reports',
        ],
        updatedAt: new Date().toISOString(),
        updatedBy: 'System',
      },
      'role-admin': {
        roleId: 'role-admin',
        roleName: 'Admin',
        dataAccess: 'all',
        modulePermissions: adminModules,
        specialPermissions: [
          'manage_employees',
          'manage_roles',
          'manage_permissions',
          'manage_hrms_settings',
          'view_employee_documents',
          'upload_documents',
          'view_reports',
          'export_reports',
          'view_all_tasks',
        ],
        updatedAt: new Date().toISOString(),
        updatedBy: 'System',
      },
      'role-manager': {
        roleId: 'role-manager',
        roleName: 'Manager',
        dataAccess: 'team',
        modulePermissions: managerModules,
        specialPermissions: [
          'approve_leave',
          'reject_leave',
          'approve_attendance_regularization',
          'edit_attendance',
          'create_tasks',
          'assign_tasks',
          'view_reports',
          'view_gps_location',
          'view_travel_history',
        ],
        updatedAt: new Date().toISOString(),
        updatedBy: 'System',
      },
      'role-team-leader': {
        roleId: 'role-team-leader',
        roleName: 'Team Leader',
        dataAccess: 'team',
        modulePermissions: tlModules,
        specialPermissions: [
          'create_tasks',
          'assign_tasks',
          'approve_attendance_regularization',
          'view_gps_location',
        ],
        updatedAt: new Date().toISOString(),
        updatedBy: 'System',
      },
      'role-employee': {
        roleId: 'role-employee',
        roleName: 'Employee',
        dataAccess: 'own',
        modulePermissions: empModules,
        specialPermissions: [],
        updatedAt: new Date().toISOString(),
        updatedBy: 'System',
      },
    },
    specialPermissionsList: SPECIAL_PERMISSIONS_LIST,
    auditLogs: [
      {
        id: 'audit-001',
        changedBy: 'System Admin',
        role: 'CEO',
        permissionChanged: 'Baseline CEO Full-Control Permissions Configured',
        oldPermission: 'None',
        newPermission: 'Full Access across all 16 HRMS modules & 22 special permissions',
        date: '2026-01-01',
        time: '09:00:00',
        timestamp: 1767238800000,
      },
      {
        id: 'audit-002',
        changedBy: 'System Admin',
        role: 'HR',
        permissionChanged: 'HR Operations baseline assigned',
        oldPermission: 'None',
        newPermission: 'Employee, Attendance, Leave, Task, Payroll, Reports (All Employee Data)',
        date: '2026-01-01',
        time: '09:05:00',
        timestamp: 1767239100000,
      },
    ],
  };

  saveStoredStore(initialData);
  return initialData;
};

const getAuthHeaders = (extraHeaders: Record<string, string> = {}) => {
  const token = typeof window !== 'undefined'
    ? (sessionStorage.getItem('vrm_auth_token') || localStorage.getItem('vrm_auth_token'))
    : null;
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const rbacService = {
  async fetchRBACData(): Promise<RBACDataResponse> {
    try {
      const res = await fetch(API_BASE, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          saveStoredStore(json.data);
          return json.data;
        }
      }
    } catch {
      // Fallback to local store
    }
    return getInitialRBACState();
  },

  async saveRolePermissions(roleId: string, payload: {
    dataAccess: DataAccessLevel;
    modulePermissions: Record<string, PermissionAction[]>;
    specialPermissions: string[];
    changedBy?: string;
  }): Promise<RolePermissionConfig> {
    const current = getInitialRBACState();
    const role = current.roles.find(r => r.id === roleId);
    const now = new Date();

    const newConfig: RolePermissionConfig = {
      roleId,
      roleName: role ? role.name : 'Unknown Role',
      dataAccess: payload.dataAccess,
      modulePermissions: payload.modulePermissions,
      specialPermissions: payload.specialPermissions,
      updatedAt: now.toISOString(),
      updatedBy: payload.changedBy || 'Admin',
    };

    current.permissionsByRole[roleId] = newConfig;

    // Append Audit Log
    current.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      changedBy: payload.changedBy || 'Admin',
      role: role ? role.name : roleId,
      permissionChanged: `Permissions saved for role ${role ? role.name : roleId}`,
      oldPermission: 'Previous matrix',
      newPermission: `Data Access: ${payload.dataAccess}; Special Perms: ${payload.specialPermissions.length}`,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      timestamp: now.getTime(),
    });

    saveStoredStore(current);

    try {
      await fetch(`${API_BASE}/roles/${roleId}/permissions`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
    } catch {
      // Offline fallback already updated
    }

    return newConfig;
  },

  async createRole(data: {
    name: string;
    description: string;
    department: string;
    status: 'Active' | 'Inactive';
    cloneFromRoleId?: string;
    changedBy?: string;
  }): Promise<RoleDefinition> {
    const current = getInitialRBACState();
    const id = `role-${data.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;
    const now = new Date();

    const newRole: RoleDefinition = {
      id,
      name: data.name.trim(),
      description: data.description.trim(),
      department: data.department.trim() || 'General',
      status: data.status,
      isDefault: false,
      userCount: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    current.roles.push(newRole);

    if (data.cloneFromRoleId && current.permissionsByRole[data.cloneFromRoleId]) {
      const src = current.permissionsByRole[data.cloneFromRoleId];
      current.permissionsByRole[id] = {
        roleId: id,
        roleName: newRole.name,
        dataAccess: src.dataAccess,
        modulePermissions: JSON.parse(JSON.stringify(src.modulePermissions)),
        specialPermissions: [...src.specialPermissions],
        updatedAt: now.toISOString(),
        updatedBy: data.changedBy || 'Admin',
      };
    } else {
      current.permissionsByRole[id] = {
        roleId: id,
        roleName: newRole.name,
        dataAccess: 'own',
        modulePermissions: { dashboard: ['view'] },
        specialPermissions: [],
        updatedAt: now.toISOString(),
        updatedBy: data.changedBy || 'Admin',
      };
    }

    current.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      changedBy: data.changedBy || 'Admin',
      role: newRole.name,
      permissionChanged: `Role Created: ${newRole.name}`,
      oldPermission: 'None',
      newPermission: `Department: ${newRole.department}, Status: ${newRole.status}`,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      timestamp: now.getTime(),
    });

    saveStoredStore(current);

    try {
      await fetch(`${API_BASE}/roles`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
      });
    } catch {
      // Handled
    }

    return newRole;
  },

  async updateRole(id: string, updates: {
    name?: string;
    description?: string;
    department?: string;
    status?: 'Active' | 'Inactive';
    changedBy?: string;
  }): Promise<RoleDefinition> {
    const current = getInitialRBACState();
    const idx = current.roles.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Role not found');

    const now = new Date();
    current.roles[idx] = {
      ...current.roles[idx],
      ...updates,
      updatedAt: now.toISOString(),
    };

    if (updates.name && current.permissionsByRole[id]) {
      current.permissionsByRole[id].roleName = updates.name;
    }

    current.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      changedBy: updates.changedBy || 'Admin',
      role: current.roles[idx].name,
      permissionChanged: `Role details updated: ${current.roles[idx].name}`,
      oldPermission: 'Previous settings',
      newPermission: `Status: ${current.roles[idx].status}, Dept: ${current.roles[idx].department}`,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      timestamp: now.getTime(),
    });

    saveStoredStore(current);

    try {
      await fetch(`${API_BASE}/roles/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(updates),
      });
    } catch {
      // Handled
    }

    return current.roles[idx];
  },

  async duplicateRole(id: string, newName: string, changedBy?: string): Promise<RoleDefinition> {
    const current = getInitialRBACState();
    const src = current.roles.find(r => r.id === id);
    if (!src) throw new Error('Source role not found');

    return this.createRole({
      name: newName,
      description: `Duplicate of ${src.name}. ${src.description}`,
      department: src.department,
      status: 'Active',
      cloneFromRoleId: src.id,
      changedBy,
    });
  },

  async deleteRole(id: string, changedBy?: string): Promise<boolean> {
    const current = getInitialRBACState();
    const role = current.roles.find(r => r.id === id);
    if (!role) throw new Error('Role not found');
    if (role.isDefault) throw new Error(`Cannot delete core system default role "${role.name}".`);

    current.roles = current.roles.filter(r => r.id !== id);
    delete current.permissionsByRole[id];

    const now = new Date();
    current.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      changedBy: changedBy || 'Admin',
      role: role.name,
      permissionChanged: `Role Deleted: ${role.name}`,
      oldPermission: `Role ${role.name}`,
      newPermission: 'Deleted',
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      timestamp: now.getTime(),
    });

    saveStoredStore(current);

    try {
      await fetch(`${API_BASE}/roles/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch {
      // Handled
    }

    return true;
  },

  async addDynamicModule(data: {
    name: string;
    key?: string;
    category?: string;
    description?: string;
    changedBy?: string;
  }): Promise<ModuleDefinition> {
    const current = getInitialRBACState();
    const key = data.key?.trim() ? data.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') : data.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const newMod: ModuleDefinition = {
      id: `mod-custom-${Date.now()}`,
      key,
      name: data.name.trim(),
      category: data.category?.trim() || 'Custom Extensions',
      isCustom: true,
      description: data.description?.trim() || `Dynamic extension module "${data.name.trim()}"`,
    };

    current.modules.push(newMod);

    // Auto-grant full access to CEO & Admin
    const allActions: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'assign', 'export'];
    if (current.permissionsByRole['role-ceo']) {
      current.permissionsByRole['role-ceo'].modulePermissions[key] = [...allActions];
    }
    if (current.permissionsByRole['role-admin']) {
      current.permissionsByRole['role-admin'].modulePermissions[key] = [...allActions];
    }

    const now = new Date();
    current.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      changedBy: data.changedBy || 'Admin',
      role: 'Global System',
      permissionChanged: `Dynamic Module Added: ${newMod.name}`,
      oldPermission: 'None',
      newPermission: `Key: ${newMod.key}, Category: ${newMod.category}`,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      timestamp: now.getTime(),
    });

    saveStoredStore(current);

    try {
      await fetch(`${API_BASE}/modules`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
      });
    } catch {
      // Handled
    }

    return newMod;
  },
};
