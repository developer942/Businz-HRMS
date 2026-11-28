import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/core/models/permission_matrix.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/auth/data/auth_repository.dart';
import 'package:businz_hrms_mobile/features/auth/presentation/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeAuthRepository implements AuthRepository {
  @override
  Future<AppUser?> restore() async => null;

  @override
  Future<AppUser> login(String identifier, String password) async =>
      const AppUser(
        id: '1',
        employeeId: 'EMP-001',
        name: 'Test Employee',
        email: 'employee@example.com',
        role: 'Employee',
      );

  @override
  Future<Map<String, dynamic>> otpConfig() async => {
        'emailOtpEnabled': true,
        'mobileOtpEnabled': false,
      };

  @override
  Future<({int expiresInSeconds, int resendCooldownSeconds})> requestEmailOtp(
          String email) async =>
      (expiresInSeconds: 300, resendCooldownSeconds: 30);

  @override
  Future<AppUser> verifyEmailOtp(String email, String otp) async =>
      const AppUser(
        id: '1',
        employeeId: 'EMP-001',
        name: 'Test Employee',
        email: 'employee@example.com',
        role: 'Employee',
      );

  @override
  Future<void> logout() async {}

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {}

  @override
  Future<void> requestPasswordReset(String identifier) async {}

  @override
  Future<String> verifyResetOtp(String identifier, String otp) async =>
      'reset-token';

  @override
  Future<void> resetPassword(String resetToken, String password) async {}
}

void main() {
  test('employee fallback does not grant administrative modules', () {
    final matrix = PermissionMatrix.fallback('Employee');
    expect(matrix.can('attendance'), isTrue);
    expect(matrix.can('leave', 'create'), isTrue);
    expect(matrix.can('employees'), isFalse);
    expect(matrix.can('payroll', 'edit'), isFalse);
  });

  test('CEO account is excluded from attendance punching', () {
    const user = AppUser(
      id: 'ceo',
      employeeId: 'CEO-001',
      name: 'CEO',
      email: 'ceo@example.com',
      role: 'CEO',
    );
    expect(user.canPunchAttendance, isFalse);
  });

  testWidgets('login validates both required credentials', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign In'));
    await tester.pump();
    expect(find.text('Enter your employee ID or email.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
  });
}
