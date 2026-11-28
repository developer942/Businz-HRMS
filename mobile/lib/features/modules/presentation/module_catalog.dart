import 'package:flutter/material.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/permission_matrix.dart';

enum ModuleSection {
  organization('Organization'),
  timeAndAttendance('Time & Attendance'),
  workflowAndOps('Workflow & Operations'),
  financeAndPayroll('Finance & Payroll'),
  workspaceAndReports('Workspace & Insights'),
  account('Account & Preferences');

  const ModuleSection(this.label);
  final String label;
}

class ModuleDefinition {
  const ModuleDefinition({
    required this.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.permission,
    required this.section,
    this.titleForUser,
    this.subtitleForUser,
  });

  final String key;
  final String title;
  final String subtitle;
  final IconData icon;
  final String permission;
  final ModuleSection section;
  final String Function(AppUser user)? titleForUser;
  final String Function(AppUser user)? subtitleForUser;

  String resolveTitle(AppUser? user) =>
      user != null && titleForUser != null ? titleForUser!(user) : title;

  String resolveSubtitle(AppUser? user) =>
      user != null && subtitleForUser != null
          ? subtitleForUser!(user)
          : subtitle;
}

final moduleCatalog = <ModuleDefinition>[
  // Organization
  const ModuleDefinition(
    key: 'employees',
    title: 'Employees',
    subtitle: 'Directory, profiles & department roster',
    icon: Icons.groups_2_outlined,
    permission: 'employees',
    section: ModuleSection.organization,
  ),
  const ModuleDefinition(
    key: 'approvals',
    title: 'Approvals Center',
    subtitle: 'Unified leaves, claims, shifts & finance reviews',
    icon: Icons.fact_check_outlined,
    permission: 'leave',
    section: ModuleSection.organization,
  ),

  // Time & Attendance
  ModuleDefinition(
    key: 'attendance_log',
    title: 'Attendance Log',
    subtitle: 'Daily punches, GPS proof & corrections',
    icon: Icons.event_available_outlined,
    permission: 'attendance',
    section: ModuleSection.timeAndAttendance,
    titleForUser: (u) =>
        u.isManagement ? 'Attendance Report' : 'My Attendance Log',
    subtitleForUser: (u) => u.isManagement
        ? 'Company muster, late entries & corrections'
        : 'Your punch history, photos & shift hours',
  ),
  ModuleDefinition(
    key: 'overtime',
    title: 'Overtime',
    subtitle: 'Daily overtime hours & policy payout breakdown',
    icon: Icons.more_time_rounded,
    permission: 'overtime',
    section: ModuleSection.timeAndAttendance,
    titleForUser: (u) =>
        (u.isCeo || u.isHr) ? 'Overtime Log' : 'My Overtime',
    subtitleForUser: (u) => (u.isCeo || u.isHr)
        ? 'Daily employee OT hours & eligible amounts'
        : 'Your daily overtime hours & policy payout',
  ),
  ModuleDefinition(
    key: 'shifts',
    title: 'Shifts',
    subtitle: 'Work schedules, assignments & requests',
    icon: Icons.access_time_rounded,
    permission: 'shift',
    section: ModuleSection.timeAndAttendance,
    titleForUser: (u) => u.canManageShifts ? 'Shift Management' : 'My Shift',
    subtitleForUser: (u) => u.canManageShifts
        ? 'Manage shifts, roster assignments & requests'
        : 'Assigned shift timing & change requests',
  ),
  ModuleDefinition(
    key: 'leave',
    title: 'Leave Management',
    subtitle: 'Balances, requests & leave approvals',
    icon: Icons.event_note_outlined,
    permission: 'leave',
    section: ModuleSection.timeAndAttendance,
    titleForUser: (u) => u.isManagement ? 'Leave Management' : 'Leave Request',
    subtitleForUser: (u) => u.isManagement
        ? 'Review & approve team leave applications'
        : 'Check balances & apply for time off',
  ),
  const ModuleDefinition(
    key: 'holidays',
    title: 'Holidays',
    subtitle: 'Company holiday calendar & upcoming offs',
    icon: Icons.beach_access_outlined,
    permission: 'holidays',
    section: ModuleSection.timeAndAttendance,
  ),

  // Workflow & Operations
  const ModuleDefinition(
    key: 'tasks',
    title: 'Task Management',
    subtitle: 'Assignments, progress, daily reports & reviews',
    icon: Icons.task_alt_rounded,
    permission: 'tasks',
    section: ModuleSection.workflowAndOps,
  ),
  ModuleDefinition(
    key: 'tracking',
    title: 'Field Tracking',
    subtitle: 'GPS visits, route maps & duty assignments',
    icon: Icons.location_on_outlined,
    permission: 'gps_tracking',
    section: ModuleSection.workflowAndOps,
    titleForUser: (u) =>
        u.isManagement ? 'Field Tracking & Duties' : 'Field Tracking',
    subtitleForUser: (u) => u.isManagement
        ? 'Live trips, assign duties, routes & alerts'
        : 'Assigned field duties & travel history',
  ),
  ModuleDefinition(
    key: 'assets',
    title: 'Assets',
    subtitle: 'Company equipment & IT hardware',
    icon: Icons.devices_other_outlined,
    permission: 'assets',
    section: ModuleSection.workflowAndOps,
    titleForUser: (u) => u.canManageAssets ? 'Asset Management' : 'My Assets',
    subtitleForUser: (u) => u.canManageAssets
        ? 'Inventory, assignments & maintenance tracking'
        : 'Equipment currently assigned to you',
  ),

  // Finance & Payroll
  const ModuleDefinition(
    key: 'accounts_payment',
    title: 'Payment Disbursement',
    subtitle: 'Unified Accounts payout & settlement queue',
    icon: Icons.account_balance_outlined,
    permission: 'accounts_payment',
    section: ModuleSection.financeAndPayroll,
  ),
  const ModuleDefinition(
    key: 'field_allowance',
    title: 'Finance & Claims',
    subtitle: 'Field visits, expense claims & receipts',
    icon: Icons.receipt_long_outlined,
    permission: 'field_allowance',
    section: ModuleSection.financeAndPayroll,
  ),
  const ModuleDefinition(
    key: 'petty_cash',
    title: 'Petty Cash',
    subtitle: 'Custodian ledger, cash requests & vouchers',
    icon: Icons.account_balance_wallet_outlined,
    permission: 'petty_cash',
    section: ModuleSection.financeAndPayroll,
  ),
  ModuleDefinition(
    key: 'payroll',
    title: 'Payroll & Payslips',
    subtitle: 'Monthly salary breakdown & PDF payslips',
    icon: Icons.payments_outlined,
    permission: 'payroll',
    section: ModuleSection.financeAndPayroll,
    titleForUser: (u) =>
        u.canViewCompanyPayroll ? 'Payroll & Payslips' : 'My Payslips',
    subtitleForUser: (u) => u.canViewCompanyPayroll
        ? 'Payroll cycles, records & PDF payslip export'
        : 'View & share your monthly salary slips',
  ),
  const ModuleDefinition(
    key: 'advance_salary',
    title: 'Advance Salary',
    subtitle: 'Salary advances, loans & repayment status',
    icon: Icons.currency_rupee_rounded,
    permission: 'advance_salary',
    section: ModuleSection.financeAndPayroll,
  ),

  // Workspace & Insights
  const ModuleDefinition(
    key: 'whatsapp_crm',
    title: 'WhatsApp CRM',
    subtitle: 'Customer inbox, approved templates & broadcasts',
    icon: Icons.forum_outlined,
    permission: 'whatsapp_crm',
    section: ModuleSection.workspaceAndReports,
  ),
  const ModuleDefinition(
    key: 'contact_scanner',
    title: 'Contact Scanner',
    subtitle: 'Scan visiting cards via OCR & save leads',
    icon: Icons.document_scanner_outlined,
    permission: 'customer_data',
    section: ModuleSection.workspaceAndReports,
  ),
  const ModuleDefinition(
    key: 'reports',
    title: 'Report',
    subtitle: 'Attendance, leave, late, half-day & OT exports',
    icon: Icons.analytics_outlined,
    permission: 'reports',
    section: ModuleSection.workspaceAndReports,
  ),
  const ModuleDefinition(
    key: 'documents',
    title: 'Documents',
    subtitle: 'Official employee & policy files',
    icon: Icons.folder_copy_outlined,
    permission: 'documents',
    section: ModuleSection.workspaceAndReports,
  ),

  // Account
  const ModuleDefinition(
    key: 'notifications',
    title: 'Notifications',
    subtitle: 'Approvals, task mentions & live alerts',
    icon: Icons.notifications_none_rounded,
    permission: 'notifications',
    section: ModuleSection.account,
  ),
  const ModuleDefinition(
    key: 'profile',
    title: 'Profile & Settings',
    subtitle: 'Appearance, password & role permissions',
    icon: Icons.tune_rounded,
    permission: 'notifications',
    section: ModuleSection.account,
  ),
];

/// Alias map so legacy routes like `/module/expenses` resolve seamlessly.
const _legacyKeyAliases = <String, String>{
  'expenses': 'field_allowance',
  'attendance_report': 'attendance_log',
};

ModuleDefinition definitionFor(String key, {AppUser? user}) {
  if (key == 'face_attendance' || key == 'attendance') {
    return const ModuleDefinition(
      key: 'face_attendance',
      title: 'Attendance',
      subtitle: 'Live face verification & shift check-in/out',
      icon: Icons.face_retouching_natural_rounded,
      permission: 'face_attendance',
      section: ModuleSection.timeAndAttendance,
    );
  }
  final resolvedKey = _legacyKeyAliases[key] ?? key;
  final match = moduleCatalog.firstWhere(
    (item) => item.key == resolvedKey,
    orElse: () => ModuleDefinition(
      key: key,
      title: _title(key),
      subtitle: 'HRMS workspace module',
      icon: Icons.apps_rounded,
      permission: key,
      section: ModuleSection.workspaceAndReports,
    ),
  );
  if (user == null) return match;
  return ModuleDefinition(
    key: match.key,
    title: match.resolveTitle(user),
    subtitle: match.resolveSubtitle(user),
    icon: match.icon,
    permission: match.permission,
    section: match.section,
  );
}

List<ModuleDefinition> modulesForUser(AppUser user, PermissionMatrix matrix) {
  return moduleCatalog.where((item) {
    if (item.key == 'approvals') return user.isManagement;
    return matrix.canAccessModule(item.key, user);
  }).toList(growable: false);
}

String _title(String value) => value
    .split('_')
    .map((part) =>
        part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}')
    .join(' ');
