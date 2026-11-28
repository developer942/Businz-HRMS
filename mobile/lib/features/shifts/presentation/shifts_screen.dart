import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/models/app_user.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

enum _AdminShiftTab { shifts, requests }

class ShiftsScreen extends ConsumerStatefulWidget {
  const ShiftsScreen({super.key});

  @override
  ConsumerState<ShiftsScreen> createState() => _ShiftsScreenState();
}

class _ShiftsScreenState extends ConsumerState<ShiftsScreen> {
  late Future<_ShiftBundle> _future;
  _AdminShiftTab _adminTab = _AdminShiftTab.shifts;
  String? _busyRequestId;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_ShiftBundle> _load() async {
    final user = ref.read(authControllerProvider).value ??
        await ref.read(authControllerProvider.future);
    if (user == null) {
      return const _ShiftBundle(
        shifts: [],
        requests: [],
        summary: [],
        employees: [],
      );
    }
    final repo = ref.read(hrmsRepositoryProvider);
    final results = await Future.wait<dynamic>([
      repo.shifts(),
      repo.shiftRequests().catchError((_) => <Map<String, dynamic>>[]),
      if (user.canManageShifts)
        repo.shiftAssignmentSummary()
      else
        Future.value(<Map<String, dynamic>>[]),
      if (user.canManageShifts)
        repo
            .employees(activeOnly: true)
            .catchError((_) => <Map<String, dynamic>>[])
      else
        Future.value(<Map<String, dynamic>>[]),
    ]);

    return _ShiftBundle(
      shifts: results[0] as List<Map<String, dynamic>>,
      requests: results[1] as List<Map<String, dynamic>>,
      summary: results[2] as List<Map<String, dynamic>>,
      employees: results[3] as List<Map<String, dynamic>>,
    );
  }

  void _reload() => setState(() => _future = _load());

  bool _assignedTo(Map<String, dynamic> shift, AppUser user) {
    final assignments = shift['assignments'];
    if (assignments is! List) return false;
    return assignments.any((assignment) {
      if (assignment is Map) {
        return user.matchesIdentity(assignment['employeeId']) ||
            user.matchesIdentity(assignment['employee_id']) ||
            user.matchesIdentity(assignment['id']);
      }
      return user.matchesIdentity(assignment);
    });
  }

  int _assignedCount(
    Map<String, dynamic> shift,
    List<Map<String, dynamic>> summary,
  ) {
    final id = shift['id']?.toString();
    for (final row in summary) {
      if (row['id']?.toString() == id ||
          row['shiftId']?.toString() == id ||
          row['shift_id']?.toString() == id) {
        final count = int.tryParse(
            '${row['assignedCount'] ?? row['assigned_count'] ?? row['employeeCount'] ?? ''}');
        if (count != null) return count;
      }
    }
    final assignments = shift['assignments'];
    return assignments is List ? assignments.length : 0;
  }

  // ---------------------------------------------------------------------------
  // Admin Actions: Create Shift, Assign Staff, Decide Shift Request
  // ---------------------------------------------------------------------------

  Future<void> _openCreateShiftSheet() async {
    final nameCtrl = TextEditingController();
    var start = const TimeOfDay(hour: 9, minute: 30);
    var end = const TimeOfDay(hour: 18, minute: 30);
    final graceCtrl = TextEditingController(text: '15');
    var saving = false;

    String fmt(TimeOfDay t) =>
        '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
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
                Text('Create Shift',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Shift Name (e.g. Morning Shift)',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final picked = await showTimePicker(
                              context: context, initialTime: start);
                          if (picked != null) {
                            setSheetState(() => start = picked);
                          }
                        },
                        icon: const Icon(Icons.wb_sunny_outlined, size: 18),
                        label: Text('Start: ${start.format(context)}'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final picked = await showTimePicker(
                              context: context, initialTime: end);
                          if (picked != null) {
                            setSheetState(() => end = picked);
                          }
                        },
                        icon: const Icon(Icons.nights_stay_outlined, size: 18),
                        label: Text('End: ${end.format(context)}'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: graceCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Grace Period (minutes)',
                  ),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: saving
                      ? null
                      : () async {
                          if (nameCtrl.text.trim().isEmpty) {
                            _message('Enter a shift name.');
                            return;
                          }
                          setSheetState(() => saving = true);
                          try {
                            await ref.read(hrmsRepositoryProvider).createShift({
                              'shiftName': nameCtrl.text.trim(),
                              'name': nameCtrl.text.trim(),
                              'startTime': fmt(start),
                              'endTime': fmt(end),
                              'gracePeriodMinutes':
                                  int.tryParse(graceCtrl.text.trim()) ?? 15,
                            });
                            if (!context.mounted) return;
                            Navigator.pop(context);
                            _message('Shift created successfully.');
                            _reload();
                          } catch (error) {
                            if (!context.mounted) return;
                            _message(error.toString());
                          } finally {
                            if (context.mounted) {
                              setSheetState(() => saving = false);
                            }
                          }
                        },
                  child: Text(saving ? 'Saving…' : 'Create Shift'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    nameCtrl.dispose();
    graceCtrl.dispose();
  }

  Future<void> _openAssignEmployeesSheet(
    Map<String, dynamic> shift,
    List<Map<String, dynamic>> employees,
  ) async {
    final shiftId = shift['id']?.toString() ?? '';
    if (shiftId.isEmpty) return;

    final selected = <String>{};
    final existing = shift['assignments'];
    if (existing is List) {
      for (final a in existing) {
        final v = a is Map
            ? (a['employeeId'] ?? a['employee_id'] ?? a['id'])?.toString()
            : a?.toString();
        if (v != null && v.isNotEmpty) selected.add(v);
      }
    }

    var search = '';
    var saving = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) {
          final visible = employees.where((emp) {
            if (search.trim().isEmpty) return true;
            final q = search.trim().toLowerCase();
            return (emp['name'] ?? '').toString().toLowerCase().contains(q) ||
                (emp['employeeId'] ?? '').toString().toLowerCase().contains(q);
          }).toList(growable: false);

          return FractionallySizedBox(
            heightFactor: 0.85,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Assign Staff · ${_name(shift)}',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 10),
                  TextField(
                    onChanged: (v) => setSheetState(() => search = v),
                    decoration: const InputDecoration(
                      hintText: 'Search employees…',
                      prefixIcon: Icon(Icons.search_rounded),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Expanded(
                    child: ListView.builder(
                      itemCount: visible.length,
                      itemBuilder: (context, idx) {
                        final emp = visible[idx];
                        final empId =
                            (emp['id'] ?? emp['employeeId']).toString();
                        final checked = selected.contains(empId) ||
                            selected.contains(emp['employeeId']?.toString());
                        return CheckboxListTile(
                          value: checked,
                          title: Text((emp['name'] ?? 'Employee').toString()),
                          subtitle: Text(
                              '${emp['employeeId'] ?? ''} · ${emp['department'] ?? ''}'),
                          onChanged: (val) => setSheetState(() {
                            if (val == true) {
                              selected.add(empId);
                            } else {
                              selected.remove(empId);
                              selected.remove(emp['employeeId']?.toString());
                            }
                          }),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: saving
                        ? null
                        : () async {
                            setSheetState(() => saving = true);
                            try {
                              await ref
                                  .read(hrmsRepositoryProvider)
                                  .assignEmployeesToShift(
                                      shiftId, selected.toList());
                              if (!context.mounted) return;
                              Navigator.pop(context);
                              _message('Shift assignments updated.');
                              _reload();
                            } catch (error) {
                              if (!context.mounted) return;
                              _message(error.toString());
                            } finally {
                              if (context.mounted) {
                                setSheetState(() => saving = false);
                              }
                            }
                          },
                    child: Text(saving
                        ? 'Saving…'
                        : 'Save Assignments (${selected.length})'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _decideShiftRequest(
    Map<String, dynamic> req,
    String status,
    AppUser user,
  ) async {
    final id = req['id']?.toString() ?? '';
    if (id.isEmpty) return;
    String? reason;
    if (status == 'Rejected') {
      final ctrl = TextEditingController();
      reason = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Reject shift change request'),
          content: TextField(
            controller: ctrl,
            maxLines: 3,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Rejection reason'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, ctrl.text.trim()),
              child: const Text('Reject'),
            ),
          ],
        ),
      );
      ctrl.dispose();
      if (reason == null) return;
    }

    setState(() => _busyRequestId = id);
    try {
      await ref.read(hrmsRepositoryProvider).decideShiftRequest(
            requestId: id,
            status: status,
            rejectionReason: reason,
            decidedBy: user.name,
          );
      if (mounted) {
        _message('Shift request $status.');
        _reload();
      }
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => _busyRequestId = null);
    }
  }

  // ---------------------------------------------------------------------------
  // Employee Action: Request Shift Change (Strictly hidden for CEO & HR!)
  // ---------------------------------------------------------------------------

  Future<void> _requestChange(
    List<Map<String, dynamic>> shifts,
    AppUser user,
  ) async {
    if (shifts.length < 2) {
      _message('At least two configured shifts are required.');
      return;
    }
    final current = shifts.cast<Map<String, dynamic>?>().firstWhere(
          (shift) => shift != null && _assignedTo(shift, user),
          orElse: () => null,
        );
    var requested = shifts.firstWhere(
      (shift) => shift != current,
      orElse: () => shifts.first,
    );
    var date = DateTime.now().add(const Duration(days: 1));
    final reason = TextEditingController();
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            10,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Request Shift Change',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 6),
                Text('Current shift: ${_name(current)}',
                    style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 16),
                DropdownButtonFormField<Map<String, dynamic>>(
                  initialValue: requested,
                  decoration:
                      const InputDecoration(labelText: 'Requested Shift'),
                  items: shifts
                      .where((shift) => shift != current)
                      .map((shift) => DropdownMenuItem(
                            value: shift,
                            child: Text(_name(shift)),
                          ))
                      .toList(),
                  onChanged: (value) {
                    if (value != null) setSheetState(() => requested = value);
                  },
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final selected = await showDatePicker(
                      context: context,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                      initialDate: date,
                    );
                    if (selected != null) setSheetState(() => date = selected);
                  },
                  icon: const Icon(Icons.calendar_today_outlined, size: 18),
                  label: Text('Effective ${DateFormat.yMMMd().format(date)}'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: reason,
                  maxLength: 500,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Reason'),
                ),
                const SizedBox(height: 10),
                FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('Submit Shift Request'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    final note = reason.text.trim();
    reason.dispose();
    if (submitted != true) return;
    if (note.length < 5) {
      _message('Enter a clear reason of at least 5 characters.');
      return;
    }
    try {
      await ref.read(hrmsRepositoryProvider).createShiftRequest({
        'employeeName': user.name,
        'currentShift': _name(current),
        'requestedShift': _name(requested),
        'requestedDate': DateFormat('yyyy-MM-dd').format(date),
        'reason': note,
      });
      if (mounted) {
        _message('Shift change request submitted.');
        _reload();
      }
    } catch (error) {
      if (mounted) _message(error.toString());
    }
  }

  void _message(String value) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(value)));

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const AppSkeletonList(itemCount: 4, height: 92);
    }

    return FutureBuilder<_ShiftBundle>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const AppSkeletonList(itemCount: 4, height: 92);
        }
        if (snapshot.hasError) {
          return AppErrorView(error: snapshot.error!, onRetry: _reload);
        }
        final bundle = snapshot.data!;
        return user.canManageShifts
            ? _buildAdminView(context, user, bundle)
            : _buildEmployeeView(context, user, bundle);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // CEO & HR SHIFT MANAGEMENT VIEW
  // ---------------------------------------------------------------------------

  Widget _buildAdminView(
    BuildContext context,
    AppUser user,
    _ShiftBundle bundle,
  ) {
    final pendingRequests = bundle.requests
        .where((r) => (r['status'] ?? '').toString().toLowerCase() == 'pending')
        .length;

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: _adminTab == _AdminShiftTab.shifts
          ? FloatingActionButton.extended(
              onPressed: _openCreateShiftSheet,
              icon: const Icon(Icons.add_rounded),
              label: const Text('New Shift'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async {
          _reload();
          await _future;
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 100),
          children: [
            AdaptiveSegmentedControl<_AdminShiftTab>(
              values: const [_AdminShiftTab.shifts, _AdminShiftTab.requests],
              selected: _adminTab,
              labelBuilder: (tab) => tab == _AdminShiftTab.shifts
                  ? 'Shift Masters (${bundle.shifts.length})'
                  : 'Requests ($pendingRequests)',
              onChanged: (tab) => setState(() => _adminTab = tab),
            ),
            const SizedBox(height: 14),
            if (_adminTab == _AdminShiftTab.shifts) ...[
              if (bundle.shifts.isEmpty)
                const EmptyState(
                  icon: Icons.access_time_rounded,
                  title: 'No shifts configured',
                  message: 'Tap New Shift to create your organization shifts.',
                )
              else
                ...bundle.shifts.map((shift) {
                  final count = _assignedCount(shift, bundle.summary);
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
                                backgroundColor: Theme.of(context)
                                    .colorScheme
                                    .primaryContainer,
                                child: Icon(
                                  Icons.schedule_rounded,
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onPrimaryContainer,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _name(shift),
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 15,
                                      ),
                                    ),
                                    Text(
                                      '${_time(shift, [
                                            'startTime',
                                            'start_time'
                                          ])} – ${_time(shift, [
                                            'endTime',
                                            'end_time'
                                          ])}',
                                      style:
                                          Theme.of(context).textTheme.bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                              StatusPill('$count Staff'),
                            ],
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              onPressed: () => _openAssignEmployeesSheet(
                                  shift, bundle.employees),
                              icon: const Icon(Icons.group_add_outlined,
                                  size: 18),
                              label: const Text('Assign / Manage Roster'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
            ] else ...[
              if (bundle.requests.isEmpty)
                const EmptyState(
                  icon: Icons.swap_horiz_rounded,
                  title: 'No shift change requests',
                  message:
                      'Employee shift change requests awaiting HR/CEO approval will appear here.',
                )
              else
                ...bundle.requests.map((req) {
                  final id = req['id']?.toString() ?? '';
                  final status = (req['status'] ?? 'Pending').toString();
                  final isPending = status.toLowerCase() == 'pending';
                  final busy = _busyRequestId == id;
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
                                    Text(
                                      (req['employeeName'] ??
                                              req['employee_name'] ??
                                              'Employee')
                                          .toString(),
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 15),
                                    ),
                                    Text(
                                      '${req['currentShift'] ?? req['current_shift'] ?? 'Current'} → ${req['requestedShift'] ?? req['requested_shift'] ?? 'Requested'}',
                                      style:
                                          Theme.of(context).textTheme.bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                              StatusPill(status),
                            ],
                          ),
                          if ((req['reason'] ?? '').toString().isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text((req['reason'] ?? '').toString(),
                                style: Theme.of(context).textTheme.bodySmall),
                          ],
                          if (isPending) ...[
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: busy
                                        ? null
                                        : () => _decideShiftRequest(
                                            req, 'Rejected', user),
                                    child: const Text('Reject'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: FilledButton(
                                    onPressed: busy
                                        ? null
                                        : () => _decideShiftRequest(
                                            req, 'Approved', user),
                                    child: Text(busy ? 'Saving…' : 'Approve'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  );
                }),
            ],
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // EMPLOYEE / ACCOUNTS SELF-SERVICE SHIFT VIEW
  // ---------------------------------------------------------------------------

  Widget _buildEmployeeView(
    BuildContext context,
    AppUser user,
    _ShiftBundle bundle,
  ) {
    final current = bundle.shifts.cast<Map<String, dynamic>?>().firstWhere(
          (shift) => shift != null && _assignedTo(shift, user),
          orElse: () => null,
        );
    final myRequests = bundle.requests
        .where((r) =>
            user.matchesIdentity(r['employeeId']) ||
            user.matchesIdentity(r['employee_id']) ||
            (r['employeeName']?.toString().trim().toLowerCase() ==
                user.name.trim().toLowerCase()))
        .toList(growable: false);

    return RefreshIndicator(
      onRefresh: () async {
        _reload();
        await _future;
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTokens.brand, AppTokens.brandHover],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(AppTokens.radiusDialog),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'MY ASSIGNED SHIFT',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.9,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _name(current),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  current == null
                      ? 'Contact HR if no shift has been mapped to your profile.'
                      : '${_time(current, [
                              'startTime',
                              'start_time'
                            ])} – ${_time(current, ['endTime', 'end_time'])}',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppTokens.brand,
                    ),
                    onPressed: () => _requestChange(bundle.shifts, user),
                    icon: const Icon(Icons.swap_horiz_rounded),
                    label: const Text('Request Shift Change'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          AppSectionHeader(
              title: 'Company Shifts', count: bundle.shifts.length),
          const SizedBox(height: 8),
          ...bundle.shifts.map((shift) {
            final mine = _assignedTo(shift, user);
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: mine
                      ? Theme.of(context).colorScheme.primaryContainer
                      : Theme.of(context).colorScheme.surfaceContainerHigh,
                  child: Icon(
                    mine ? Icons.check_rounded : Icons.schedule_outlined,
                    color: mine
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                title: Text(_name(shift),
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(
                  '${_time(shift, [
                        'startTime',
                        'start_time'
                      ])} – ${_time(shift, ['endTime', 'end_time'])}',
                ),
                trailing: mine ? const StatusPill('Active') : null,
              ),
            );
          }),
          if (myRequests.isNotEmpty) ...[
            const SizedBox(height: 18),
            AppSectionHeader(
              title: 'My Shift Requests',
              count: myRequests.length,
            ),
            const SizedBox(height: 8),
            ...myRequests.map((req) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(
                      '${req['requestedShift'] ?? req['requested_shift'] ?? 'Shift'}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      'Effective ${formatDisplayDate((req['requestedDate'] ?? req['requested_date'])?.toString())}',
                    ),
                    trailing:
                        StatusPill((req['status'] ?? 'Pending').toString()),
                  ),
                )),
          ],
        ],
      ),
    );
  }

  static String _name(Map<String, dynamic>? shift) {
    if (shift == null) return 'Not assigned';
    return (shift['shiftName'] ??
            shift['shift_name'] ??
            shift['name'] ??
            'Shift')
        .toString();
  }

  static String _time(Map<String, dynamic> item, List<String> keys) {
    for (final key in keys) {
      final value = item[key]?.toString();
      if (value != null && value.isNotEmpty) {
        return value.length >= 5 ? value.substring(0, 5) : value;
      }
    }
    return '--:--';
  }
}

class _ShiftBundle {
  const _ShiftBundle({
    required this.shifts,
    required this.requests,
    required this.summary,
    required this.employees,
  });

  final List<Map<String, dynamic>> shifts;
  final List<Map<String, dynamic>> requests;
  final List<Map<String, dynamic>> summary;
  final List<Map<String, dynamic>> employees;
}
