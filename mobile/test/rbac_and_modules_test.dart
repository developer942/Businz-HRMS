import 'package:businz_hrms_mobile/app/providers.dart';
import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/core/models/permission_matrix.dart';
import 'package:businz_hrms_mobile/core/theme/app_theme.dart';
import 'package:businz_hrms_mobile/core/utils/result.dart';
import 'package:businz_hrms_mobile/core/widgets/adaptive_components.dart';
import 'package:businz_hrms_mobile/core/widgets/businz_design_system.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/auth/data/auth_repository.dart';
import 'package:businz_hrms_mobile/features/modules/presentation/module_catalog.dart';
import 'package:businz_hrms_mobile/features/shared/data/hrms_repository.dart';
import 'package:businz_hrms_mobile/features/shell/presentation/home_shell.dart';
import 'package:businz_hrms_mobile/features/shifts/presentation/shifts_screen.dart';
import 'package:businz_hrms_mobile/features/tracking/presentation/tracking_screen.dart';
import 'package:businz_hrms_mobile/features/whatsapp/presentation/whatsapp_crm_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _StubAuthRepo implements AuthRepository {
  _StubAuthRepo(this.user);
  final AppUser user;

  @override
  Future<AppUser?> restore() async => user;

  @override
  Future<AppUser> login(String identifier, String password) async => user;

  @override
  Future<Map<String, dynamic>> otpConfig() async =>
      const {'emailOtpEnabled': true};

  @override
  Future<({int expiresInSeconds, int resendCooldownSeconds})> requestEmailOtp(
          String email) async =>
      (expiresInSeconds: 300, resendCooldownSeconds: 30);

  @override
  Future<AppUser> verifyEmailOtp(String email, String otp) async => user;

  @override
  Future<void> logout() async {}

  @override
  Future<void> changePassword(
      {required String currentPassword, required String newPassword}) async {}

  @override
  Future<void> requestPasswordReset(String identifier) async {}

  @override
  Future<String> verifyResetOtp(String identifier, String otp) async => 'tok';

  @override
  Future<void> resetPassword(String resetToken, String password) async {}
}

class _StubHrmsRepo implements HrmsRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      Future.value(<Map<String, dynamic>>[]);

  @override
  Future<Map<String, dynamic>> attendanceSummary() async => const {
        'totalEmployees': 24,
        'presentCount': 18,
        'absentCount': 4,
        'lateCount': 2,
        'onDutyCount': 1,
      };

  @override
  Future<Map<String, dynamic>> shiftStatus(String employeeId) async => const {
        'shiftName': 'General Shift',
        'canCheckIn': true,
        'canCheckOut': false,
      };

  @override
  Future<Map<String, dynamic>> leaveBalances(String employeeId) async => const {
        'casual': {'remaining': 8, 'total': 12},
        'sick': {'remaining': 6, 'total': 6},
        'earned': {'remaining': 10, 'total': 15},
      };

  @override
  Future<Map<String, dynamic>> notificationFeed(
          {int limit = 50, int offset = 0}) async =>
      const {
        'data': [],
        'meta': {'unread': 2}
      };

  @override
  Future<List<Map<String, dynamic>>> attendance(
          {String? employeeId, String? date}) async =>
      const [];

  @override
  Future<List<Map<String, dynamic>>> leaves({String? employeeId}) async =>
      const [];

  @override
  Future<List<Map<String, dynamic>>> tasks() async => const [];

  @override
  Future<List<Map<String, dynamic>>> fieldAllowanceRequests() async => const [];

  @override
  Future<List<Map<String, dynamic>>> pettyCashRequests() async => const [];

  @override
  Future<List<Map<String, dynamic>>> loanRecords() async => const [];

  @override
  Future<List<Map<String, dynamic>>> payrollRecords(
          {int? month, int? year, String? employeeId}) async =>
      const [];

  @override
  Future<List<Map<String, dynamic>>> shiftRequests() async => const [];

  @override
  Future<List<Map<String, dynamic>>> shifts() async => const [
        {
          'id': 's1',
          'shiftName': 'General Shift',
          'startTime': '09:30',
          'endTime': '18:30',
          'assignments': ['VRM-027'],
        },
        {
          'id': 's2',
          'shiftName': 'Evening Shift',
          'startTime': '13:00',
          'endTime': '21:30',
          'assignments': [],
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> shiftAssignmentSummary() async => const [
        {'id': 's1', 'assignedCount': 12},
        {'id': 's2', 'assignedCount': 4},
      ];

  @override
  Future<List<Map<String, dynamic>>> employees(
          {bool activeOnly = false, bool forceRefresh = false}) async =>
      const [];

  @override
  Future<List<Map<String, dynamic>>> expenses() async => const [];
}

void main() {
  const ceoUser = AppUser(
    id: 'u-ceo',
    employeeId: 'VRM-001',
    name: 'Velmurugan M',
    email: 'ceo@businz.com',
    role: 'Super Admin',
    designation: 'CEO',
  );

  const hrUser = AppUser(
    id: 'u-hr',
    employeeId: 'VRM-002',
    name: 'Pavithra R',
    email: 'hr@businz.com',
    role: 'Employee',
    department: 'HR',
    designation: 'HR Manager',
  );

  const accountsUser = AppUser(
    id: 'u-acc',
    employeeId: 'VRM-032',
    name: 'Vaishnavi V',
    email: 'accounts@businz.com',
    role: 'Employee',
    department: 'Accounts',
    designation: 'SENIOR',
  );

  const employeeUser = AppUser(
    id: 'u-emp',
    employeeId: 'VRM-027',
    name: 'Ahilesh K',
    email: 'ahilesh@businz.com',
    role: 'Employee',
    department: 'DEVELOPER',
    designation: 'JUNIOR',
  );

  group('Role resolution & strict RBAC matrix', () {
    test('maps production department & role combinations accurately', () {
      expect(ceoUser.roleFamily, UserRoleFamily.ceo);
      expect(ceoUser.canPunchAttendance, isFalse);
      expect(ceoUser.canDisbursePayments, isFalse);
      expect(ceoUser.canManageShifts, isTrue);
      expect(ceoUser.canRequestShiftChange, isFalse);
      expect(ceoUser.canManageAssets, isTrue);

      expect(hrUser.roleFamily, UserRoleFamily.hr);
      expect(hrUser.canPunchAttendance, isTrue);
      expect(hrUser.canManageShifts, isTrue);
      expect(hrUser.canManageEmployees, isTrue);
      expect(hrUser.canDisbursePayments, isFalse);

      expect(accountsUser.roleFamily, UserRoleFamily.accounts);
      expect(accountsUser.canDisbursePayments, isTrue);
      expect(accountsUser.canManageEmployees, isFalse);
      expect(accountsUser.canViewCompanyPayroll, isTrue);

      expect(employeeUser.roleFamily, UserRoleFamily.employee);
      expect(employeeUser.canPunchAttendance, isTrue);
      expect(employeeUser.canRequestShiftChange, isTrue);
      expect(employeeUser.canManageAssets, isFalse);
    });

    test('enforces strict module visibility per role', () {
      final ceoMatrix = PermissionMatrix.fallback('CEO');
      expect(ceoMatrix.canAccessModule('employees', ceoUser), isTrue);
      expect(ceoMatrix.canAccessModule('assets', ceoUser), isTrue);
      expect(ceoMatrix.canAccessModule('accounts_payment', ceoUser), isFalse);
      expect(ceoMatrix.canAccessModule('petty_cash', ceoUser), isTrue);
      expect(ceoMatrix.canAccessModule('face_attendance', ceoUser), isFalse);

      final hrMatrix = PermissionMatrix.fallback('HR');
      expect(hrMatrix.canAccessModule('employees', hrUser), isTrue);
      expect(hrMatrix.canAccessModule('shifts', hrUser), isTrue);
      expect(hrMatrix.canAccessModule('accounts_payment', hrUser), isFalse);
      expect(hrMatrix.canAccessModule('petty_cash', hrUser), isFalse);

      final accMatrix = PermissionMatrix.fallback('Finance Manager');
      expect(
          accMatrix.canAccessModule('face_attendance', accountsUser), isTrue);
      expect(
          accMatrix.canAccessModule('accounts_payment', accountsUser), isTrue);
      expect(
          accMatrix.canAccessModule('field_allowance', accountsUser), isTrue);
      expect(accMatrix.canAccessModule('petty_cash', accountsUser), isTrue);
      expect(accMatrix.canAccessModule('employees', accountsUser), isFalse);
      expect(accMatrix.canAccessModule('reports', accountsUser), isFalse);

      final empMatrix = PermissionMatrix.fallback('Employee');
      expect(empMatrix.canAccessModule('payroll', employeeUser), isTrue);
      expect(
          empMatrix.canAccessModule('field_allowance', employeeUser), isTrue);
      expect(empMatrix.canAccessModule('employees', employeeUser), isFalse);
      expect(
          empMatrix.canAccessModule('accounts_payment', employeeUser), isFalse);
      expect(empMatrix.canAccessModule('petty_cash', employeeUser), isFalse);

      final custodianMatrix = empMatrix.copyWith(isPettyCashCustodian: true);
      expect(
          custodianMatrix.canAccessModule('petty_cash', employeeUser), isTrue);
    });

    test('resolves role-aware module titles and Finance & Claims alias', () {
      expect(definitionFor('leave', user: ceoUser).title, 'Leave Management');
      expect(definitionFor('leave', user: employeeUser).title, 'Leave Request');
      expect(definitionFor('shifts', user: hrUser).title, 'Shift Management');
      expect(definitionFor('shifts', user: employeeUser).title, 'My Shift');
      expect(definitionFor('assets', user: ceoUser).title, 'Asset Management');
      expect(definitionFor('assets', user: employeeUser).title, 'My Assets');
      expect(definitionFor('expenses', user: employeeUser).title,
          'Finance & Claims');
    });
  });

  group('Field tracking state guard', () {
    test('never permits starting Completed, Archived, or Cancelled duties', () {
      expect(
        canStartTrackingAssignment(
          {'status': 'Completed', 'employeeId': 'VRM-027'},
          employeeUser,
        ),
        isFalse,
      );
      expect(
        canStartTrackingAssignment(
          {'status': 'Archived', 'employeeId': 'VRM-027'},
          employeeUser,
        ),
        isFalse,
      );
      expect(
        canStartTrackingAssignment(
          {'status': 'Scheduled', 'employeeId': 'VRM-099'},
          employeeUser,
        ),
        isFalse,
      );
      expect(
        canStartTrackingAssignment(
          {'status': 'Scheduled', 'employeeId': 'VRM-027'},
          ceoUser,
        ),
        isFalse,
      );
      expect(
        canStartTrackingAssignment(
          {'status': 'Scheduled', 'employeeId': 'VRM-027'},
          employeeUser,
        ),
        isTrue,
      );
    });
  });

  group('WhatsApp Meta error formatter', () {
    test('formats Meta 131047 JSON into clear 24h guidance', () {
      const raw =
          '[{"code":131047,"title":"Re-engagement message","message":"Re-engagement message","error_data":{"details":"Message failed to send because more than 24 hours have passed since the customer last replied to this number."}}]';
      final parsed = formatMetaFailureReason(raw);
      expect(parsed, contains('24-hour'));
      expect(parsed, contains('Approved Template'));
      expect(isMetaReengagementWindowError(raw), isTrue);
    });

    test('formats Meta 131049 frequency cap cleanly', () {
      const raw = '[{"code":131049,"title":"Frequency cap"}]';
      final parsed = formatMetaFailureReason(raw);
      expect(parsed, contains('frequency limit'));
      expect(isMetaReengagementWindowError(raw), isFalse);
    });
  });

  group('Compass Result & Adaptive UI widgets', () {
    test('Result Ok and Error carry typed values', () {
      const Result<int> ok = Ok(42);
      const Result<int> err = Error('boom');
      expect(ok.isOk, isTrue);
      expect(ok.valueOrNull, 42);
      expect(err.isError, isTrue);
      expect(err.errorOrNull, 'boom');
    });

    Future<void> usePhoneSize(WidgetTester tester) async {
      tester.view.devicePixelRatio = 2.0;
      tester.view.physicalSize = const Size(780, 1688);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
    }

    testWidgets(
        'CEO HomeShell shows Home, Tasks, Reports, More with NO Face Attendance button',
        (tester) async {
      await usePhoneSize(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(_StubAuthRepo(ceoUser)),
            hrmsRepositoryProvider.overrideWithValue(_StubHrmsRepo()),
            permissionProvider.overrideWith(
              (_) async => PermissionMatrix.fallback('CEO'),
            ),
            unreadNotificationCountProvider.overrideWith((_) async => 2),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(BusinzFloatingNavigation), findsOneWidget);
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(find.text('Face Attendance'), findsNothing);
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Tasks'), findsOneWidget);
      expect(find.text('Reports'), findsOneWidget);
      expect(find.text('More'), findsOneWidget);
    });

    testWidgets(
        'HR HomeShell shows Home, Tasks, Attendance, Leave, More (no floating button)',
        (tester) async {
      await usePhoneSize(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(_StubAuthRepo(hrUser)),
            hrmsRepositoryProvider.overrideWithValue(_StubHrmsRepo()),
            permissionProvider.overrideWith(
              (_) async => PermissionMatrix.fallback('HR'),
            ),
            unreadNotificationCountProvider.overrideWith((_) async => 1),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final nav = find.byType(BusinzFloatingNavigation);
      expect(nav, findsOneWidget);
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(find.descendant(of: nav, matching: find.text('Home')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Tasks')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Attendance')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Leave')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('More')), findsOneWidget);
    });

    testWidgets(
        'Accounts HomeShell shows Home, Tasks, Attendance, Leave, More (no floating button)',
        (tester) async {
      await usePhoneSize(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_StubAuthRepo(accountsUser)),
            hrmsRepositoryProvider.overrideWithValue(_StubHrmsRepo()),
            permissionProvider.overrideWith(
              (_) async => PermissionMatrix.fallback('Finance Manager'),
            ),
            unreadNotificationCountProvider.overrideWith((_) async => 0),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final nav = find.byType(BusinzFloatingNavigation);
      expect(nav, findsOneWidget);
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(find.descendant(of: nav, matching: find.text('Home')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Tasks')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Attendance')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Leave')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('More')), findsOneWidget);
    });

    testWidgets(
        'Employee HomeShell shows Home, Tasks, Attendance, Leave, More (no floating button)',
        (tester) async {
      await usePhoneSize(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_StubAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(_StubHrmsRepo()),
            permissionProvider.overrideWith(
              (_) async => PermissionMatrix.fallback('Employee'),
            ),
            unreadNotificationCountProvider.overrideWith((_) async => 0),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final nav = find.byType(BusinzFloatingNavigation);
      expect(nav, findsOneWidget);
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(find.descendant(of: nav, matching: find.text('Home')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Tasks')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Attendance')),
          findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Leave')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('More')), findsOneWidget);
      expect(find.descendant(of: nav, matching: find.text('Reports')), findsNothing);
    });

    testWidgets(
        'ShiftsScreen strictly splits CEO Management from Employee self-service',
        (tester) async {
      // CEO sees Shift Masters & Requests, never Request Shift Change
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(_StubAuthRepo(ceoUser)),
            hrmsRepositoryProvider.overrideWithValue(_StubHrmsRepo()),
            permissionProvider.overrideWith(
              (_) async => PermissionMatrix.fallback('CEO'),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Scaffold(body: ShiftsScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Shift Masters (2)'), findsOneWidget);
      expect(find.text('Request Shift Change'), findsNothing);

      // Employee sees Request Shift Change, never New Shift
      await tester.pumpWidget(
        ProviderScope(
          key: const ValueKey('emp-shifts'),
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_StubAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(_StubHrmsRepo()),
            permissionProvider.overrideWith(
              (_) async => PermissionMatrix.fallback('Employee'),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Scaffold(body: ShiftsScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Request Shift Change'), findsOneWidget);
      expect(find.text('New Shift'), findsNothing);
    });

    testWidgets('CompactKpiCard renders label, value, and subtitle cleanly',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(
            body: SizedBox(
              width: 180,
              height: 150,
              child: CompactKpiCard(
                label: 'Pending Payouts',
                value: '12',
                subtitle: '₹45,000',
                icon: Icons.payments_outlined,
              ),
            ),
          ),
        ),
      );
      expect(find.text('Pending Payouts'), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('₹45,000'), findsOneWidget);
    });
  });
}
