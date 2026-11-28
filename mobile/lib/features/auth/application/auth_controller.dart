import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/app_user.dart';
import '../data/auth_repository.dart';

class AuthController extends AsyncNotifier<AppUser?> {
  @override
  Future<AppUser?> build() => ref.read(authRepositoryProvider).restore();

  Future<bool> login(String identifier, String password) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).login(identifier, password),
    );
    return state.hasValue && state.value != null;
  }

  Future<bool> verifyEmailOtp(String email, String otp) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(authRepositoryProvider).verifyEmailOtp(email, otp),
    );
    return state.hasValue && state.value != null;
  }

  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncData(null);
  }

  Future<void> changePassword(
      String currentPassword, String newPassword) async {
    await ref.read(authRepositoryProvider).changePassword(
          currentPassword: currentPassword,
          newPassword: newPassword,
        );
    final user = state.value;
    if (user != null) {
      state = AsyncData(user.copyWith(mustChangePassword: false));
    }
  }
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => throw UnimplementedError(
      'AuthRepository is initialized in app providers.'),
);

final authControllerProvider = AsyncNotifierProvider<AuthController, AppUser?>(
  AuthController.new,
);
