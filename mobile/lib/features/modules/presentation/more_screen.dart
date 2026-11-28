import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../auth/application/auth_controller.dart';
import 'module_catalog.dart';

class MoreScreen extends ConsumerStatefulWidget {
  const MoreScreen({super.key});

  @override
  ConsumerState<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends ConsumerState<MoreScreen> {
  String _query = '';

  static (Color pastel, Color accent) _paletteForSection(ModuleSection section) =>
      switch (section) {
        ModuleSection.organization => (AppTokens.pastelBlue, AppTokens.info),
        ModuleSection.timeAndAttendance =>
          (AppTokens.pastelMint, AppTokens.brandPrimary),
        ModuleSection.workflowAndOps =>
          (AppTokens.pastelLavender, AppTokens.cobaltAccent),
        ModuleSection.financeAndPayroll =>
          (AppTokens.pastelAmber, AppTokens.warning),
        ModuleSection.workspaceAndReports =>
          (AppTokens.pastelBlue, AppTokens.brandDeep),
        ModuleSection.account => (AppTokens.pastelRose, AppTokens.danger),
      };

  @override
  Widget build(BuildContext context) {
    final permissions = ref.watch(permissionProvider);
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const BusinzLoadingSkeleton(itemCount: 6, height: 68);
    }
    final scheme = Theme.of(context).colorScheme;

    return permissions.when(
      loading: () => const BusinzLoadingSkeleton(itemCount: 6, height: 68),
      error: (_, __) => const SizedBox.shrink(),
      data: (matrix) {
        final allowedModules = modulesForUser(user, matrix);
        final q = _query.trim().toLowerCase();
        final filtered = q.isEmpty
            ? allowedModules
            : allowedModules.where((item) {
                return item.resolveTitle(user).toLowerCase().contains(q) ||
                    item.resolveSubtitle(user).toLowerCase().contains(q) ||
                    item.section.label.toLowerCase().contains(q);
              }).toList(growable: false);

        final grouped = <ModuleSection, List<ModuleDefinition>>{};
        for (final item in filtered) {
          grouped.putIfAbsent(item.section, () => []).add(item);
        }

        return ListView(
          padding: const EdgeInsets.fromLTRB(
            16,
            10,
            16,
            AppTokens.floatingNavClearance + 20,
          ),
          children: [
            // Neo-Bento Profile Hero Card
            Container(
              decoration: BoxDecoration(
                color: scheme.surface,
                borderRadius: BorderRadius.circular(AppTokens.radiusCardLg),
                border: Border.all(color: scheme.outlineVariant),
                boxShadow: AppTokens.cardShadow(context),
              ),
              child: Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(AppTokens.radiusCardLg),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () =>
                      GoRouter.maybeOf(context)?.push('/module/profile'),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(2.5),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: scheme.primary.withValues(alpha: 0.35),
                              width: 2,
                            ),
                          ),
                          child: CircleAvatar(
                            radius: 26,
                            backgroundColor: scheme.primaryContainer,
                            child: Text(
                              initialsOf(user.name),
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                                color: scheme.onPrimaryContainer,
                              ),
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
                                style: const TextStyle(
                                  fontSize: 16.5,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 9,
                                  vertical: 2.5,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTokens.pastelFor(
                                      context, AppTokens.pastelMint),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  '${user.displayRoleLabel}${user.employeeId.isEmpty ? '' : ' · ${user.employeeId}'}',
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    color: AppTokens.brandDeep,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              if (user.email.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  user.email,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right_rounded,
                          color: scheme.onSurfaceVariant,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Search bar across authorized modules
            BusinzSearchBar(
              hintText: 'Search modules, tools, or settings…',
              onChanged: (value) => setState(() => _query = value),
            ),
            const SizedBox(height: 18),

            for (final section in ModuleSection.values)
              if ((grouped[section] ?? const []).isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.only(left: 4, bottom: 8),
                  child: Text(
                    section.label.toUpperCase(),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.7,
                        ),
                  ),
                ),
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: scheme.surface,
                    borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                    border: Border.all(color: scheme.outlineVariant),
                    boxShadow: AppTokens.cardShadow(context),
                  ),
                  child: Material(
                    type: MaterialType.transparency,
                    borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        for (var i = 0; i < grouped[section]!.length; i++) ...[
                          _ModuleRow(
                            definition: grouped[section]![i],
                            title: grouped[section]![i].resolveTitle(user),
                            palette: _paletteForSection(section),
                            onTap: () => GoRouter.maybeOf(context)
                                ?.push('/module/${grouped[section]![i].key}'),
                          ),
                          if (i != grouped[section]!.length - 1)
                            const Divider(indent: 66, endIndent: 14),
                        ],
                      ],
                    ),
                  ),
                ),
              ],

            // Sign Out Card
            Container(
              decoration: BoxDecoration(
                color: scheme.surface,
                borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                border:
                    Border.all(color: AppTokens.danger.withValues(alpha: 0.2)),
                boxShadow: AppTokens.cardShadow(context),
              ),
              child: Material(
                type: MaterialType.transparency,
                borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                clipBehavior: Clip.antiAlias,
                child: ListTile(
                  minTileHeight: 58,
                  leading: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppTokens.pastelFor(context, AppTokens.pastelRose),
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: const Icon(Icons.logout_rounded,
                        size: 20, color: AppTokens.danger),
                  ),
                  title: const Text(
                    'Sign Out',
                    style: TextStyle(
                      color: AppTokens.danger,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  onTap: () async {
                    final ok = await showAdaptiveConfirmDialog(
                      context: context,
                      title: 'Sign out?',
                      message: 'You will need to sign in again to access HRMS.',
                      confirmLabel: 'Sign Out',
                      destructive: true,
                    );
                    if (ok) {
                      ref.read(hrmsRepositoryProvider).invalidateCache();
                      await ref.read(authControllerProvider.notifier).logout();
                    }
                  },
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ModuleRow extends StatelessWidget {
  const _ModuleRow({
    required this.definition,
    required this.title,
    required this.palette,
    required this.onTap,
  });

  final ModuleDefinition definition;
  final String title;
  final (Color pastel, Color accent) palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 54,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      leading: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: AppTokens.pastelFor(context, palette.$1),
          borderRadius: BorderRadius.circular(11),
        ),
        child: Icon(definition.icon, size: 19, color: palette.$2),
      ),
      title: Text(
        title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
      ),
      trailing: const Icon(Icons.chevron_right_rounded, size: 20),
      onTap: onTap,
    );
  }
}
