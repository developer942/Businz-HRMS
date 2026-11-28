import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/theme_controller.dart';
import '../core/widgets/adaptive_components.dart';
import '../features/auth/application/auth_controller.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/required_password_change_screen.dart';
import '../features/modules/presentation/module_catalog.dart';
import '../features/modules/presentation/module_list_screen.dart';
import '../features/shell/presentation/home_shell.dart';
import 'providers.dart';

class BusinzHrmsApp extends ConsumerWidget {
  const BusinzHrmsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: AppConfig.appName,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: _router,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: MediaQuery.textScalerOf(context).clamp(
            minScaleFactor: .85,
            maxScaleFactor: 1.35,
          ),
        ),
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}

final _router = GoRouter(routes: [
  GoRoute(path: '/', builder: (_, __) => const _AuthGate()),
  GoRoute(
    path: '/module/:module',
    builder: (_, state) => _ProtectedModule(
      moduleKey: state.pathParameters['module'] ?? '',
    ),
  ),
]);

class _ProtectedModule extends ConsumerWidget {
  const _ProtectedModule({required this.moduleKey});
  final String moduleKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth.isLoading) return const _LaunchScreen();
    if (auth.hasError) return LoginScreen(initialError: auth.error.toString());
    final user = auth.value;
    if (user == null) return const LoginScreen();
    if (user.mustChangePassword) return const RequiredPasswordChangeScreen();
    final permission = ref.watch(permissionProvider);
    if (permission.isLoading) return const _LaunchScreen();
    final definition = definitionFor(moduleKey, user: user);
    final allowed = permission.value?.canAccessModule(moduleKey, user) ?? false;
    if (!allowed) {
      return Scaffold(
        appBar: AppBar(title: Text(definition.title)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.shield_outlined,
                  size: 46,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                const SizedBox(height: 14),
                Text(
                  'Access restricted',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  'Your ${user.displayRoleLabel} role does not have permission to open ${definition.title}.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      );
    }
    return ModuleListScreen(moduleKey: moduleKey);
  }
}

class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return auth.when(
      loading: () => const _LaunchScreen(),
      error: (error, _) => LoginScreen(initialError: error.toString()),
      data: (user) => user == null
          ? const LoginScreen()
          : user.mustChangePassword
              ? const RequiredPasswordChangeScreen()
              : const HomeShell(),
    );
  }
}

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const BusinzBrandMark(size: 76, padding: 10, radius: 22),
              const SizedBox(height: 18),
              Text(
                AppConfig.appName,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                'Verifying secure session…',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 22),
              const SizedBox.square(
                dimension: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
            ]),
          ),
        ),
      );
}
