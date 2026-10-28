const ALL_ACTIONS = [
    'view',
    'create',
    'edit',
    'delete',
    'approve',
    'reject',
    'assign',
    'export',
];
export const CORE_MODULES = [
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
    { id: 'mod-17', key: 'customer_data', name: 'Customer Data Collection', category: 'Operations', isCustom: false, description: 'Field customer capture, visiting card OCR scanning, WhatsApp consent and templates' },
];
export const SPECIAL_PERMISSIONS_CATALOG = [
    // Payroll & Salary
    { key: 'view_salary', label: 'View Salary', category: 'Payroll', description: 'View compensation structure and monthly remuneration' },
    { key: 'edit_salary', label: 'Edit Salary', category: 'Payroll', description: 'Modify wage components, CTC and bonus structures' },
    { key: 'process_payroll', label: 'Process Payroll', category: 'Payroll', description: 'Trigger monthly batch payroll calculations' },
    { key: 'approve_payroll', label: 'Approve Payroll', category: 'Payroll', description: 'Final sign-off and disbursal approval for payroll batches' },
    // Documents
    { key: 'view_employee_documents', label: 'View Employee Documents', category: 'Documents', description: 'Inspect identity cards, KYC and contracts' },
    { key: 'upload_documents', label: 'Upload Documents', category: 'Documents', description: 'Attach new confidential records and certificates' },
    // Attendance & Regularization
    { key: 'edit_attendance', label: 'Edit Attendance', category: 'Attendance', description: 'Manually alter punch records, overtime and timesheets' },
    { key: 'approve_attendance_regularization', label: 'Approve Attendance Regularization', category: 'Attendance', description: 'Sanction employee miss-punch and regularization requests' },
    // Leave Management
    { key: 'approve_leave', label: 'Approve Leave', category: 'Leave', description: 'Approve applied leave applications' },
    { key: 'reject_leave', label: 'Reject Leave', category: 'Leave', description: 'Decline leave applications with reason' },
    // Tasks
    { key: 'create_tasks', label: 'Create Tasks', category: 'Tasks', description: 'Spawn new actionable assignments and work tickets' },
    { key: 'assign_tasks', label: 'Assign Tasks', category: 'Tasks', description: 'Delegate tasks to team members or departments' },
    { key: 'view_all_tasks', label: 'View All Tasks', category: 'Tasks', description: 'Global task board visibility across all departments' },
    // Advance Salary
    { key: 'approve_salary_advance', label: 'Approve Advance Salary', category: 'Advance Salary', description: 'Authorize loan & advance applications up to policy cap' },
    // Location & Tracking
    { key: 'view_gps_location', label: 'View GPS Location', category: 'Tracking', description: 'View current coordinates and check-in positions' },
    { key: 'view_travel_history', label: 'View Employee Travel History', category: 'Tracking', description: 'Inspect historical breadcrumbs and odometer calculations' },
    // Reports
    { key: 'view_reports', label: 'View Reports', category: 'Reports', description: 'Access standard business analytics and dashboards' },
    { key: 'export_reports', label: 'Export Reports', category: 'Reports', description: 'Download CSV/Excel/PDF consolidated reports' },
    // Administration
    { key: 'manage_employees', label: 'Manage Employees', category: 'Administration', description: 'Add, archive, terminate and edit employee records' },
    { key: 'manage_roles', label: 'Manage Roles', category: 'Administration', description: 'Create, modify and duplicate organizational roles' },
    { key: 'manage_permissions', label: 'Manage Permissions', category: 'Administration', description: 'Adjust module permissions and data access levels' },
    { key: 'manage_hrms_settings', label: 'Manage HRMS Settings', category: 'Administration', description: 'Modify enterprise policies, time shifts and company details' },
];
export class RbacRepository {
    roles = [
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
    ];
    modules = [...CORE_MODULES];
    permissionsByRole = {};
    auditLogs = [];
    constructor() {
        this.seedDefaultPermissions();
    }
    seedDefaultPermissions() {
        // 1. CEO (Full Access across every module, action, and special permission)
        const ceoModules = {};
        this.modules.forEach(m => {
            ceoModules[m.key] = [...ALL_ACTIONS];
        });
        this.permissionsByRole['role-ceo'] = {
            roleId: 'role-ceo',
            roleName: 'CEO',
            dataAccess: 'all',
            modulePermissions: ceoModules,
            specialPermissions: SPECIAL_PERMISSIONS_CATALOG.map(sp => sp.key),
            updatedAt: new Date().toISOString(),
            updatedBy: 'System',
        };
        // 2. HR (Employee + Attendance + Leave + Task + Reports + All Employee Data - NO CEO FINANCIAL APPROVAL)
        const hrModules = {};
        this.modules.forEach(m => {
            if (['expenses', 'advance_salary', 'payroll'].includes(m.key)) {
                // HR can view, create and export, but CANNOT approve financial requests
                hrModules[m.key] = ['view', 'create', 'export'];
            }
            else if (['employees', 'attendance', 'shift', 'leave', 'tasks', 'reports', 'documents', 'notifications', 'dashboard', 'customer_data'].includes(m.key)) {
                hrModules[m.key] = [...ALL_ACTIONS];
            }
            else {
                hrModules[m.key] = ['view'];
            }
        });
        this.permissionsByRole['role-hr'] = {
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
        };
        // 3. Admin (System Administration Access + All Employee Data)
        const adminModules = {};
        this.modules.forEach(m => {
            adminModules[m.key] = ['view', 'create', 'edit', 'delete', 'export'];
        });
        adminModules['settings'] = [...ALL_ACTIONS];
        adminModules['documents'] = [...ALL_ACTIONS];
        this.permissionsByRole['role-admin'] = {
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
        };
        // 4. Manager (Own Data + Team Data)
        const managerModules = {
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
            customer_data: ['view', 'create', 'edit', 'export'],
        };
        this.permissionsByRole['role-manager'] = {
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
        };
        // 5. Team Leader (Own Data + Team Data)
        const tlModules = {
            dashboard: ['view'],
            attendance: ['view', 'create', 'edit'],
            shift: ['view'],
            leave: ['view', 'approve'],
            tasks: ['view', 'create', 'edit', 'assign'],
            performance: ['view'],
            site_visit: ['view'],
            notifications: ['view'],
            customer_data: ['view', 'create'],
        };
        this.permissionsByRole['role-team-leader'] = {
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
        };
        // 6. Employee (Own Data Only)
        const empModules = {
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
            customer_data: ['view', 'create'],
        };
        this.permissionsByRole['role-employee'] = {
            roleId: 'role-employee',
            roleName: 'Employee',
            dataAccess: 'own',
            modulePermissions: empModules,
            specialPermissions: [],
            updatedAt: new Date().toISOString(),
            updatedBy: 'System',
        };
        // 7. Accounts (Finance Manager / Accounts Staff)
        // Normal Employee features + CEO-approved payment distribution & ledger
        // STRICTLY NO access to employee directory, company attendance, or CEO approval rights
        const accountsModules = {
            dashboard: ['view'],
            attendance: ['view', 'create'], // Self punches only
            shift: ['view'],
            leave: ['view', 'create'], // Self leaves
            tasks: ['view', 'edit'],
            payroll: ['view', 'export'], // Self payslip
            advance_salary: ['view', 'create', 'export'], // Disburse approved advances
            expenses: ['view', 'create', 'export'], // Disburse approved claims
            petty_cash: ['view', 'create', 'export'], // Disburse funding
            documents: ['view'],
            notifications: ['view'],
        };
        this.permissionsByRole['role-accounts'] = {
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
        };
    }
    getAllRBACData() {
        return {
            roles: [...this.roles],
            modules: [...this.modules],
            permissionsByRole: { ...this.permissionsByRole },
            specialPermissionsList: [...SPECIAL_PERMISSIONS_CATALOG],
            auditLogs: [...this.auditLogs].sort((a, b) => b.timestamp - a.timestamp),
        };
    }
    getRoleById(id) {
        return this.roles.find(r => r.id === id);
    }
    getRoleByName(name) {
        return this.roles.find(r => r.name.toLowerCase() === name.toLowerCase());
    }
    getRolePermissions(roleIdOrName) {
        if (this.permissionsByRole[roleIdOrName]) {
            return this.permissionsByRole[roleIdOrName];
        }
        const clean = (roleIdOrName || '').toLowerCase().trim();
        const role = this.roles.find(r => r.id === roleIdOrName ||
            r.name.toLowerCase() === clean ||
            (clean.includes('hr') && r.name === 'HR') ||
            (clean.includes('admin') && r.name === 'Admin') ||
            (clean.includes('ceo') && r.name === 'CEO') ||
            ((clean.includes('finance') || clean.includes('account')) && r.name === 'Finance Manager'));
        if (role && this.permissionsByRole[role.id]) {
            return this.permissionsByRole[role.id];
        }
        return undefined;
    }
    createRole(data, changedBy = 'Admin') {
        const existing = this.getRoleByName(data.name);
        if (existing) {
            throw new Error(`Role with name "${data.name}" already exists.`);
        }
        const id = `role-${data.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;
        const now = new Date().toISOString();
        const newRole = {
            id,
            name: data.name.trim(),
            description: data.description.trim(),
            department: data.department.trim() || 'General',
            status: data.status,
            isDefault: false,
            userCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        this.roles.push(newRole);
        // If cloned, copy source role permissions
        if (data.cloneFromRoleId && this.permissionsByRole[data.cloneFromRoleId]) {
            const source = this.permissionsByRole[data.cloneFromRoleId];
            this.permissionsByRole[id] = {
                roleId: id,
                roleName: newRole.name,
                dataAccess: source.dataAccess,
                modulePermissions: JSON.parse(JSON.stringify(source.modulePermissions)),
                specialPermissions: [...source.specialPermissions],
                updatedAt: now,
                updatedBy: changedBy,
            };
        }
        else {
            // Default blank config
            this.permissionsByRole[id] = {
                roleId: id,
                roleName: newRole.name,
                dataAccess: 'own',
                modulePermissions: { dashboard: ['view'] },
                specialPermissions: [],
                updatedAt: now,
                updatedBy: changedBy,
            };
        }
        this.appendAuditLog({
            changedBy,
            role: newRole.name,
            permissionChanged: `Role created: ${newRole.name}`,
            oldPermission: 'None',
            newPermission: `Role registered with status "${newRole.status}" in department "${newRole.department}"`,
        });
        return newRole;
    }
    updateRole(id, updates, changedBy = 'Admin') {
        const roleIndex = this.roles.findIndex(r => r.id === id);
        if (roleIndex === -1) {
            throw new Error(`Role not found: ${id}`);
        }
        const currentRole = this.roles[roleIndex];
        const now = new Date().toISOString();
        const updatedRole = {
            ...currentRole,
            ...updates,
            updatedAt: now,
        };
        this.roles[roleIndex] = updatedRole;
        if (this.permissionsByRole[id] && updates.name) {
            this.permissionsByRole[id].roleName = updates.name;
        }
        this.appendAuditLog({
            changedBy,
            role: updatedRole.name,
            permissionChanged: `Role metadata updated: ${updatedRole.name}`,
            oldPermission: `${currentRole.name} (${currentRole.status})`,
            newPermission: `${updatedRole.name} (${updatedRole.status})`,
        });
        return updatedRole;
    }
    duplicateRole(id, newName, changedBy = 'Admin') {
        const sourceRole = this.roles.find(r => r.id === id);
        if (!sourceRole) {
            throw new Error(`Source role not found: ${id}`);
        }
        return this.createRole({
            name: newName.trim(),
            description: `Duplicate of ${sourceRole.name}. ${sourceRole.description}`,
            department: sourceRole.department,
            status: 'Active',
            cloneFromRoleId: sourceRole.id,
        }, changedBy);
    }
    deleteRole(id, changedBy = 'Admin') {
        const role = this.roles.find(r => r.id === id);
        if (!role) {
            throw new Error(`Role not found: ${id}`);
        }
        if (role.isDefault) {
            throw new Error(`Cannot delete core system default role "${role.name}".`);
        }
        this.roles = this.roles.filter(r => r.id !== id);
        delete this.permissionsByRole[id];
        this.appendAuditLog({
            changedBy,
            role: role.name,
            permissionChanged: `Role deleted: ${role.name}`,
            oldPermission: `Role ${role.name} (${role.department})`,
            newPermission: 'Deleted',
        });
        return true;
    }
    saveRolePermissions(roleId, updates, changedBy = 'Admin') {
        const role = this.roles.find(r => r.id === roleId);
        if (!role) {
            throw new Error(`Role not found: ${roleId}`);
        }
        const previousConfig = this.permissionsByRole[roleId];
        const now = new Date().toISOString();
        const newConfig = {
            roleId,
            roleName: role.name,
            dataAccess: updates.dataAccess,
            modulePermissions: updates.modulePermissions,
            specialPermissions: updates.specialPermissions,
            updatedAt: now,
            updatedBy: changedBy,
        };
        this.permissionsByRole[roleId] = newConfig;
        // Diff calculation for Audit Logging
        const diffs = [];
        if (previousConfig) {
            if (previousConfig.dataAccess !== updates.dataAccess) {
                diffs.push(`Data Access: "${previousConfig.dataAccess}" -> "${updates.dataAccess}"`);
            }
            // Check module permissions diff
            const allModKeys = Array.from(new Set([...Object.keys(previousConfig.modulePermissions || {}), ...Object.keys(updates.modulePermissions || {})]));
            for (const mKey of allModKeys) {
                const oldActs = (previousConfig.modulePermissions[mKey] || []).sort().join(',');
                const newActs = (updates.modulePermissions[mKey] || []).sort().join(',');
                if (oldActs !== newActs) {
                    diffs.push(`${mKey}: [${oldActs || 'none'}] -> [${newActs || 'none'}]`);
                }
            }
            // Check special permissions diff
            const oldSpec = (previousConfig.specialPermissions || []).sort().join(',');
            const newSpec = (updates.specialPermissions || []).sort().join(',');
            if (oldSpec !== newSpec) {
                diffs.push(`Special: [${oldSpec || 'none'}] -> [${newSpec || 'none'}]`);
            }
        }
        else {
            diffs.push('Config initialized');
        }
        if (diffs.length > 0) {
            this.appendAuditLog({
                changedBy,
                role: role.name,
                permissionChanged: `Permissions modified for ${role.name}`,
                oldPermission: previousConfig ? `DataAccess: ${previousConfig.dataAccess}, Spec: ${previousConfig.specialPermissions.length}` : 'None',
                newPermission: diffs.slice(0, 3).join('; ') + (diffs.length > 3 ? ` (+${diffs.length - 3} more)` : ''),
            });
        }
        return newConfig;
    }
    addDynamicModule(moduleData, changedBy = 'Admin') {
        const key = moduleData.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const existing = this.modules.find(m => m.key === key);
        if (existing) {
            throw new Error(`Module with key "${key}" already exists.`);
        }
        const newModule = {
            id: `mod-custom-${Date.now()}`,
            key,
            name: moduleData.name.trim(),
            category: moduleData.category?.trim() || 'Custom Extensions',
            isCustom: true,
            description: moduleData.description?.trim() || `Dynamic extension module "${moduleData.name.trim()}"`,
        };
        this.modules.push(newModule);
        // Auto-grant full access to CEO & Admin for the new dynamic module
        if (this.permissionsByRole['role-ceo']) {
            this.permissionsByRole['role-ceo'].modulePermissions[key] = [...ALL_ACTIONS];
        }
        if (this.permissionsByRole['role-admin']) {
            this.permissionsByRole['role-admin'].modulePermissions[key] = [...ALL_ACTIONS];
        }
        this.appendAuditLog({
            changedBy,
            role: 'Global System',
            permissionChanged: `New Module Registered: ${newModule.name}`,
            oldPermission: 'Module Not Present',
            newPermission: `Module "${newModule.name}" (key: ${newModule.key}) added to dynamic registry`,
        });
        return newModule;
    }
    appendAuditLog(entry) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];
        const log = {
            id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            changedBy: entry.changedBy,
            role: entry.role,
            permissionChanged: entry.permissionChanged,
            oldPermission: entry.oldPermission,
            newPermission: entry.newPermission,
            date: dateStr,
            time: timeStr,
            timestamp: now.getTime(),
        };
        this.auditLogs.unshift(log);
        // Keep max 500 audit logs
        if (this.auditLogs.length > 500) {
            this.auditLogs.pop();
        }
        return log;
    }
    getAuditLogs() {
        return [...this.auditLogs];
    }
}
export const rbacRepository = new RbacRepository();
//# sourceMappingURL=rbacRepository.js.map