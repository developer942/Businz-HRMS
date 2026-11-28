import 'package:businz_hrms_mobile/app/providers.dart';
import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/core/models/permission_matrix.dart';
import 'package:businz_hrms_mobile/core/network/api_client.dart';
import 'package:businz_hrms_mobile/core/storage/secure_session_store.dart';
import 'package:businz_hrms_mobile/core/utils/overtime_calculator.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/overtime/presentation/overtime_screen.dart';
import 'package:businz_hrms_mobile/features/shared/data/hrms_repository.dart';
import 'package:businz_hrms_mobile/features/whatsapp/presentation/whatsapp_crm_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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

class _StaticAuth extends AuthController {
  _StaticAuth(this._user);
  final AppUser _user;
  @override
  Future<AppUser?> build() async => _user;
}

class _OvertimeAndCampaignRepo extends HrmsRepository {
  _OvertimeAndCampaignRepo({
    this.otEmployees = const [],
    this.otAttendance = const [],
    this.deptPolicies = const [],
    this.contacts = const [],
    this.staffForCampaign = const [],
  }) : super(ApiClient(sessionStore: _MemStore()));

  final List<Map<String, dynamic>> otEmployees;
  final List<Map<String, dynamic>> otAttendance;
  final List<Map<String, dynamic>> deptPolicies;
  final List<Map<String, dynamic>> contacts;
  final List<Map<String, dynamic>> staffForCampaign;

  final List<Map<String, dynamic>> sentPayloads = [];
  final List<String> consentedContactIds = [];

  @override
  Future<
      ({
        List<Map<String, dynamic>> employees,
        List<Map<String, dynamic>> attendanceRecords,
        List<Map<String, dynamic>> overtimeRecords,
        List<Map<String, dynamic>> departmentOtPolicies,
        List<Map<String, dynamic>> employeeOtPolicies,
        Map<String, dynamic>? overtimePolicy,
        Map<String, dynamic>? payrollConfig,
      })> overtimeBundle({
    required int month,
    required int year,
    String? employeeId,
  }) async =>
      (
        employees: otEmployees,
        attendanceRecords: otAttendance,
        overtimeRecords: const <Map<String, dynamic>>[],
        departmentOtPolicies: deptPolicies,
        employeeOtPolicies: const <Map<String, dynamic>>[],
        overtimePolicy: null,
        payrollConfig: null,
      );

  @override
  Future<List<Map<String, dynamic>>> crmTemplates() async => const [
        {
          'id': 'tmpl-1',
          'name': 'staff_notice',
          'category': 'MARKETING',
          'language': 'en',
          'status': 'APPROVED',
          'headerType': 'NONE',
          'bodyText': 'Hello {{1}}, shift update from BUSINZ.',
          'bodyExampleValues': ['Ahilesh'],
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> crmContacts({
    String? search,
    String? category,
    int limit = 300,
  }) async =>
      contacts;

  @override
  Future<List<Map<String, dynamic>>> campaignEmployees() async =>
      staffForCampaign;

  @override
  Future<Map<String, dynamic>> recordCrmConsent(
    String contactId, {
    String consentStatus = 'Opted In',
    String source = 'Mobile CRM Broadcast',
  }) async {
    consentedContactIds.add(contactId);
    return {'success': true};
  }

  @override
  Future<Map<String, dynamic>> createCrmBroadcast(
          Map<String, dynamic> payload) async =>
      {
        'success': true,
        'data': {'id': 'bc-emp-1'},
      };

  @override
  Future<Map<String, dynamic>> updateCrmBroadcastStatus(
          String id, String status) async =>
      {'success': true};

  @override
  Future<Map<String, dynamic>> sendCrmTemplate(
      Map<String, dynamic> payload) async {
    sentPayloads.add(payload);
    return {
      'success': true,
      'data': {'id': 'msg-1', 'status': 'sent'},
    };
  }
}

void main() {
  group('Issue #1: Daily Overtime Screen & Web OT Policy Amount Rules', () {
    test(
        'OvertimeCalculator shows amount ONLY for OT-policy-eligible employees and hours-only for non-eligible employees',
        () {
      final floorEmp = {
        'id': 'u-floor',
        'employeeId': 'VRM-010',
        'name': 'Karthik Floor',
        'department': 'FLOOR',
        'basic_salary': 7200,
        'profile_data': {
          'salaryDetails': {'monthlyCtc': 18000, 'basicSalary': 7200},
        },
      };
      final devEmp = {
        'id': 'u-dev',
        'employeeId': 'VRM-027',
        'name': 'Ahilesh K',
        'department': 'DEVELOPER',
        'basic_salary': 7200,
        'profile_data': {
          'salaryDetails': {'monthlyCtc': 18000, 'basicSalary': 7200},
        },
      };
      final devAllowExceptionEmp = {
        'id': 'u-dev2',
        'employeeId': 'VRM-030',
        'name': 'Priya Dev',
        'department': 'DEVELOPER',
        'basic_salary': 7200,
        'profile_data': {
          'salaryDetails': {'monthlyCtc': 18000, 'basicSalary': 7200},
        },
      };

      final entries = OvertimeCalculator.buildDailyEntries(
        month: 11,
        year: 2026,
        employees: [floorEmp, devEmp, devAllowExceptionEmp],
        attendanceRecords: const [
          {
            'employee_id': 'VRM-010',
            'date': '2026-11-20',
            'check_in': '09:00 AM',
            'check_out': '08:00 PM',
            'working_hours': 11.0,
            'calculated_ot_hours': 2.0,
          },
          {
            'employee_id': 'VRM-027',
            'date': '2026-11-20',
            'check_in': '09:30 AM',
            'check_out': '08:30 PM',
            'working_hours': 11.0,
            'calculated_ot_hours': 2.0,
          },
          {
            'employee_id': 'VRM-030',
            'date': '2026-11-20',
            'check_in': '09:30 AM',
            'check_out': '08:00 PM',
            'working_hours': 10.5,
            'calculated_ot_hours': 1.5,
          },
        ],
        overtimeRecords: const [],
        departmentOtPolicies: const [
          {
            'department': 'FLOOR',
            'otAllowed': true,
            'wageBase': 'FIXED_HOURLY',
            'otHourlyRate': 120,
            'defaultMultiplier': '1.5x Salary',
          },
          {
            'department': 'DEVELOPER',
            'otAllowed': false,
          },
        ],
        employeeOtPolicies: const [
          {
            'employeeId': 'VRM-030',
            'individualException': 'Allow OT',
            'customWageBase': 'FIXED_HOURLY',
            'customHourlyRate': 150,
            'customMultiplier': '1x Salary',
          },
        ],
      );

      final floorEntry =
          entries.firstWhere((e) => e.employeeId == 'VRM-010');
      final devEntry = entries.firstWhere((e) => e.employeeId == 'VRM-027');
      final exceptionEntry =
          entries.firstWhere((e) => e.employeeId == 'VRM-030');

      // FLOOR employee has active Department OT policy -> shows hours AND amount (2h * 120 * 1.5 = 360)
      expect(floorEntry.showAmount, isTrue);
      expect(floorEntry.otHours, 2.0);
      expect(floorEntry.amount, 360.0);

      // DEVELOPER without exception -> hours ONLY, NO amount
      expect(devEntry.showAmount, isFalse);
      expect(devEntry.otHours, 2.0);
      expect(devEntry.amount, isNull);
      expect(devEntry.hourlyRate, isNull);

      // DEVELOPER with Individual Exception 'Allow OT' -> shows hours AND amount (1.5h * 150 * 1 = 225)
      expect(exceptionEntry.showAmount, isTrue);
      expect(exceptionEntry.otHours, 1.5);
      expect(exceptionEntry.amount, 225.0);
    });

    testWidgets(
        'OvertimeScreen renders hours + ₹ amount for OT-policy-eligible employee',
        (tester) async {
      final now = DateTime.now();
      final dIso =
          '${now.year}-${now.month.toString().padLeft(2, '0')}-12';
      const user = AppUser(
        id: 'u-floor',
        employeeId: 'VRM-010',
        name: 'Karthik Floor',
        email: 'karthik@vrm.in',
        role: 'Employee',
        department: 'FLOOR',
        designation: 'Operator',
      );
      final repo = _OvertimeAndCampaignRepo(
        otEmployees: [
          {
            'id': 'u-floor',
            'employeeId': 'VRM-010',
            'name': 'Karthik Floor',
            'department': 'FLOOR',
            'basic_salary': 7200,
          },
        ],
        otAttendance: [
          {
            'employee_id': 'VRM-010',
            'date': dIso,
            'check_in': '09:00 AM',
            'check_out': '08:00 PM',
            'working_hours': 11.0,
            'calculated_ot_hours': 2.0,
          },
        ],
        deptPolicies: const [
          {
            'department': 'FLOOR',
            'otAllowed': true,
            'wageBase': 'FIXED_HOURLY',
            'otHourlyRate': 125,
            'defaultMultiplier': '1x Salary',
          },
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(() => _StaticAuth(user)),
            hrmsRepositoryProvider.overrideWithValue(repo),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('Employee')),
          ],
          child: const MaterialApp(
            home: Scaffold(body: OvertimeScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Total OT Hours'), findsOneWidget);
      expect(find.text('OT Amount'), findsOneWidget);
      expect(find.text('+2.0 h'), findsOneWidget);
      expect(find.textContaining('₹250'), findsWidgets);
    });

    testWidgets(
        'OvertimeScreen renders ONLY hours (zero ₹ amounts) for employee without OT policy',
        (tester) async {
      final now = DateTime.now();
      final dIso =
          '${now.year}-${now.month.toString().padLeft(2, '0')}-12';
      const user = AppUser(
        id: 'u-dev',
        employeeId: 'VRM-027',
        name: 'Ahilesh K',
        email: 'ahilesh@vrm.in',
        role: 'Employee',
        department: 'DEVELOPER',
        designation: 'JUNIOR',
      );
      final repo = _OvertimeAndCampaignRepo(
        otEmployees: [
          {
            'id': 'u-dev',
            'employeeId': 'VRM-027',
            'name': 'Ahilesh K',
            'department': 'DEVELOPER',
            'basic_salary': 7200,
          },
        ],
        otAttendance: [
          {
            'employee_id': 'VRM-027',
            'date': dIso,
            'check_in': '09:30 AM',
            'check_out': '08:30 PM',
            'working_hours': 11.0,
            'calculated_ot_hours': 2.5,
          },
        ],
        deptPolicies: const [
          {'department': 'DEVELOPER', 'otAllowed': false},
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(() => _StaticAuth(user)),
            hrmsRepositoryProvider.overrideWithValue(repo),
            permissionProvider
                .overrideWith((_) async => PermissionMatrix.fallback('Employee')),
          ],
          child: const MaterialApp(
            home: Scaffold(body: OvertimeScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Total Overtime Hours'), findsOneWidget);
      expect(find.text('+2.5 h'), findsOneWidget);
      // Strictly NO OT Amount card and ZERO rupee figures for non-eligible staff
      expect(find.text('OT Amount'), findsNothing);
      expect(find.textContaining('₹'), findsNothing);
    });
  });

  group('Issue #2: WhatsApp CRM Campaigns Employee Selection', () {
    testWidgets(
        'allows filtering & selecting active HRMS employees and unconsented contacts while excluding opted-out users',
        (tester) async {
      final repo = _OvertimeAndCampaignRepo(
        contacts: const [
          {
            'id': 'crm-unknown-1',
            'name': 'Suresh Client',
            'companyName': 'Apex Solar',
            'phone': '9840011223',
            'consentStatus': 'Unknown',
            'category': 'Customers',
          },
          {
            'id': 'crm-out-1',
            'name': 'Blocked User',
            'companyName': 'External',
            'phone': '9999988888',
            'consentStatus': 'Opted Out',
            'category': 'Customers',
          },
        ],
        staffForCampaign: const [
          {
            'id': 'uuid-emp-1',
            'employeeId': 'VRM-027',
            'name': 'Ahilesh K',
            'department': 'DEVELOPER',
            'phone': '9876543210',
            'status': 'Active',
          },
          {
            'id': 'uuid-emp-2',
            'employeeId': 'VRM-002',
            'name': 'Manoj Raj Selvaraj',
            'department': 'SALES',
            'phone': '9884012345',
            'status': 'Active',
          },
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [hrmsRepositoryProvider.overrideWithValue(repo)],
          child: const MaterialApp(home: WhatsAppCampaignBuilderScreen()),
        ),
      );
      await tester.pumpAndSettle();

      // Opted-out user must remain hidden
      expect(find.text('Blocked User'), findsNothing);

      // Filter by Employees chip and select Ahilesh K
      final mainScroll = find.byType(Scrollable).first;
      final empChip = find.widgetWithText(FilterChip, 'Employees');
      await tester.scrollUntilVisible(empChip, 300, scrollable: mainScroll);
      await tester.tap(empChip);
      await tester.pumpAndSettle();

      expect(find.text('Suresh Client'), findsNothing);
      final ahileshRow = find.text('Ahilesh K');
      await tester.scrollUntilVisible(ahileshRow, 200, scrollable: mainScroll);
      await tester.tap(ahileshRow);
      await tester.pumpAndSettle();

      expect(find.text('Send Bulk (1)'), findsOneWidget);

      // Also switch back to All and select Suresh Client (Unknown consent -> auto opt-in on send)
      await tester.tap(find.widgetWithText(FilterChip, 'All'));
      await tester.pumpAndSettle();
      final sureshRow = find.text('Suresh Client');
      await tester.scrollUntilVisible(sureshRow, 200, scrollable: mainScroll);
      await tester.tap(sureshRow);
      await tester.pumpAndSettle();

      expect(find.text('Send Bulk (2)'), findsOneWidget);

      // Dispatch campaign
      await tester.tap(find.text('Send Bulk (2)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm send'));
      await tester.pumpAndSettle();

      expect(repo.sentPayloads, hasLength(2));
      // Employee without prior CRM record omits contactId so backend auto-upserts by phone
      final empSend = repo.sentPayloads
          .firstWhere((p) => p['recipientPhone'] == '9876543210');
      expect(empSend.containsKey('contactId'), isFalse);
      expect(empSend['recipientName'], 'Ahilesh K');

      // Existing CRM contact with Unknown consent auto-recorded Opted In before Marketing send
      expect(repo.consentedContactIds, contains('crm-unknown-1'));
      expect(find.text('Bulk campaign completed'), findsOneWidget);
    });
  });
}
