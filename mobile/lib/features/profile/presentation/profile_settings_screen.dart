import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/config/app_config.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_controller.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../auth/application/auth_controller.dart';

class ProfileSettingsScreen extends ConsumerWidget {
  const ProfileSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).value!;
    final themeMode = ref.watch(themeModeProvider);
    final permissions = ref.watch(permissionProvider).value;
    final scheme = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
      children: [
        // Identity Hero Card
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: scheme.primaryContainer,
                      child: Text(
                        initialsOf(user.name),
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: scheme.onPrimaryContainer,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.name,
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(fontSize: 18),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            user.displayRoleLabel,
                            style: TextStyle(
                              color: scheme.primary,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          if (user.employeeId.isNotEmpty)
                            Text(
                              user.employeeId,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Divider(),
                const SizedBox(height: 6),
                DetailKeyValueRow(label: 'Work Email', value: user.email),
                DetailKeyValueRow(
                    label: 'Department', value: user.department ?? '—'),
                DetailKeyValueRow(
                    label: 'Designation', value: user.designation ?? user.role),
                DetailKeyValueRow(
                  label: 'Access Scope',
                  value: (permissions?.dataAccess ?? 'own').toUpperCase(),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),

        // Appearance Card
        const AppSectionHeader(title: 'Appearance'),
        const SizedBox(height: 10),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Theme Preference',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  'Switch cleanly between System, Light, and Dark workspaces.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                AdaptiveSegmentedControl<ThemeMode>(
                  values: const [
                    ThemeMode.system,
                    ThemeMode.light,
                    ThemeMode.dark,
                  ],
                  selected: themeMode,
                  labelBuilder: (mode) => switch (mode) {
                    ThemeMode.system => 'System',
                    ThemeMode.light => 'Light',
                    ThemeMode.dark => 'Dark',
                  },
                  onChanged: (mode) =>
                      ref.read(themeModeProvider.notifier).setMode(mode),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),

        // Security & Session
        const AppSectionHeader(title: 'Security & Account'),
        const SizedBox(height: 10),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.lock_reset_rounded),
                title: const Text('Change Password'),
                subtitle: const Text('Update your HRMS login credentials'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => _openChangePasswordSheet(context, ref),
              ),
              const Divider(indent: 56),
              const ListTile(
                leading: Icon(Icons.verified_outlined),
                title: Text('Server Environment'),
                subtitle: Text(AppConfig.apiBaseUrl),
              ),
              const Divider(indent: 56),
              ListTile(
                leading: Icon(Icons.logout_rounded, color: scheme.error),
                title: Text(
                  'Sign Out',
                  style: TextStyle(
                    color: scheme.error,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                subtitle: const Text('Clear session tokens on this device'),
                onTap: () async {
                  final ok = await showAdaptiveConfirmDialog(
                    context: context,
                    title: 'Sign out of BUSINZ HRMS?',
                    message:
                        'Your secure access tokens will be cleared from this device.',
                    confirmLabel: 'Sign Out',
                    destructive: true,
                  );
                  if (ok) {
                    ref.read(hrmsRepositoryProvider).invalidateCache();
                    await ref.read(authControllerProvider.notifier).logout();
                  }
                },
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const BusinzBrandMark(size: 24, padding: 3, radius: 7),
              const SizedBox(width: 8),
              Text(
                '${AppConfig.appName} · Enterprise Mobile',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTokens.textMutedLight,
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _openChangePasswordSheet(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    var working = false;
    String? error;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Change Password',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: currentCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Current Password',
                    prefixIcon: Icon(Icons.lock_outline_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: newCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'New Password (min 8 characters)',
                    prefixIcon: Icon(Icons.password_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: confirmCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Confirm New Password',
                    prefixIcon: Icon(Icons.check_circle_outline_rounded),
                  ),
                ),
                if (error != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: working
                      ? null
                      : () async {
                          if (currentCtrl.text.isEmpty) {
                            setModalState(
                                () => error = 'Enter your current password.');
                            return;
                          }
                          if (newCtrl.text.length < 8) {
                            setModalState(() => error =
                                'New password must be at least 8 characters.');
                            return;
                          }
                          if (newCtrl.text != confirmCtrl.text) {
                            setModalState(
                                () => error = 'Passwords do not match.');
                            return;
                          }
                          setModalState(() {
                            working = true;
                            error = null;
                          });
                          try {
                            await ref
                                .read(authControllerProvider.notifier)
                                .changePassword(currentCtrl.text, newCtrl.text);
                            if (!context.mounted) return;
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Password updated successfully.'),
                              ),
                            );
                          } catch (err) {
                            if (context.mounted) {
                              setModalState(() => error = err.toString());
                            }
                          } finally {
                            if (context.mounted) {
                              setModalState(() => working = false);
                            }
                          }
                        },
                  child: Text(working ? 'Updating…' : 'Update Password'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    currentCtrl.dispose();
    newCtrl.dispose();
    confirmCtrl.dispose();
  }
}
