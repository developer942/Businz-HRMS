import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/auth/data/auth_repository.dart';
import 'package:businz_hrms_mobile/features/auth/presentation/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

class _DeviceFakeAuthRepository implements AuthRepository {
  @override
  Future<AppUser?> restore() async => null;

  @override
  Future<AppUser> login(String identifier, String password) async {
    expect(identifier, 'EMP-001');
    expect(password, 'ValidPassword123!');
    return const AppUser(
      id: 'device-test-user',
      employeeId: 'EMP-001',
      name: 'Device Test Employee',
      email: 'device-test@example.com',
      role: 'Employee',
    );
  }

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
        id: 'device-test-user',
        employeeId: 'EMP-001',
        name: 'Device Test Employee',
        email: 'device-test@example.com',
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
      'device-reset-token';

  @override
  Future<void> resetPassword(String resetToken, String password) async {}
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('login form accepts credentials on a real Flutter device',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(
            _DeviceFakeAuthRepository(),
          ),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    final fields = find.byType(TextFormField);
    expect(fields, findsNWidgets(2));
    await tester.enterText(fields.at(0), 'EMP-001');
    await tester.enterText(fields.at(1), 'ValidPassword123!');
    await tester.tap(find.text('Sign in securely'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });
}
