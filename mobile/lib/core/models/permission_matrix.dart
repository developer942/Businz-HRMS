import 'app_user.dart';

class PermissionMatrix {
  const PermissionMatrix({
    required this.moduleActions,
    required this.specialPermissions,
    required this.dataAccess,
    this.isPettyCashCustodian = false,
  });

  final Map<String, Set<String>> moduleActions;
  final Set<String> specialPermissions;
  final String dataAccess;
  final bool isPettyCashCustodian;

  static const _aliases = <String, List<String>>{
    'leave': ['leave', 'leaves'],
    'leaves': ['leave', 'leaves'],
    'shift': ['shift', 'shifts'],
    'shifts': ['shift', 'shifts'],
    'gps_tracking': ['gps_tracking', 'tracking', 'site_visit'],
    'tracking': ['gps_tracking', 'tracking', 'site_visit'],
    'field_allowance': ['field_allowance', 'finance', 'expenses'],
    'finance': ['field_allowance', 'finance', 'expenses'],
    'expenses': ['expenses', 'field_allowance', 'finance'],
    'attendance_log': ['attendance', 'attendance_log'],
    'contact_scanner': ['customer_data'],
    'holidays': ['holidays', 'leave'],
  };

  bool can(String module, [String action = 'view']) {
    final keys = _aliases[module] ?? [module];
    for (final key in keys) {
      final actions = moduleActions[key];
      if (actions != null &&
          (actions.contains(action) || actions.contains('*'))) {
        return true;
      }
    }
    return false;
  }

  bool hasSpecial(String permission) => specialPermissions.contains(permission);

  bool get canAssignTasks =>
      can('tasks', 'create') ||
      can('tasks', 'assign') ||
      hasSpecial('create_tasks') ||
      hasSpecial('assign_tasks');

  /// Evaluates strict role + server RBAC visibility aligned with Web Sidebar.tsx.
  bool canAccessModule(String moduleKey, AppUser user) {
    if (moduleKey == 'notifications' || moduleKey == 'profile') return true;

    // CEO / Super Admin: full executive access except employee face punch station
    // and the Accounts-only Payment Disbursement desk.
    if (user.isCeo) {
      return moduleKey != 'face_attendance' &&
          moduleKey != 'accounts_payment';
    }

    // Accounts staff: self-service + finance disbursement + CRM/scanner;
    // strictly NO Employee Directory, Company Attendance Report, HR Settings, Recruitment.
    if (user.isAccounts) {
      if (const {
        'employees',
        'attendance_report',
        'reports',
        'settings',
        'recruitment',
      }.contains(moduleKey)) {
        return false;
      }
      if (const {
        'face_attendance',
        'accounts_payment',
        'field_allowance',
        'expenses',
        'petty_cash',
        'payroll',
        'advance_salary',
        'contact_scanner',
        'whatsapp_crm',
        'attendance_log',
        'overtime',
        'shifts',
        'leave',
        'holidays',
        'tasks',
        'assets',
        'documents',
      }.contains(moduleKey)) {
        return true;
      }
    }

    // Payment Disbursement strictly restricted to Accounts only.
    if (moduleKey == 'accounts_payment') {
      return user.isAccounts;
    }

    // Petty Cash strictly restricted to CEO, Accounts, and the active Custodian.
    if (moduleKey == 'petty_cash') {
      return user.isCeo || user.isAccounts || isPettyCashCustodian;
    }

    // HR: company-wide HR operations (no CEO-only disbursement desk).
    if (user.isHr) {
      if (moduleKey == 'accounts_payment') return false;
      if (const {
        'employees',
        'attendance_log',
        'attendance_report',
        'face_attendance',
        'shifts',
        'leave',
        'holidays',
        'overtime',
        'tasks',
        'tracking',
        'field_allowance',
        'expenses',
        'payroll',
        'advance_salary',
        'assets',
        'contact_scanner',
        'whatsapp_crm',
        'reports',
        'documents',
        'recruitment',
        'performance',
      }.contains(moduleKey)) {
        return true;
      }
    }

    // Standard Employee / Manager: restricted from Employee Directory, Company Reports & Settings.
    if (user.isEmployee) {
      if (const {'employees', 'attendance_report', 'reports', 'settings'}
              .contains(moduleKey) &&
          !user.isManager) {
        return false;
      }
      if (const {
        'face_attendance',
        'attendance_log',
        'overtime',
        'shifts',
        'leave',
        'holidays',
        'tasks',
        'payroll',
        'field_allowance',
        'advance_salary',
        'assets',
        'tracking',
        'contact_scanner',
        'whatsapp_crm',
        'documents',
      }.contains(moduleKey)) {
        return true;
      }
    }

    return can(moduleKey, 'view');
  }

  PermissionMatrix copyWith({bool? isPettyCashCustodian}) => PermissionMatrix(
        moduleActions: moduleActions,
        specialPermissions: specialPermissions,
        dataAccess: dataAccess,
        isPettyCashCustodian: isPettyCashCustodian ?? this.isPettyCashCustodian,
      );

  factory PermissionMatrix.forUser(
    Map<String, dynamic> payload,
    AppUser user, {
    bool isPettyCashCustodian = false,
  }) {
    final effectiveRole = switch (user.roleFamily) {
      UserRoleFamily.ceo => 'CEO',
      UserRoleFamily.hr => 'HR',
      UserRoleFamily.accounts => 'Finance Manager',
      UserRoleFamily.manager => 'Manager',
      UserRoleFamily.employee => user.role,
    };
    return PermissionMatrix.forRole(
      payload,
      effectiveRole,
      isPettyCashCustodian: isPettyCashCustodian,
    );
  }

  factory PermissionMatrix.forRole(
    Map<String, dynamic> payload,
    String role, {
    bool isPettyCashCustodian = false,
  }) {
    final data = payload['data'] is Map
        ? Map<String, dynamic>.from(payload['data'] as Map)
        : payload;
    final configs = data['permissionsByRole'];
    Map<String, dynamic>? match;
    final cleanRole = role.trim().toLowerCase();

    if (configs is Map) {
      for (final entry in configs.entries) {
        if (entry.value is! Map) continue;
        final candidate = Map<String, dynamic>.from(entry.value as Map);
        final candidateName =
            candidate['roleName']?.toString().trim().toLowerCase() ?? '';
        final matched = candidateName == cleanRole ||
            ((cleanRole == 'super admin' || cleanRole.contains('ceo')) &&
                candidateName == 'ceo') ||
            (cleanRole.contains('hr') && candidateName == 'hr') ||
            ((cleanRole.contains('finance') || cleanRole.contains('account')) &&
                candidateName == 'finance manager') ||
            (cleanRole.contains('manager') &&
                !cleanRole.contains('hr') &&
                !cleanRole.contains('finance') &&
                candidateName == 'manager');
        if (matched) {
          match = candidate;
          break;
        }
      }
    }

    if (match == null) {
      return PermissionMatrix.fallback(
        role,
        isPettyCashCustodian: isPettyCashCustodian,
      );
    }

    final modules = <String, Set<String>>{};
    final rawModules = match['modulePermissions'];
    if (rawModules is Map) {
      for (final entry in rawModules.entries) {
        final actions = entry.value is List
            ? (entry.value as List).map((e) => e.toString()).toSet()
            : <String>{};
        modules[entry.key.toString()] = actions;
      }
    }

    // Ensure CEO/Super Admin retains full module actions even against older server RBAC lists.
    if (cleanRole == 'super admin' || cleanRole.contains('ceo')) {
      for (final module in _knownModules) {
        modules.putIfAbsent(module, () => {..._allActions});
      }
      modules.remove('face_attendance');
      modules.remove('accounts_payment');
    }

    return PermissionMatrix(
      moduleActions: modules,
      specialPermissions: match['specialPermissions'] is List
          ? (match['specialPermissions'] as List)
              .map((e) => e.toString())
              .toSet()
          : const {},
      dataAccess: match['dataAccess']?.toString() ?? 'own',
      isPettyCashCustodian: isPettyCashCustodian,
    );
  }

  factory PermissionMatrix.fallback(
    String role, {
    bool isPettyCashCustodian = false,
  }) {
    final normalized = role.trim().toLowerCase();
    final base = <String, Set<String>>{
      'dashboard': {'view'},
      'notifications': {'view'},
      'documents': {'view'},
    };
    if (normalized == 'ceo' || normalized == 'super admin') {
      for (final module in _knownModules) {
        base[module] = {..._allActions};
      }
      base.remove('face_attendance');
      base.remove('accounts_payment');
    } else if (normalized.contains('hr') || normalized == 'admin') {
      for (final module in _hrModules) {
        base[module] = {
          'view',
          'create',
          'edit',
          'approve',
          'reject',
          'assign',
          'export',
        };
      }
      base['payroll'] = {'view', 'create', 'export'};
      base['advance_salary'] = {'view', 'create', 'export'};
      base['expenses'] = {'view', 'create', 'export'};
    } else if (normalized.contains('finance') ||
        normalized.contains('account')) {
      for (final module in _employeeModules) {
        base[module] = {'view', 'create'};
      }
      for (final module in [
        'payroll',
        'expenses',
        'petty_cash',
        'field_allowance',
        'accounts_payment',
        'advance_salary',
      ]) {
        base[module] = {'view', 'create', 'export'};
      }
      base['customer_data'] = {..._allActions};
      base['whatsapp_crm'] = {..._allActions};
    } else if (normalized.contains('manager') ||
        normalized.contains('team leader')) {
      for (final module in _employeeModules) {
        base[module] = {'view', 'create', 'edit'};
      }
      base['leave'] = {'view', 'create', 'approve', 'reject'};
      base['tasks'] = {'view', 'create', 'edit', 'assign'};
      base['gps_tracking'] = {'view', 'create'};
      base['reports'] = {'view', 'export'};
    } else {
      for (final module in _employeeModules) {
        base[module] = {'view', 'create'};
      }
      base['tasks'] = {'view', 'edit'};
      base['whatsapp_crm'] = {'view', 'edit'};
      base['assets'] = {'view'};
    }
    return PermissionMatrix(
      moduleActions: base,
      specialPermissions: normalized == 'ceo' || normalized == 'super admin'
          ? const {
              'create_tasks',
              'assign_tasks',
              'approve_leave',
              'edit_attendance',
              'approve_payroll'
            }
          : normalized.contains('hr')
              ? const {
                  'create_tasks',
                  'assign_tasks',
                  'approve_leave',
                  'edit_attendance',
                  'manage_employees'
                }
              : const {},
      dataAccess: normalized == 'ceo' ||
              normalized == 'super admin' ||
              normalized.contains('hr')
          ? 'all'
          : normalized.contains('manager')
              ? 'team'
              : 'own',
      isPettyCashCustodian: isPettyCashCustodian,
    );
  }

  static const _allActions = <String>{
    'view',
    'create',
    'edit',
    'delete',
    'approve',
    'reject',
    'assign',
    'export',
  };

  static const _employeeModules = [
    'dashboard',
    'attendance',
    'face_attendance',
    'shift',
    'leave',
    'holidays',
    'tasks',
    'payroll',
    'advance_salary',
    'expenses',
    'field_allowance',
    'gps_tracking',
    'assets',
    'customer_data',
    'whatsapp_crm',
    'documents',
    'notifications',
  ];

  static const _hrModules = [
    'dashboard',
    'employees',
    'attendance',
    'face_attendance',
    'shift',
    'leave',
    'holidays',
    'overtime',
    'tasks',
    'performance',
    'gps_tracking',
    'field_allowance',
    'assets',
    'customer_data',
    'whatsapp_crm',
    'recruitment',
    'reports',
    'documents',
    'notifications',
  ];

  static const _knownModules = [
    ..._hrModules,
    'payroll',
    'advance_salary',
    'expenses',
    'petty_cash',
    'accounts_payment',
    'settings',
  ];
}
