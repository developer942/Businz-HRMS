class AppConfig {
  const AppConfig._();

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://hrms.businz.com/api/v1',
  );

  /// Origin used to resolve relative upload/API proof paths (e.g. `/uploads/...`).
  static String get apiOrigin {
    final parsed = Uri.tryParse(apiBaseUrl);
    if (parsed != null && parsed.hasScheme && parsed.host.isNotEmpty) {
      final port =
          parsed.hasPort && parsed.port != 80 && parsed.port != 443
              ? ':${parsed.port}'
              : '';
      return '${parsed.scheme}://${parsed.host}$port';
    }
    return 'https://hrms.businz.com';
  }

  static const connectTimeout = Duration(seconds: 15);
  static const requestTimeout = Duration(seconds: 30);
  static const appName = 'BUSINZ HRMS';
}
