import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

class ThemeController extends Notifier<ThemeMode> {
  static const _storageKey = 'businz_theme_mode';

  @override
  ThemeMode build() {
    _restore();
    return ThemeMode.light;
  }

  Future<void> _restore() async {
    try {
      final saved =
          await ref.read(secureStoreProvider).readProtectedValue(_storageKey);
      if (saved == 'dark') {
        state = ThemeMode.dark;
      } else if (saved == 'system') {
        state = ThemeMode.system;
      } else if (saved == 'light') {
        state = ThemeMode.light;
      }
    } catch (_) {
      // Fall back safely to light mode.
    }
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    try {
      final value = switch (mode) {
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
        ThemeMode.light => 'light',
      };
      await ref
          .read(secureStoreProvider)
          .writeProtectedValue(_storageKey, value);
    } catch (_) {
      // Keep in-memory selection even if secure storage is unavailable.
    }
  }
}

final themeModeProvider = NotifierProvider<ThemeController, ThemeMode>(
  ThemeController.new,
);
