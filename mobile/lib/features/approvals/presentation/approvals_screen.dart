import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/models/app_user.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

enum _ApprovalFilter { all, leaves, claims, shifts, finance }

class ApprovalsScreen extends ConsumerStatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  ConsumerState<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends ConsumerState<ApprovalsScreen> {
  late Future<_ApprovalsSnapshot> _future;
  _ApprovalFilter _filter = _ApprovalFilter.all;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_ApprovalsSnapshot> _load() async {
    final repo = ref.read(hrmsRepositoryProvider);
    final user = ref.read(authControllerProvider).value!;

    final results = await Future.wait<dynamic>([
      repo.leaves().catchError((_) => <Map<String, dynamic>>[]),
      repo.fieldAllowanceRequests().catchError((_) => <Map<String, dynamic>>[]),
      repo.shiftRequests().catchError((_) => <Map<String, dynamic>>[]),
      if (user.isCeo)
        repo.pettyCashRequests().catchError((_) => <Map<String, dynamic>>[])
      else
        Future.value(<Map<String, dynamic>>[]),
      repo.loanRecords().catchError((_) => <Map<String, dynamic>>[]),
      repo.employees().catchError((_) => <Map<String, dynamic>>[]),
    ]);

    final employees = results[5] as List<Map<String, dynamic>>;
    final empNames = <String, String>{};
    for (final emp in employees) {
      final name = (emp['name'] ?? '').toString().trim();
      if (name.isEmpty) continue;
      final id = (emp['id'] ?? '').toString().trim();
      final code =
          (emp['employeeId'] ?? emp['employee_id'] ?? '').toString().trim();
      if (id.isNotEmpty) empNames[id.toLowerCase()] = name;
      if (code.isNotEmpty) empNames[code.toLowerCase()] = name;
    }

    final pendingLeaves = (results[0] as List<Map<String, dynamic>>)
        .where((row) =>
            (row['status'] ?? '').toString().trim().toLowerCase() == 'pending')
        .toList(growable: false);

    final pendingClaims =
        (results[1] as List<Map<String, dynamic>>).where((row) {
      final status = (row['status'] ?? '').toString().trim().toUpperCase();
      return status == 'PENDING_APPROVAL' ||
          status == 'PENDING' ||
          status == 'CORRECTION_REQUIRED';
    }).toList(growable: false);

    final pendingShifts = (results[2] as List<Map<String, dynamic>>)
        .where((row) =>
            (row['status'] ?? '').toString().trim().toLowerCase() == 'pending')
        .toList(growable: false);

    final pendingPettyCash =
        (results[3] as List<Map<String, dynamic>>).where((row) {
      final status = (row['status'] ?? '').toString().trim().toUpperCase();
      return status == 'PENDING' || status == 'PENDING_APPROVAL';
    }).toList(growable: false);

    final pendingAdvances =
        (results[4] as List<Map<String, dynamic>>).where((row) {
      final status = (row['status'] ?? '').toString().trim().toLowerCase();
      return status == 'pending' ||
          status == 'pending approval' ||
          status == 'pending_approval';
    }).toList(growable: false);

    return _ApprovalsSnapshot(
      leaves: pendingLeaves,
      claims: pendingClaims,
      shifts: pendingShifts,
      pettyCash: pendingPettyCash,
      advances: pendingAdvances,
      employeeNames: empNames,
    );
  }

  void _reload() => setState(() => _future = _load());

  String _resolveName(
    Map<String, dynamic> row,
    Map<String, String> names,
  ) {
    for (final key in [
      'employeeName',
      'employee_name',
      'requested_by_name',
      'custodian_name',
      'name',
    ]) {
      final val = row[key]?.toString().trim() ?? '';
      if (val.isNotEmpty && !val.contains('-')) return val;
    }
    for (final key in ['employeeId', 'employee_id', 'requested_by']) {
      final id = row[key]?.toString().trim().toLowerCase() ?? '';
      if (id.isNotEmpty && names.containsKey(id)) return names[id]!;
    }
    return (row['employeeId'] ?? row['employee_id'] ?? 'Employee').toString();
  }

  Future<String?> _askReason(String title, String hint) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          maxLines: 3,
          autofocus: true,
          decoration: InputDecoration(labelText: hint),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> _runAction(
    String itemKey,
    Future<void> Function() task,
    String successMessage,
  ) async {
    setState(() => _busyId = itemKey);
    try {
      await task();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(successMessage)));
      _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString()),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value!;
    return FutureBuilder<_ApprovalsSnapshot>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const AppSkeletonList(itemCount: 5, height: 108);
        }
        if (snapshot.hasError) {
          return AppErrorView(error: snapshot.error!, onRetry: _reload);
        }
        final data = snapshot.data!;
        final totalPending = data.totalCount;
        final financeCount = data.pettyCash.length + data.advances.length;

        return RefreshIndicator(
          onRefresh: () async {
            _reload();
            await _future;
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 108),
            children: [
              // Compact summary banner
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Theme.of(context).colorScheme.primary,
                      AppTokens.brandHover,
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(AppTokens.radiusCard),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.verified_user_outlined,
                        color: Colors.white,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            totalPending == 0
                                ? 'All Caught Up'
                                : '$totalPending Pending Approvals',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${data.leaves.length} Leaves · ${data.claims.length} Claims · ${data.shifts.length} Shifts · $financeCount Finance',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.9),
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Filter Chips
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _filterChip(_ApprovalFilter.all, 'All ($totalPending)'),
                    const SizedBox(width: 8),
                    _filterChip(_ApprovalFilter.leaves,
                        'Leaves (${data.leaves.length})'),
                    const SizedBox(width: 8),
                    _filterChip(_ApprovalFilter.claims,
                        'Claims (${data.claims.length})'),
                    const SizedBox(width: 8),
                    _filterChip(_ApprovalFilter.shifts,
                        'Shifts (${data.shifts.length})'),
                    const SizedBox(width: 8),
                    _filterChip(
                        _ApprovalFilter.finance, 'Finance ($financeCount)'),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              if (totalPending == 0)
                const Padding(
                  padding: EdgeInsets.only(top: 32),
                  child: EmptyState(
                    icon: Icons.check_circle_outline_rounded,
                    title: 'Zero pending approvals',
                    message:
                        'New employee leaves, finance claims, shift changes, and advance requests will appear here automatically.',
                  ),
                )
              else ...[
                if (_showSection(_ApprovalFilter.leaves) &&
                    data.leaves.isNotEmpty) ...[
                  AppSectionHeader(
                    title: 'Leave Requests',
                    count: data.leaves.length,
                  ),
                  const SizedBox(height: 10),
                  ...data.leaves
                      .map((row) => _buildLeaveCard(row, data.employeeNames)),
                  const SizedBox(height: 14),
                ],
                if (_showSection(_ApprovalFilter.claims) &&
                    data.claims.isNotEmpty) ...[
                  AppSectionHeader(
                    title: 'Finance & Claims',
                    count: data.claims.length,
                  ),
                  const SizedBox(height: 10),
                  ...data.claims
                      .map((row) => _buildClaimCard(row, data.employeeNames)),
                  const SizedBox(height: 14),
                ],
                if (_showSection(_ApprovalFilter.shifts) &&
                    data.shifts.isNotEmpty) ...[
                  AppSectionHeader(
                    title: 'Shift Change Requests',
                    count: data.shifts.length,
                  ),
                  const SizedBox(height: 10),
                  ...data.shifts.map(
                      (row) => _buildShiftCard(row, data.employeeNames, user)),
                  const SizedBox(height: 14),
                ],
                if (_showSection(_ApprovalFilter.finance) &&
                    (data.pettyCash.isNotEmpty ||
                        data.advances.isNotEmpty)) ...[
                  AppSectionHeader(
                    title: 'Petty Cash & Advance Salary',
                    count: financeCount,
                  ),
                  const SizedBox(height: 10),
                  ...data.pettyCash.map((row) => _buildPettyCashCard(row)),
                  ...data.advances.map((row) =>
                      _buildAdvanceCard(row, data.employeeNames, user)),
                ],
              ],
            ],
          ),
        );
      },
    );
  }

  bool _showSection(_ApprovalFilter target) =>
      _filter == _ApprovalFilter.all || _filter == target;

  Widget _filterChip(_ApprovalFilter value, String label) => FilterChip(
        selected: _filter == value,
        label: Text(label),
        onSelected: (_) => setState(() => _filter = value),
      );

  Widget _buildLeaveCard(
    Map<String, dynamic> row,
    Map<String, String> names,
  ) {
    final id = row['id']?.toString() ?? '';
    final key = 'leave_$id';
    final busy = _busyId == key;
    final name = _resolveName(row, names);
    final type = (row['leave_type'] ?? row['type'] ?? 'Leave').toString();
    final start =
        formatDisplayDate((row['start_date'] ?? row['startDate'])?.toString());
    final end =
        formatDisplayDate((row['end_date'] ?? row['endDate'])?.toString());
    final reason = (row['reason'] ?? '').toString().trim();

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor:
                      Theme.of(context).colorScheme.primaryContainer,
                  child: Text(
                    initialsOf(name),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 14.5)),
                      Text('$type · $start – $end',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                const StatusPill('Pending'),
              ],
            ),
            if (reason.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(reason, style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy
                        ? null
                        : () async {
                            final note = await _askReason(
                              'Reject leave request',
                              'Reason for rejection (optional)',
                            );
                            if (note == null) return;
                            await _runAction(
                              key,
                              () =>
                                  ref.read(hrmsRepositoryProvider).decideLeave(
                                        id,
                                        'Rejected',
                                        comment: note,
                                      ),
                              'Leave request rejected.',
                            );
                          },
                    icon: const Icon(Icons.close_rounded, size: 17),
                    label: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: busy
                        ? null
                        : () => _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .decideLeave(id, 'Approved'),
                              'Leave request approved.',
                            ),
                    icon: const Icon(Icons.check_rounded, size: 17),
                    label: Text(busy ? 'Saving…' : 'Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildClaimCard(
    Map<String, dynamic> row,
    Map<String, String> names,
  ) {
    final id = row['id']?.toString() ?? '';
    final key = 'claim_$id';
    final busy = _busyId == key;
    final name = _resolveName(row, names);
    final reqNo = (row['request_number'] ?? 'CLAIM').toString();
    final location =
        (row['visit_location'] ?? row['purpose'] ?? 'Field visit').toString();
    final amount = double.tryParse(
            '${row['requested_amount'] ?? row['estimated_amount'] ?? 0}') ??
        0;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('$name · $reqNo',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 14.5)),
                      Text(location,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                Text(
                  formatInr(amount),
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy
                        ? null
                        : () async {
                            final note = await _askReason(
                              'Reject claim',
                              'Reason for rejection',
                            );
                            if (note == null) return;
                            await _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .decideFieldAllowance(id, {
                                'action': 'REJECT',
                                'decision': 'REJECTED',
                                'remarks': note,
                              }),
                              'Finance claim rejected.',
                            );
                          },
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: busy
                        ? null
                        : () => _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .decideFieldAllowance(id, {
                                'action': 'APPROVE',
                                'decision': 'APPROVED',
                                'approvedAmount': amount,
                              }),
                              'Finance claim approved.',
                            ),
                    child: Text(busy ? 'Saving…' : 'Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildShiftCard(
    Map<String, dynamic> row,
    Map<String, String> names,
    AppUser user,
  ) {
    final id = row['id']?.toString() ?? '';
    final key = 'shift_$id';
    final busy = _busyId == key;
    final name = _resolveName(row, names);
    final reqShift =
        (row['requestedShift'] ?? row['requested_shift'] ?? 'Shift change')
            .toString();
    final date = formatDisplayDate(
        (row['requestedDate'] ?? row['requested_date'])?.toString());
    final reason = (row['reason'] ?? '').toString();

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 14.5)),
                      Text('Requested: $reqShift · $date',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                const StatusPill('Pending'),
              ],
            ),
            if (reason.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(reason, style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy
                        ? null
                        : () async {
                            final note = await _askReason(
                              'Reject shift request',
                              'Reason for rejection',
                            );
                            if (note == null) return;
                            await _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .decideShiftRequest(
                                    requestId: id,
                                    status: 'Rejected',
                                    rejectionReason: note,
                                    decidedBy: user.name,
                                  ),
                              'Shift request rejected.',
                            );
                          },
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: busy
                        ? null
                        : () => _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .decideShiftRequest(
                                    requestId: id,
                                    status: 'Approved',
                                    decidedBy: user.name,
                                  ),
                              'Shift request approved.',
                            ),
                    child: Text(busy ? 'Saving…' : 'Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPettyCashCard(Map<String, dynamic> row) {
    final id = row['id']?.toString() ?? '';
    final key = 'pc_$id';
    final busy = _busyId == key;
    final amount =
        double.tryParse('${row['requested_amount'] ?? row['amount'] ?? 0}') ??
            0;
    final purpose = (row['purpose'] ?? 'Petty cash replenishment').toString();

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Petty Cash Replenishment',
                          style: TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 14.5)),
                      Text(purpose,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                Text(
                  formatInr(amount),
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy
                        ? null
                        : () async {
                            final note = await _askReason(
                              'Reject petty cash',
                              'Reason for rejection',
                            );
                            if (note == null) return;
                            await _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .decidePettyCash(id, {
                                'decision': 'REJECTED',
                                'rejectionReason': note,
                              }),
                              'Petty cash request rejected.',
                            );
                          },
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: busy
                        ? null
                        : () => _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .decidePettyCash(id, {
                                'decision': 'APPROVED',
                                'approvedAmount': amount,
                              }),
                              'Petty cash request approved.',
                            ),
                    child: Text(busy ? 'Saving…' : 'Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAdvanceCard(
    Map<String, dynamic> row,
    Map<String, String> names,
    AppUser user,
  ) {
    final id = row['id']?.toString() ?? '';
    final key = 'adv_$id';
    final busy = _busyId == key;
    final name = _resolveName(row, names);
    final amount = double.tryParse(
            '${row['requestedAmount'] ?? row['requested_amount'] ?? 0}') ??
        0;
    final purpose = (row['purpose'] ?? 'Advance Salary').toString();

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('$name · Advance Salary',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 14.5)),
                      Text(purpose,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                Text(
                  formatInr(amount),
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy
                        ? null
                        : () async {
                            final note = await _askReason(
                              'Reject advance salary',
                              'Reason for rejection',
                            );
                            if (note == null) return;
                            await _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .reviewLoanRequest(
                                    id: id,
                                    status: 'Rejected',
                                    reviewedBy: user.name,
                                    rejectionReason: note,
                                  ),
                              'Advance request rejected.',
                            );
                          },
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: busy
                        ? null
                        : () => _runAction(
                              key,
                              () => ref
                                  .read(hrmsRepositoryProvider)
                                  .reviewLoanRequest(
                                    id: id,
                                    status: 'Approved',
                                    reviewedBy: user.name,
                                    approvedAmount: amount,
                                  ),
                              'Advance salary approved for disbursement.',
                            ),
                    child: Text(busy ? 'Saving…' : 'Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ApprovalsSnapshot {
  const _ApprovalsSnapshot({
    required this.leaves,
    required this.claims,
    required this.shifts,
    required this.pettyCash,
    required this.advances,
    required this.employeeNames,
  });

  final List<Map<String, dynamic>> leaves;
  final List<Map<String, dynamic>> claims;
  final List<Map<String, dynamic>> shifts;
  final List<Map<String, dynamic>> pettyCash;
  final List<Map<String, dynamic>> advances;
  final Map<String, String> employeeNames;

  int get totalCount =>
      leaves.length +
      claims.length +
      shifts.length +
      pettyCash.length +
      advances.length;
}
