import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureSessionStore {
  const SecureSessionStore(this._storage);

  static const _accessKey = 'businz_access_token';
  static const _refreshKey = 'businz_refresh_token';
  static const _userKey = 'businz_session_user';

  final FlutterSecureStorage _storage;

  Future<String?> readAccessToken() => _storage.read(key: _accessKey);
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  Future<String?> readProtectedValue(String key) => _storage.read(key: key);

  Future<void> writeProtectedValue(String key, String value) =>
      _storage.write(key: key, value: value);

  Future<void> deleteProtectedValue(String key) => _storage.delete(key: key);

  Future<Map<String, dynamic>?> readUser() async {
    final raw = await _storage.read(key: _userKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  Future<void> save({
    required String accessToken,
    String? refreshToken,
    required Map<String, dynamic> user,
  }) async {
    await Future.wait([
      _storage.write(key: _accessKey, value: accessToken),
      if (refreshToken != null && refreshToken.isNotEmpty)
        _storage.write(key: _refreshKey, value: refreshToken),
      _storage.write(key: _userKey, value: jsonEncode(user)),
    ]);
  }

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _accessKey),
      _storage.delete(key: _refreshKey),
      _storage.delete(key: _userKey),
    ]);
  }
}
