import '../../../core/models/app_user.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/secure_session_store.dart';

class AuthRepository {
  const AuthRepository(this._api, this._store);

  final ApiClient _api;
  final SecureSessionStore _store;

  Future<AppUser?> restore() async {
    final token = await _store.readAccessToken();
    if (token == null || token.isEmpty) return null;
    try {
      final response = await _api.get('/auth/me');
      final user = _extractUser(response);
      final refresh = await _store.readRefreshToken();
      await _store.save(
          accessToken: token, refreshToken: refresh, user: user.toJson());
      return user;
    } on ApiException catch (error) {
      if (error.isUnauthorized || error.code == 'ACCOUNT_DEACTIVATED') {
        await _store.clear();
        return null;
      }
      final cached = await _store.readUser();
      return cached == null ? null : AppUser.fromJson(cached);
    }
  }

  Future<AppUser> login(String identifier, String password) async {
    final response = await _api.publicPost('/auth/login', {
      'identifier': identifier.trim().toLowerCase(),
      'password': password,
    });
    return _saveAuthenticatedSession(response);
  }

  Future<Map<String, dynamic>> otpConfig() async {
    final response = await _api.publicGet('/auth/otp-config');
    final data = response['data'];
    return data is Map ? Map<String, dynamic>.from(data) : response;
  }

  Future<({int expiresInSeconds, int resendCooldownSeconds})> requestEmailOtp(
      String email) async {
    final response = await _api.publicPost('/auth/otp-login/request', {
      'email': email.trim().toLowerCase(),
    });
    final data = response['data'];
    final values = data is Map ? Map<String, dynamic>.from(data) : response;
    return (
      expiresInSeconds:
          int.tryParse('${values['expiresInSeconds'] ?? 300}') ?? 300,
      resendCooldownSeconds:
          int.tryParse('${values['resendCooldownSeconds'] ?? 30}') ?? 30,
    );
  }

  Future<AppUser> verifyEmailOtp(String email, String otp) async {
    final response = await _api.publicPost('/auth/otp-login/verify', {
      'email': email.trim().toLowerCase(),
      'otp': otp.trim(),
    });
    return _saveAuthenticatedSession(response);
  }

  Future<AppUser> _saveAuthenticatedSession(
      Map<String, dynamic> response) async {
    final data = response['data'] is Map
        ? Map<String, dynamic>.from(response['data'] as Map)
        : response;
    final access = data['accessToken']?.toString();
    if (access == null || access.isEmpty || data['user'] is! Map) {
      throw const ApiException('Authentication response was incomplete.');
    }
    final user =
        AppUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    await _store.save(
      accessToken: access,
      refreshToken: data['refreshToken']?.toString(),
      user: user.toJson(),
    );
    return user;
  }

  Future<void> logout() async {
    final refresh = await _store.readRefreshToken();
    try {
      await _api.post('/auth/logout', body: {'refreshToken': refresh});
    } catch (_) {
      // Local sign-out must still complete if the server is unavailable.
    }
    await _store.clear();
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await _api.post('/auth/change-password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
      'confirmPassword': newPassword,
    });
    final data = response['data'];
    if (data is Map && data['accessToken'] != null) {
      final user = await _store.readUser();
      if (user != null) {
        user['mustChangePassword'] = false;
        await _store.save(
          accessToken: data['accessToken'].toString(),
          refreshToken: data['refreshToken']?.toString() ??
              await _store.readRefreshToken(),
          user: user,
        );
      }
    }
  }

  Future<void> requestPasswordReset(String identifier) async {
    await _api.publicPost('/auth/forgot-password', {
      'email_or_employee_id': identifier.trim().toLowerCase(),
    });
  }

  Future<String> verifyResetOtp(String identifier, String otp) async {
    final response = await _api.publicPost('/auth/verify-reset-otp', {
      'email_or_employee_id': identifier.trim().toLowerCase(),
      'otp': otp.trim(),
    });
    final data = response['data'];
    if (data is Map && data['resetToken'] != null) {
      return data['resetToken'].toString();
    }
    throw const ApiException('The reset verification response was incomplete.');
  }

  Future<void> resetPassword(String resetToken, String password) async {
    await _api.publicPost('/auth/reset-password', {
      'reset_token': resetToken,
      'new_password': password,
      'confirm_password': password,
    });
  }

  static AppUser _extractUser(Map<String, dynamic> response) {
    final data = response['data'];
    if (data is Map && data['user'] is Map) {
      return AppUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    }
    if (data is Map) return AppUser.fromJson(Map<String, dynamic>.from(data));
    if (response['user'] is Map) {
      return AppUser.fromJson(
          Map<String, dynamic>.from(response['user'] as Map));
    }
    throw const ApiException(
        'User profile was missing from the server response.');
  }
}
