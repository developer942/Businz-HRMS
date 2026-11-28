import 'dart:convert';

import 'package:businz_hrms_mobile/app/providers.dart';
import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/core/models/permission_matrix.dart';
import 'package:businz_hrms_mobile/core/network/api_client.dart';
import 'package:businz_hrms_mobile/core/storage/secure_session_store.dart';
import 'package:businz_hrms_mobile/core/utils/employee_filters.dart';
import 'package:businz_hrms_mobile/core/utils/file_share_helper.dart';
import 'package:businz_hrms_mobile/core/utils/payroll_calculator.dart';
import 'package:businz_hrms_mobile/core/widgets/businz_design_system.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/dashboard/presentation/dashboard_screen.dart';
import 'package:businz_hrms_mobile/features/employees/presentation/employees_screen.dart';
import 'package:businz_hrms_mobile/features/modules/presentation/auxiliary_screens.dart';
import 'package:businz_hrms_mobile/features/modules/presentation/module_catalog.dart';
import 'package:businz_hrms_mobile/features/payroll/presentation/payroll_screen.dart';
import 'package:businz_hrms_mobile/features/shared/data/hrms_repository.dart';
import 'package:businz_hrms_mobile/features/tasks/presentation/tasks_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _FakeSessionStore implements SecureSessionStore {
  @override
  Future<String?> readAccessToken() async => 'test-token';
  @override
  Future<String?> readRefreshToken() async => 'test-refresh';
  @override
  Future<String?> readProtectedValue(String key) async => null;
  @override
  Future<void> writeProtectedValue(String key, String value) async {}
  @override
  Future<void> deleteProtectedValue(String key) async {}
  @override
  Future<Map<String, dynamic>?> readUser() async => null;
  @override
  Future<void> save({
    required String accessToken,
    String? refreshToken,
    required Map<String, dynamic> user,
  }) async {}
  @override
  Future<void> clear() async {}
}

class _StaticAuth extends AuthController {
  _StaticAuth(this._user);
  final AppUser _user;
  @override
  Future<AppUser?> build() async => _user;
}

const _ceoUser = AppUser(
  id: 'u-ceo',
  employeeId: 'VRM-001',
  name: 'Velmurugan M',
  email: 'vel@vrm.in',
  role: 'CEO',
  department: 'Executive',
  designation: 'CEO',
);

const _hrUser = AppUser(
  id: 'u-hr',
  employeeId: 'VRM-002',
  name: 'Pavithra Ravi',
  email: 'hr@vrm.in',
  role: 'HR',
  department: 'HR',
  designation: 'HR Manager',
);

const _staffUser = AppUser(
  id: 'u-staff',
  employeeId: 'VRM-021',
  name: 'Ahilesh K',
  email: 'ahilesh@vrm.in',
  role: 'Employee',
  department: 'DEVELOPER',
  designation: 'Developer',
);

Widget _wrapWithUser({
  required AppUser user,
  required HrmsRepository repo,
  required Widget child,
}) {
  return ProviderScope(
    overrides: [
      authControllerProvider.overrideWith(() => _StaticAuth(user)),
      hrmsRepositoryProvider.overrideWithValue(repo),
      permissionProvider.overrideWith(
        (_) async => const PermissionMatrix(
          moduleActions: {},
          specialPermissions: {},
          dataAccess: 'all',
        ),
      ),
      unreadNotificationCountProvider.overrideWith((_) async => 0),
    ],
    child: MaterialApp(home: Scaffold(body: child)),
  );
}

void main() {
  group('Issue #1 & #5: CEO Home banner removed & cached instant refresh', () {
    testWidgets('CEO Home hides executive review banner even with pending leaves',
        (tester) async {
      final mockClient = MockClient((req) async {
        if (req.url.path.endsWith('/attendance/summary')) {
          return http.Response(
            jsonEncode({
              'data': {
                'presentCount': 24,
                'absentCount': 9,
                'lateCount': 5,
                'totalEmployees': 33,
              }
            }),
            200,
          );
        }
        if (req.url.path.endsWith('/leaves')) {
          return http.Response(
            jsonEncode({
              'data': [
                {'id': 'l1', 'status': 'Pending', 'employeeId': 'VRM-021'},
                {'id': 'l2', 'status': 'Pending', 'employeeId': 'VRM-022'},
                {'id': 'l3', 'status': 'Pending', 'employeeId': 'VRM-023'},
              ]
            }),
            200,
          );
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });

      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      await tester.pumpWidget(
        _wrapWithUser(
          user: _ceoUser,
          repo: repo,
          child: DashboardScreen(onNavigateTab: (_) {}),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('awaiting executive review'), findsNothing);
      expect(find.text('Workforce Present'), findsOneWidget);
      expect(find.text('Pending Approvals'), findsOneWidget);
    });
  });

  group('Issue #2: Task status icon, strict permissions & Reopen', () {
    testWidgets('BusinzTaskCard hides left tick/loading icons and shows clean status pill',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                BusinzTaskCard(
                  title: 'Done Task',
                  subtitle: 'Sub',
                  priority: 'High',
                  status: 'COMPLETED',
                  dueText: '27 Nov',
                  progress: 100,
                ),
                BusinzTaskCard(
                  title: 'Active Task',
                  subtitle: 'Sub',
                  priority: 'Medium',
                  status: 'IN PROGRESS',
                  dueText: '28 Nov',
                  progress: 50,
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.check_rounded), findsNothing);
      expect(find.byIcon(Icons.timelapse_rounded), findsNothing);
      expect(find.byIcon(Icons.circle_outlined), findsNothing);
      expect(find.text('COMPLETED'), findsOneWidget);
      expect(find.text('IN PROGRESS'), findsOneWidget);
    });

    testWidgets(
        'CEO viewing another assigner task sees Reopen (no Delete, no Edit, no Update Status)',
        (tester) async {
      final sampleTask = <String, dynamic>{
        'id': 't-10',
        'taskNumber': 'TSK-2026-010',
        'title': 'Mobile fixes',
        'description': 'Fix reported issues',
        'priority': 'High',
        'overallStatus': 'COMPLETED',
        'overallProgress': 100,
        'assignedBy': 'VRM-002',
        'assignedByName': 'Pavithra Ravi',
        'assignees': [
          {
            'employeeId': 'VRM-021',
            'employeeName': 'Ahilesh K',
            'individualStatus': 'Completed',
            'progressPercentage': 100,
          }
        ],
        'dailyReports': [
          {
            'employeeId': 'VRM-021',
            'employeeName': 'Ahilesh K',
            'processStatus': 'Completed',
            'progressPercentage': 0,
            'workDoneToday': 'done',
          }
        ],
      };
      final mockClient = MockClient((req) async {
        if (req.url.path.endsWith('/data-gateway/proxy')) {
          return http.Response(jsonEncode({'data': [sampleTask]}), 200);
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });
      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      await tester.pumpWidget(
        _wrapWithUser(user: _ceoUser, repo: repo, child: const TasksScreen()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Mobile fixes'));
      await tester.pumpAndSettle();

      expect(find.text('Reopen Task'), findsOneWidget);
      expect(find.text('Delete'), findsNothing);
      expect(find.text('Edit Task'), findsNothing);
      expect(find.text('Update Status'), findsNothing);
      expect(find.text('Daily Report'), findsNothing);
      expect(find.textContaining('Completed (100%)'), findsOneWidget);
      expect(find.textContaining('Completed (0%)'), findsNothing);
    });

    testWidgets('Assigner sees Edit Task & Reopen Task, never Delete',
        (tester) async {
      final sampleTask = <String, dynamic>{
        'id': 't-11',
        'title': 'HR Assigned Task',
        'description': 'Desc',
        'priority': 'Medium',
        'overallStatus': 'COMPLETED',
        'overallProgress': 100,
        'assignedBy': 'VRM-002',
        'assignedByName': 'Pavithra Ravi',
        'assignees': [
          {'employeeId': 'VRM-021', 'employeeName': 'Ahilesh K'},
        ],
      };
      final mockClient = MockClient((req) async {
        if (req.url.path.endsWith('/data-gateway/proxy')) {
          return http.Response(jsonEncode({'data': [sampleTask]}), 200);
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });
      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      await tester.pumpWidget(
        _wrapWithUser(user: _hrUser, repo: repo, child: const TasksScreen()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('HR Assigned Task'));
      await tester.pumpAndSettle();

      expect(find.text('Edit Task'), findsOneWidget);
      expect(find.text('Reopen Task'), findsOneWidget);
      expect(find.text('Delete'), findsNothing);
      expect(find.text('Update Status'), findsNothing);
    });

    testWidgets('Assigned employee sees Update Status & Daily Report only',
        (tester) async {
      final sampleTask = <String, dynamic>{
        'id': 't-12',
        'title': 'Dev Task',
        'description': 'Build feature',
        'priority': 'High',
        'overallStatus': 'IN PROGRESS',
        'overallProgress': 40,
        'assignedBy': 'VRM-002',
        'assignedByName': 'Pavithra Ravi',
        'assignees': [
          {'employeeId': 'VRM-021', 'employeeName': 'Ahilesh K'},
        ],
      };
      final mockClient = MockClient((req) async {
        if (req.url.path.endsWith('/data-gateway/proxy')) {
          return http.Response(jsonEncode({'data': [sampleTask]}), 200);
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });
      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      await tester.pumpWidget(
        _wrapWithUser(user: _staffUser, repo: repo, child: const TasksScreen()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Dev Task'));
      await tester.pumpAndSettle();

      await tester.drag(find.byType(ListView).last, const Offset(0, -400));
      await tester.pumpAndSettle();

      expect(find.text('Update Status'), findsOneWidget);
      expect(find.text('Daily Report'), findsOneWidget);
      expect(find.text('Edit Task'), findsNothing);
      expect(find.text('Delete'), findsNothing);
    });
  });

  group('Issue #3: Report screen, title & Excel SpreadsheetML generator', () {
    test('Module catalog renames reports to Report', () {
      expect(definitionFor('reports').title, 'Report');
    });

    test('FileShareHelper generates valid Excel SpreadsheetML XML', () {
      final bytes = FileShareHelper.buildExcelSpreadsheetXml(
        sheetName: 'Present',
        title: 'BUSINZ HRMS — Present Report',
        subtitle: 'Period: 27 Nov 2026',
        headers: const ['Emp ID', 'Name', 'Status'],
        rows: const [
          ['VRM-002', 'Manoj & Co', 'Present'],
        ],
      );
      final xml = utf8.decode(bytes);
      expect(xml, contains('<?mso-application progid="Excel.Sheet"?>'));
      expect(xml, contains('Manoj &amp; Co'));
      expect(xml, contains('BUSINZ HRMS'));
    });

    testWidgets(
        'ReportsScreen exposes Single Date, Date Range, all 6 categories & Excel/PDF actions',
        (tester) async {
      final mockClient = MockClient((req) async {
        if (req.url.path.endsWith('/employees')) {
          return http.Response(
            jsonEncode({
              'data': [
                {'id': 'e0', 'employeeId': 'VRM-001', 'name': 'Velmurugan M', 'role': 'CEO', 'designation': 'CEO'},
                {'id': 'e1', 'employeeId': 'VRM-002', 'name': 'Manoj Raj', 'department': 'SALES'},
              ]
            }),
            200,
          );
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });
      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      await tester.pumpWidget(
        _wrapWithUser(user: _ceoUser, repo: repo, child: const ReportsScreen()),
      );
      await tester.pumpAndSettle();

      expect(find.text('Single Date'), findsOneWidget);
      expect(find.text('Date Range'), findsOneWidget);
      expect(find.text('Excel'), findsOneWidget);
      expect(find.text('PDF'), findsOneWidget);
      expect(find.text('Present'), findsOneWidget);
      expect(find.text('Absent'), findsOneWidget);
      expect(find.text('Leave'), findsOneWidget);
      expect(find.text('Late'), findsOneWidget);
      expect(find.text('Half Day'), findsOneWidget);
      expect(find.text('OT'), findsOneWidget);
      // CEO excluded from employee reports
      expect(find.text('Velmurugan M'), findsNothing);
    });
  });

  group('Issue #4: Payroll Web-parity calculation & removal of top segment pills', () {
    test('PayrollCalculator matches Web exact Dhanasekar Nov 2026 payslip (18.5/30d, Exempt)',
        () {
      // Nov 2026: 30 days, cutoff 2026-11-27.
      // Sundays: Nov 1, 8, 15, 22 (4 paid WO; Nov 29 is future).
      // Holiday: Nov 9 (1 paid holiday).
      // Present: 13 full days + 1 half day = 13.5 present, 8.5 LOP -> 18.5 / 30 paid days.
      final fullDays = [
        '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
        '2026-11-07', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
        '2026-11-14', '2026-11-16', '2026-11-17',
      ];
      final attendance = [
        for (final d in fullDays)
          {
            'employee_id': 'VRM-042',
            'date': d,
            'status': 'Present',
            'check_in': '${d}T09:00:00Z',
            'check_out': '${d}T18:00:00Z',
            'working_hours': 9,
          },
        {
          'employee_id': 'VRM-042',
          'date': '2026-11-18',
          'status': 'Half Day',
          'check_in': '2026-11-18T09:00:00Z',
          'check_out': '2026-11-18T13:00:00Z',
          'working_hours': 4,
        },
      ];

      final result = PayrollCalculator.recalculateRecord(
        record: {
          'employeeId': 'VRM-042',
          'employeeName': 'Dhanasekar J',
          'monthlyCtc': 35000,
          'grossSalary': 35000,
          'status': 'Processed',
          'pfAmount': 0,
        },
        employee: {
          'employeeId': 'VRM-042',
          'joining_date': '2026-08-13',
          'basic_salary': 35000,
          'withPf': false,
        },
        monthAttendance: attendance,
        approvedLeaves: const [],
        holidayDates: const {'2026-11-09'},
        month: 11,
        year: 2026,
        todayOverride: DateTime(2026, 11, 27),
      );

      expect(result['calendarDays'], 30.0);
      expect(result['workingDays'], 24.0);
      expect(result['presentDays'], 13.5);
      expect(result['paidWeekOffDays'], 4.0);
      expect(result['paidHolidayDays'], 1.0);
      expect(result['lopDays'], 8.5);
      expect(result['totalPaidDays'], 18.5);
      expect(result['basicSalary'], 8633.0);
      expect(result['hra'], 7554.0);
      expect(result['da'], 4317.0);
      expect(result['conveyance'], 1079.0);
      expect(result['grossSalary'], 21583.0);
      expect(result['epfDeduction'], 0.0);
      expect(result['esiDeduction'], 0.0);
      expect(result['netSalary'], 21583.0);
      final deds = result['deductionsBreakdown'] as List;
      expect(deds.first['description'], 'Exempt (< 6 Months)');
    });

    test('PayrollCalculator matches Web exact EPF (12%) + ESIC (0.75%) math (26/30d)',
        () {
      // 21 present + 4 WO + 1 Hol = 26/30 days on 16,000 CTC -> Gross 13,867
      final workingDates = [
        '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
        '2026-11-07', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
        '2026-11-14', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19',
        '2026-11-20', '2026-11-21', '2026-11-23', '2026-11-24', '2026-11-25',
        '2026-11-26',
      ];
      final attendance = [
        for (final d in workingDates)
          {'employee_id': 'VRM-003', 'date': d, 'status': 'Present', 'working_hours': 9},
      ];

      final result = PayrollCalculator.recalculateRecord(
        record: {
          'employeeId': 'VRM-003',
          'employeeName': 'Kaleeshwari',
          'monthlyCtc': 16000,
          'grossSalary': 16000,
          'pfAmount': 1248,
          'status': 'Processed',
        },
        employee: {
          'employeeId': 'VRM-003',
          'joining_date': '2025-01-10',
          'basic_salary': 16000,
          'withPf': true,
        },
        monthAttendance: attendance,
        approvedLeaves: const [],
        holidayDates: const {'2026-11-09'},
        month: 11,
        year: 2026,
        todayOverride: DateTime(2026, 11, 27),
      );

      expect(result['totalPaidDays'], 26.0);
      expect(result['grossSalary'], 13867.0);
      expect(result['epfDeduction'], 1081.56);
      expect(result['esiDeduction'], 104.0);
      expect(result['totalDeductions'], 1185.56);
      expect(result['netSalary'], 12681.44);
    });

    testWidgets('PayrollScreen removes top Payslips | Claims | Advance pills',
        (tester) async {
      final mockClient = MockClient((req) async {
        return http.Response(jsonEncode({'data': []}), 200);
      });
      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      await tester.pumpWidget(
        _wrapWithUser(user: _ceoUser, repo: repo, child: const PayrollScreen()),
      );
      await tester.pumpAndSettle();

      expect(find.text('Payslips'), findsNothing);
      expect(find.text('Claims'), findsNothing);
      expect(find.text('Advance'), findsNothing);
    });

    test(
        'PayrollCalculator matches Web exact Ahilesh K Nov 2026 payslip (CTC 18,000, 26.5/30d, Gross/Net 15,900, no stale 120 late deduction)',
        () {
      // Nov 2026 (cutoff 2026-11-27):
      // 20 full present + 1 half-day (2026-11-26) = 20.5 present, 0.5 LOP
      // 1 approved paid leave (2026-11-07), 1 holiday (2026-11-09), 4 Sundays = 26.5 / 30 paid days
      final fullDates = [
        '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
        '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14',
        '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
        '2026-11-21', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27',
      ];
      final attendance = [
        for (final d in fullDates)
          {'employee_id': 'VRM-027', 'date': d, 'status': 'Present', 'working_hours': 9},
        {
          'employee_id': 'VRM-027',
          'date': '2026-11-26',
          'status': 'Half Day',
          'working_hours': 4.5,
        },
      ];
      final leaves = [
        {
          'employeeId': 'VRM-027',
          'startDate': '2026-11-07',
          'endDate': '2026-11-07',
          'leaveType': 'Paid Leave',
          'status': 'Approved',
          'daysCount': 1,
        },
      ];

      final result = PayrollCalculator.recalculateRecord(
        record: {
          'employeeId': 'VRM-027',
          'employeeName': 'Ahilesh K',
          // Stale snapshot values that previously caused Web vs Mobile mismatch:
          'grossSalary': 17700,
          'lateAttendanceDeduction': 120,
          'status': 'Processed',
        },
        employee: {
          'id': 'uuid-ahilesh',
          'employee_id': 'VRM-027',
          'employeeId': 'VRM-027',
          'first_name': 'Ahilesh',
          'last_name': 'K',
          'designation': 'JUNIOR',
          'department': 'DEVELOPER',
          'joining_date': '2026-08-01',
          'basic_salary': 7200,
          'status': 'Active',
          'profile_data': {
            'salaryDetails': {
              'monthlyCtc': 18000,
              'basicSalary': 7200,
              'withPf': false,
              'salaryScheme': 'WITHOUT_PF',
              'panNumber': 'OZIPK5680M',
            },
            'bankDetails': {
              'bankName': 'Karur Vysya Bank',
              'accountNumber': '1233153000006279',
              'ifscCode': 'KVBL0001233',
            },
          },
        },
        monthAttendance: attendance,
        approvedLeaves: leaves,
        holidayDates: const {'2026-11-09'},
        month: 11,
        year: 2026,
        attendancePolicies: const [],
        loanRecords: const [],
        todayOverride: DateTime(2026, 11, 27),
      );

      expect(result['monthlyCtc'], 18000.0);
      expect(result['calendarDays'], 30.0);
      expect(result['workingDays'], 24.0);
      expect(result['presentDays'], 20.5);
      expect(result['paidWeekOffDays'], 4.0);
      expect(result['paidHolidayDays'], 1.0);
      expect(result['paidLeaveDays'], 1.0);
      expect(result['lopDays'], 0.5);
      expect(result['totalPaidDays'], 26.5);
      expect(result['basicSalary'], 6360.0);
      expect(result['hra'], 5565.0);
      expect(result['da'], 3180.0);
      expect(result['conveyance'], 795.0);
      expect(result['grossSalary'], 15900.0);
      expect(result['lateAttendanceDeduction'], 0.0);
      expect(result['epfDeduction'], 0.0);
      expect(result['esiDeduction'], 0.0);
      expect(result['totalDeductions'], 0.0);
      expect(result['netSalary'], 15900.0);
      expect(result['joiningDate'], '2026-08-01');
      expect(result['accountNumber'], '1233153000006279');
      expect(result['panNumber'], 'OZIPK5680M');
      expect(result['_hasEmbeddedProfile'], isTrue);
    });

    test(
        'HrmsRepository.payrollRecords filters inactive/deleted staff, avoids select=* on attendance_records, prevents taxDeduction double-count, and opens Payslip with 0 extra network calls',
        () async {
      final recordedGatewayPaths = <String>[];
      int totalRequests = 0;

      final mockClient = MockClient((req) async {
        totalRequests++;
        if (req.url.path.contains('/data-gateway/proxy')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          final rawPath = (body['path'] ?? '').toString();
          final path = rawPath.startsWith('/') ? rawPath.substring(1) : rawPath;
          recordedGatewayPaths.add(path);

          if (path.startsWith('company_settings?')) {
            return http.Response(
              jsonEncode({
                'data': [
                  {
                    'setting_key': 'company_info',
                    'setting_val': {
                      'legalCompanyName': 'VRM STRUCTURES INDIA PRIVATE LIMITED',
                      'registeredAddress': 'Chennai, Tamil Nadu',
                    },
                  },
                  {
                    'setting_key': 'holiday_policies_data',
                    'setting_val': [
                      {
                        'name': 'Company',
                        'holidays': [
                          {'date': '2026-11-09', 'name': 'Festival Holiday'},
                        ],
                      },
                    ],
                  },
                  {
                    'setting_key': 'payroll_records_data',
                    'setting_val': [
                      {
                        'id': 'pr-active',
                        'employeeId': 'VRM-002',
                        'employeeName': 'Manoj Raj Selvaraj',
                        'month': 'November',
                        'year': 2026,
                        'grossSalary': 45000,
                        // Web stores total statutory (EPF+ESIC+PT) in taxDeduction;
                        // Mobile must NOT treat taxDeduction as Professional Tax!
                        'taxDeduction': 3510,
                        'pfAmount': 3510,
                        'lateAttendanceDeduction': 120,
                        'status': 'Processed',
                      },
                      {
                        'id': 'pr-inactive',
                        'employeeId': 'VRM-099',
                        'employeeName': 'Relieved Staff',
                        'month': 'November',
                        'year': 2026,
                        'grossSalary': 20000,
                        'netSalary': 20000,
                        'status': 'Processed',
                      },
                      {
                        'id': 'pr-orphan',
                        'employeeId': 'VRM-888',
                        'employeeName': 'Deleted Staff',
                        'month': 'November',
                        'year': 2026,
                        'grossSalary': 15000,
                        'netSalary': 15000,
                        'status': 'Processed',
                      },
                    ],
                  },
                  {
                    'setting_key': 'master_attendance_policies_data',
                    'setting_val': [],
                  },
                  {
                    'setting_key': 'loan_records_data',
                    'setting_val': [],
                  },
                ],
              }),
              200,
            );
          }
          if (path.startsWith('employees?')) {
            return http.Response(
              jsonEncode({
                'data': [
                  {
                    'id': 'uuid-manoj',
                    'employee_id': 'VRM-002',
                    'first_name': 'Manoj Raj',
                    'last_name': 'Selvaraj',
                    'designation': 'Manager',
                    'status': 'Active',
                    'basic_salary': 20000,
                    'joining_date': '2024-01-15',
                    'company_id': 'company-a',
                    'departments': {'name': 'SALES'},
                    'profile_data': {
                      'salaryDetails': {
                        'monthlyCtc': 50000,
                        'withPf': true,
                        'salaryScheme': 'WITH_PF',
                        'panNumber': 'ABCDE1234F',
                      },
                      'bankDetails': {'accountNumber': '998877665544'},
                    },
                  },
                  {
                    'id': 'uuid-inactive',
                    'employee_id': 'VRM-099',
                    'first_name': 'Relieved',
                    'last_name': 'Staff',
                    'designation': 'Staff',
                    'status': 'Inactive',
                    'basic_salary': 8000,
                    'company_id': 'company-a',
                  },
                ],
              }),
              200,
            );
          }
          if (path.startsWith('attendance_records?')) {
            // Confirm photo-free explicit select (NEVER select=*)
            expect(path.contains('select=*'), isFalse);
            expect(path.contains('check_in_photo'), isFalse);
            return http.Response(
              jsonEncode({
                'data': [
                  for (var day = 2; day <= 27; day++)
                    if (DateTime(2026, 11, day).weekday != DateTime.sunday &&
                        day != 9)
                      {
                        'employee_id': 'VRM-002',
                        'date': '2026-11-${day.toString().padLeft(2, '0')}',
                        'status': 'Present',
                        'working_hours': 9,
                      },
                ],
              }),
              200,
            );
          }
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });

      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      final records = await repo.payrollRecords(month: 11, year: 2026);
      // Only active VRM-002 survives (VRM-099 Inactive & VRM-888 Deleted excluded!)
      expect(records.length, 1);
      final rec = records.first;
      expect(rec['employeeId'], 'VRM-002');
      expect(rec['monthlyCtc'], 50000.0);
      expect(rec['professionalTax'], 0.0);
      expect(rec['lateAttendanceDeduction'], 0.0);
      // Verify no double-deduction of taxDeduction
      expect(rec['totalDeductions'], rec['epfDeduction']);

      // Confirm photo-free attendance_records query was executed
      expect(
        recordedGatewayPaths.any((p) => p.startsWith('attendance_records?')),
        isTrue,
      );

      // Second call hits 60s memory cache -> 0 new HTTP requests
      final reqsAfterFirstLoad = totalRequests;
      final cachedRecords = await repo.payrollRecords(month: 11, year: 2026);
      expect(cachedRecords.length, 1);
      expect(totalRequests, reqsAfterFirstLoad);

      // Opening Official Payslip with embedded profile + cached companyInfo -> 0 HTTP requests!
      final slip = await repo.payslip(
        'VRM-002',
        month: 11,
        year: 2026,
        fallbackRecord: rec,
      );
      expect(totalRequests, reqsAfterFirstLoad);
      expect(slip['employee']['accountNumber'], '998877665544');
      expect(slip['employee']['panNumber'], 'ABCDE1234F');
      expect(slip['employee']['joiningDate'], '2024-01-15');
      expect(slip['company']['legalName'],
          'VRM STRUCTURES INDIA PRIVATE LIMITED');
    });

    test(
        'HrmsRepository.payrollRecords never requests nonexistent shift_name/exit_date, falls back cleanly on HTTP 400 attendance tier, and merges employee_profiles_data WITHOUT_PF',
        () async {
      final seenPaths = <String>[];
      final mockClient = MockClient((req) async {
        if (req.url.path.contains('/data-gateway/proxy')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          final rawPath = (body['path'] ?? '').toString();
          final path = rawPath.startsWith('/') ? rawPath.substring(1) : rawPath;
          seenPaths.add(path);

          // Assert nonexistent columns are NEVER requested
          expect(path.contains('shift_name'), isFalse);
          expect(path.contains('exit_date'), isFalse);

          if (path.startsWith('company_settings?')) {
            return http.Response(
              jsonEncode({
                'data': [
                  {
                    'setting_key': 'holiday_policies_data',
                    'setting_val': [
                      {
                        'name': 'Company',
                        'holidays': [
                          {'date': '2026-11-09', 'name': 'Festival Holiday'},
                        ],
                      },
                    ],
                  },
                  {
                    'setting_key': 'employee_profiles_data',
                    'setting_val': {
                      'VRM-027': {
                        'employeeId': 'VRM-027',
                        'joiningDate': '2026-08-01',
                        'withPf': false,
                        'salaryDetails': {
                          'monthlyCtc': 18000,
                          'salaryScheme': 'WITHOUT_PF',
                          'withPf': false,
                          'panNumber': 'OZIPK5680M',
                        },
                        'bankDetails': {
                          'accountNumber': '1233153000006279',
                        },
                      },
                    },
                  },
                  {
                    'setting_key': 'payroll_records_data',
                    'setting_val': [
                      {
                        'id': 'pr-ahilesh',
                        'employeeId': 'VRM-027',
                        'employeeName': 'Ahilesh K',
                        'month': 'November',
                        'year': 2026,
                        // Stale 30/30 snapshot with PF=1404 & ESIC=135!
                        'basicSalary': 7200,
                        'hra': 6300,
                        'da': 3600,
                        'conveyance': 900,
                        'grossSalary': 18000,
                        'pfAmount': 1404,
                        'esicAmount': 135,
                        'totalDeductions': 1539,
                        'netSalary': 16461,
                        'withPf': true,
                        'totalPaidDays': 30,
                        'status': 'Processed',
                      },
                    ],
                  },
                ],
              }),
              200,
            );
          }

          if (path.startsWith('employees?')) {
            return http.Response(
              jsonEncode({
                'data': [
                  {
                    'id': 'uuid-vrm027',
                    'employee_id': 'VRM-027',
                    'first_name': 'Ahilesh',
                    'last_name': 'K',
                    'designation': 'JUNIOR',
                    'status': 'Active',
                    'basic_salary': 7200,
                    'joining_date': '2026-08-01',
                    'company_id': 'company-a',
                    'departments': {'name': 'DEVELOPER'},
                    // profile_data intentionally null to prove employee_profiles_data merge!
                    'profile_data': null,
                  },
                ],
              }),
              200,
            );
          }

          if (path.startsWith('attendance_records?')) {
            // Simulate older PostgreSQL lacking calculated_ot_hours -> HTTP 400 on Tier 1
            if (path.contains('calculated_ot_hours')) {
              return http.Response(
                jsonEncode({
                  'success': false,
                  'error': 'column attendance_records.calculated_ot_hours does not exist',
                }),
                400,
              );
            }
            // Tier 2 (Web verified columns) succeeds with real attendance rows!
            final fullDates = [
              '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
              '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14',
              '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
              '2026-11-21', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27',
            ];
            return http.Response(
              jsonEncode({
                'data': [
                  for (final d in fullDates)
                    {
                      'id': 'att-$d',
                      'employee_id': 'uuid-vrm027',
                      'date': d,
                      'status': 'Present',
                      'working_hours': 9,
                    },
                  {
                    'id': 'att-2026-11-26',
                    'employee_id': 'uuid-vrm027',
                    'date': '2026-11-26',
                    'status': 'Half Day',
                    'working_hours': 4.5,
                  },
                ],
              }),
              200,
            );
          }
        }
        if (req.url.path.endsWith('/leaves')) {
          return http.Response(
            jsonEncode({
              'data': [
                {
                  'employeeId': 'VRM-027',
                  'startDate': '2026-11-07',
                  'endDate': '2026-11-07',
                  'leaveType': 'Paid Leave',
                  'status': 'Approved',
                  'daysCount': 1,
                },
              ],
            }),
            200,
          );
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });

      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      final records = await repo.payrollRecords(
        month: 11,
        year: 2026,
        employeeId: 'VRM-027',
      );
      expect(records, hasLength(1));
      final rec = records.first;
      // Must NOT show stale 30/30 or stale PF 1404 / ESIC 135!
      expect(rec['monthlyCtc'], 18000.0);
      expect(rec['totalPaidDays'], 26.5);
      expect(rec['grossSalary'], 15900.0);
      expect(rec['epfDeduction'], 0.0);
      expect(rec['esiDeduction'], 0.0);
      expect(rec['totalDeductions'], 0.0);
      expect(rec['netSalary'], 15900.0);
      expect(rec['accountNumber'], '1233153000006279');
      expect(rec['panNumber'], 'OZIPK5680M');
      expect(
        seenPaths.any((p) =>
            p.startsWith('attendance_records?') &&
            !p.contains('calculated_ot_hours')),
        isTrue,
      );
    });

    testWidgets(
        'PayrollScreen Official Payslip never duplicates Employees Provident Fund / ESIC deduction rows',
        (tester) async {
      final mockClient = MockClient((req) async {
        if (req.url.path.contains('/data-gateway/proxy')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          final path = (body['path'] ?? '').toString();
          if (path.contains('company_settings')) {
            return http.Response(
              jsonEncode({
                'data': [
                  {
                    'setting_key': 'company_info',
                    'setting_val': {
                      'legalCompanyName': 'VRM STRUCTURES INDIA PRIVATE LIMITED',
                    },
                  },
                  {
                    'setting_key': 'payroll_records_data',
                    'setting_val': [
                      {
                        'id': 'pr-paid-1',
                        'employeeId': 'VRM-002',
                        'employeeName': 'Manoj Raj Selvaraj',
                        'month': 'November',
                        'year': 2026,
                        'basicSalary': 7200,
                        'hra': 6300,
                        'da': 3600,
                        'conveyance': 900,
                        'grossSalary': 18000,
                        'pfAmount': 1404,
                        'esicAmount': 135,
                        'totalDeductions': 1539,
                        'netSalary': 16461,
                        'status': 'Paid',
                        'deductionsBreakdown': [
                          {
                            'name': "Employees' Provident Fund",
                            'description': 'Formula: (BASIC+DA+CONV)*12/100',
                            'amount': 1404,
                          },
                          {
                            'name': "Employees' State Insurance Corporation",
                            'description': 'Formula: (BASIC+HRA+DA+CONV+OT)*0.75/100',
                            'amount': 135,
                          },
                        ],
                      },
                    ],
                  },
                ],
              }),
              200,
            );
          }
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });

      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );
      await tester.pumpWidget(
        _wrapWithUser(user: _ceoUser, repo: repo, child: const PayrollScreen()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Manoj Raj Selvaraj'));
      await tester.pumpAndSettle();

      final slipScroll = find.byType(Scrollable).last;
      await tester.scrollUntilVisible(
        find.text("Employees' Provident Fund"),
        250,
        scrollable: slipScroll,
      );
      await tester.pumpAndSettle();

      expect(find.text("Employees' Provident Fund"), findsOneWidget);
      expect(
          find.text("Employees' State Insurance Corporation"), findsOneWidget);
      // Must NEVER append duplicate EPF Employee Contribution / ESIC Contribution rows!
      expect(find.text('EPF Employee Contribution'), findsNothing);
      expect(find.text('ESIC Contribution'), findsNothing);
    });

    test(
        'PayrollCalculator ignores legacy enableProfessionalTax=true when payrollConfig.components defines statutory PF/ESIC without an active PT component (matches Web ₹0 PT)',
        () {
      final result = PayrollCalculator.recalculateRecord(
        record: {
          'employeeId': 'VRM-027',
          'employeeName': 'Ahilesh K',
          'status': 'Processed',
        },
        employee: {
          'id': 'uuid-vrm027',
          'employee_id': 'VRM-027',
          'joining_date': '2026-08-01',
          'basic_salary': 7200,
          'profile_data': {
            'salaryDetails': {
              'monthlyCtc': 18000,
              'salaryScheme': 'WITHOUT_PF',
              'withPf': false,
            },
          },
        },
        monthAttendance: const [
          {
            'employee_id': 'VRM-027',
            'date': '2026-11-02',
            'status': 'Present',
            'working_hours': 9,
          },
        ],
        approvedLeaves: const [],
        holidayDates: const {'2026-11-09'},
        month: 11,
        year: 2026,
        payrollConfig: const {
          'enableProfessionalTax': true,
          'standardPtAmount': 200,
          'components': [
            {
              'code': 'PF',
              'name': "Employees' Provident Fund",
              'type': 'DEDUCTION',
              'active': true,
            },
            {
              'code': 'ESIC',
              'name': "Employees' State Insurance Corporation",
              'type': 'DEDUCTION',
              'active': true,
            },
            {
              'code': 'PT',
              'name': 'Professional Tax',
              'type': 'DEDUCTION',
              'active': false,
              'defaultValue': 200,
            },
          ],
        },
        todayOverride: DateTime(2026, 11, 2),
      );

      expect(result['professionalTax'], 0.0);
      expect(result['totalDeductions'], 0.0);
      expect(result['netSalary'], result['grossSalary']);
      final deds = result['deductionsBreakdown'] as List;
      expect(
        deds.any((d) =>
            (d as Map)['name'].toString().toLowerCase().contains('professional')),
        isFalse,
      );
    });
  });

  group('Issue #6 & #7: Exclude CEO from Employee list & Field Duty assignment', () {
    test('excludeCeoEmployees filters VRM-001, EMP-000, CEO role & designation', () {
      final filtered = excludeCeoEmployees([
        {'employeeId': 'VRM-001', 'name': 'Velmurugan M', 'role': 'CEO', 'designation': 'CEO'},
        {'employeeId': 'EMP-000', 'name': 'Owner', 'role': 'Super Admin'},
        {'employeeId': 'VRM-002', 'name': 'Manoj Raj', 'role': 'Employee', 'designation': 'BDE-Manager'},
      ]);
      expect(filtered.length, 1);
      expect(filtered.first['employeeId'], 'VRM-002');
    });

    testWidgets('EmployeesScreen hides CEO Velmurugan M from directory', (tester) async {
      final mockClient = MockClient((req) async {
        if (req.url.path.endsWith('/employees')) {
          return http.Response(
            jsonEncode({
              'data': [
                {'id': 'e0', 'employeeId': 'VRM-001', 'name': 'Velmurugan M', 'role': 'CEO', 'designation': 'CEO'},
                {'id': 'e1', 'employeeId': 'VRM-002', 'name': 'Manoj Raj', 'department': 'SALES', 'designation': 'Manager'},
              ]
            }),
            200,
          );
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });
      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      await tester.pumpWidget(
        _wrapWithUser(user: _ceoUser, repo: repo, child: const EmployeesScreen()),
      );
      await tester.pumpAndSettle();

      expect(find.text('Velmurugan M'), findsNothing);
      expect(find.text('Manoj Raj'), findsOneWidget);
    });
  });

  group('Issue #8: Asset Management 403 fallback to live PostgREST /rest/v1/assets', () {
    test('HrmsRepository.assets falls back to /rest/v1/assets when gateway returns 403',
        () async {
      var hitDirectRest = false;
      final mockClient = MockClient((req) async {
        if (req.url.path.endsWith('/data-gateway/proxy')) {
          return http.Response(
            jsonEncode({
              'success': false,
              'error': {
                'code': 'FORBIDDEN',
                'message': 'Your role cannot view asset records.',
              }
            }),
            403,
          );
        }
        if (req.url.path.contains('/rest/v1/assets')) {
          hitDirectRest = true;
          return http.Response(
            jsonEncode([
              {
                'id': 'ast-1',
                'asset_tag': 'VRM-LAP-01',
                'name': 'MacBook Pro 14',
                'status': 'Assigned',
                'assigned_employee_id': 'VRM-021',
              }
            ]),
            200,
          );
        }
        return http.Response(jsonEncode({'data': []}), 200);
      });

      final repo = HrmsRepository(
        ApiClient(sessionStore: _FakeSessionStore(), httpClient: mockClient),
      );

      final assets = await repo.assets();
      expect(hitDirectRest, isTrue);
      expect(assets.length, 1);
      expect(assets.first['name'], 'MacBook Pro 14');
    });
  });
}
