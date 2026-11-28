import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/models/app_user.dart';
import '../../../core/models/permission_matrix.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../auth/application/auth_controller.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key, required this.onNavigateTab});
  final ValueChanged<String> onNavigateTab;

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  static final Map<String, ({_DashboardData data, DateTime loadedAt})>
      _sessionCache = {};

  _DashboardData? _cachedData;
  Object? _lastError;
  DateTime? _lastLoadedAt;
  bool _isRefreshing = false;

  static const _silentRefreshCooldown = Duration(seconds: 45);

  @override
  void initState() {
    super.initState();
    final user = ref.read(authControllerProvider).value;
    final repo = ref.read(hrmsRepositoryProvider);
    if (user != null) {
      final hit =
          _sessionCache['${identityHashCode(repo)}|${user.id}|${user.role}'];
      if (hit != null) {
        _cachedData = hit.data;
        _lastLoadedAt = hit.loadedAt;
      }
    }
    if (_cachedData == null ||
        _lastLoadedAt == null ||
        DateTime.now().difference(_lastLoadedAt!) >= _silentRefreshCooldown) {
      _fetchAndCache();
    }
  }

  Future<_DashboardData> _fetchAndCache() async {
    _isRefreshing = true;
    try {
      final result = await _load();
      _cachedData = result;
      _lastError = null;
      _lastLoadedAt = DateTime.now();
      final user = ref.read(authControllerProvider).value;
      final repo = ref.read(hrmsRepositoryProvider);
      if (user != null) {
        _sessionCache['${identityHashCode(repo)}|${user.id}|${user.role}'] = (
          data: result,
          loadedAt: _lastLoadedAt!,
        );
      }
      if (mounted) setState(() {});
      return result;
    } catch (error) {
      if (_cachedData == null) {
        _lastError = error;
        if (mounted) setState(() {});
      }
      rethrow;
    } finally {
      _isRefreshing = false;
    }
  }

  Future<_DashboardData> _load() async {
    final repo = ref.read(hrmsRepositoryProvider);
    final user = ref.read(authControllerProvider).value ??
        await ref.read(authControllerProvider.future);
    if (user == null) {
      return const _DashboardData(
        summary: {},
        leaves: [],
        tasks: [],
        shiftStatus: {},
        leaveBalance: {},
        claims: [],
        pettyCash: [],
        loans: [],
        payroll: [],
        shiftRequests: [],
        trend: [],
        myAttendance: [],
        myAttendanceRaw: [],
        overtimeRecords: [],
        currentEmployeeId: '',
        currentUserId: '',
      );
    }

    // Role-scoped parallel fetches using existing production APIs only.
    final summaryFuture = user.isManagement
        ? repo.attendanceSummary().catchError((_) => <String, dynamic>{})
        : Future.value(<String, dynamic>{});

    final leavesFuture = repo
        .leaves(employeeId: user.isManagement ? null : user.employeeId)
        .catchError((_) => <Map<String, dynamic>>[]);

    final tasksFuture =
        repo.tasks().catchError((_) => <Map<String, dynamic>>[]);

    final shiftStatusFuture = user.canPunchAttendance
        ? repo
            .shiftStatus(user.employeeId)
            .catchError((_) => <String, dynamic>{})
        : Future.value(<String, dynamic>{});

    final leaveBalFuture = !user.isCeo
        ? repo
            .leaveBalances(user.employeeId)
            .catchError((_) => <String, dynamic>{})
        : Future.value(<String, dynamic>{});

    final claimsFuture = (user.isCeo || user.isHr || user.isAccounts)
        ? repo
            .fieldAllowanceRequests()
            .catchError((_) => <Map<String, dynamic>>[])
        : Future.value(<Map<String, dynamic>>[]);

    final pettyCashFuture = (user.isCeo || user.isAccounts)
        ? repo.pettyCashRequests().catchError((_) => <Map<String, dynamic>>[])
        : Future.value(<Map<String, dynamic>>[]);

    final loansFuture = (user.isCeo || user.isHr || user.isAccounts)
        ? repo.loanRecords().catchError((_) => <Map<String, dynamic>>[])
        : Future.value(<Map<String, dynamic>>[]);

    // CEO Home never renders payroll rows — skip heavy payroll fetch on CEO Home.
    final payrollFuture = user.isAccounts
        ? repo.payrollRecords().catchError((_) => <Map<String, dynamic>>[])
        : Future.value(<Map<String, dynamic>>[]);

    final shiftRequestsFuture = user.isManagement
        ? repo.shiftRequests().catchError((_) => <Map<String, dynamic>>[])
        : Future.value(<Map<String, dynamic>>[]);

    // Single range query for the 7-day attendance trend instead of 7 separate calls.
    final trendFuture = user.isManagement
        ? () async {
            final now = DateTime.now();
            final dates = List.generate(
              7,
              (offset) => DateFormat('yyyy-MM-dd')
                  .format(now.subtract(Duration(days: 6 - offset))),
            );
            final fromDate = dates.first;
            final rows = await repo
                .gatewayList(
                  'attendance_records',
                  query:
                      'select=date,shift_date,status&date=gte.$fromDate&limit=1000',
                )
                .catchError((_) => <Map<String, dynamic>>[]);
            final byDate = <String, List<Map<String, dynamic>>>{
              for (final d in dates) d: <Map<String, dynamic>>[],
            };
            for (final row in rows) {
              final raw = (row['date'] ?? row['shift_date'] ?? '').toString();
              final key = raw.length >= 10 ? raw.substring(0, 10) : raw;
              byDate[key]?.add(row);
            }
            return dates
                .map((d) => byDate[d] ?? const <Map<String, dynamic>>[])
                .toList(growable: false);
          }()
        : Future.value(<List<Map<String, dynamic>>>[]);

    final myAttendanceFuture = !user.isCeo
        ? repo
            .attendance(employeeId: user.employeeId)
            .catchError((_) => <Map<String, dynamic>>[])
        : Future.value(<Map<String, dynamic>>[]);

    final myAttendanceRawFuture = !user.isCeo
        ? repo
            .attendanceRecordsForOvertime()
            .catchError((_) => <Map<String, dynamic>>[])
        : Future.value(<Map<String, dynamic>>[]);

    final overtimeFuture = !user.isCeo
        ? repo.overtimeRecords().catchError((_) => <Map<String, dynamic>>[])
        : Future.value(<Map<String, dynamic>>[]);

    final results = await Future.wait<dynamic>([
      summaryFuture,
      leavesFuture,
      tasksFuture,
      shiftStatusFuture,
      leaveBalFuture,
      claimsFuture,
      pettyCashFuture,
      loansFuture,
      payrollFuture,
      shiftRequestsFuture,
      trendFuture,
      myAttendanceFuture,
      myAttendanceRawFuture,
      overtimeFuture,
    ]);

    final rawSummary = results[0];
    final summary = rawSummary is Map && rawSummary['data'] is Map
        ? Map<String, dynamic>.from(rawSummary['data'] as Map)
        : rawSummary is Map
            ? Map<String, dynamic>.from(rawSummary)
            : <String, dynamic>{};

    final rawShift = results[3];
    final shift = rawShift is Map && rawShift['data'] is Map
        ? Map<String, dynamic>.from(rawShift['data'] as Map)
        : rawShift is Map
            ? Map<String, dynamic>.from(rawShift)
            : <String, dynamic>{};

    final rawBal = results[4];
    final leaveBalance = rawBal is Map && rawBal['data'] is Map
        ? Map<String, dynamic>.from(rawBal['data'] as Map)
        : rawBal is Map
            ? Map<String, dynamic>.from(rawBal)
            : <String, dynamic>{};

    return _DashboardData(
      summary: summary,
      leaves: results[1] as List<Map<String, dynamic>>,
      tasks: results[2] as List<Map<String, dynamic>>,
      shiftStatus: shift,
      leaveBalance: leaveBalance,
      claims: results[5] as List<Map<String, dynamic>>,
      pettyCash: results[6] as List<Map<String, dynamic>>,
      loans: results[7] as List<Map<String, dynamic>>,
      payroll: results[8] as List<Map<String, dynamic>>,
      shiftRequests: results[9] as List<Map<String, dynamic>>,
      trend: results[10] as List<List<Map<String, dynamic>>>,
      myAttendance: results[11] as List<Map<String, dynamic>>,
      myAttendanceRaw: results[12] as List<Map<String, dynamic>>,
      overtimeRecords: results[13] as List<Map<String, dynamic>>,
      currentEmployeeId: user.employeeId,
      currentUserId: user.id,
    );
  }

  Future<void> _reload({bool force = true}) async {
    if (_isRefreshing) return;
    if (!force &&
        _cachedData != null &&
        _lastLoadedAt != null &&
        DateTime.now().difference(_lastLoadedAt!) < _silentRefreshCooldown) {
      return;
    }
    final next = _fetchAndCache();
    if (_cachedData == null && mounted) {
      setState(() {});
    }
    try {
      await next;
    } catch (_) {
      // Handled inside _fetchAndCache without blanking cached dashboard UI.
    }
  }

  Future<void> _pushModule(BuildContext context, String key) async {
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      await router.push('/module/$key');
      if (key == 'notifications') {
        ref.invalidate(unreadNotificationCountProvider);
      }
    } else {
      widget.onNavigateTab(key);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const BusinzLoadingSkeleton(itemCount: 5, height: 108);
    }
    final matrix = ref.watch(permissionProvider).value;
    final unread = ref.watch(unreadNotificationCountProvider).value ?? 0;

    ref.listen<int>(attendanceSyncTickProvider, (_, __) {
      if (mounted) _reload(force: true);
    });
    ref.listen<int>(homeRefreshTickProvider, (_, __) {
      if (mounted) _reload(force: false);
    });

    Widget buildBody() {
      final cached = _cachedData;
      if (cached != null) {
        return switch (user.roleFamily) {
          UserRoleFamily.ceo =>
            _buildCeoDashboard(context, user, matrix, cached, unread),
          UserRoleFamily.hr =>
            _buildHrDashboard(context, user, matrix, cached, unread),
          UserRoleFamily.accounts =>
            _buildAccountsDashboard(context, user, matrix, cached, unread),
          UserRoleFamily.manager ||
          UserRoleFamily.employee =>
            _buildEmployeeDashboard(context, user, matrix, cached, unread),
        };
      }
      if (_lastError != null) {
        return BusinzErrorState(
          error: _lastError!,
          onRetry: () => _reload(force: true),
        );
      }
      return const BusinzLoadingSkeleton(itemCount: 5, height: 108);
    }

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () => _reload(force: true),
        child: buildBody(),
      ),
    );
  }

  // ===========================================================================
  // 1. EMPLOYEE / MANAGER DASHBOARD (Reference Center Screen Layout)
  // ===========================================================================

  static String _headerSubtitle(AppUser user) {
    final desig = (user.designation ?? '').trim();
    final dept = (user.department ?? '').trim();
    final primary = desig.isNotEmpty ? desig : user.displayRoleLabel;
    if (dept.isNotEmpty && dept.toLowerCase() != primary.toLowerCase()) {
      return '${primary.toUpperCase()} · ${dept.toUpperCase()}';
    }
    return primary.toUpperCase();
  }

  Widget _buildEmployeeDashboard(
    BuildContext context,
    AppUser user,
    PermissionMatrix? matrix,
    _DashboardData data,
    int unread,
  ) {
    final parsedShift = _ParsedShiftHero.fromShiftStatus(data.shiftStatus);
    final deptLabel = _headerSubtitle(user);

    final myAllTasks = data.tasks.where((t) => _isTaskForUser(t, user)).toList();
    final myOpenTasks = myAllTasks.where((t) => !_isTaskDone(t)).toList();
    final leaveBal = _totalAvailableLeave(data.leaveBalance);
    final leaveBalStr = leaveBal.toStringAsFixed(leaveBal % 1 == 0 ? 0 : 1);

    final shiftSubtitle = parsedShift.shiftWindow.isNotEmpty
        ? parsedShift.shiftWindow
        : parsedShift.shiftName;

    final shiftSecondary = parsedShift.isCompleted
        ? 'In ${parsedShift.checkInDisplay} · Out ${parsedShift.checkOutDisplay}'
        : (parsedShift.canCheckOut || parsedShift.isCheckedIn)
            ? 'In ${parsedShift.checkInDisplay} · Tap to Punch Out'
            : 'Tap to open Face Camera & Punch In';

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        16,
        12,
        16,
        AppTokens.floatingNavClearance + 16,
      ),
      children: [
        BusinzAppHeader(
          name: user.name,
          subtitle: deptLabel,
          avatarUrl: user.avatarUrl,
          unreadCount: unread,
          onAvatarTap: () => _pushModule(context, 'profile'),
          onNotificationsTap: () => _pushModule(context, 'notifications'),
        ),
        const SizedBox(height: 14),

        // Approved Teal-to-Blue Wave Hero Card ("Today's Shift" — no On Duty badge)
        BusinzGradientAttendanceCard(
          title: "Today's Shift",
          subtitle: shiftSubtitle,
          secondaryText: shiftSecondary,
          isOnDuty: parsedShift.canCheckOut || parsedShift.isCheckedIn,
          isCompleted: parsedShift.isCompleted,
          onTap: () => widget.onNavigateTab('face_attendance'),
        ),
        const SizedBox(height: 14),

        // Approved 2x2 Clean White KPI Grid
        BusinzBentoGrid(
          minTileHeight: 110,
          children: [
            BusinzKpiCard(
              label: 'Present Days',
              value: '${data.myPresentDays}',
              unitOrSecondary: '/ ${data.elapsedWorkingDays}',
              icon: Icons.event_available_rounded,
              pastelColor: AppTokens.pastelMint,
              accentColor: AppTokens.success,
              onTap: () => _pushModule(context, 'attendance_log'),
            ),
            BusinzKpiCard(
              label: 'Overtime Hrs',
              value: data.myOvertimeHours.toStringAsFixed(1),
              unitOrSecondary: 'h',
              icon: Icons.more_time_rounded,
              pastelColor: AppTokens.pastelLavender,
              accentColor: AppTokens.violet,
              onTap: () => _pushModule(context, 'overtime'),
            ),
            BusinzKpiCard(
              label: 'Leave Balance',
              value: leaveBalStr,
              unitOrSecondary: 'Days',
              icon: Icons.beach_access_rounded,
              pastelColor: AppTokens.pastelAmber,
              accentColor: AppTokens.warning,
              onTap: () => widget.onNavigateTab('leave'),
            ),
            BusinzKpiCard(
              label: 'My Tasks',
              value: '${myOpenTasks.length}',
              unitOrSecondary: 'Pending',
              icon: Icons.task_alt_rounded,
              pastelColor: AppTokens.pastelBlue,
              accentColor: AppTokens.info,
              onTap: () => widget.onNavigateTab('tasks'),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Compact Quick Actions Strip
        const AppSectionHeader(title: 'Quick Actions'),
        const SizedBox(height: 10),
        _NeoQuickActionsGrid(
          user: user,
          matrix: matrix,
          onNavigateTab: widget.onNavigateTab,
          items: const [
            _QuickTile(
              'leave',
              'Leave',
              Icons.event_note_rounded,
              AppTokens.pastelLavender,
              AppTokens.cobaltAccent,
            ),
            _QuickTile(
              'tasks',
              'Tasks',
              Icons.check_circle_rounded,
              AppTokens.pastelBlue,
              AppTokens.info,
            ),
            _QuickTile(
              'payroll',
              'Payslip',
              Icons.description_rounded,
              AppTokens.pastelRose,
              AppTokens.danger,
            ),
            _QuickTile(
              'field_allowance',
              'Claims',
              Icons.receipt_long_rounded,
              AppTokens.pastelMint,
              AppTokens.success,
            ),
            _QuickTile(
              'shifts',
              'My Shift',
              Icons.schedule_rounded,
              AppTokens.pastelAmber,
              AppTokens.warning,
            ),
            _QuickTile(
              'tracking',
              'Tracking',
              Icons.location_on_rounded,
              AppTokens.pastelBlue,
              AppTokens.brandPrimary,
            ),
            _QuickTile(
              'assets',
              'Assets',
              Icons.devices_other_rounded,
              AppTokens.pastelLavender,
              AppTokens.violet,
            ),
            _QuickTile(
              'attendance_log',
              'History',
              Icons.history_rounded,
              AppTokens.pastelMint,
              AppTokens.brandDeep,
            ),
          ],
        ),

        if (myOpenTasks.isNotEmpty) ...[
          const SizedBox(height: 18),
          AppSectionHeader(
            title: "Today's Tasks",
            count: myOpenTasks.length,
          ),
          const SizedBox(height: 10),
          ...myOpenTasks.take(3).map((task) {
            final title = (task['title'] ?? 'Task').toString();
            final desc = (task['description'] ?? '').toString().trim();
            final priority = (task['priority'] ?? 'Medium').toString();
            final status =
                (task['overallStatus'] ?? task['status'] ?? 'OPEN').toString();
            final due = formatDisplayDate(task['dueDate']?.toString());
            final progress =
                double.tryParse('${task['completionPercentage'] ?? 0}') ?? 0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: BusinzTaskCard(
                title: title,
                subtitle: desc,
                priority: priority,
                status: status,
                dueText: due,
                progress: progress,
                taskNumber: task['taskNumber']?.toString(),
                onTap: () => widget.onNavigateTab('tasks'),
              ),
            );
          }),
        ],
      ],
    );
  }

  // ===========================================================================
  // 2. HR OPERATIONS DASHBOARD
  // ===========================================================================

  Widget _buildHrDashboard(
    BuildContext context,
    AppUser user,
    PermissionMatrix? matrix,
    _DashboardData data,
    int unread,
  ) {
    final present = _num(data.summary, ['presentCount', 'present']);
    final absent = _num(data.summary, ['absentCount', 'absent']);
    final late = _num(data.summary, ['lateCount', 'late']);
    final onDuty = _num(data.summary, ['onDutyCount', 'onDuty']);
    final totalStaff = _num(data.summary, ['totalEmployees', 'total']);
    final pendingLeaves = data.pendingLeavesCount;
    final pendingClaims = data.pendingApprovalClaimsCount;
    final pendingShifts = data.pendingShiftsCount;
    final totalApprovals = pendingLeaves + pendingClaims + pendingShifts;

    final parsedShift = _ParsedShiftHero.fromShiftStatus(data.shiftStatus);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        16,
        12,
        16,
        AppTokens.floatingNavClearance + 16,
      ),
      children: [
        BusinzAppHeader(
          name: user.name,
          subtitle: _headerSubtitle(user),
          avatarUrl: user.avatarUrl,
          unreadCount: unread,
          onAvatarTap: () => _pushModule(context, 'profile'),
          onNotificationsTap: () => _pushModule(context, 'notifications'),
        ),
        const SizedBox(height: 14),

        // 2x2 HR Operations Clean White KPI Grid
        BusinzBentoGrid(
          minTileHeight: 122,
          children: [
            BusinzKpiCard(
              label: 'Present Today',
              value: '$present',
              unitOrSecondary: '/ $totalStaff',
              subtitle: '$onDuty on field duty',
              icon: Icons.how_to_reg_rounded,
              pastelColor: AppTokens.pastelMint,
              accentColor: AppTokens.success,
              onTap: () => _pushModule(context, 'attendance_log'),
            ),
            BusinzKpiCard(
              label: 'Absent & Late',
              value: '${absent + late}',
              subtitle: '$absent absent · $late late',
              icon: Icons.schedule_rounded,
              pastelColor: AppTokens.pastelRose,
              accentColor: AppTokens.danger,
              onTap: () => _pushModule(context, 'attendance_log'),
            ),
            BusinzKpiCard(
              label: 'Pending Approvals',
              value: '$totalApprovals',
              subtitle: '$pendingLeaves leave · $pendingShifts shift',
              icon: Icons.fact_check_rounded,
              pastelColor: AppTokens.pastelAmber,
              accentColor: AppTokens.warning,
              onTap: () => _pushModule(context, 'approvals'),
            ),
            BusinzKpiCard(
              label: 'Open Tasks',
              value: '${data.openTasksCount}',
              subtitle: data.overdueTasksCount > 0
                  ? '${data.overdueTasksCount} overdue'
                  : 'On schedule',
              icon: Icons.task_alt_rounded,
              pastelColor: AppTokens.pastelBlue,
              accentColor: AppTokens.info,
              onTap: () => widget.onNavigateTab('tasks'),
            ),
          ],
        ),

        if (totalApprovals > 0) ...[
          const SizedBox(height: 14),
          _NeoActionBanner(
            title: '$totalApprovals HR approvals waiting',
            subtitle:
                '$pendingLeaves leaves · $pendingClaims claims · $pendingShifts shift requests',
            buttonLabel: 'Review',
            onPressed: () => _pushModule(context, 'approvals'),
          ),
        ],

        const SizedBox(height: 14),
        // Personal shift status (Attendance tab / card opens Face Camera)
        BusinzGradientAttendanceCard(
          title: "Today's Shift",
          subtitle: parsedShift.shiftWindow.isNotEmpty
              ? parsedShift.shiftWindow
              : parsedShift.shiftName,
          statusLabel: '',
          secondaryText: parsedShift.isCompleted
              ? 'In ${parsedShift.checkInDisplay} · Out ${parsedShift.checkOutDisplay}'
              : (parsedShift.canCheckOut || parsedShift.isCheckedIn)
                  ? 'In ${parsedShift.checkInDisplay} · Tap to Punch Out'
                  : 'Tap to open Face Camera & Punch In',
          isOnDuty: parsedShift.canCheckOut || parsedShift.isCheckedIn,
          isCompleted: parsedShift.isCompleted,
          onTap: () => widget.onNavigateTab('face_attendance'),
        ),

        const SizedBox(height: 16),
        _AttendanceDonutCard(
          present: present,
          absent: absent,
          late: late,
          onDuty: onDuty,
          total: totalStaff,
        ),
        const SizedBox(height: 12),
        _AttendanceTrendCard(rows: data.trend, totalEmployees: totalStaff),
        const SizedBox(height: 20),

        AppSectionHeader(
          title: 'HR Operations',
          actionLabel: 'All Modules ›',
          onAction: () => widget.onNavigateTab('more'),
        ),
        const SizedBox(height: 10),
        _NeoQuickActionsGrid(
          user: user,
          matrix: matrix,
          onNavigateTab: widget.onNavigateTab,
          items: const [
            _QuickTile(
              'employees',
              'Employees',
              Icons.groups_2_rounded,
              AppTokens.pastelBlue,
              AppTokens.info,
            ),
            _QuickTile(
              'approvals',
              'Approvals',
              Icons.fact_check_rounded,
              AppTokens.pastelAmber,
              AppTokens.warning,
            ),
            _QuickTile(
              'attendance_log',
              'Muster Log',
              Icons.event_available_rounded,
              AppTokens.pastelMint,
              AppTokens.success,
            ),
            _QuickTile(
              'shifts',
              'Shifts',
              Icons.access_time_filled_rounded,
              AppTokens.pastelLavender,
              AppTokens.cobaltAccent,
            ),
            _QuickTile(
              'tracking',
              'Field Duties',
              Icons.location_on_rounded,
              AppTokens.pastelBlue,
              AppTokens.brandPrimary,
            ),
            _QuickTile(
              'field_allowance',
              'Claims',
              Icons.receipt_long_rounded,
              AppTokens.pastelRose,
              AppTokens.danger,
            ),
            _QuickTile(
              'assets',
              'Assets',
              Icons.devices_other_rounded,
              AppTokens.pastelLavender,
              AppTokens.violet,
            ),
            _QuickTile(
              'reports',
              'Reports',
              Icons.analytics_rounded,
              AppTokens.pastelMint,
              AppTokens.brandDeep,
            ),
          ],
        ),
      ],
    );
  }

  // ===========================================================================
  // 3. ACCOUNTS & FINANCE DASHBOARD
  // ===========================================================================

  Widget _buildAccountsDashboard(
    BuildContext context,
    AppUser user,
    PermissionMatrix? matrix,
    _DashboardData data,
    int unread,
  ) {
    final pendingPayouts = data.pendingDisbursementCount;
    final pendingAmount = data.pendingDisbursementAmount;
    final totalClaims = data.claims.length;
    final totalPayroll = data.payroll.length;
    final parsedShift = _ParsedShiftHero.fromShiftStatus(data.shiftStatus);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        16,
        12,
        16,
        AppTokens.floatingNavClearance + 16,
      ),
      children: [
        BusinzAppHeader(
          name: user.name,
          subtitle: _headerSubtitle(user),
          avatarUrl: user.avatarUrl,
          unreadCount: unread,
          onAvatarTap: () => _pushModule(context, 'profile'),
          onNotificationsTap: () => _pushModule(context, 'notifications'),
        ),
        const SizedBox(height: 14),

        // Finance-Focused Clean White KPI Grid
        BusinzBentoGrid(
          minTileHeight: 122,
          children: [
            BusinzKpiCard(
              label: 'Pending Payouts',
              value: '$pendingPayouts',
              subtitle: 'Ready to disburse',
              icon: Icons.pending_actions_rounded,
              pastelColor: AppTokens.pastelAmber,
              accentColor: AppTokens.warning,
              onTap: () => _pushModule(context, 'accounts_payment'),
            ),
            BusinzKpiCard(
              label: 'Pending Volume',
              value: formatInr(pendingAmount),
              subtitle: 'Approved queue',
              icon: Icons.currency_rupee_rounded,
              pastelColor: AppTokens.pastelMint,
              accentColor: AppTokens.success,
              onTap: () => _pushModule(context, 'accounts_payment'),
            ),
            BusinzKpiCard(
              label: 'Finance & Claims',
              value: '$totalClaims',
              subtitle: '${data.claimsReadyToDistribute} ready',
              icon: Icons.receipt_long_rounded,
              pastelColor: AppTokens.pastelBlue,
              accentColor: AppTokens.info,
              onTap: () => _pushModule(context, 'field_allowance'),
            ),
            BusinzKpiCard(
              label: 'Payroll Records',
              value: '$totalPayroll',
              subtitle: 'Current ledger',
              icon: Icons.payments_rounded,
              pastelColor: AppTokens.pastelLavender,
              accentColor: AppTokens.cobaltAccent,
              onTap: () => _pushModule(context, 'payroll'),
            ),
          ],
        ),

        if (pendingPayouts > 0) ...[
          const SizedBox(height: 14),
          _NeoActionBanner(
            title: '$pendingPayouts approved disbursements waiting',
            subtitle: 'Total payout queue: ${formatInr(pendingAmount)}',
            buttonLabel: 'Open Desk',
            onPressed: () => _pushModule(context, 'accounts_payment'),
          ),
        ],

        const SizedBox(height: 14),
        BusinzGradientAttendanceCard(
          title: "Today's Shift",
          subtitle: parsedShift.shiftWindow.isNotEmpty
              ? parsedShift.shiftWindow
              : parsedShift.shiftName,
          statusLabel: '',
          secondaryText: parsedShift.isCompleted
              ? 'In ${parsedShift.checkInDisplay} · Out ${parsedShift.checkOutDisplay}'
              : (parsedShift.canCheckOut || parsedShift.isCheckedIn)
                  ? 'In ${parsedShift.checkInDisplay} · Tap to Punch Out'
                  : 'Tap to open Face Camera & Punch In',
          isOnDuty: parsedShift.canCheckOut || parsedShift.isCheckedIn,
          isCompleted: parsedShift.isCompleted,
          onTap: () => widget.onNavigateTab('face_attendance'),
        ),

        const SizedBox(height: 20),
        AppSectionHeader(
          title: 'Finance & Self-Service',
          actionLabel: 'All Modules ›',
          onAction: () => widget.onNavigateTab('more'),
        ),
        const SizedBox(height: 10),
        _NeoQuickActionsGrid(
          user: user,
          matrix: matrix,
          onNavigateTab: widget.onNavigateTab,
          items: const [
            _QuickTile(
              'accounts_payment',
              'Payouts',
              Icons.account_balance_rounded,
              AppTokens.pastelMint,
              AppTokens.success,
            ),
            _QuickTile(
              'field_allowance',
              'Claims',
              Icons.receipt_long_rounded,
              AppTokens.pastelBlue,
              AppTokens.info,
            ),
            _QuickTile(
              'petty_cash',
              'Petty Cash',
              Icons.account_balance_wallet_rounded,
              AppTokens.pastelAmber,
              AppTokens.warning,
            ),
            _QuickTile(
              'payroll',
              'Payroll',
              Icons.payments_rounded,
              AppTokens.pastelLavender,
              AppTokens.cobaltAccent,
            ),
            _QuickTile(
              'advance_salary',
              'Advances',
              Icons.currency_rupee_rounded,
              AppTokens.pastelRose,
              AppTokens.danger,
            ),
            _QuickTile(
              'whatsapp_crm',
              'WhatsApp',
              Icons.forum_rounded,
              AppTokens.pastelMint,
              AppTokens.brandPrimary,
            ),
            _QuickTile(
              'contact_scanner',
              'Scanner',
              Icons.document_scanner_rounded,
              AppTokens.pastelBlue,
              AppTokens.brandDeep,
            ),
            _QuickTile(
              'shifts',
              'My Shift',
              Icons.access_time_filled_rounded,
              AppTokens.pastelLavender,
              AppTokens.violet,
            ),
          ],
        ),
      ],
    );
  }

  // ===========================================================================
  // 4. CEO EXECUTIVE DASHBOARD (STRICTLY NO FACE ATTENDANCE / NO PUNCH UI)
  // ===========================================================================

  Widget _buildCeoDashboard(
    BuildContext context,
    AppUser user,
    PermissionMatrix? matrix,
    _DashboardData data,
    int unread,
  ) {
    final present = _num(data.summary, ['presentCount', 'present']);
    final absent = _num(data.summary, ['absentCount', 'absent']);
    final late = _num(data.summary, ['lateCount', 'late']);
    final onDuty = _num(data.summary, ['onDutyCount', 'onDuty']);
    final totalStaff = _num(data.summary, ['totalEmployees', 'total']);

    final pendingLeaves = data.pendingLeavesCount;
    final pendingClaims = data.pendingApprovalClaimsCount;
    final pendingShifts = data.pendingShiftsCount;
    final pendingPettyCash = data.pendingPettyCashApprovalCount;
    final pendingAdvances = data.pendingAdvanceApprovalCount;
    final totalApprovals = pendingLeaves +
        pendingClaims +
        pendingShifts +
        pendingPettyCash +
        pendingAdvances;

    final openTasks = data.openTasksCount;
    final overdueTasks = data.overdueTasksCount;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        16,
        12,
        16,
        AppTokens.floatingNavClearance + 16,
      ),
      children: [
        BusinzAppHeader(
          name: user.name,
          subtitle: _headerSubtitle(user),
          avatarUrl: user.avatarUrl,
          unreadCount: unread,
          onAvatarTap: () => _pushModule(context, 'profile'),
          onNotificationsTap: () => _pushModule(context, 'notifications'),
        ),
        const SizedBox(height: 14),

        // Executive 2x2 Clean White KPI Grid
        BusinzBentoGrid(
          minTileHeight: 122,
          children: [
            BusinzKpiCard(
              label: 'Workforce Present',
              value: '$present',
              unitOrSecondary: '/ $totalStaff',
              subtitle: '$late late · $absent absent',
              icon: Icons.how_to_reg_rounded,
              pastelColor: AppTokens.pastelMint,
              accentColor: AppTokens.success,
              onTap: () => _pushModule(context, 'attendance_log'),
            ),
            BusinzKpiCard(
              label: 'Pending Approvals',
              value: '$totalApprovals',
              subtitle: '$pendingLeaves leave · $pendingClaims claim',
              icon: Icons.fact_check_rounded,
              pastelColor: AppTokens.pastelAmber,
              accentColor:
                  totalApprovals > 0 ? AppTokens.warning : AppTokens.brandPrimary,
              onTap: () => _pushModule(context, 'approvals'),
            ),
            BusinzKpiCard(
              label: 'Open Tasks',
              value: '$openTasks',
              subtitle:
                  overdueTasks > 0 ? '$overdueTasks overdue' : 'On track',
              icon: Icons.task_alt_rounded,
              pastelColor: AppTokens.pastelBlue,
              accentColor:
                  overdueTasks > 0 ? AppTokens.danger : AppTokens.info,
              onTap: () => widget.onNavigateTab('tasks'),
            ),
            BusinzKpiCard(
              label: 'Finance & Claims',
              value: '${data.claims.length}',
              subtitle: pendingClaims > 0
                  ? '$pendingClaims pending'
                  : 'All reviewed',
              icon: Icons.receipt_long_rounded,
              pastelColor: AppTokens.pastelLavender,
              accentColor: AppTokens.cobaltAccent,
              onTap: () => _pushModule(context, 'field_allowance'),
            ),
          ],
        ),

        const SizedBox(height: 16),
        _AttendanceDonutCard(
          present: present,
          absent: absent,
          late: late,
          onDuty: onDuty,
          total: totalStaff,
        ),
        const SizedBox(height: 12),
        _AttendanceTrendCard(rows: data.trend, totalEmployees: totalStaff),
        const SizedBox(height: 20),

        AppSectionHeader(
          title: 'Executive Workspace',
          actionLabel: 'All Modules ›',
          onAction: () => widget.onNavigateTab('more'),
        ),
        const SizedBox(height: 10),
        _NeoQuickActionsGrid(
          user: user,
          matrix: matrix,
          onNavigateTab: widget.onNavigateTab,
          items: const [
            _QuickTile(
              'approvals',
              'Approvals',
              Icons.fact_check_rounded,
              AppTokens.pastelAmber,
              AppTokens.warning,
            ),
            _QuickTile(
              'employees',
              'Employees',
              Icons.groups_2_rounded,
              AppTokens.pastelBlue,
              AppTokens.info,
            ),
            _QuickTile(
              'attendance_log',
              'Attendance',
              Icons.event_available_rounded,
              AppTokens.pastelMint,
              AppTokens.success,
            ),
            _QuickTile(
              'field_allowance',
              'Claims',
              Icons.receipt_long_rounded,
              AppTokens.pastelRose,
              AppTokens.danger,
            ),
            _QuickTile(
              'advance_salary',
              'Advances',
              Icons.currency_rupee_rounded,
              AppTokens.pastelMint,
              AppTokens.brandPrimary,
            ),
            _QuickTile(
              'payroll',
              'Payroll',
              Icons.payments_rounded,
              AppTokens.pastelLavender,
              AppTokens.cobaltAccent,
            ),
            _QuickTile(
              'petty_cash',
              'Petty Cash',
              Icons.account_balance_wallet_rounded,
              AppTokens.pastelAmber,
              AppTokens.solarAccent,
            ),
            _QuickTile(
              'tracking',
              'Tracking',
              Icons.location_on_rounded,
              AppTokens.pastelBlue,
              AppTokens.brandDeep,
            ),
          ],
        ),
      ],
    );
  }

  static bool _isTaskDone(Map<String, dynamic> t) {
    final status =
        (t['overallStatus'] ?? t['overall_status'] ?? t['status'] ?? '')
            .toString()
            .toLowerCase();
    return status.contains('complete') ||
        status.contains('closed') ||
        status == 'draft';
  }

  static bool _isTaskForUser(Map<String, dynamic> t, AppUser user) {
    return user.matchesIdentity(t['responsiblePersonId']) ||
        user.matchesIdentity(t['responsible_person_id']) ||
        (t['assignees'] is List &&
            (t['assignees'] as List).any((a) =>
                a is Map &&
                (user.matchesIdentity(a['employeeId']) ||
                    user.matchesIdentity(a['employee_id']) ||
                    (a['employeeName']?.toString().trim().toLowerCase() ==
                        user.name.trim().toLowerCase()))));
  }

  static int _num(Map<String, dynamic> map, List<String> keys) {
    for (final key in keys) {
      final value = map[key];
      if (value is num) return value.round();
      final parsed = int.tryParse(value?.toString() ?? '');
      if (parsed != null) return parsed;
    }
    return 0;
  }

  static double _totalAvailableLeave(Map<String, dynamic> raw) {
    final direct = double.tryParse('${raw['totalPaidRemaining'] ?? ''}');
    if (direct != null) return direct;
    if (raw['categories'] is List) {
      double sum = 0;
      for (final item in raw['categories'] as List) {
        if (item is Map && item['isPaid'] != false) {
          sum += double.tryParse(
                  '${item['remainingDays'] ?? item['remaining'] ?? 0}') ??
              0;
        }
      }
      return sum;
    }
    double sum = 0;
    for (final entry in raw.entries) {
      final v = entry.value;
      if (v is Map) {
        final avail = double.tryParse(
                '${v['available'] ?? v['remaining'] ?? v['balance'] ?? 0}') ??
            0;
        sum += avail;
      } else if (v is num && entry.key.toLowerCase().contains('avail')) {
        sum += v.toDouble();
      }
    }
    return sum;
  }
}

class _NeoActionBanner extends StatelessWidget {
  const _NeoActionBanner({
    required this.title,
    required this.subtitle,
    required this.buttonLabel,
    required this.onPressed,
  });

  final String title;
  final String subtitle;
  final String buttonLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTokens.pastelFor(context, AppTokens.pastelAmber),
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        border: Border.all(
          color: AppTokens.warning.withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.notifications_active_rounded,
              color: AppTokens.warning,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                    color: scheme.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: onPressed,
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 38),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            ),
            child: Text(buttonLabel, style: const TextStyle(fontSize: 12.5)),
          ),
        ],
      ),
    );
  }
}

class _ParsedShiftHero {
  const _ParsedShiftHero({
    required this.shiftName,
    required this.checkInDisplay,
    required this.checkOutDisplay,
    required this.shiftEndDisplay,
    required this.shiftWindow,
    required this.canCheckIn,
    required this.canCheckOut,
    required this.isCheckedIn,
    required this.isCompleted,
  });

  final String shiftName;
  final String checkInDisplay;
  final String checkOutDisplay;
  final String shiftEndDisplay;
  final String shiftWindow;
  final bool canCheckIn;
  final bool canCheckOut;
  final bool isCheckedIn;
  final bool isCompleted;

  static String _fmtTime(dynamic raw) {
    final value = raw?.toString().trim() ?? '';
    if (value.isEmpty || value == '--:--' || value == '-') return '';
    final parsed = DateTime.tryParse(value);
    if (parsed != null) {
      return DateFormat('hh:mm a').format(parsed.toLocal());
    }
    return value;
  }

  factory _ParsedShiftHero.fromShiftStatus(Map<String, dynamic> raw) {
    final assigned = raw['assignedShift'] is Map
        ? Map<String, dynamic>.from(raw['assignedShift'] as Map)
        : const <String, dynamic>{};
    final record = raw['todayRecord'] is Map
        ? Map<String, dynamic>.from(raw['todayRecord'] as Map)
        : raw['activeAttendance'] is Map
            ? Map<String, dynamic>.from(raw['activeAttendance'] as Map)
            : const <String, dynamic>{};

    final shiftName = (assigned['shiftName'] ??
            assigned['name'] ??
            raw['shiftName'] ??
            raw['shift_name'] ??
            'Assigned Shift')
        .toString()
        .trim();

    final checkInRaw = record['checkIn'] ??
        record['check_in'] ??
        raw['checkInTime'] ??
        raw['check_in'];
    final checkOutRaw = record['checkOut'] ??
        record['check_out'] ??
        raw['checkOutTime'] ??
        raw['check_out'];

    final checkInDisplay = _fmtTime(checkInRaw);
    final checkOutDisplay = _fmtTime(checkOutRaw);
    final shiftStart = (raw['shiftStartDisplay'] ?? assigned['startTime'] ?? '')
        .toString()
        .trim();
    final shiftEnd =
        (raw['shiftEndDisplay'] ?? assigned['endTime'] ?? '').toString().trim();
    final window = shiftStart.isNotEmpty && shiftEnd.isNotEmpty
        ? '$shiftStart – $shiftEnd'
        : '';

    final stateStr = (raw['state'] ?? '').toString().trim().toUpperCase();
    final canIn = raw['canCheckIn'] == true;
    final canOut = raw['canCheckOut'] == true;
    final hasIn = checkInDisplay.isNotEmpty;
    final hasOut = checkOutDisplay.isNotEmpty;

    final isCompleted = (hasIn && hasOut) ||
        (stateStr == 'WAITING_FOR_NEXT_SHIFT' && hasIn && hasOut);
    final isCheckedIn =
        !isCompleted && (canOut || stateStr == 'CHECKED_IN' || hasIn);

    return _ParsedShiftHero(
      shiftName: shiftName.isEmpty ? 'Assigned Shift' : shiftName,
      checkInDisplay: checkInDisplay,
      checkOutDisplay: checkOutDisplay,
      shiftEndDisplay: shiftEnd,
      shiftWindow: window,
      canCheckIn: canIn,
      canCheckOut: canOut,
      isCheckedIn: isCheckedIn,
      isCompleted: isCompleted,
    );
  }
}

class _AttendanceDonutCard extends StatelessWidget {
  const _AttendanceDonutCard({
    required this.present,
    required this.absent,
    required this.late,
    required this.onDuty,
    required this.total,
  });

  final int present;
  final int absent;
  final int late;
  final int onDuty;
  final int total;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onTime = (present - late).clamp(0, present);
    final values = [onTime, late, absent, onDuty];
    const colors = [
      AppTokens.brandEmerald,
      AppTokens.warning,
      AppTokens.danger,
      AppTokens.info,
    ];
    const labels = ['On Time', 'Late', 'Absent', 'On Duty'];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Today's Attendance",
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              SizedBox.square(
                dimension: 108,
                child: CustomPaint(
                  painter: _DonutPainter(values: values, colors: colors),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '$total',
                          style: AppTokens.kpiStyle(context, size: 22),
                        ),
                        Text('Staff',
                            style: Theme.of(context).textTheme.labelSmall),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  children: List.generate(
                    4,
                    (i) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Container(
                            width: 9,
                            height: 9,
                            decoration: BoxDecoration(
                              color: colors[i],
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              labels[i],
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                          Text(
                            '${values[i]}',
                            style: AppTokens.kpiStyle(context, size: 15),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DonutPainter extends CustomPainter {
  const _DonutPainter({required this.values, required this.colors});
  final List<int> values;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final total = values.fold<int>(0, (sum, value) => sum + value);
    final rect = Offset.zero & size;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12
      ..strokeCap = StrokeCap.round;
    if (total == 0) {
      paint.color = const Color(0xFFE2E8F0);
      canvas.drawArc(rect.deflate(9), 0, 6.28319, false, paint);
      return;
    }
    var start = -1.5708;
    for (var i = 0; i < values.length; i++) {
      if (values[i] == 0) continue;
      final sweep = values[i] / total * 6.28319;
      paint.color = colors[i];
      canvas.drawArc(rect.deflate(9), start, sweep, false, paint);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter oldDelegate) =>
      oldDelegate.values.toString() != values.toString();
}

class _AttendanceTrendCard extends StatelessWidget {
  const _AttendanceTrendCard({
    required this.rows,
    required this.totalEmployees,
  });

  final List<List<Map<String, dynamic>>> rows;
  final int totalEmployees;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final today = DateTime.now();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '7-Day Attendance Trend',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 118,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(7, (index) {
                final dayRows = index < rows.length ? rows[index] : const [];
                final attended = dayRows.where((row) {
                  final status =
                      (row['status'] ?? '').toString().trim().toLowerCase();
                  return status.contains('present') ||
                      status.contains('late') ||
                      status.contains('half') ||
                      status.contains('duty');
                }).length;
                final denom = totalEmployees > 0
                    ? totalEmployees
                    : dayRows.isEmpty
                        ? 1
                        : dayRows.length;
                final ratio = (attended / denom).clamp(0.0, 1.0);
                final day = today.subtract(Duration(days: 6 - index));
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          '${(ratio * 100).round()}%',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(fontSize: 10.5),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          height: 66 * ratio + 4,
                          decoration: BoxDecoration(
                            color: index == 6
                                ? AppTokens.brandPrimary
                                : AppTokens.brandPrimary
                                    .withValues(alpha: 0.45),
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          DateFormat('E').format(day).substring(0, 1),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickTile {
  const _QuickTile(
    this.moduleKey,
    this.label,
    this.icon,
    this.pastelColor,
    this.accentColor,
  );
  final String moduleKey;
  final String label;
  final IconData icon;
  final Color pastelColor;
  final Color accentColor;
}

class _NeoQuickActionsGrid extends StatelessWidget {
  const _NeoQuickActionsGrid({
    required this.user,
    required this.matrix,
    required this.onNavigateTab,
    required this.items,
  });

  final AppUser user;
  final PermissionMatrix? matrix;
  final ValueChanged<String> onNavigateTab;
  final List<_QuickTile> items;

  @override
  Widget build(BuildContext context) {
    final visible = items
        .where((item) => matrix?.canAccessModule(item.moduleKey, user) ?? true)
        .toList(growable: false);
    final scheme = Theme.of(context).colorScheme;

    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = constraints.maxWidth < 310 ? 3 : 4;
        final textScale = MediaQuery.textScalerOf(context).scale(1.0);
        final tileHeight =
            (84 * textScale.clamp(1.0, 1.35)).ceilToDouble();
        return GridView.builder(
          shrinkWrap: true,
          padding: EdgeInsets.zero,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: visible.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            mainAxisExtent: tileHeight,
          ),
          itemBuilder: (context, index) {
            final item = visible[index];
            return Container(
              decoration: BoxDecoration(
                color: scheme.surface,
                borderRadius: BorderRadius.circular(15),
                border: Border.all(color: scheme.outlineVariant),
                boxShadow: AppTokens.cardShadow(context),
              ),
              child: Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(15),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => onNavigateTab(item.moduleKey),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: AppTokens.pastelFor(
                                context, item.pastelColor),
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: Icon(
                            item.icon,
                            color: item.accentColor,
                            size: 20,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          item.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: scheme.onSurface,
                                fontSize: 11,
                              ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _DashboardData {
  const _DashboardData({
    required this.summary,
    required this.leaves,
    required this.tasks,
    required this.shiftStatus,
    required this.leaveBalance,
    required this.claims,
    required this.pettyCash,
    required this.loans,
    required this.payroll,
    required this.shiftRequests,
    required this.trend,
    required this.myAttendance,
    this.myAttendanceRaw = const [],
    this.overtimeRecords = const [],
    this.currentEmployeeId = '',
    this.currentUserId = '',
  });

  final Map<String, dynamic> summary;
  final List<Map<String, dynamic>> leaves;
  final List<Map<String, dynamic>> tasks;
  final Map<String, dynamic> shiftStatus;
  final Map<String, dynamic> leaveBalance;
  final List<Map<String, dynamic>> claims;
  final List<Map<String, dynamic>> pettyCash;
  final List<Map<String, dynamic>> loans;
  final List<Map<String, dynamic>> payroll;
  final List<Map<String, dynamic>> shiftRequests;
  final List<List<Map<String, dynamic>>> trend;
  final List<Map<String, dynamic>> myAttendance;
  final List<Map<String, dynamic>> myAttendanceRaw;
  final List<Map<String, dynamic>> overtimeRecords;
  final String currentEmployeeId;
  final String currentUserId;

  List<Map<String, dynamic>> get _thisMonthAttendance {
    final now = DateTime.now();
    return myAttendance.where((row) {
      final rawDate = (row['date'] ?? row['attendance_date'] ?? '').toString();
      final parsed = DateTime.tryParse(rawDate);
      return parsed != null &&
          parsed.year == now.year &&
          parsed.month == now.month;
    }).toList(growable: false);
  }

  int get myPresentDays => _thisMonthAttendance.where((row) {
        final s = (row['status'] ?? '').toString().trim().toLowerCase();
        return s.contains('present') ||
            s.contains('late') ||
            s.contains('half') ||
            s.contains('wfh') ||
            s.contains('duty') ||
            s.contains('field');
      }).length;

  int get elapsedWorkingDays {
    final now = DateTime.now();
    var count = 0;
    for (var day = 1; day <= now.day; day++) {
      final d = DateTime(now.year, now.month, day);
      if (d.weekday != DateTime.sunday) count++;
    }
    return count < myPresentDays ? myPresentDays : (count == 0 ? 1 : count);
  }

  double get myOvertimeHours {
    final now = DateTime.now();
    final monthPrefix =
        '${now.year}-${now.month.toString().padLeft(2, '0')}';
    final otByDate = <String, double>{};

    void recordRowOt(Map<String, dynamic> row) {
      final rawDate = (row['date'] ??
              row['shift_date'] ??
              row['shiftDate'] ??
              row['attendance_date'] ??
              '')
          .toString()
          .split('T')
          .first;
      if (!rawDate.startsWith(monthPrefix)) return;
      final direct = double.tryParse(
        '${row['approvedOtHours'] ?? row['approved_ot_hours'] ?? row['calculated_ot_hours'] ?? row['calculatedOtHours'] ?? row['overtime_hours'] ?? row['overtimeHours'] ?? row['ot_hours'] ?? row['otHours'] ?? ''}',
      );
      if (direct != null && direct > 0) {
        final prev = otByDate[rawDate] ?? 0;
        if (direct > prev) otByDate[rawDate] = direct;
      }
    }

    for (final row in _thisMonthAttendance) {
      recordRowOt(row);
    }
    for (final row in myAttendanceRaw) {
      recordRowOt(row);
    }

    final empCodeLower = currentEmployeeId.trim().toLowerCase();
    final uidLower = currentUserId.trim().toLowerCase();
    for (final ot in overtimeRecords) {
      final status = (ot['status'] ?? '').toString().trim().toUpperCase();
      if (status == 'REJECTED') continue;
      final otEmp =
          (ot['employeeId'] ?? ot['employee_id'] ?? '').toString().trim().toLowerCase();
      final matchesUser = otEmp.isEmpty ||
          (empCodeLower.isNotEmpty && otEmp == empCodeLower) ||
          (uidLower.isNotEmpty && otEmp == uidLower);
      if (!matchesUser) continue;
      final rawDate = (ot['date'] ?? '').toString().split('T').first;
      if (!rawDate.startsWith(monthPrefix)) continue;
      final hrs = double.tryParse('${ot['hours'] ?? ot['approvedOtHours'] ?? ''}') ?? 0;
      if (hrs > 0) {
        final prev = otByDate[rawDate] ?? 0;
        if (hrs > prev) otByDate[rawDate] = hrs;
      }
    }

    return otByDate.values.fold<double>(0, (sum, v) => sum + v);
  }

  double get myWorkingHours {
    double sum = 0;
    for (final row in _thisMonthAttendance) {
      final direct = double.tryParse(
        '${row['working_hours'] ?? row['workingHours'] ?? ''}',
      );
      if (direct != null && direct > 0) {
        sum += direct;
        continue;
      }
      final inTime =
          DateTime.tryParse('${row['check_in'] ?? row['checkIn'] ?? ''}');
      final outTime =
          DateTime.tryParse('${row['check_out'] ?? row['checkOut'] ?? ''}');
      if (inTime != null && outTime != null && outTime.isAfter(inTime)) {
        sum += outTime.difference(inTime).inMinutes / 60.0;
      }
    }
    return sum;
  }

  int get pendingLeavesCount => leaves
      .where((e) =>
          (e['status'] ?? '').toString().trim().toLowerCase() == 'pending')
      .length;

  int get pendingApprovalClaimsCount => claims.where((e) {
        final s = (e['status'] ?? '').toString().trim().toUpperCase();
        return s == 'PENDING_APPROVAL' || s == 'PENDING';
      }).length;

  static bool _claimNeedsDisbursement(Map<String, dynamic> c) {
    final s = (c['status'] ?? '').toString().trim().toUpperCase();
    final advReq =
        c['advance_required'] != false && c['advanceRequired'] != false;
    final approvedAmt = double.tryParse(
            '${c['approved_amount'] ?? c['approvedAmount'] ?? 0}') ??
        0;
    final balReturnStatus =
        (c['balance_return_status'] ?? c['balanceReturnStatus'] ?? '')
            .toString()
            .trim()
            .toUpperCase();
    final allocated = double.tryParse(
            '${c['allocated_amount'] ?? c['allocatedAmount'] ?? 0}') ??
        0;
    final spent =
        double.tryParse('${c['total_spent'] ?? c['totalSpent'] ?? 0}') ?? 0;
    final returned = double.tryParse(
            '${c['returned_amount'] ?? c['returnedAmount'] ?? 0}') ??
        0;

    if ((s == 'APPROVED' || s == 'PENDING_DISTRIBUTION') &&
        advReq &&
        approvedAmt > 0) {
      return true;
    }
    if (s == 'PENDING_REIMBURSEMENT') {
      final bal = double.tryParse('${c['balance'] ?? 0}')?.abs() ?? 0;
      return (bal > 0 ? bal : spent) > 0;
    }
    if (balReturnStatus == 'SUBMITTED_TO_ACCOUNTS') {
      final settleAmt = returned > 0 ? returned : (allocated - spent).abs();
      return settleAmt > 0;
    }
    return false;
  }

  static double _claimDisbursementAmount(Map<String, dynamic> c) {
    final s = (c['status'] ?? '').toString().trim().toUpperCase();
    final balReturnStatus =
        (c['balance_return_status'] ?? c['balanceReturnStatus'] ?? '')
            .toString()
            .trim()
            .toUpperCase();
    final allocated = double.tryParse(
            '${c['allocated_amount'] ?? c['allocatedAmount'] ?? 0}') ??
        0;
    final spent =
        double.tryParse('${c['total_spent'] ?? c['totalSpent'] ?? 0}') ?? 0;
    final returned = double.tryParse(
            '${c['returned_amount'] ?? c['returnedAmount'] ?? 0}') ??
        0;
    if (s == 'PENDING_REIMBURSEMENT') {
      final bal = double.tryParse('${c['balance'] ?? 0}')?.abs() ?? 0;
      return bal > 0 ? bal : spent;
    }
    if (balReturnStatus == 'SUBMITTED_TO_ACCOUNTS') {
      return returned > 0 ? returned : (allocated - spent).abs();
    }
    return double.tryParse(
            '${c['approved_amount'] ?? c['approvedAmount'] ?? c['requested_amount'] ?? 0}') ??
        0;
  }

  int get claimsReadyToDistribute =>
      claims.where(_claimNeedsDisbursement).length;

  int get pendingShiftsCount => shiftRequests
      .where((e) =>
          (e['status'] ?? '').toString().trim().toLowerCase() == 'pending')
      .length;

  int get pendingPettyCashApprovalCount => pettyCash.where((e) {
        final s = (e['status'] ?? '').toString().trim().toUpperCase();
        return s == 'PENDING' ||
            s == 'PENDING_APPROVAL' ||
            s == 'PENDING_CEO_APPROVAL';
      }).length;

  int get pendingAdvanceApprovalCount => loans
      .where((e) =>
          (e['status'] ?? '').toString().trim().toLowerCase() == 'pending')
      .length;

  int get openTasksCount => tasks.where((e) {
        final s =
            (e['overallStatus'] ?? e['status'] ?? '').toString().toLowerCase();
        return !s.contains('complete') && !s.contains('closed');
      }).length;

  int get overdueTasksCount {
    final now = DateTime.now();
    return tasks.where((e) {
      final s = (e['overallStatus'] ?? '').toString().toLowerCase();
      if (s.contains('complete') || s.contains('closed')) return false;
      final due = DateTime.tryParse('${e['dueDate'] ?? ''}');
      return due != null &&
          due.isBefore(DateTime(now.year, now.month, now.day));
    }).length;
  }

  int get pendingDisbursementCount {
    var count = claimsReadyToDistribute;
    count += pettyCash.where((e) {
      final s = (e['status'] ?? '').toString().trim().toUpperCase();
      return s == 'APPROVED_BY_CEO' ||
          s == 'APPROVED' ||
          s == 'PARTIALLY_DISBURSED';
    }).length;
    count += loans
        .where((e) =>
            (e['status'] ?? '').toString().trim().toLowerCase() == 'approved')
        .length;
    count += payroll.where((e) {
      final s = (e['status'] ?? '').toString().trim().toLowerCase();
      return s == 'sent to accounts';
    }).length;
    return count;
  }

  double get pendingDisbursementAmount {
    double total = 0;
    for (final c in claims) {
      if (_claimNeedsDisbursement(c)) {
        total += _claimDisbursementAmount(c);
      }
    }
    for (final p in pettyCash) {
      final s = (p['status'] ?? '').toString().trim().toUpperCase();
      if (s == 'APPROVED_BY_CEO' ||
          s == 'APPROVED' ||
          s == 'PARTIALLY_DISBURSED') {
        total += double.tryParse(
                '${p['approved_amount'] ?? p['requested_amount'] ?? 0}') ??
            0;
      }
    }
    for (final l in loans) {
      if ((l['status'] ?? '').toString().trim().toLowerCase() == 'approved') {
        total += double.tryParse(
                '${l['approvedAmount'] ?? l['requestedAmount'] ?? 0}') ??
            0;
      }
    }
    for (final pr in payroll) {
      final s = (pr['status'] ?? '').toString().trim().toLowerCase();
      if (s == 'sent to accounts') {
        total +=
            double.tryParse('${pr['netSalary'] ?? pr['net_salary'] ?? 0}') ?? 0;
      }
    }
    return total;
  }
}
