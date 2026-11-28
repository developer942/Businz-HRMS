import 'dart:convert';

import 'package:businz_hrms_mobile/app/providers.dart';
import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/core/network/api_client.dart';
import 'package:businz_hrms_mobile/core/storage/secure_session_store.dart';
import 'package:businz_hrms_mobile/core/widgets/proof_viewer.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/field_allowance/presentation/field_allowance_screen.dart';
import 'package:businz_hrms_mobile/features/shared/data/hrms_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _InMemoryStore implements SecureSessionStore {
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

class _StubAuthController extends AuthController {
  _StubAuthController(this._user);
  final AppUser _user;

  @override
  Future<AppUser?> build() async => _user;
}

class _StubClaimsRepository extends HrmsRepository {
  _StubClaimsRepository(this._claims)
      : super(ApiClient(sessionStore: _InMemoryStore()));

  final List<Map<String, dynamic>> _claims;

  @override
  Future<List<Map<String, dynamic>>> fieldAllowanceRequests() async => _claims;
}

void main() {
  group('Proof Viewer utilities', () {
    test('resolveProofUrl preserves data URIs & HTTPS URLs and resolves relative paths', () {
      const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
      expect(resolveProofUrl(dataUri), dataUri);
      expect(
        resolveProofUrl('https://cdn.businz.com/bill.jpg'),
        'https://cdn.businz.com/bill.jpg',
      );
      expect(
        resolveProofUrl('/uploads/receipts/bill-1.jpg'),
        'https://hrms.businz.com/uploads/receipts/bill-1.jpg',
      );
      expect(isPdfProof('data:application/pdf;base64,JVBERi0='), isTrue);
      expect(isPdfProof('/uploads/invoice.pdf'), isTrue);
      expect(isPdfProof(dataUri), isFalse);
    });

    test('tryDecodeDataUriBytes decodes base64 data URI cleanly', () {
      final bytes = tryDecodeDataUriBytes(
        'data:image/png;base64,${base64Encode([1, 2, 3, 4])}',
      );
      expect(bytes, isNotNull);
      expect(bytes, equals([1, 2, 3, 4]));
      expect(tryDecodeDataUriBytes('https://hrms.businz.com/img.png'), isNull);
    });
  });

  group('HrmsRepository.expenses legacy exclusion', () {
    test('does NOT fall back to legacy company_settings.expenses_data when /expenses is empty', () async {
      final requestedPaths = <String>[];
      final mockHttp = MockClient((request) async {
        requestedPaths.add(request.url.path);
        return http.Response(jsonEncode({'success': true, 'data': []}), 200);
      });
      final api = ApiClient(
        sessionStore: _InMemoryStore(),
        httpClient: mockHttp,
        baseUrl: 'https://hrms.businz.com/api/v1',
      );
      final repo = HrmsRepository(api);
      final rows = await repo.expenses();

      expect(rows, isEmpty);
      expect(requestedPaths, equals(['/api/v1/expenses']));
    });
  });

  group('FieldAllowanceScreen (Finance & Claims)', () {
    testWidgets(
      'hides legacy Expenses tab, hides Distribute button on No Advance ₹0 trips, and shows View Proof chip',
      (tester) async {
        const accountsUser = AppUser(
          id: 'u-acc',
          employeeId: 'VRM-032',
          name: 'Ajith Accounts',
          email: 'accounts@businz.com',
          role: 'Finance Manager',
          department: 'Accounts',
        );
        const tinyPngDataUri =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        final repo = _StubClaimsRepository([
          {
            'id': 'fa-1',
            'trip_code': 'FA-2026-72F4B707',
            'employee_id': 'VRM-026',
            'employee_name': 'Annamalaiyar AR',
            'purpose': 'Visit Coolzone for Software Update',
            'destination': 'molakadai',
            'advance_required': false,
            'requested_amount': 0,
            'approved_amount': 0,
            'allocated_amount': 0,
            'total_spent': 0,
            'balance': 0,
            'status': 'APPROVED',
            'daily_reports': [
              {
                'id': 'rep-1',
                'category': 'TRAVEL',
                'description': 'Auto fare',
                'amount': 120,
                'expense_date': '2026-11-24',
                'attachment_path': tinyPngDataUri,
              },
            ],
          },
        ]);

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              authControllerProvider
                  .overrideWith(() => _StubAuthController(accountsUser)),
              hrmsRepositoryProvider.overrideWithValue(repo),
            ],
            child: const MaterialApp(
              home: Scaffold(body: FieldAllowanceScreen()),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('FA-2026-72F4B707'), findsOneWidget);
        expect(find.text('No Advance'), findsOneWidget);
        expect(find.textContaining('Expenses ('), findsNothing);
        expect(find.text('Distribute Cash / Advance'), findsNothing);
        expect(find.text('View Proof'), findsOneWidget);
      },
    );
  });
}
