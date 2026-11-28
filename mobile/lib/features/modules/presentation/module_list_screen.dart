import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../approvals/presentation/approvals_screen.dart';
import '../../assets/presentation/assets_screen.dart';
import '../../attendance/presentation/face_capture_screen.dart';
import '../../attendance_log/presentation/attendance_log_screen.dart';
import '../../auth/application/auth_controller.dart';
import '../../contacts/presentation/contacts_screen.dart';
import '../../employees/presentation/employees_screen.dart';
import '../../field_allowance/presentation/field_allowance_screen.dart';
import '../../leave/presentation/leave_screen.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../overtime/presentation/overtime_screen.dart';
import '../../payments/presentation/payment_disbursement_screen.dart';
import '../../payroll/presentation/payroll_screen.dart';
import '../../petty_cash/presentation/petty_cash_screen.dart';
import '../../profile/presentation/profile_settings_screen.dart';
import '../../shared/presentation/async_content.dart';
import '../../shifts/presentation/shifts_screen.dart';
import '../../tasks/presentation/tasks_screen.dart';
import '../../tracking/presentation/tracking_screen.dart';
import '../../whatsapp/presentation/whatsapp_crm_screen.dart';
import 'auxiliary_screens.dart';
import 'module_catalog.dart';

class ModuleListScreen extends ConsumerStatefulWidget {
  const ModuleListScreen({super.key, required this.moduleKey});
  final String moduleKey;

  @override
  ConsumerState<ModuleListScreen> createState() => _ModuleListScreenState();
}

class _ModuleListScreenState extends ConsumerState<ModuleListScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _customModuleKeys.contains(widget.moduleKey)
        ? Future.value(const <Map<String, dynamic>>[])
        : _load();
  }

  Future<List<Map<String, dynamic>>> _load() {
    final repo = ref.read(hrmsRepositoryProvider);
    return switch (widget.moduleKey) {
      'documents' => repo.gatewayList('employee_documents'),
      _ => repo.gatewayList(widget.moduleKey),
    };
  }

  void _reload() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    final definition = definitionFor(widget.moduleKey, user: user);

    if (widget.moduleKey == 'attendance' ||
        widget.moduleKey == 'face_attendance') {
      return const FaceCaptureScreen(autoPunch: true);
    }

    if (widget.moduleKey == 'accounts_payment' &&
        user != null &&
        !user.isAccounts) {
      return Scaffold(
        appBar: AppBar(title: Text(definition.title)),
        body: const EmptyState(
          icon: Icons.lock_outline_rounded,
          title: 'Accounts Access Only',
          message:
              'Payment Disbursement is available exclusively to the Accounts department.',
        ),
      );
    }

    final customBody = switch (widget.moduleKey) {
      'approvals' => const ApprovalsScreen(),
      'accounts_payment' => const PaymentDisbursementScreen(),
      'advance_salary' => const AdvanceSalaryScreen(),
      'employees' => const EmployeesScreen(),
      'attendance_log' || 'attendance_report' => const AttendanceLogScreen(),
      'assets' => const AssetsScreen(),
      'contact_scanner' => const ContactsScreen(),
      'expenses' || 'field_allowance' => const FieldAllowanceScreen(),
      'holidays' => const HolidaysScreen(),
      'leave' => const LeaveScreen(),
      'notifications' => const NotificationsScreen(),
      'overtime' => const OvertimeScreen(),
      'petty_cash' => const PettyCashScreen(),
      'payroll' => const PayrollScreen(),
      'profile' => const ProfileSettingsScreen(),
      'reports' => const ReportsScreen(),
      'shifts' => const ShiftsScreen(),
      'tasks' => const TasksScreen(),
      'tracking' => const TrackingScreen(),
      'whatsapp_crm' => const WhatsAppCrmScreen(),
      _ => null,
    };

    if (customBody != null) {
      return Scaffold(
        appBar: AppBar(title: Text(definition.title)),
        body: customBody,
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(definition.title)),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AppErrorView(error: snapshot.error!, onRetry: _reload);
          }
          final items = snapshot.data ?? const [];
          if (items.isEmpty) {
            return EmptyState(
              icon: definition.icon,
              title: 'No ${definition.title.toLowerCase()} yet',
              message:
                  'Server records you are permitted to view will appear here.',
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              _reload();
              await _future;
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) => _RecordCard(
                item: items[index],
                icon: definition.icon,
              ),
            ),
          );
        },
      ),
    );
  }
}

const _customModuleKeys = <String>{
  'approvals',
  'accounts_payment',
  'advance_salary',
  'attendance',
  'face_attendance',
  'employees',
  'attendance_log',
  'attendance_report',
  'assets',
  'contact_scanner',
  'expenses',
  'field_allowance',
  'holidays',
  'leave',
  'notifications',
  'overtime',
  'petty_cash',
  'payroll',
  'profile',
  'reports',
  'shifts',
  'tasks',
  'tracking',
  'whatsapp_crm',
};

class _RecordCard extends StatelessWidget {
  const _RecordCard({required this.item, required this.icon});
  final Map<String, dynamic> item;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final title = _first([
      'name',
      'title',
      'document_name',
      'employee_name',
      'employeeName',
      'request_number',
      'employee_id',
      'id'
    ], 'Record');
    final subtitle = _first([
      'description',
      'document_type',
      'department',
      'category',
      'date',
      'start_date',
      'created_at',
      'email'
    ], '');
    final status = _first(['status', 'approval_status', 'payment_status'], '');
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          child: Icon(icon,
              size: 21,
              color: Theme.of(context).colorScheme.onPrimaryContainer),
        ),
        title: Text(title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: subtitle.isEmpty
            ? null
            : Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(subtitle,
                    maxLines: 2, overflow: TextOverflow.ellipsis),
              ),
        trailing: status.isEmpty
            ? null
            : ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 100),
                child: StatusPill(status),
              ),
      ),
    );
  }

  String _first(List<String> keys, String fallback) {
    for (final key in keys) {
      if (item[key] != null && item[key].toString().trim().isNotEmpty) {
        return item[key].toString();
      }
    }
    return fallback;
  }
}
