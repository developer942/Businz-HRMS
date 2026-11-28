import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class LeaveScreen extends ConsumerStatefulWidget {
  const LeaveScreen({super.key});

  @override
  ConsumerState<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends ConsumerState<LeaveScreen> {
  late Future<_LeaveBundle> _future;
  String _filter = 'All';
  String _search = '';
  String? _busyId;
  Map<String, dynamic> _latestBalances = const {};

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_LeaveBundle> _load() async {
    final user = ref.read(authControllerProvider).value ??
        await ref.read(authControllerProvider.future);
    if (user == null) {
      return const _LeaveBundle(leaves: [], balances: {}, employeeNames: {});
    }
    final repo = ref.read(hrmsRepositoryProvider);
    final results = await Future.wait<dynamic>([
      repo.leaves(employeeId: user.isManagement ? null : user.employeeId),
      if (!user.isCeo)
        repo
            .leaveBalances(user.employeeId)
            .catchError((_) => <String, dynamic>{})
      else
        Future.value(<String, dynamic>{}),
      if (user.isManagement)
        repo.employees().catchError((_) => <Map<String, dynamic>>[])
      else
        Future.value(<Map<String, dynamic>>[]),
    ]);

    final names = <String, String>{};
    for (final emp in results[2] as List<Map<String, dynamic>>) {
      final name = (emp['name'] ?? '').toString().trim();
      if (name.isEmpty) continue;
      final id = (emp['id'] ?? '').toString().trim();
      final code =
          (emp['employeeId'] ?? emp['employee_id'] ?? '').toString().trim();
      if (id.isNotEmpty) names[id.toLowerCase()] = name;
      if (code.isNotEmpty) names[code.toLowerCase()] = name;
    }

    final rawBal = results[1];
    final balances = rawBal is Map && rawBal['data'] is Map
        ? Map<String, dynamic>.from(rawBal['data'] as Map)
        : rawBal is Map
            ? Map<String, dynamic>.from(rawBal)
            : <String, dynamic>{};
    _latestBalances = balances;

    return _LeaveBundle(
      leaves: results[0] as List<Map<String, dynamic>>,
      balances: balances,
      employeeNames: names,
    );
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _apply({String? initialType}) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _LeaveForm(
        balances: _latestBalances,
        initialType: initialType,
      ),
    );
    if (saved == true) _reload();
  }

  Future<void> _decide(String id, String decision) async {
    String? comment;
    if (decision == 'Rejected') {
      final controller = TextEditingController();
      comment = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Reject leave request'),
          content: TextField(
            controller: controller,
            minLines: 2,
            maxLines: 4,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Rejection reason'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final value = controller.text.trim();
                if (value.length >= 3) Navigator.pop(context, value);
              },
              child: const Text('Reject'),
            ),
          ],
        ),
      );
      controller.dispose();
      if (comment == null) return;
    }
    setState(() => _busyId = id);
    try {
      await ref
          .read(hrmsRepositoryProvider)
          .decideLeave(id, decision, comment: comment);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Leave request $decision.')),
        );
        _reload();
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.toString()),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final permissions = ref.watch(permissionProvider).value;
    final canApprove = user.canApproveLeaves ||
        (permissions?.can('leave', 'approve') ?? false);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: FutureBuilder<_LeaveBundle>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppSkeletonList(itemCount: 5, height: 96);
          }
          if (snapshot.hasError) {
            return AppErrorView(error: snapshot.error!, onRetry: _reload);
          }
          final bundle = snapshot.data!;
          final all = bundle.leaves;
          final query = _search.trim().toLowerCase();

          final filtered = all.where((item) {
            final status =
                (item['status'] ?? '').toString().trim().toLowerCase();
            final type = _value(
                item, ['leave_type', 'leaveType', 'type'], 'Leave');
            final isWfh = type.toLowerCase().contains('work from home') ||
                type.toLowerCase() == 'wfh';

            final matchesFilter = switch (_filter) {
              'All' => true,
              'WFH' => isWfh,
              _ => status == _filter.toLowerCase(),
            };
            if (!matchesFilter) return false;
            if (query.isEmpty) return true;
            final empName = _resolveName(item, bundle.employeeNames);
            final empCode = _value(item, ['employeeId', 'employee_id'], '');
            final reason = _value(item, ['reason'], '');
            return empName.toLowerCase().contains(query) ||
                empCode.toLowerCase().contains(query) ||
                type.toLowerCase().contains(query) ||
                reason.toLowerCase().contains(query);
          }).toList(growable: false);

          final pendingCount = all
              .where((e) =>
                  (e['status'] ?? '').toString().trim().toLowerCase() ==
                  'pending')
              .length;
          final wfhCount = all.where((e) {
            final t = _value(e, ['leave_type', 'leaveType', 'type'], '')
                .toLowerCase();
            return t.contains('work from home') || t == 'wfh';
          }).length;

          return RefreshIndicator(
            onRefresh: () async {
              _reload();
              await _future;
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                16,
                10,
                16,
                AppTokens.floatingNavClearance + 20,
              ),
              children: [
                // Quick Action Strip matching Web HRMS (Apply Leave + Apply WFH)
                if (!user.isCeo) ...[
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () => _apply(),
                          icon: const Icon(Icons.add_rounded, size: 18),
                          label: const Text('Apply Leave'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () =>
                              _apply(initialType: 'Work From Home'),
                          icon: const Icon(Icons.home_work_outlined, size: 17),
                          label: const Text('Apply WFH'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
                // Web-Parity Leave Balance Card (hidden for CEO)
                if (!user.isCeo && bundle.balances.isNotEmpty) ...[
                  _WebLeaveBalanceCard(balances: bundle.balances),
                  const SizedBox(height: 14),
                ],
                if (user.isManagement) ...[
                  TextField(
                    onChanged: (v) => setState(() => _search = v),
                    decoration: const InputDecoration(
                      hintText: 'Search employee, ID, leave type, or reason…',
                      prefixIcon: Icon(Icons.search_rounded),
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
                // Status Filter Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _chip('All', 'All (${all.length})'),
                      const SizedBox(width: 8),
                      _chip('Pending', 'Pending ($pendingCount)'),
                      const SizedBox(width: 8),
                      _chip('Approved', 'Approved'),
                      const SizedBox(width: 8),
                      _chip('Rejected', 'Rejected'),
                      const SizedBox(width: 8),
                      _chip('WFH', 'WFH ($wfhCount)'),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Text(
                      user.isManagement
                          ? 'Leave Applications'
                          : 'My Applications',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Theme.of(context)
                            .colorScheme
                            .primaryContainer,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${filtered.length}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: Theme.of(context)
                              .colorScheme
                              .onPrimaryContainer,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (filtered.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 24),
                    child: EmptyState(
                      icon: Icons.event_available_rounded,
                      title: 'No applications found',
                      message:
                          'Try adjusting your status filter or submit a new leave request.',
                    ),
                  )
                else
                  ...filtered.map((item) {
                    final id = _value(item, ['id'], '');
                    final type = _value(
                        item, ['leave_type', 'leaveType', 'type'], 'Leave');
                    final start = formatDisplayDate(
                        _value(item, ['start_date', 'startDate'], ''));
                    final end = formatDisplayDate(
                        _value(item, ['end_date', 'endDate'], ''));
                    final appliedOn = formatDisplayDate(
                      _value(item, ['appliedAt', 'created_at', 'createdAt'], ''),
                      fallback: '',
                    );
                    final status = _value(item, ['status'], 'Pending');
                    final reason = _value(item, ['reason'], '');
                    final comment = _value(
                        item, ['approverComment', 'approver_comment', 'comment'], '');
                    final reviewer = _value(
                        item, ['approvedBy', 'approved_by', 'reviewedBy'], '');
                    final days =
                        num.tryParse('${item['days_count'] ?? item['daysCount'] ?? ''}');
                    final paidDays = num.tryParse(
                        '${item['paidDaysCount'] ?? item['paid_days_count'] ?? ''}');
                    final unpaidDays = num.tryParse(
                        '${item['unpaidDaysCount'] ?? item['unpaid_days_count'] ?? ''}');
                    final sandwichDays = num.tryParse(
                        '${item['sandwichDays'] ?? item['sandwich_days'] ?? ''}');
                    final empName = _resolveName(item, bundle.employeeNames);
                    final empCode =
                        _value(item, ['employeeId', 'employee_id'], '');
                    final isPending = status.toLowerCase() == 'pending';
                    final isSelf = user.matchesIdentity(item['employee_id']) ||
                        user.matchesIdentity(item['employeeId']);
                    final showReview =
                        canApprove && isPending && id.isNotEmpty && !isSelf;
                    final busy = _busyId == id;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                        border: Border.all(
                            color: Theme.of(context).colorScheme.outlineVariant),
                        boxShadow: AppTokens.cardShadow(context),
                      ),
                      child: Material(
                        color: Colors.transparent,
                        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () => _openLeaveDetails(
                            context,
                            type: type,
                            status: status,
                            start: start,
                            end: end,
                            days: days,
                            appliedOn: appliedOn,
                            empName: empName,
                            empCode: empCode,
                            reason: reason,
                            reviewer: reviewer,
                            comment: comment,
                            paidDays: paidDays,
                            unpaidDays: unpaidDays,
                            sandwichDays: sandwichDays,
                            showManagementHeader: user.isManagement,
                            showReviewActions: showReview,
                            onApprove: showReview
                                ? () {
                                    Navigator.pop(context);
                                    _decide(id, 'Approved');
                                  }
                                : null,
                            onReject: showReview
                                ? () {
                                    Navigator.pop(context);
                                    _decide(id, 'Rejected');
                                  }
                                : null,
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 40,
                                      height: 40,
                                      decoration: BoxDecoration(
                                        color: AppTokens.pastelFor(
                                          context,
                                          _pastelForType(type),
                                        ),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      alignment: Alignment.center,
                                      child: Text(
                                        user.isManagement
                                            ? initialsOf(empName)
                                            : _shortCodeForType(type),
                                        style: TextStyle(
                                          fontSize: 12.5,
                                          fontWeight: FontWeight.w800,
                                          color: _accentForType(type),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            user.isManagement ? empName : type,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 14.5,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            [
                                              if (user.isManagement) type,
                                              start == end
                                                  ? start
                                                  : '$start – $end',
                                              if (days != null) _fmtDay(days),
                                            ].join(' · '),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall,
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    StatusPill(status),
                                    const SizedBox(width: 2),
                                    Icon(
                                      Icons.chevron_right_rounded,
                                      size: 18,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant,
                                    ),
                                  ],
                                ),
                                if (showReview) ...[
                                  const SizedBox(height: 10),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: OutlinedButton.icon(
                                          onPressed: busy
                                              ? null
                                              : () => _decide(id, 'Rejected'),
                                          icon: const Icon(Icons.close_rounded,
                                              size: 16),
                                          label: const Text('Reject'),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: FilledButton.icon(
                                          onPressed: busy
                                              ? null
                                              : () => _decide(id, 'Approved'),
                                          icon: const Icon(Icons.check_rounded,
                                              size: 16),
                                          label: Text(
                                              busy ? 'Saving…' : 'Approve'),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          );
        },
      ),
    );
  }

  void _openLeaveDetails(
    BuildContext context, {
    required String type,
    required String status,
    required String start,
    required String end,
    required num? days,
    required String appliedOn,
    required String empName,
    required String empCode,
    required String reason,
    required String reviewer,
    required String comment,
    required num? paidDays,
    required num? unpaidDays,
    required num? sandwichDays,
    required bool showManagementHeader,
    required bool showReviewActions,
    VoidCallback? onApprove,
    VoidCallback? onReject,
  }) {
    final scheme = Theme.of(context).colorScheme;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          showManagementHeader ? empName : type,
                          style: Theme.of(ctx)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          [
                            if (showManagementHeader && empCode.isNotEmpty)
                              empCode,
                            if (showManagementHeader) type,
                            start == end ? start : '$start – $end',
                            if (days != null) _fmtDay(days),
                          ].join(' · '),
                          style: Theme.of(ctx).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  StatusPill(status),
                ],
              ),
              if ((paidDays != null && paidDays > 0) ||
                  (unpaidDays != null && unpaidDays > 0) ||
                  (sandwichDays != null && sandwichDays > 0) ||
                  appliedOn.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (paidDays != null && paidDays > 0)
                      _MetaChip(
                        label: 'Paid: ${_fmtDay(paidDays)}',
                        color: AppTokens.success,
                      ),
                    if (unpaidDays != null && unpaidDays > 0)
                      _MetaChip(
                        label: 'LOP: ${_fmtDay(unpaidDays)}',
                        color: AppTokens.warning,
                      ),
                    if (sandwichDays != null && sandwichDays > 0)
                      _MetaChip(
                        label: 'Sandwich: ${_fmtDay(sandwichDays)}',
                        color: AppTokens.danger,
                      ),
                    if (appliedOn.isNotEmpty)
                      _MetaChip(
                        label: 'Applied $appliedOn',
                        color: scheme.onSurfaceVariant,
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: scheme.outlineVariant),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Reason',
                      style: Theme.of(ctx).textTheme.labelMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      reason.isNotEmpty ? reason : 'No reason provided.',
                      style: const TextStyle(fontSize: 14, height: 1.4),
                    ),
                  ],
                ),
              ),
              if (reviewer.isNotEmpty || comment.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: scheme.outlineVariant),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (reviewer.isNotEmpty)
                        Text(
                          'Reviewed by $reviewer',
                          style: Theme.of(ctx).textTheme.labelMedium?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: scheme.primary,
                              ),
                        ),
                      if (comment.isNotEmpty) ...[
                        if (reviewer.isNotEmpty) const SizedBox(height: 4),
                        Text(
                          comment,
                          style: const TextStyle(fontSize: 13.5, height: 1.4),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
              if (showReviewActions &&
                  onApprove != null &&
                  onReject != null) ...[
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: onReject,
                        icon: const Icon(Icons.close_rounded, size: 17),
                        label: const Text('Reject'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: onApprove,
                        icon: const Icon(Icons.check_rounded, size: 17),
                        label: const Text('Approve'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static Color _pastelForType(String type) {
    final l = type.toLowerCase();
    if (l.contains('sick')) return AppTokens.pastelBlue;
    if (l.contains('wfh') || l.contains('home')) return AppTokens.pastelLavender;
    if (l.contains('unpaid') || l.contains('lop') || l.contains('lwp')) {
      return AppTokens.pastelAmber;
    }
    return AppTokens.pastelMint;
  }

  static Color _accentForType(String type) {
    final l = type.toLowerCase();
    if (l.contains('sick')) return AppTokens.info;
    if (l.contains('wfh') || l.contains('home')) return AppTokens.cobaltAccent;
    if (l.contains('unpaid') || l.contains('lop') || l.contains('lwp')) {
      return AppTokens.warning;
    }
    return AppTokens.brandPrimary;
  }

  static String _shortCodeForType(String type) {
    final l = type.toLowerCase();
    if (l.contains('sick') || l.contains('(sl)')) return 'SL';
    if (l.contains('earn') || l.contains('(el)')) return 'EL';
    if (l.contains('casual') || l.contains('(cl)')) return 'CL';
    if (l.contains('home') || l == 'wfh') return 'WFH';
    if (l.contains('unpaid') || l.contains('lop') || l.contains('lwp')) {
      return 'LOP';
    }
    if (l.contains('paid')) return 'PL';
    return type.isNotEmpty ? type.substring(0, 1).toUpperCase() : 'L';
  }

  Widget _chip(String value, String label) => FilterChip(
        selected: _filter == value,
        label: Text(label),
        onSelected: (_) => setState(() => _filter = value),
      );

  static String _resolveName(
      Map<String, dynamic> item, Map<String, String> names) {
    final direct = _value(item, ['employeeName', 'employee_name'], '');
    if (direct.isNotEmpty) return direct;
    final key = _value(item, ['employeeId', 'employee_id'], '').toLowerCase();
    return names[key] ?? _value(item, ['employeeId', 'employee_id'], 'Employee');
  }

  static String _value(
      Map<String, dynamic> map, List<String> keys, String fallback) {
    for (final key in keys) {
      if (map[key] != null && map[key].toString().trim().isNotEmpty) {
        return map[key].toString().trim();
      }
    }
    return fallback;
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.28)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      );
}

class _LeaveBundle {
  const _LeaveBundle({
    required this.leaves,
    required this.balances,
    required this.employeeNames,
  });
  final List<Map<String, dynamic>> leaves;
  final Map<String, dynamic> balances;
  final Map<String, String> employeeNames;
}

/// Clean, compact mobile Leave Balance strip:
/// Single sleek row of pastel mini-cards (EL | SL | LOP) — zero vertical bloat.
class _WebLeaveBalanceCard extends StatelessWidget {
  const _WebLeaveBalanceCard({required this.balances});
  final Map<String, dynamic> balances;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final rawCategories = balances['categories'] is List
        ? (balances['categories'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList(growable: false)
        : <Map<String, dynamic>>[];

    final paidCategories = rawCategories
        .where((c) => c['isPaid'] != false)
        .toList(growable: false);

    final effectivePaid = paidCategories.isNotEmpty
        ? paidCategories
        : _legacyPaidCategories(balances);

    final totalPaidRemaining = num.tryParse(
          '${balances['totalPaidRemaining'] ?? ''}',
        ) ??
        effectivePaid.fold<num>(
          0,
          (sum, c) => sum + (num.tryParse('${c['remainingDays'] ?? 0}') ?? 0),
        );

    final approvedUnpaid =
        num.tryParse('${balances['approvedUnpaidDays'] ?? 0}') ?? 0;
    final rejectedAbsent =
        num.tryParse('${balances['rejectedLeaveAbsentDays'] ?? 0}') ?? 0;
    final uninformedAbsent =
        num.tryParse('${balances['uninformedAbsentDays'] ?? 0}') ?? 0;
    final totalUnpaid = num.tryParse('${balances['totalUnpaidUsed'] ?? ''}') ??
        (approvedUnpaid + rejectedAbsent + uninformedAbsent);

    final tiles = <Widget>[
      for (var i = 0; i < effectivePaid.length; i++)
        _CompactBalanceTile(
          shortLabel: _shortCode(effectivePaid[i]),
          value: _fmtNum(
              num.tryParse('${effectivePaid[i]['remainingDays'] ?? 0}') ?? 0),
          caption:
              'of ${_fmtNum(num.tryParse('${effectivePaid[i]['annualQuota'] ?? 0}') ?? 0)}d',
        ),
      _CompactBalanceTile(
        shortLabel: 'LOP',
        value: _fmtNum(totalUnpaid),
        caption: 'taken',
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(
              'Leave Balance',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: AppTokens.brandTint,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '${_fmtNum(totalPaidRemaining)}d paid left',
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: scheme.primary,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            for (var i = 0; i < tiles.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(child: tiles[i]),
            ],
          ],
        ),
      ],
    );
  }

  static String _shortCode(Map<String, dynamic> category) {
    final code = (category['code'] ?? '').toString().trim();
    if (code.isNotEmpty && code.length <= 4) return code.toUpperCase();
    final name = (category['name'] ?? '').toString();
    final match = RegExp(r'\(([^)]+)\)').firstMatch(name);
    if (match != null) return match.group(1)!.trim().toUpperCase();
    final l = name.toLowerCase();
    if (l.contains('earn')) return 'EL';
    if (l.contains('sick')) return 'SL';
    if (l.contains('casual')) return 'CL';
    return name.length >= 2 ? name.substring(0, 2).toUpperCase() : 'PL';
  }

  static List<Map<String, dynamic>> _legacyPaidCategories(
      Map<String, dynamic> balances) {
    final result = <Map<String, dynamic>>[];
    for (final entry in const [
      ('earned', 'Earned Leave (EL)'),
      ('sick', 'Sick Leave (SL)'),
      ('casual', 'Casual Leave (CL)'),
    ]) {
      final raw = balances[entry.$1];
      if (raw is Map) {
        final total = num.tryParse('${raw['total'] ?? 0}') ?? 0;
        final used = num.tryParse('${raw['used'] ?? 0}') ?? 0;
        final rem = num.tryParse('${raw['remaining'] ?? raw['available'] ?? 0}') ??
            (total - used);
        if (total > 0 || used > 0) {
          result.add({
            'name': entry.$2,
            'annualQuota': total,
            'usedDays': used,
            'pendingDays': 0,
            'remainingDays': rem,
            'isPaid': true,
          });
        }
      }
    }
    return result;
  }
}

class _CompactBalanceTile extends StatelessWidget {
  const _CompactBalanceTile({
    required this.shortLabel,
    required this.value,
    required this.caption,
  });

  final String shortLabel;
  final String value;
  final String caption;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 11),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            shortLabel,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              color: scheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: AppTokens.kpiStyle(
                  context,
                  size: 22,
                  color: scheme.onSurface,
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        color: scheme.onSurfaceVariant,
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

class _LeaveForm extends ConsumerStatefulWidget {
  const _LeaveForm({
    required this.balances,
    this.initialType,
  });
  final Map<String, dynamic> balances;
  final String? initialType;

  @override
  ConsumerState<_LeaveForm> createState() => _LeaveFormState();
}

class _LeaveFormState extends ConsumerState<_LeaveForm> {
  final _formKey = GlobalKey<FormState>();
  final _reason = TextEditingController();
  late List<_LeaveTypeOption> _options;
  late String _type;
  DateTime _start = DateTime.now().add(const Duration(days: 1));
  DateTime _end = DateTime.now().add(const Duration(days: 1));
  bool _saving = false;
  String? _error;
  bool _halfDay = false;
  String _halfDayType = 'First Half';

  @override
  void initState() {
    super.initState();
    _options = _buildOptions(widget.balances);
    final requested = widget.initialType?.trim();
    if (requested != null &&
        requested.isNotEmpty &&
        _options.any((o) => o.value == requested)) {
      _type = requested;
    } else {
      _type = _options.first.value;
    }
  }

  static List<_LeaveTypeOption> _buildOptions(Map<String, dynamic> balances) {
    final options = <_LeaveTypeOption>[];
    final seen = <String>{};
    if (balances['categories'] is List) {
      for (final raw in balances['categories'] as List) {
        if (raw is! Map) continue;
        final name = (raw['name'] ?? '').toString().trim();
        if (name.isEmpty || !seen.add(name.toLowerCase())) continue;
        final isPaid = raw['isPaid'] != false;
        final rem = num.tryParse('${raw['remainingDays'] ?? 0}') ?? 0;
        final label = isPaid ? '$name (${_fmtNum(rem)}d left)' : name;
        options.add(_LeaveTypeOption(value: name, label: label));
      }
    }
    if (options.isEmpty) {
      options.addAll(const [
        _LeaveTypeOption(value: 'Earned Leave (EL)', label: 'Earned Leave (EL)'),
        _LeaveTypeOption(value: 'Sick Leave (SL)', label: 'Sick Leave (SL)'),
        _LeaveTypeOption(
            value: 'Unpaid Leave (LWP)', label: 'Unpaid Leave (LWP)'),
      ]);
      seen.addAll(['earned leave (el)', 'sick leave (sl)', 'unpaid leave (lwp)']);
    }
    if (seen.add('work from home')) {
      options.add(
        const _LeaveTypeOption(
            value: 'Work From Home', label: 'Work From Home (WFH)'),
      );
    }
    return options;
  }

  static String _canonicalFallbackLeaveType(String raw) {
    final l = raw.toLowerCase();
    if (l.contains('work from home') || l == 'wfh') return 'Work From Home';
    if (l.contains('sick') || l.contains('(sl)')) return 'Sick Leave';
    if (l.contains('earn') || l.contains('(el)')) return 'Earned Leave';
    if (l.contains('casual') || l.contains('(cl)')) return 'Casual Leave';
    if (l.contains('unpaid') || l.contains('lwp') || l.contains('lop')) {
      return 'Unpaid Leave';
    }
    if (l.contains('emergency')) return 'Emergency Leave';
    return 'Paid Leave';
  }

  Future<void> _pick(bool start) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final date = await showDatePicker(
      context: context,
      firstDate: today,
      lastDate: today.add(const Duration(days: 730)),
      initialDate: start ? _start : _end,
    );
    if (date == null) return;
    setState(() {
      if (start) {
        _start = date;
        if (_end.isBefore(date)) _end = date;
      } else {
        _end = date;
      }
    });
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final fmt = DateFormat('yyyy-MM-dd');
    final payload = <String, dynamic>{
      'leaveType': _type,
      'startDate': fmt.format(_start),
      'endDate': fmt.format(_halfDay ? _start : _end),
      'daysCount': _halfDay ? .5 : _end.difference(_start).inDays + 1,
      'reason': _halfDay
          ? '[Half Day - $_halfDayType] ${_reason.text.trim()}'
          : _reason.text.trim(),
    };
    try {
      await ref.read(hrmsRepositoryProvider).createLeave(payload);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      // Graceful fallback for older backend instances before validator deploy
      final fallbackType = _canonicalFallbackLeaveType(_type);
      final errText = error.toString().toLowerCase();
      if (fallbackType != _type &&
          (errText.contains('leavetype') ||
              errText.contains('invalid enum') ||
              errText.contains('validation'))) {
        try {
          await ref.read(hrmsRepositoryProvider).createLeave({
            ...payload,
            'leaveType': fallbackType,
          });
          if (mounted) Navigator.pop(context, true);
          return;
        } catch (retryError) {
          if (mounted) setState(() => _error = retryError.toString());
        }
      } else if (mounted) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalDays =
        _halfDay ? 0.5 : (_end.difference(_start).inDays + 1).toDouble();
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        6,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _type == 'Work From Home'
                    ? 'Apply for Work From Home'
                    : 'Apply for Leave',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _type,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Leave Type'),
                items: _options
                    .map((opt) => DropdownMenuItem(
                        value: opt.value, child: Text(opt.label)))
                    .toList(),
                onChanged: _saving
                    ? null
                    : (value) => setState(() => _type = value!),
              ),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(
                  child: _DateField(
                    label: 'From',
                    date: _start,
                    onTap: () => _pick(true),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _DateField(
                    label: 'To',
                    date: _halfDay ? _start : _end,
                    onTap: _halfDay ? null : () => _pick(false),
                  ),
                ),
              ]),
              const SizedBox(height: 8),
              Text(
                'Duration: ${_fmtDay(totalDays)}',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(height: 6),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                title: const Text('Half-day leave'),
                subtitle:
                    const Text('Applies for 0.5 day on the selected date'),
                value: _halfDay,
                onChanged: _saving
                    ? null
                    : (value) => setState(() => _halfDay = value),
              ),
              if (_halfDay)
                AdaptiveSegmentedControl<String>(
                  values: const ['First Half', 'Second Half'],
                  selected: _halfDayType,
                  labelBuilder: (v) => v,
                  onChanged: (v) => setState(() => _halfDayType = v),
                ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _reason,
                enabled: !_saving,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'Reason'),
                validator: (value) => value == null || value.trim().length < 3
                    ? 'Enter a clear reason.'
                    : null,
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 18),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving
                    ? 'Submitting…'
                    : _type == 'Work From Home'
                        ? 'Submit WFH Request'
                        : 'Submit Leave Request'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LeaveTypeOption {
  const _LeaveTypeOption({required this.value, required this.label});
  final String value;
  final String label;
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.date,
    required this.onTap,
  });
  final String label;
  final DateTime date;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTokens.radiusInput),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            suffixIcon: const Icon(Icons.calendar_today_rounded, size: 18),
          ),
          child: Text(DateFormat('dd MMM yyyy').format(date)),
        ),
      );
}

String _fmtNum(num value) =>
    value == value.roundToDouble() ? '${value.toInt()}' : value.toStringAsFixed(1);

String _fmtDay(num value) {
  final formatted = _fmtNum(value);
  return value == 1 ? '$formatted day' : '$formatted days';
}
