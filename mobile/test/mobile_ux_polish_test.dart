import 'dart:convert';

import 'package:businz_hrms_mobile/app/providers.dart';
import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/core/models/permission_matrix.dart';
import 'package:businz_hrms_mobile/core/network/api_client.dart';
import 'package:businz_hrms_mobile/core/storage/secure_session_store.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/dashboard/presentation/dashboard_screen.dart';
import 'package:businz_hrms_mobile/features/leave/presentation/leave_screen.dart';
import 'package:businz_hrms_mobile/features/modules/presentation/more_screen.dart';
import 'package:businz_hrms_mobile/features/shared/data/hrms_repository.dart';
import 'package:businz_hrms_mobile/features/tasks/presentation/tasks_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _MemStore implements SecureSessionStore {
  @override
  Future<String?> readAccessToken() async => 'test-token';
  @override
  Future<String?> readRefreshToken() async => null;
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

class _StubAuth extends AuthController {
  _StubAuth(this._user);
  final AppUser _user;
  @override
  Future<AppUser?> build() async => _user;
}

class _StubRepo extends HrmsRepository {
  _StubRepo() : super(ApiClient(sessionStore: _MemStore()));

  @override
  Future<List<Map<String, dynamic>>> leaves({String? employeeId}) async =>
      const [
        {
          'id': 'lv-1',
          'employeeId': 'VRM-027',
          'employeeName': 'Ahilesh K',
          'leaveType': 'Paid Leave',
          'startDate': '2026-11-10',
          'endDate': '2026-11-10',
          'daysCount': 1,
          'status': 'Approved',
          'reason': 'Going to native for Diwali.',
          'approvedBy': 'Pavithra Ravi (HR Manager)',
          'approverComment': 'Approved for festival travel.',
        },
      ];

  @override
  Future<Map<String, dynamic>> leaveBalances(String employeeId) async => const {
        'year': 2026,
        'totalPaidRemaining': 1,
        'totalPaidUsed': 1,
        'totalUnpaidUsed': 0,
        'categories': [
          {
            'name': 'Earned Leave (EL)',
            'code': 'EL',
            'isPaid': true,
            'annualQuota': 1,
            'usedDays': 1,
            'remainingDays': 0,
          },
          {
            'name': 'Sick Leave (SL)',
            'code': 'SL',
            'isPaid': true,
            'annualQuota': 1,
            'usedDays': 0,
            'remainingDays': 1,
          },
        ],
      };

  @override
  Future<List<Map<String, dynamic>>> tasks() async => const [
        {
          'id': 't-1',
          'taskNumber': 'TSK-2026-011',
          'title': 'HRMS CORRECTIONS',
          'priority': 'High',
          'overallStatus': 'COMPLETED',
          'overallProgress': 100,
          'dueDate': '2026-11-17',
          'responsiblePersonId': 'VRM-027',
          'responsiblePersonName': 'Ahilesh K',
          'assignedByName': 'Pavithra Ravi',
        },
      ];

  @override
  Future<Map<String, dynamic>> shiftStatus(String employeeId) async => const {
        'canCheckIn': false,
        'canCheckOut': true,
        'state': 'CHECKED_IN',
        'shiftStartDisplay': '09:30 AM',
        'shiftEndDisplay': '06:30 PM',
        'todayRecord': {'checkIn': '2026-11-27T04:38:00Z'},
      };

  @override
  Future<List<Map<String, dynamic>>> attendance({
    String? employeeId,
    String? date,
  }) async {
    final now = DateTime.now();
    final today =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    return [
      {
        'date': today,
        'status': 'Present',
        'workingHours': 10.5,
      },
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> attendanceRecordsForOvertime() async {
    final now = DateTime.now();
    final today =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    return [
      {
        'date': today,
        'status': 'Present',
        'working_hours': 10.5,
        'calculated_ot_hours': 2.5,
      },
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> overtimeRecords() async => const [];
}

void main() {
  const employee = AppUser(
    id: 'u-27',
    employeeId: 'VRM-027',
    name: 'Ahilesh K',
    email: 'ahilesh@businz.com',
    role: 'Employee',
    department: 'DEVELOPER',
    designation: 'JUNIOR',
  );

  const matrix = PermissionMatrix(
    dataAccess: 'own',
    moduleActions: {
      'dashboard': {'view'},
      'attendance': {'view', 'create'},
      'face_attendance': {'view', 'create'},
      'shift': {'view'},
      'leave': {'view', 'create'},
      'holidays': {'view'},
      'tasks': {'view', 'create', 'edit', 'assign'},
      'payroll': {'view'},
      'assets': {'view'},
      'field_allowance': {'view', 'create'},
      'gps_tracking': {'view', 'create'},
    },
    specialPermissions: {'create_tasks', 'assign_tasks'},
  );

  testWidgets(
    'LeaveScreen renders compact EL/SL/LOP row, hides subtitle & inline reason, and reveals reason on tap',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(() => _StubAuth(employee)),
            hrmsRepositoryProvider.overrideWithValue(_StubRepo()),
            permissionProvider.overrideWith((_) async => matrix),
          ],
          child: const MaterialApp(home: Scaffold(body: LeaveScreen())),
        ),
      );
      await tester.pumpAndSettle();

      // Compact EL / SL / LOP tiles visible
      expect(find.text('EL'), findsOneWidget);
      expect(find.text('SL'), findsOneWidget);
      expect(find.text('LOP'), findsOneWidget);

      // Noisy subtitle removed
      expect(
        find.text('Includes Work From Home, Sandwich Days & Pay Breakdown'),
        findsNothing,
      );

      // Reason hidden until card is tapped
      expect(find.text('Going to native for Diwali.'), findsNothing);

      // Tap leave application card -> Reason appears inside bottom sheet
      await tester.tap(find.text('Paid Leave'));
      await tester.pumpAndSettle();
      expect(find.text('Going to native for Diwali.'), findsOneWidget);
      expect(find.text('Reviewed by Pavithra Ravi (HR Manager)'), findsOneWidget);
    },
  );

  testWidgets(
    'TasksScreen removes green LinearProgressIndicator bar and shows clean % badge',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(() => _StubAuth(employee)),
            hrmsRepositoryProvider.overrideWithValue(_StubRepo()),
          ],
          child: const MaterialApp(home: Scaffold(body: TasksScreen())),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('HRMS CORRECTIONS'), findsOneWidget);
      expect(find.text('100%'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    },
  );

  test(
    'HrmsRepository.employees falls back to sanitized data-gateway directory on HTTP 403 (Assign Task fix)',
    () async {
      final mockHttp = MockClient((request) async {
        if (request.url.path == '/api/v1/employees') {
          return http.Response(
            jsonEncode({
              'success': false,
              'error': {
                'code': 'FORBIDDEN',
                'message':
                    'Access denied: Role "Employee" lacks "view" permission on module "employees".',
              },
            }),
            403,
          );
        }
        if (request.url.path == '/api/v1/data-gateway/proxy') {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': [
                {
                  'id': 'u-26',
                  'employee_id': 'VRM-026',
                  'first_name': 'Annamalaiyar',
                  'last_name': 'AR',
                  'designation': 'SENIOR',
                  'status': 'Active',
                  'departments': {'name': 'DEVELOPER'},
                },
              ],
            }),
            200,
          );
        }
        return http.Response('Not found', 404);
      });

      final repo = HrmsRepository(
        ApiClient(
          sessionStore: _MemStore(),
          httpClient: mockHttp,
          baseUrl: 'https://hrms.businz.com/api/v1',
        ),
      );
      final list = await repo.employees(activeOnly: true, forceRefresh: true);
      expect(list, hasLength(1));
      expect(list.first['name'], 'Annamalaiyar AR');
      expect(list.first['department'], 'DEVELOPER');
    },
  );

  testWidgets(
    'DashboardScreen shows Overtime Hrs (not Working Hours) and removes Task Progress, Recent Notifications, and View All',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(() => _StubAuth(employee)),
            hrmsRepositoryProvider.overrideWithValue(_StubRepo()),
            permissionProvider.overrideWith((_) async => matrix),
            unreadNotificationCountProvider.overrideWith((_) async => 0),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: DashboardScreen(onNavigateTab: (_) {}),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Overtime Hrs'), findsOneWidget);
      expect(find.text('2.5 h', findRichText: true), findsOneWidget);
      expect(find.text('Working Hours'), findsNothing);
      expect(find.text('Task Progress'), findsNothing);
      expect(find.text('Recent Notifications'), findsNothing);
      expect(find.text('View All ›'), findsNothing);
    },
  );

  testWidgets(
    'MoreScreen removes all Workspace tile subtitles',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(() => _StubAuth(employee)),
            hrmsRepositoryProvider.overrideWithValue(_StubRepo()),
            permissionProvider.overrideWith((_) async => matrix),
          ],
          child: const MaterialApp(home: Scaffold(body: MoreScreen())),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('My Attendance Log'), findsOneWidget);
      expect(find.textContaining('Your punch history'), findsNothing);
      expect(find.textContaining('Assigned shift timing'), findsNothing);
      expect(find.textContaining('Check balances'), findsNothing);
    },
  );
}
