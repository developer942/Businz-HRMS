enum UserRoleFamily {
  ceo,
  hr,
  accounts,
  manager,
  employee,
}

class AppUser {
  const AppUser({
    required this.id,
    required this.employeeId,
    required this.name,
    required this.email,
    required this.role,
    this.department,
    this.designation,
    this.companyId,
    this.avatarUrl,
    this.mustChangePassword = false,
  });

  final String id;
  final String employeeId;
  final String name;
  final String email;
  final String role;
  final String? department;
  final String? designation;
  final String? companyId;
  final String? avatarUrl;
  final bool mustChangePassword;

  String get _roleLower => role.trim().toLowerCase();
  String get _deptLower => (department ?? '').trim().toLowerCase();
  String get _desigLower => (designation ?? '').trim().toLowerCase();
  String get _empCodeUpper => employeeId.trim().toUpperCase();

  bool get isCeo =>
      const {
        'ceo',
        'super admin',
        'management',
        'erp administrator',
      }.contains(_roleLower) ||
      _desigLower == 'ceo' ||
      _desigLower.contains('chief executive') ||
      _desigLower.contains('managing director') ||
      _empCodeUpper == 'EMP-000' ||
      _empCodeUpper == 'VRM-001';

  bool get isHr =>
      !isCeo &&
      (const {'hr', 'hr manager', 'hr admin', 'admin'}.contains(_roleLower) ||
          _deptLower == 'hr' ||
          _deptLower.contains('human resource') ||
          _desigLower.contains('hr manager') ||
          _desigLower.contains('hr admin') ||
          RegExp(r'\bhr\b').hasMatch(_desigLower));

  bool get isAccounts =>
      !isCeo &&
      !isHr &&
      (const {
            'finance',
            'finance manager',
            'accountant',
            'accounts',
          }.contains(_roleLower) ||
          _deptLower.contains('account') ||
          _deptLower.contains('finance') ||
          _desigLower.contains('account') ||
          _desigLower.contains('finance'));

  bool get isManager =>
      !isCeo &&
      !isHr &&
      !isAccounts &&
      (const {
            'manager',
            'department manager',
            'dept manager',
            'department head',
            'team leader',
          }.contains(_roleLower) ||
          _desigLower.contains('manager') ||
          _desigLower.contains('head'));

  bool get isEmployee => !isCeo && !isHr && !isAccounts;

  bool get isManagement => isCeo || isHr;
  bool get isCompanyWide => isCeo || isHr;

  /// Role family used to construct role-specific shells and dashboards.
  UserRoleFamily get roleFamily {
    if (isCeo) return UserRoleFamily.ceo;
    if (isHr) return UserRoleFamily.hr;
    if (isAccounts) return UserRoleFamily.accounts;
    if (isManager) return UserRoleFamily.manager;
    return UserRoleFamily.employee;
  }

  /// CEO never uses personal attendance punching or employee shift swap forms.
  bool get canPunchAttendance => !isCeo;
  bool get canManageShifts => isCeo || isHr;
  bool get canRequestShiftChange => !isCeo && !isHr;
  bool get canManageEmployees => isCeo || isHr;
  bool get canManageAssets => isCeo || isHr;
  bool get canCorrectAttendance => isCeo || isHr;
  bool get canApproveLeaves => isCeo || isHr || isManager;
  bool get canApproveFinanceClaims => isCeo || isHr;
  bool get canApproveExecutiveFinance => isCeo;
  /// Payment Disbursement desk belongs strictly to Accounts staff (not CEO).
  bool get canDisbursePayments => isAccounts;
  bool get canViewCompanyPayroll => isCeo || isHr || isAccounts;

  String get displayRoleLabel => switch (roleFamily) {
        UserRoleFamily.ceo =>
          _roleLower == 'super admin' ? 'CEO · Admin' : 'CEO',
        UserRoleFamily.hr => 'HR Management',
        UserRoleFamily.accounts => 'Accounts & Finance',
        UserRoleFamily.manager =>
          designation?.isNotEmpty == true ? designation! : 'Department Manager',
        UserRoleFamily.employee =>
          designation?.isNotEmpty == true ? designation! : 'Employee',
      };

  /// Matches any identifier format (employee code or database UUID) belonging to this user.
  bool matchesIdentity(dynamic candidate) {
    final value = candidate?.toString().trim().toLowerCase() ?? '';
    if (value.isEmpty) return false;
    return (employeeId.isNotEmpty &&
            value == employeeId.trim().toLowerCase()) ||
        (id.isNotEmpty && value == id.trim().toLowerCase()) ||
        (email.isNotEmpty && value == email.trim().toLowerCase());
  }

  factory AppUser.fromJson(Map<String, dynamic> json) {
    String first(List<String> keys, [String fallback = '']) {
      for (final key in keys) {
        final value = json[key];
        if (value != null && value.toString().trim().isNotEmpty) {
          return value.toString().trim();
        }
      }
      return fallback;
    }

    final dept = first(['department', 'departmentName', 'department_name']);
    final desig = first(['designation', 'jobTitle', 'job_title']);
    final comp = first(['companyId', 'company_id']);
    final avatar = first(['avatarUrl', 'avatar_url', 'avatar']);

    return AppUser(
      id: first(['id', 'userId', 'user_id']),
      employeeId: first(['employeeId', 'employee_id', 'employeeCode']),
      name: first(['name', 'fullName', 'full_name'], 'Employee'),
      email: first(['email']),
      role: first(['role', 'roleName', 'role_name'], 'Employee'),
      department: dept.isEmpty ? null : dept,
      designation: desig.isEmpty ? null : desig,
      companyId: comp.isEmpty ? null : comp,
      avatarUrl: avatar.isEmpty ? null : avatar,
      mustChangePassword: json['mustChangePassword'] == true ||
          json['must_change_password'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'employeeId': employeeId,
        'name': name,
        'email': email,
        'role': role,
        if (department != null) 'department': department,
        if (designation != null) 'designation': designation,
        if (companyId != null) 'companyId': companyId,
        if (avatarUrl != null) 'avatarUrl': avatarUrl,
        'mustChangePassword': mustChangePassword,
      };

  AppUser copyWith({bool? mustChangePassword, String? avatarUrl}) => AppUser(
        id: id,
        employeeId: employeeId,
        name: name,
        email: email,
        role: role,
        department: department,
        designation: designation,
        companyId: companyId,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        mustChangePassword: mustChangePassword ?? this.mustChangePassword,
      );
}
