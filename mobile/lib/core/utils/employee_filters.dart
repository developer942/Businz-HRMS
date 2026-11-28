// Shared employee filtering & identity helpers used across mobile modules
// (Employee Directory, Field Tracking duty assignment, Reports, Payroll).

const _ceoEmployeeCodes = <String>{'vrm-001', 'emp-000'};

const _ceoRoles = <String>{
  'ceo',
  'super admin',
  'super_admin',
  'superadmin',
  'management',
  'erp administrator',
  'owner',
};

/// Returns true when an employee record represents the CEO / executive owner
/// account (`Velmurugan M` / `VRM-001` / CEO role or designation) that must be
/// excluded from standard staff directories, field duty assignments, attendance
/// reports, and regular staff payroll lists.
bool isCeoEmployeeRecord(Map<String, dynamic> emp) {
  final code = (emp['employeeId'] ?? emp['employee_id'] ?? '')
      .toString()
      .trim()
      .toLowerCase();
  if (_ceoEmployeeCodes.contains(code)) return true;

  final role = (emp['role'] ?? emp['userRole'] ?? emp['user_role'] ?? '')
      .toString()
      .trim()
      .toLowerCase();
  if (_ceoRoles.contains(role)) return true;

  final designation = (emp['designation'] ?? emp['jobTitle'] ?? '')
      .toString()
      .trim()
      .toLowerCase();
  if (designation == 'ceo' ||
      designation.startsWith('ceo ') ||
      designation.endsWith(' ceo') ||
      designation.contains('chief executive') ||
      designation.contains('managing director')) {
    return true;
  }

  final department = (emp['department'] ?? emp['departmentName'] ?? '')
      .toString()
      .trim()
      .toLowerCase();
  if (department == 'executive' && designation.contains('ceo')) {
    return true;
  }

  return false;
}

/// Filters out CEO / executive owner rows from an employee list.
List<Map<String, dynamic>> excludeCeoEmployees(
  List<Map<String, dynamic>> employees,
) =>
    employees.where((e) => !isCeoEmployeeRecord(e)).toList(growable: false);
