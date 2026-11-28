import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../storage/secure_session_store.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient({
    required SecureSessionStore sessionStore,
    http.Client? httpClient,
    String baseUrl = AppConfig.apiBaseUrl,
  })  : _sessionStore = sessionStore,
        _http = httpClient ?? http.Client(),
        baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final SecureSessionStore _sessionStore;
  final http.Client _http;
  final String baseUrl;
  Future<bool>? _refreshInFlight;

  Future<String?> readAccessToken() => _sessionStore.readAccessToken();

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
  }) =>
      _request('GET', path, query: query);

  Future<Map<String, dynamic>> post(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    Duration? timeout,
  }) =>
      _request('POST', path, body: body, query: query, timeout: timeout);

  Future<Map<String, dynamic>> put(String path, {Object? body}) =>
      _request('PUT', path, body: body);

  Future<Map<String, dynamic>> patch(String path, {Object? body}) =>
      _request('PATCH', path, body: body);

  Future<Map<String, dynamic>> delete(String path, {Object? body}) =>
      _request('DELETE', path, body: body);

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool retryAfterRefresh = true,
    bool authenticated = true,
    Duration? timeout,
  }) async {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    var uri = Uri.parse('$baseUrl$normalizedPath');
    if (query != null) {
      uri = uri.replace(
        queryParameters: query.map(
          (key, value) => MapEntry(key, value?.toString() ?? ''),
        ),
      );
    }

    final token = authenticated ? await _sessionStore.readAccessToken() : null;
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };

    try {
      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      final streamed = await _http
          .send(request)
          .timeout(timeout ?? AppConfig.requestTimeout);
      final response = await http.Response.fromStream(streamed);

      if (response.statusCode == 401 && retryAfterRefresh && authenticated) {
        if (await _singleFlightRefresh()) {
          return await _request(
            method,
            path,
            body: body,
            query: query,
            retryAfterRefresh: false,
            timeout: timeout,
          );
        }
      }

      final decoded = _decode(response.body);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = decoded['error'];
        throw ApiException(
          error is Map && error['message'] != null
              ? error['message'].toString()
              : error is String && error.trim().isNotEmpty
                  ? error.trim()
                  : decoded['message']?.toString() ??
                      'The server rejected this request.',
          statusCode: response.statusCode,
          code: error is Map
              ? error['code']?.toString()
              : decoded['errorCode']?.toString(),
        );
      }
      return decoded;
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(
          'The server took too long to respond. Please try again.');
    } on SocketException {
      throw const ApiException(
          'No network connection. Check your internet and try again.');
    } on http.ClientException {
      throw const ApiException('Unable to reach the HRMS server.');
    } on FormatException {
      throw const ApiException('The server returned an unreadable response.');
    }
  }

  Future<Map<String, dynamic>> publicPost(String path, Object body) => _request(
        'POST',
        path,
        body: body,
        authenticated: false,
        retryAfterRefresh: false,
      );

  Future<Map<String, dynamic>> publicGet(
    String path, {
    Map<String, dynamic>? query,
  }) =>
      _request(
        'GET',
        path,
        query: query,
        authenticated: false,
        retryAfterRefresh: false,
      );

  /// Compatibility direct PostgREST call against `${AppConfig.apiOrigin}/rest/v1/...`
  /// matching Web's `supabaseDirectService.ts` fallback when a live server's
  /// data-gateway proxy rejects an authorized module before backend redeploy.
  Future<dynamic> directRest(
    String method,
    String resourcePath, {
    Object? body,
    String? prefer,
  }) async {
    final normalized =
        resourcePath.startsWith('/') ? resourcePath : '/$resourcePath';
    final uri = Uri.parse('${AppConfig.apiOrigin}/rest/v1$normalized');
    const restKey = 'vps-local-rest-key';
    final headers = <String, String>{
      'Accept': 'application/json',
      'apikey': restKey,
      'Authorization': 'Bearer $restKey',
      if (body != null) 'Content-Type': 'application/json',
      if (prefer != null && prefer.isNotEmpty) 'Prefer': prefer,
    };
    try {
      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      final streamed = await _http.send(request).timeout(AppConfig.requestTimeout);
      final response = await http.Response.fromStream(streamed);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ApiException(
          'Unable to complete direct database request (${response.statusCode}).',
          statusCode: response.statusCode,
        );
      }
      if (response.body.trim().isEmpty) return const <String, dynamic>{};
      return jsonDecode(response.body);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(
          'The server took too long to respond. Please try again.');
    } on SocketException {
      throw const ApiException(
          'No network connection. Check your internet and try again.');
    } on http.ClientException {
      throw const ApiException('Unable to reach the HRMS server.');
    } on FormatException {
      throw const ApiException('The server returned an unreadable response.');
    }
  }

  Future<bool> _singleFlightRefresh() {
    final current = _refreshInFlight;
    if (current != null) return current;
    final operation = _refresh();
    _refreshInFlight = operation;
    return operation.whenComplete(() => _refreshInFlight = null);
  }

  Future<bool> _refresh() async {
    final refreshToken = await _sessionStore.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return false;
    try {
      final response = await _request(
        'POST',
        '/auth/refresh',
        body: {'refreshToken': refreshToken},
        authenticated: false,
        retryAfterRefresh: false,
      );
      final data = _dataMap(response);
      final access = data['accessToken']?.toString();
      final user = await _sessionStore.readUser();
      if (access == null || access.isEmpty || user == null) return false;
      await _sessionStore.save(
        accessToken: access,
        refreshToken: data['refreshToken']?.toString() ?? refreshToken,
        user: user,
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  static Map<String, dynamic> _decode(String body) {
    if (body.trim().isEmpty) return <String, dynamic>{};
    final value = jsonDecode(body);
    return value is Map
        ? Map<String, dynamic>.from(value)
        : <String, dynamic>{'data': value};
  }

  static Map<String, dynamic> _dataMap(Map<String, dynamic> response) {
    final data = response['data'];
    return data is Map ? Map<String, dynamic>.from(data) : response;
  }

  void close() => _http.close();
}
