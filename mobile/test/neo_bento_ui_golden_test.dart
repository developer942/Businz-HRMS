import 'dart:io';

import 'package:businz_hrms_mobile/app/providers.dart';
import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/core/models/permission_matrix.dart';
import 'package:businz_hrms_mobile/core/theme/app_theme.dart';
import 'package:businz_hrms_mobile/core/theme/app_tokens.dart';
import 'package:businz_hrms_mobile/core/widgets/businz_design_system.dart';
import 'package:businz_hrms_mobile/features/attendance/presentation/attendance_screen.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/auth/data/auth_repository.dart';
import 'package:businz_hrms_mobile/features/auth/presentation/login_screen.dart';
import 'package:businz_hrms_mobile/features/field_allowance/presentation/field_allowance_screen.dart';
import 'package:businz_hrms_mobile/features/modules/presentation/auxiliary_screens.dart';
import 'package:businz_hrms_mobile/features/payroll/presentation/payroll_screen.dart';
import 'package:businz_hrms_mobile/features/shared/data/hrms_repository.dart';
import 'package:businz_hrms_mobile/features/shell/presentation/home_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';

class _TestAuthRepo implements AuthRepository {
  _TestAuthRepo(this.user);
  final AppUser? user;

  @override
  Future<AppUser?> restore() async => user;

  @override
  Future<AppUser> login(String identifier, String password) async => user!;

  @override
  Future<Map<String, dynamic>> otpConfig() async =>
      const {'emailOtpEnabled': true};

  @override
  Future<({int expiresInSeconds, int resendCooldownSeconds})> requestEmailOtp(
          String email) async =>
      (expiresInSeconds: 300, resendCooldownSeconds: 30);

  @override
  Future<AppUser> verifyEmailOtp(String email, String otp) async => user!;

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

class _RichStubHrmsRepo implements HrmsRepository {
  _RichStubHrmsRepo({this.shiftPayload});

  final Map<String, dynamic>? shiftPayload;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      Future.value(<Map<String, dynamic>>[]);

  @override
  Future<Map<String, dynamic>> attendanceSummary() async => const {
        'totalEmployees': 28,
        'presentCount': 22,
        'absentCount': 3,
        'lateCount': 2,
        'onDutyCount': 1,
      };

  @override
  Future<Map<String, dynamic>> shiftStatus(String employeeId) async =>
      shiftPayload ??
      const {
        'assignedShift': {
          'id': 'shift-1',
          'shiftName': 'General Shift',
          'startTime': '09:00 AM',
          'endTime': '06:00 PM',
        },
        'shiftStartDisplay': '09:00 AM',
        'shiftEndDisplay': '06:00 PM',
        'canCheckIn': true,
        'canCheckOut': false,
        'state': 'READY_TO_CHECK_IN',
      };

  @override
  Future<Map<String, dynamic>> leaveBalances(String employeeId) async => const {
        'year': 2026,
        'totalPaidRemaining': 8,
        'totalPaidUsed': 4,
        'approvedUnpaidDays': 0,
        'rejectedLeaveAbsentDays': 1,
        'uninformedAbsentDays': 0,
        'totalUnpaidUsed': 1,
        'categories': [
          {
            'name': 'Earned Leave (EL)',
            'annualQuota': 8,
            'usedDays': 2,
            'pendingDays': 0,
            'remainingDays': 6,
            'isPaid': true,
          },
          {
            'name': 'Sick Leave (SL)',
            'annualQuota': 4,
            'usedDays': 2,
            'pendingDays': 0,
            'remainingDays': 2,
            'isPaid': true,
          },
        ],
      };

  @override
  Future<Map<String, dynamic>> notificationFeed(
          {int limit = 50, int offset = 0}) async =>
      const {
        'data': [
          {
            'id': 'n1',
            'title': 'Task Assigned: Client Proposal Review',
            'message': 'Assigned by Velmurugan M · Due Today',
            'isRead': false,
          },
          {
            'id': 'n2',
            'title': 'Payslip Available',
            'message': 'Your monthly salary slip has been generated.',
            'isRead': true,
          },
        ],
        'meta': {'unread': 2},
      };

  @override
  Future<List<Map<String, dynamic>>> attendance(
      {String? employeeId, String? date}) async {
    final now = DateTime.now();
    if (employeeId != null) {
      return List.generate(12, (i) {
        final day = (i + 1).clamp(1, now.day);
        final dt = DateTime(now.year, now.month, day);
        return {
          'date': DateFormat('yyyy-MM-dd').format(dt),
          'status': 'Present',
          'working_hours': 8.05,
        };
      });
    }
    return List.generate(
      20,
      (i) => {'employee_id': 'VRM-${i + 1}', 'status': 'Present'},
    );
  }

  @override
  Future<List<Map<String, dynamic>>> leaves({String? employeeId}) async =>
      const [
        {
          'id': 'lv-1',
          'employeeId': 'VRM-027',
          'employeeName': 'Ahilesh K',
          'leaveType': 'Earned Leave (EL)',
          'startDate': '2026-11-28',
          'endDate': '2026-11-29',
          'daysCount': 2,
          'paidDaysCount': 2,
          'status': 'Pending',
          'reason': 'Family function at hometown',
        },
        {
          'id': 'lv-2',
          'employeeId': 'VRM-027',
          'employeeName': 'Ahilesh K',
          'leaveType': 'Sick Leave (SL)',
          'startDate': '2026-11-10',
          'endDate': '2026-11-10',
          'daysCount': 1,
          'paidDaysCount': 1,
          'status': 'Approved',
          'reason': 'Medical checkup',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> tasks() async {
    final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());
    return [
      {
        'id': 't1',
        'taskNumber': 'TSK-104',
        'title': 'Client Follow-up & Proposal Update',
        'description': 'Call client and share revised BOM quote',
        'priority': 'High',
        'overallStatus': 'IN_PROGRESS',
        'overallProgress': 65,
        'completionPercentage': 65,
        'dueDate': todayStr,
        'responsiblePersonId': 'VRM-027',
        'responsiblePersonName': 'Ahilesh K',
        'assignedByName': 'Velmurugan M',
        'dailyReports': [
          {
            'id': 'dr1',
            'date': todayStr,
            'employeeName': 'Ahilesh K',
            'workDone': 'Reviewed pricing sheet and called customer.',
            'status': 'In Progress',
          }
        ],
      },
      {
        'id': 't2',
        'taskNumber': 'TSK-105',
        'title': 'Monthly Sales Analytics Summary',
        'description': 'Update Q4 regional numbers for review',
        'priority': 'Medium',
        'overallStatus': 'OPEN',
        'overallProgress': 30,
        'completionPercentage': 30,
        'dueDate': todayStr,
        'responsiblePersonId': 'VRM-027',
        'responsiblePersonName': 'Ahilesh K',
        'assignedByName': 'Pavithra R',
      },
      {
        'id': 't3',
        'taskNumber': 'TSK-106',
        'title': 'Sprint Sync & QA Sign-off',
        'description': 'Finalize mobile release checklist',
        'priority': 'Low',
        'overallStatus': 'COMPLETED',
        'overallProgress': 100,
        'completionPercentage': 100,
        'dueDate': todayStr,
        'responsiblePersonId': 'VRM-027',
        'responsiblePersonName': 'Ahilesh K',
        'assignedByName': 'Velmurugan M',
      },
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> fieldAllowanceRequests() async => const [
        {
          'id': 'fa1',
          'status': 'PENDING_APPROVAL',
          'requested_amount': 3200,
        },
        {
          'id': 'fa2',
          'status': 'APPROVED',
          'approved_amount': 4800,
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> pettyCashRequests() async => const [
        {
          'id': 'pc1',
          'status': 'APPROVED',
          'approved_amount': 2500,
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> loanRecords() async => const [
        {
          'id': 'ln1',
          'status': 'Approved',
          'approvedAmount': 10000,
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> payrollRecords(
      {int? month, int? year, String? employeeId}) async {
    return [
      {
        'id': 'pr-1',
        'employeeId': 'VRM-027',
        'employeeName': 'Ahilesh K',
        'department': 'DEVELOPER',
        'payrollMonth': month ?? DateTime.now().month,
        'payrollYear': year ?? DateTime.now().year,
        'basicSalary': 45000,
        'allowances': 8500,
        'grossSalary': 53500,
        'totalDeductions': 3200,
        'netSalary': 50300,
        'totalPaidDays': 26,
        'calendarDays': 30,
        'status': 'Sent to Accounts',
      },
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> shiftRequests() async => const [
        {'id': 'sr1', 'status': 'Pending'},
      ];

  @override
  Future<List<Map<String, dynamic>>> employees(
          {bool activeOnly = false, bool forceRefresh = false}) async =>
      const [
        {'id': '1', 'name': 'Ahilesh K', 'department': 'DEVELOPER'},
        {'id': '2', 'name': 'Pavithra R', 'department': 'HR'},
        {'id': '3', 'name': 'Vaishnavi V', 'department': 'Accounts'},
        {'id': '4', 'name': 'Nivetha S', 'department': 'SALES'},
      ];
}

Future<void> _loadBundledFonts() async {
  Future<void> loadFamily(String family, List<String> files) async {
    final loader = FontLoader(family);
    for (final path in files) {
      final file = File(path);
      if (file.existsSync()) {
        final bytes = await file.readAsBytes();
        loader.addFont(Future.value(ByteData.sublistView(bytes)));
      }
    }
    await loader.load();
  }

  await loadFamily('PlusJakartaSans', const [
    'assets/fonts/PlusJakartaSans-400.ttf',
    'assets/fonts/PlusJakartaSans-500.ttf',
    'assets/fonts/PlusJakartaSans-600.ttf',
    'assets/fonts/PlusJakartaSans-700.ttf',
    'assets/fonts/PlusJakartaSans-800.ttf',
  ]);
  await loadFamily('Manrope', const [
    'assets/fonts/Manrope-600.ttf',
    'assets/fonts/Manrope-700.ttf',
    'assets/fonts/Manrope-800.ttf',
  ]);
  final flutterRoot = Platform.environment['FLUTTER_ROOT'] ?? r'C:\Users\ahile\flutter';
  final materialIconFont = File(
    '$flutterRoot${Platform.pathSeparator}bin${Platform.pathSeparator}cache${Platform.pathSeparator}artifacts${Platform.pathSeparator}material_fonts${Platform.pathSeparator}MaterialIcons-Regular.otf',
  );
  if (materialIconFont.existsSync()) {
    final loader = FontLoader('MaterialIcons');
    final bytes = await materialIconFont.readAsBytes();
    loader.addFont(Future.value(ByteData.sublistView(bytes)));
    await loader.load();
  }
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

  setUpAll(() async {
    await _loadBundledFonts();
  });

  Future<void> setPhoneViewport(WidgetTester tester,
      {Size size = const Size(390, 844)}) async {
    tester.view.devicePixelRatio = 2.0;
    tester.view.physicalSize = Size(size.width * 2, size.height * 2);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
  }

  group('BUSINZ Neo-Bento 2026 UI & Rendered Goldens', () {
    testWidgets('01. Login screen matches Neo-Bento reference layout',
        (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(_TestAuthRepo(null)),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const LoginScreen(),
          ),
        ),
      );
      await tester.runAsync(() async {
        final ctx = tester.element(find.byType(LoginScreen));
        await precacheImage(const AssetImage('assets/businz-logo.png'), ctx);
      });
      await tester.pumpAndSettle();
      expect(find.text('BUSINZ'), findsOneWidget);
      expect(find.text('Welcome Back 👋'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);
      expect(find.text('Forgot Password?'), findsOneWidget);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/01_login.png'),
      );
    });

    testWidgets('02. Attendance State A (Punch In) renders glowing green ring',
        (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: Scaffold(
              appBar: AppBar(title: const Text('Attendance')),
              body: const AttendanceScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Punch In'), findsOneWidget);
      expect(find.text('Tap to start your work'), findsOneWidget);
      expect(find.text('Not Punched In'), findsOneWidget);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/02_attendance_punch_in.png'),
      );
    });

    testWidgets('03. Attendance State B (Punch Out) renders active ring',
        (tester) async {
      await setPhoneViewport(tester);
      final repo = _RichStubHrmsRepo(
        shiftPayload: const {
          'assignedShift': {
            'id': 'shift-1',
            'shiftName': 'General Shift',
            'startTime': '09:00 AM',
            'endTime': '06:00 PM',
          },
          'shiftStartDisplay': '09:00 AM',
          'shiftEndDisplay': '06:00 PM',
          'canCheckIn': false,
          'canCheckOut': true,
          'state': 'CHECKED_IN',
          'todayRecord': {
            'checkIn': '2026-11-27T04:38:00.000Z',
            'workingHours': 4.3,
          },
        },
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(repo),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: Scaffold(
              appBar: AppBar(title: const Text('Attendance')),
              body: const AttendanceScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Punch Out'), findsOneWidget);
      expect(find.text('4.3 h'), findsOneWidget);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/03_attendance_punch_out.png'),
      );
    });

    testWidgets('04. Attendance State C (Unavailable) shows backend policy msg',
        (tester) async {
      await setPhoneViewport(tester);
      final repo = _RichStubHrmsRepo(
        shiftPayload: const {
          'assignedShift': {
            'id': 'shift-1',
            'shiftName': 'General Shift',
            'startTime': '09:00 AM',
            'endTime': '06:00 PM',
          },
          'shiftStartDisplay': '09:00 AM',
          'shiftEndDisplay': '06:00 PM',
          'canCheckIn': false,
          'canCheckOut': false,
          'state': 'WINDOW_CLOSED',
          'message': 'Shift check-in window opens 30 minutes before shift.',
        },
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(repo),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: Scaffold(
              appBar: AppBar(title: const Text('Attendance')),
              body: const AttendanceScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Unavailable'), findsOneWidget);
      expect(
        find.text('Shift check-in window opens 30 minutes before shift.'),
        findsWidgets,
      );
    });

    testWidgets('05. Employee HomeShell & Final Approved White KPI Dashboard',
        (tester) async {
      await setPhoneViewport(tester);
      final checkedInRepo = _RichStubHrmsRepo(
        shiftPayload: const {
          'assignedShift': {
            'id': 'shift-1',
            'shiftName': 'General Shift',
            'startTime': '09:30 AM',
            'endTime': '06:30 PM',
          },
          'shiftStartDisplay': '09:30 AM',
          'shiftEndDisplay': '06:30 PM',
          'canCheckIn': false,
          'canCheckOut': true,
          'state': 'CHECKED_IN',
          'todayRecord': {
            'checkIn': '10:08',
            'workingHours': 4.5,
          },
        },
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(checkedInRepo),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('Employee')),
            unreadNotificationCountProvider.overrideWith((_) async => 0),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 1. Header: "Hello Ahilesh K", no Good Morning/Afternoon/Evening, no emoji, no duplicate name
      expect(find.text('Hello Ahilesh K'), findsOneWidget);
      expect(find.text('JUNIOR · DEVELOPER'), findsOneWidget);
      expect(find.text('Ahilesh K'), findsNothing);
      expect(find.textContaining('Good Morning'), findsNothing);
      expect(find.textContaining('Good Afternoon'), findsNothing);
      expect(find.textContaining('Good Evening'), findsNothing);
      expect(find.textContaining('👋'), findsNothing);

      // 2. Today's Shift card: gradient preserved, On Duty badge removed
      expect(find.text("Today's Shift"), findsOneWidget);
      expect(find.text('09:30 AM – 06:30 PM'), findsOneWidget);
      expect(find.textContaining('Tap to Punch Out'), findsOneWidget);
      expect(find.text('On Duty'), findsNothing);

      // 3. Four clean white KPI cards
      expect(find.text('Present Days'), findsOneWidget);
      expect(find.text('Overtime Hrs'), findsOneWidget);
      expect(find.text('Leave Balance'), findsOneWidget);
      expect(find.text('My Tasks'), findsOneWidget);
      final kpiContainers = tester.widgetList<Container>(
        find.descendant(
          of: find.byType(BusinzKpiCard),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration).borderRadius ==
                    BorderRadius.circular(AppTokens.radiusCard),
          ),
        ),
      );
      expect(kpiContainers.length, 4);
      for (final card in kpiContainers) {
        final dec = card.decoration as BoxDecoration;
        expect(dec.color, AppTokens.surfaceLight);
      }

      // 4. Compact Quick Actions
      expect(find.text('Quick Actions'), findsOneWidget);
      final quickTileRect = tester.getSize(
        find.ancestor(
          of: find.text('Payslip'),
          matching: find.byType(InkWell),
        ).first,
      );
      expect(quickTileRect.height, lessThanOrEqualTo(95));

      // 5. Flat 5-item Bottom Nav with Attendance inside bar (NO floating button)
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(find.text('Face Attendance'), findsNothing);
      final navFinder = find.byType(BusinzFloatingNavigation);
      expect(
        find.descendant(of: navFinder, matching: find.text('Home')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navFinder, matching: find.text('Tasks')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navFinder, matching: find.text('Attendance')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navFinder, matching: find.text('Leave')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navFinder, matching: find.text('More')),
        findsOneWidget,
      );
      // Verify Attendance sits on exact same vertical baseline as Home & More
      final homeY = tester
          .getCenter(find.descendant(of: navFinder, matching: find.text('Home')))
          .dy;
      final attY = tester
          .getCenter(
              find.descendant(of: navFinder, matching: find.text('Attendance')))
          .dy;
      final moreY = tester
          .getCenter(find.descendant(of: navFinder, matching: find.text('More')))
          .dy;
      expect((attY - homeY).abs(), lessThanOrEqualTo(1.0));
      expect((attY - moreY).abs(), lessThanOrEqualTo(1.0));

      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/05_employee_dashboard.png'),
      );
    });

    testWidgets('06. HR HomeShell & Operations Dashboard', (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(_TestAuthRepo(hrUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('HR')),
            unreadNotificationCountProvider.overrideWith((_) async => 3),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Hello Pavithra R'), findsOneWidget);
      expect(find.text('Present Today'), findsOneWidget);
      expect(find.text('Absent & Late'), findsOneWidget);
      expect(find.text('Pending Approvals'), findsOneWidget);
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(
        find.descendant(
          of: find.byType(BusinzFloatingNavigation),
          matching: find.text('Attendance'),
        ),
        findsOneWidget,
      );
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/06_hr_dashboard.png'),
      );
    });

    testWidgets('07. Accounts HomeShell & Finance Dashboard', (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(accountsUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider.overrideWith(
                (_) async => PermissionMatrix.fallback('Finance Manager')),
            unreadNotificationCountProvider.overrideWith((_) async => 1),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Hello Vaishnavi V'), findsOneWidget);
      expect(find.text('Pending Payouts'), findsOneWidget);
      expect(find.text('Pending Volume'), findsOneWidget);
      expect(find.text('Finance & Claims'), findsOneWidget);
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(
        find.descendant(
          of: find.byType(BusinzFloatingNavigation),
          matching: find.text('Attendance'),
        ),
        findsOneWidget,
      );
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/07_accounts_dashboard.png'),
      );
    });

    testWidgets('08. CEO HomeShell & Executive Dashboard (ZERO Attendance Tab)',
        (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(_TestAuthRepo(ceoUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('CEO')),
            unreadNotificationCountProvider.overrideWith((_) async => 4),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Hello Velmurugan M'), findsOneWidget);
      expect(find.text('Workforce Present'), findsOneWidget);
      expect(find.text('Pending Approvals'), findsOneWidget);
      expect(find.text('Finance & Claims'), findsOneWidget);
      final navFinder = find.byType(BusinzFloatingNavigation);
      expect(
        find.descendant(of: navFinder, matching: find.text('Home')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navFinder, matching: find.text('Tasks')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navFinder, matching: find.text('Reports')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navFinder, matching: find.text('More')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navFinder, matching: find.text('Attendance')),
        findsNothing,
      );
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(find.text('Face Attendance'), findsNothing);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/08_ceo_dashboard.png'),
      );
    });

    testWidgets('09. Tasks Tab renders Weekly Date Strip & Task Cards',
        (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('Employee')),
            unreadNotificationCountProvider.overrideWith((_) async => 2),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(BusinzFloatingNavigation),
          matching: find.text('Tasks'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('My Tasks ('), findsOneWidget);
      expect(find.byType(BusinzTaskCard), findsWidgets);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/09_tasks_screen.png'),
      );
    });

    testWidgets('10. Payroll screen renders Payslip Card without top pills',
        (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('Employee')),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: Scaffold(
              appBar: AppBar(title: const Text('Payroll')),
              body: const PayrollScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Payslips'), findsNothing);
      expect(find.text('Claims'), findsNothing);
      expect(find.text('Advance'), findsNothing);
      expect(find.byType(BusinzPayslipCard), findsOneWidget);
      expect(find.text('Salary Summary'), findsOneWidget);
      expect(find.text('Net Pay'), findsOneWidget);
      expect(find.text('View Payslip (PDF)'), findsOneWidget);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/10_payroll_screen.png'),
      );
    });

    testWidgets('11. Leave Tab renders clean white EL, SL, LOP cards (no colors)',
        (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('Employee')),
            unreadNotificationCountProvider.overrideWith((_) async => 2),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(BusinzFloatingNavigation),
          matching: find.text('Leave'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Apply Leave'), findsOneWidget);
      expect(find.text('Apply WFH'), findsOneWidget);
      expect(find.text('EL'), findsWidgets);
      expect(find.text('SL'), findsWidgets);
      expect(find.text('LOP'), findsWidgets);
      // Verify EL, SL, LOP cards are pure white (no pastel fill colors)
      for (final code in const ['EL', 'SL', 'LOP']) {
        final container = tester.widget<Container>(
          find
              .ancestor(
                of: find.text(code).first,
                matching: find.byWidgetPredicate(
                  (w) =>
                      w is Container &&
                      w.decoration is BoxDecoration &&
                      (w.decoration as BoxDecoration).borderRadius ==
                          BorderRadius.circular(14),
                ),
              )
              .first,
        );
        expect((container.decoration as BoxDecoration).color,
            AppTokens.surfaceLight);
      }
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/11_leave_screen.png'),
      );
    });

    testWidgets('12. Responsive small phone, tablet rail, and 1.3x text scale have zero overflow',
        (tester) async {
      // Small phone (360x740) with 1.3x accessibility font scaling
      await setPhoneViewport(tester, size: const Size(360, 740));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider
                .overrideWithValue(_TestAuthRepo(employeeUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('Employee')),
            unreadNotificationCountProvider.overrideWith((_) async => 2),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: const TextScaler.linear(1.3)),
              child: child!,
            ),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      // Tablet viewport (820x1180) renders NavigationRail for CEO without Face Attendance
      await setPhoneViewport(tester, size: const Size(820, 1180));
      await tester.pumpWidget(
        ProviderScope(
          key: const ValueKey('ceo-tablet'),
          overrides: [
            authRepositoryProvider.overrideWithValue(_TestAuthRepo(ceoUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('CEO')),
            unreadNotificationCountProvider.overrideWith((_) async => 2),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const HomeShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(BusinzFaceAttendanceButton), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('13. Report screen renders compact 3x2 grid & single-line exports',
        (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(_TestAuthRepo(ceoUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('CEO')),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: Scaffold(
              appBar: AppBar(title: const Text('Report')),
              body: const ReportsScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Single Date'), findsOneWidget);
      expect(find.text('Date Range'), findsOneWidget);
      expect(find.text('Excel'), findsOneWidget);
      expect(find.text('PDF'), findsOneWidget);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/13_report_screen.png'),
      );
    });

    testWidgets('14. Finance & Claims renders sleek unified summary & clean cards',
        (tester) async {
      await setPhoneViewport(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(_TestAuthRepo(ceoUser)),
            hrmsRepositoryProvider.overrideWithValue(_RichStubHrmsRepo()),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('CEO')),
          ],
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: Scaffold(
              appBar: AppBar(title: const Text('Finance & Claims')),
              body: const FieldAllowanceScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Requests'), findsOneWidget);
      expect(find.text('Pending'), findsOneWidget);
      expect(find.text('Distributed'), findsOneWidget);
      expect(find.text('Spent'), findsOneWidget);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/14_finance_claims_screen.png'),
      );
    });
  });
}
