import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/models/app_user.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../attendance/presentation/face_capture_screen.dart';
import '../../auth/application/auth_controller.dart';
import '../../dashboard/presentation/dashboard_screen.dart';
import '../../leave/presentation/leave_screen.dart';
import '../../modules/presentation/auxiliary_screens.dart';
import '../../modules/presentation/more_screen.dart';
import '../../tasks/presentation/tasks_screen.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;
  final Set<int> _visitedTabs = {0};

  Future<void> _openFaceAttendance(BuildContext context) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => const FaceCaptureScreen(autoPunch: true),
      ),
    );
    if (!mounted) return;
    ref.read(attendanceSyncTickProvider.notifier).state++;
    ref.read(homeRefreshTickProvider.notifier).state++;
  }

  Future<void> _pushModule(BuildContext context, String moduleKey) async {
    if (moduleKey == 'attendance' || moduleKey == 'face_attendance') {
      await _openFaceAttendance(context);
      return;
    }
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      await router.push('/module/$moduleKey');
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final unread = ref.watch(unreadNotificationCountProvider).value ?? 0;
    final tabs = _tabsForUser(user);
    if (_index >= tabs.length) _index = 0;

    void selectTabIndex(int nextIndex) {
      if (nextIndex < 0 || nextIndex >= tabs.length) return;
      if (tabs[nextIndex].key == 'attendance') {
        _openFaceAttendance(context);
        return;
      }
      if (nextIndex == _index) return;
      setState(() {
        _index = nextIndex;
        _visitedTabs.add(nextIndex);
      });
      if (nextIndex == 0) {
        ref.read(homeRefreshTickProvider.notifier).state++;
      }
    }

    void navigateByKey(String tabKey) {
      if ((tabKey == 'attendance' || tabKey == 'face_attendance') &&
          user.canPunchAttendance) {
        _openFaceAttendance(context);
        return;
      }
      final found = tabs.indexWhere((tab) => tab.key == tabKey);
      if (found >= 0) {
        selectTabIndex(found);
      } else {
        _pushModule(context, tabKey);
      }
    }

    _visitedTabs.add(_index);
    final pages = [
      for (var i = 0; i < tabs.length; i++)
        _visitedTabs.contains(i)
            ? _buildPage(tabs[i].key, navigateByKey)
            : const SizedBox.shrink(),
    ];

    final activeTab = tabs[_index];
    final scheme = Theme.of(context).colorScheme;

    // Home dashboard uses the custom clean BusinzAppHeader inside SafeArea.
    // Inner tabs display a crisp, balanced AppBar matching the approved screens.
    final PreferredSizeWidget? appBar = _index == 0
        ? null
        : AppBar(
            titleSpacing: 20,
            title: Text(activeTab.pageTitle),
            actions: [
              IconButton(
                tooltip: 'Notifications',
                onPressed: () async {
                  await _pushModule(context, 'notifications');
                  ref.invalidate(unreadNotificationCountProvider);
                },
                icon: Badge(
                  isLabelVisible: unread > 0,
                  label: Text(unread > 99 ? '99+' : '$unread'),
                  child: const Icon(Icons.notifications_none_rounded),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 16, left: 2),
                child: InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () => _pushModule(context, 'profile'),
                  child: CircleAvatar(
                    radius: 17,
                    backgroundColor: scheme.primaryContainer,
                    child: Text(
                      initialsOf(user.name),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: scheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );

    return BusinzAppShell(
      appBar: appBar,
      tabs: tabs,
      selectedIndex: _index,
      onSelectTab: selectTabIndex,
      body: IndexedStack(index: _index, children: pages),
    );
  }

  /// Strict approved role-based bottom navigation specification (NO floating center button):
  /// - Employee / HR / Accounts: Home | Tasks | Attendance | Leave | More
  /// - CEO: Home | Tasks | Reports | More (STRICTLY NO Attendance tab or Punch In/Out)
  List<BusinzNavItem> _tabsForUser(AppUser user) {
    if (user.isCeo) {
      return const [
        BusinzNavItem(
          key: 'home',
          label: 'Home',
          pageTitle: 'Executive Dashboard',
          icon: Icons.home_outlined,
          selectedIcon: Icons.home_rounded,
        ),
        BusinzNavItem(
          key: 'tasks',
          label: 'Tasks',
          pageTitle: 'Task Management',
          icon: Icons.task_alt_outlined,
          selectedIcon: Icons.task_alt_rounded,
        ),
        BusinzNavItem(
          key: 'reports',
          label: 'Reports',
          pageTitle: 'Report',
          icon: Icons.bar_chart_outlined,
          selectedIcon: Icons.bar_chart_rounded,
        ),
        BusinzNavItem(
          key: 'more',
          label: 'More',
          pageTitle: 'Workspace',
          icon: Icons.grid_view_outlined,
          selectedIcon: Icons.grid_view_rounded,
        ),
      ];
    }

    final tasksTitle = user.isHr ? 'Task Management' : 'My Tasks';
    final leaveTitle = user.isHr ? 'Leave Management' : 'Leave Request';
    final moreTitle = switch (user.roleFamily) {
      UserRoleFamily.hr => 'HR Modules',
      UserRoleFamily.accounts => 'Finance & Self-Service',
      _ => 'Workspace',
    };

    return [
      const BusinzNavItem(
        key: 'home',
        label: 'Home',
        pageTitle: 'Home',
        icon: Icons.home_outlined,
        selectedIcon: Icons.home_rounded,
      ),
      BusinzNavItem(
        key: 'tasks',
        label: 'Tasks',
        pageTitle: tasksTitle,
        icon: Icons.task_alt_outlined,
        selectedIcon: Icons.task_alt_rounded,
      ),
      const BusinzNavItem(
        key: 'attendance',
        label: 'Attendance',
        pageTitle: 'Attendance',
        icon: Icons.face_retouching_natural_outlined,
        selectedIcon: Icons.face_retouching_natural_rounded,
      ),
      BusinzNavItem(
        key: 'leave',
        label: 'Leave',
        pageTitle: leaveTitle,
        icon: Icons.event_note_outlined,
        selectedIcon: Icons.event_note_rounded,
      ),
      BusinzNavItem(
        key: 'more',
        label: 'More',
        pageTitle: moreTitle,
        icon: Icons.grid_view_outlined,
        selectedIcon: Icons.grid_view_rounded,
      ),
    ];
  }

  Widget _buildPage(String key, ValueChanged<String> onNavigateTab) =>
      switch (key) {
        'home' => DashboardScreen(onNavigateTab: onNavigateTab),
        'tasks' => const TasksScreen(),
        'attendance' => const SizedBox.shrink(),
        'leave' => const LeaveScreen(),
        'reports' => const ReportsScreen(),
        'more' => const MoreScreen(),
        _ => const MoreScreen(),
      };
}
