import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/models/permission_matrix.dart';
import '../core/network/api_client.dart';
import '../core/storage/secure_session_store.dart';
import '../features/auth/application/auth_controller.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/shared/data/hrms_repository.dart';

final secureStoreProvider = Provider<SecureSessionStore>(
  (_) => const SecureSessionStore(
    FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true),
    ),
  ),
);

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(sessionStore: ref.read(secureStoreProvider));
  ref.onDispose(client.close);
  return client;
});

final hrmsRepositoryProvider = Provider<HrmsRepository>(
  (ref) => HrmsRepository(ref.read(apiClientProvider)),
);

/// Incremented whenever attendance is punched IN/OUT or home tab is re-entered
/// so DashboardScreen and AttendanceScreen always reflect live punch status.
final attendanceSyncTickProvider = StateProvider<int>((ref) => 0);

/// Incremented when returning to the Home tab to refresh dashboard KPIs silently.
final homeRefreshTickProvider = StateProvider<int>((ref) => 0);

final activePettyCashCustodianProvider =
    FutureProvider<Map<String, dynamic>>((ref) async {
  final user = ref.watch(authControllerProvider).value;
  if (user == null) return const <String, dynamic>{};
  try {
    return await ref.read(hrmsRepositoryProvider).activePettyCashCustodian();
  } catch (_) {
    return const <String, dynamic>{};
  }
});

final unreadNotificationCountProvider = FutureProvider<int>((ref) async {
  final user = ref.watch(authControllerProvider).value;
  if (user == null) return 0;
  try {
    final payload = await ref.read(hrmsRepositoryProvider).notificationFeed(
          limit: 1,
        );
    final meta = payload['meta'];
    if (meta is Map) {
      return int.tryParse('${meta['unread'] ?? 0}') ?? 0;
    }
    return 0;
  } catch (_) {
    return 0;
  }
});

final permissionProvider = FutureProvider<PermissionMatrix>((ref) async {
  final user = ref.watch(authControllerProvider).value;
  if (user == null) return PermissionMatrix.fallback('Employee');

  var isCustodian = false;
  try {
    final account =
        await ref.read(hrmsRepositoryProvider).activePettyCashCustodian();
    final custodianId = account['custodian_id'] ?? account['custodianId'];
    final custodianEmp =
        account['custodian_employee_id'] ?? account['custodianEmployeeId'];
    isCustodian =
        user.matchesIdentity(custodianId) || user.matchesIdentity(custodianEmp);
  } catch (_) {
    // Non-custodian employees receive HTTP 403 on active custodian lookup.
    isCustodian = false;
  }

  try {
    final payload = await ref.read(hrmsRepositoryProvider).permissions();
    return PermissionMatrix.forUser(
      payload,
      user,
      isPettyCashCustodian: isCustodian,
    );
  } catch (_) {
    return PermissionMatrix.fallback(
      user.role,
      isPettyCashCustodian: isCustodian,
    );
  }
});

List<Override> appOverrides() => [
      authRepositoryProvider.overrideWith(
        (ref) => AuthRepository(
          ref.read(apiClientProvider),
          ref.read(secureStoreProvider),
        ),
      ),
    ];
