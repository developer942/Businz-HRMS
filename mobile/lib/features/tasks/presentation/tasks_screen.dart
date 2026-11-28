import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../app/providers.dart';
import '../../../core/models/app_user.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/file_share_helper.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../../core/widgets/proof_viewer.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  String _section = '';
  String _statusFilter = 'All';
  String _reportStatusFilter = 'All';
  String _search = '';

  @override
  void initState() {
    super.initState();
    _future = ref.read(hrmsRepositoryProvider).tasks();
  }

  void _reload() =>
      setState(() => _future = ref.read(hrmsRepositoryProvider).tasks());

  Future<void> _createOrEdit({Map<String, dynamic>? existing}) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _TaskForm(existingTask: existing),
    );
    if (saved == true) _reload();
  }

  Future<void> _openTask(Map<String, dynamic> task) async {
    var mutated = false;
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => _TaskDetail(
        task: task,
        onTaskMutated: () => mutated = true,
        onEditRequested: (t) async {
          Navigator.pop(context);
          await _createOrEdit(existing: t);
        },
      ),
    );
    if (changed == true || mutated) _reload();
  }

  Future<void> _openStandaloneDailyReport(
    List<Map<String, dynamic>> allTasks,
  ) async {
    final user = ref.read(authControllerProvider).value;
    final assignedTasks = user == null
        ? const <Map<String, dynamic>>[]
        : allTasks
            .where((t) => _isTaskAssignedToUser(t, user))
            .toList(growable: false);
    if (assignedTasks.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Only assigned employees can submit daily reports for a task.',
            ),
          ),
        );
      }
      return;
    }
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _StandaloneDailyReportSheet(tasks: assignedTasks),
    );
    if (saved == true) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final sections = user.isManagement
        ? const ['All Tasks', 'My Tasks', 'Assigned', 'Daily Reports']
        : const ['My Tasks', 'Assigned', 'Team', 'Daily Reports'];
    final activeSection =
        sections.contains(_section) ? _section : sections.first;

    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snapshot) {
        final all = snapshot.data ?? const <Map<String, dynamic>>[];
        final isDailyReportTab = activeSection == 'Daily Reports';

        return Scaffold(
          backgroundColor: Colors.transparent,
          body: Builder(
            builder: (context) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const BusinzLoadingSkeleton(itemCount: 5, height: 108);
              }
              if (snapshot.hasError) {
                return BusinzErrorState(
                    error: snapshot.error!, onRetry: _reload);
              }

              final today = DateTime.now();
              final todayFloor = DateTime(today.year, today.month, today.day);
              final q = _search.trim().toLowerCase();

              final sectionTasks = all.where((task) {
                return switch (activeSection) {
                  'My Tasks' => _isTaskAssignedToUser(task, user),
                  'Assigned' => _isTaskAssignedByUser(task, user),
                  'Team' => true,
                  _ => true,
                };
              }).toList(growable: false);

              final totalCount = sectionTasks.length;
              final completedCount =
                  sectionTasks.where((t) => _isTaskDone(t)).length;
              final overdueCount = sectionTasks
                  .where((t) => _isTaskOverdue(t, todayFloor))
                  .length;
              final activeCount = sectionTasks
                  .where((t) => !_isTaskDone(t) && !_isTaskDraft(t))
                  .length;

              final dailyReports =
                  _collectDailyReports(all, q, _reportStatusFilter);

              final filteredTasks = sectionTasks.where((task) {
                final status = _taskStatus(task).toLowerCase();
                final isDone = _isTaskDone(task);
                final isDraft = _isTaskDraft(task);
                final isOverdue = _isTaskOverdue(task, todayFloor);

                final matchesStatus = switch (_statusFilter) {
                  'Open' => !isDone && !isDraft,
                  'In Progress' =>
                    status.contains('progress') || status.contains('process'),
                  'Under Review' => status.contains('review'),
                  'Overdue' => isOverdue,
                  'Completed' => isDone,
                  'Drafts' => isDraft,
                  _ => true,
                };
                if (!matchesStatus) return false;
                if (q.isEmpty) return true;
                return _first(task, ['title', 'task_name', 'name'], '')
                        .toLowerCase()
                        .contains(q) ||
                    _first(task, ['taskNumber', 'task_number'], '')
                        .toLowerCase()
                        .contains(q) ||
                    _first(task, ['department'], '')
                        .toLowerCase()
                        .contains(q) ||
                    _first(
                            task,
                            [
                              'responsiblePersonName',
                              'responsible_person_name'
                            ],
                            '')
                        .toLowerCase()
                        .contains(q) ||
                    _first(task,
                            ['assignedByName', 'assignedBy', 'assigned_by'], '')
                        .toLowerCase()
                        .contains(q);
              }).toList(growable: false);

              return RefreshIndicator(
                onRefresh: () async {
                  _reload();
                  await _future;
                },
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Reference Search + Circular Teal Action Row
                            Row(
                              children: [
                                Expanded(
                                  child: BusinzSearchBar(
                                    hintText: isDailyReportTab
                                        ? 'Search daily reports or employee…'
                                        : 'Search task, #ID, or assignee…',
                                    onChanged: (v) =>
                                        setState(() => _search = v),
                                  ),
                                ),
                                if (!isDailyReportTab ||
                                    all.any(
                                        (t) => _isTaskAssignedToUser(t, user)))
                                  Padding(
                                    padding: const EdgeInsets.only(left: 10),
                                    child: Semantics(
                                      button: true,
                                      label: isDailyReportTab
                                          ? 'Submit Daily Report'
                                          : 'Assign Task',
                                      child: Material(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary,
                                        shape: const CircleBorder(),
                                        elevation: 2,
                                        shadowColor: AppTokens.brandPrimary
                                            .withValues(alpha: 0.32),
                                        child: InkWell(
                                          customBorder: const CircleBorder(),
                                          onTap: isDailyReportTab
                                              ? () =>
                                                  _openStandaloneDailyReport(
                                                      all)
                                              : () => _createOrEdit(),
                                          child: Padding(
                                            padding: const EdgeInsets.all(13),
                                            child: Icon(
                                              isDailyReportTab
                                                  ? Icons.post_add_rounded
                                                  : Icons.add_rounded,
                                              color: Colors.white,
                                              size: 22,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 12),

                            // Web-parity Section Pills
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: sections.map((sec) {
                                  final selected = activeSection == sec;
                                  final badgeCount = switch (sec) {
                                    'My Tasks' => all
                                        .where((t) =>
                                            _isTaskAssignedToUser(t, user))
                                        .length,
                                    'Assigned' => all
                                        .where((t) =>
                                            _isTaskAssignedByUser(t, user))
                                        .length,
                                    'Daily Reports' =>
                                      _collectDailyReports(all, '', 'All')
                                          .length,
                                    _ => all.length,
                                  };
                                  return Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: ChoiceChip(
                                      selected: selected,
                                      avatar: Icon(
                                        _sectionIcon(sec),
                                        size: 16,
                                        color: selected
                                            ? Colors.white
                                            : Theme.of(context)
                                                .colorScheme
                                                .primary,
                                      ),
                                      label: Text('$sec ($badgeCount)'),
                                      onSelected: (_) => setState(() {
                                        _section = sec;
                                      }),
                                    ),
                                  );
                                }).toList(),
                              ),
                            ),
                            const SizedBox(height: 12),

                            // Clean Compact KPI Summary Row
                            if (!isDailyReportTab) ...[
                              Row(
                                children: [
                                  _MiniKpi('Total', '$totalCount',
                                      AppTokens.brandPrimary),
                                  const SizedBox(width: 8),
                                  _MiniKpi(
                                      'Active', '$activeCount', AppTokens.info),
                                  const SizedBox(width: 8),
                                  _MiniKpi('Overdue', '$overdueCount',
                                      AppTokens.danger),
                                  const SizedBox(width: 8),
                                  _MiniKpi('Done', '$completedCount',
                                      AppTokens.success),
                                ],
                              ),
                              const SizedBox(height: 10),
                            ],

                            if (!isDailyReportTab)
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: const [
                                    'All',
                                    'Open',
                                    'In Progress',
                                    'Under Review',
                                    'Overdue',
                                    'Completed',
                                    'Drafts',
                                  ]
                                      .map((value) => Padding(
                                            padding:
                                                const EdgeInsets.only(right: 8),
                                            child: FilterChip(
                                              selected: _statusFilter == value,
                                              label: Text(value),
                                              onSelected: (_) => setState(
                                                  () => _statusFilter = value),
                                            ),
                                          ))
                                      .toList(),
                                ),
                              )
                            else
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: const [
                                    'All',
                                    'Completed',
                                    'In Progress',
                                    'Under Review',
                                    'Pending',
                                  ]
                                      .map((value) => Padding(
                                            padding:
                                                const EdgeInsets.only(right: 8),
                                            child: FilterChip(
                                              selected:
                                                  _reportStatusFilter == value,
                                              label: Text(value),
                                              onSelected: (_) => setState(() =>
                                                  _reportStatusFilter = value),
                                            ),
                                          ))
                                      .toList(),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (isDailyReportTab)
                      if (dailyReports.isEmpty)
                        const SliverFillRemaining(
                          hasScrollBody: false,
                          child: BusinzEmptyState(
                            icon: Icons.assignment_outlined,
                            title: 'No daily task reports yet',
                            message:
                                'Tap the top-right action button to log today\'s work progress on an assigned task.',
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(
                            16,
                            0,
                            16,
                            AppTokens.floatingNavClearance + 20,
                          ),
                          sliver: SliverList.separated(
                            itemCount: dailyReports.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 10),
                            itemBuilder: (context, index) {
                              final entry = dailyReports[index];
                              return _DailyReportFeedCard(
                                entry: entry,
                                onTap: () => _openTask(entry.task),
                              );
                            },
                          ),
                        )
                    else if (filteredTasks.isEmpty)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: BusinzEmptyState(
                          icon: Icons.task_alt_rounded,
                          title: 'No tasks matching filter',
                          message: activeSection == 'Assigned'
                              ? 'Tasks you assign to colleagues will appear here.'
                              : 'Switch status filter to "All" or tap "+" above to assign a new task.',
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(
                          16,
                          0,
                          16,
                          AppTokens.floatingNavClearance + 20,
                        ),
                        sliver: SliverList.separated(
                          itemCount: filteredTasks.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final item = filteredTasks[index];
                            return _TaskCard(
                              task: item,
                              todayFloor: todayFloor,
                              onTap: () => _openTask(item),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }

  static IconData _sectionIcon(String section) => switch (section) {
        'My Tasks' => Icons.person_outline_rounded,
        'Assigned' => Icons.send_outlined,
        'Team' => Icons.groups_outlined,
        'Daily Reports' => Icons.fact_check_outlined,
        _ => Icons.view_list_rounded,
      };

  static List<_DailyReportFeedItem> _collectDailyReports(
    List<Map<String, dynamic>> tasks,
    String query,
    String statusFilter,
  ) {
    final entries = <_DailyReportFeedItem>[];
    for (final task in tasks) {
      final rawReports = task['dailyReports'];
      if (rawReports is! List) continue;
      for (final raw in rawReports.whereType<Map>()) {
        final report = Map<String, dynamic>.from(raw);
        final status =
            _first(report, ['processStatus', 'status'], 'In Progress');
        if (statusFilter != 'All' &&
            !status.toLowerCase().contains(statusFilter.toLowerCase()) &&
            !(statusFilter == 'In Progress' &&
                status.toLowerCase().contains('process'))) {
          continue;
        }
        final item = _DailyReportFeedItem(task: task, report: report);
        if (query.isNotEmpty) {
          final haystack = [
            _first(task, ['title', 'task_name'], ''),
            _first(task, ['taskNumber', 'task_number'], ''),
            _first(report, ['employeeName', 'employeeId'], ''),
            _first(report, ['workDoneToday', 'workDone', 'remarks'], ''),
            _first(report, ['planForTomorrow', 'blockersOrIssues'], ''),
          ].join(' ').toLowerCase();
          if (!haystack.contains(query)) continue;
        }
        entries.add(item);
      }
    }
    entries.sort((a, b) => b.sortKey.compareTo(a.sortKey));
    return entries;
  }
}

class _MiniKpi extends StatelessWidget {
  const _MiniKpi(this.label, this.value, this.color);
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(12),
          border:
              Border.all(color: scheme.outlineVariant.withValues(alpha: 0.7)),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: color,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            Text(label, style: Theme.of(context).textTheme.labelSmall),
          ],
        ),
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    required this.todayFloor,
    required this.onTap,
  });
  final Map<String, dynamic> task;
  final DateTime todayFloor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final title = _first(task, ['title', 'task_name', 'name'], 'Task');
    final number = _first(task, ['taskNumber', 'task_number'], '');
    final dueRaw = _first(task, ['due_date', 'dueDate', 'deadline'], '');
    final due = formatDisplayDate(dueRaw, fallback: 'No due date');
    final status = _taskStatus(task);
    final priority = _first(task, ['priority'], 'Medium');
    final owner =
        _first(task, ['responsiblePersonName', 'responsible_person_name'], '');
    final assignedBy = _first(
        task,
        ['assignedByName', 'assigned_by_name', 'assignedBy', 'assigned_by'],
        '');
    final progress = double.tryParse(
            '${task['overallProgress'] ?? task['overall_progress'] ?? 0}') ??
        0;
    final reportsCount = task['dailyReports'] is List
        ? (task['dailyReports'] as List).length
        : 0;
    final overdue = _isTaskOverdue(task, todayFloor);
    final subtitleParts = <String>[
      if (owner.isNotEmpty) owner,
      if (assignedBy.isNotEmpty) 'By $assignedBy',
      if (reportsCount > 0)
        '$reportsCount report${reportsCount == 1 ? '' : 's'}',
    ];

    return BusinzTaskCard(
      title: title,
      subtitle: subtitleParts.join(' · '),
      taskNumber: number.isEmpty ? null : number,
      priority: priority,
      status: status,
      dueText: due,
      progress: progress,
      isOverdue: overdue,
      onTap: onTap,
    );
  }
}

class _DailyReportFeedItem {
  const _DailyReportFeedItem({required this.task, required this.report});
  final Map<String, dynamic> task;
  final Map<String, dynamic> report;

  String get sortKey =>
      _first(report, ['submittedAt', 'reportDate', 'createdAt'], '1970-01-01');
}

class _DailyReportFeedCard extends StatelessWidget {
  const _DailyReportFeedCard({required this.entry, required this.onTap});
  final _DailyReportFeedItem entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final r = entry.report;
    final t = entry.task;
    final taskTitle = _first(t, ['title', 'task_name'], 'Task');
    final empName = _first(r, ['employeeName', 'employeeId'], 'Employee');
    final dateStr = formatDisplayDate(
      _first(r, ['reportDate', 'submittedAt', 'createdAt'], ''),
    );
    final status = _first(r, ['processStatus', 'status'], 'In Progress');
    final progress =
        double.tryParse('${r['progressPercentage'] ?? 0}')?.round() ?? 0;
    final workDone =
        _first(r, ['workDoneToday', 'workDone', 'remarks', 'description'], '');
    final plan = _first(r, ['planForTomorrow', 'nextPlan'], '');
    final blockers = _first(r, ['blockersOrIssues', 'blockers'], '');
    final hours = r['hoursSpent'];

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 17,
                    backgroundColor:
                        Theme.of(context).colorScheme.primaryContainer,
                    child: Text(
                      initialsOf(empName),
                      style: TextStyle(
                        fontSize: 11.5,
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
                        Text(
                          taskTitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                        Text(
                          '$empName · $dateStr${hours != null ? ' · ${hours}h' : ''}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  StatusPill(status),
                ],
              ),
              if (workDone.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(workDone, style: const TextStyle(fontSize: 13.5)),
              ],
              if (plan.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  'Next Plan: $plan',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              if (blockers.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  'Blockers: $blockers',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppTokens.danger,
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .colorScheme
                        .surfaceContainerHighest
                        .withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$progress%',
                    style: Theme.of(context)
                        .textTheme
                        .labelSmall
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StandaloneDailyReportSheet extends ConsumerStatefulWidget {
  const _StandaloneDailyReportSheet({required this.tasks});
  final List<Map<String, dynamic>> tasks;

  @override
  ConsumerState<_StandaloneDailyReportSheet> createState() =>
      _StandaloneDailyReportSheetState();
}

class _StandaloneDailyReportSheetState
    extends ConsumerState<_StandaloneDailyReportSheet> {
  final _formKey = GlobalKey<FormState>();
  final _summary = TextEditingController();
  final _plan = TextEditingController();
  final _blockers = TextEditingController();
  final _hours = TextEditingController();
  Map<String, dynamic>? _selectedTask;
  DateTime _reportDate = DateTime.now();
  String _status = 'IN PROGRESS';
  double _progress = 50;
  XFile? _evidence;
  bool _saving = false;
  String? _error;

  static const _statuses = [
    'OPEN',
    'IN PROGRESS',
    'UNDER REVIEW',
    'COMPLETED',
  ];

  @override
  void initState() {
    super.initState();
    final user = ref.read(authControllerProvider).value;
    if (widget.tasks.isNotEmpty) {
      final preferred = user == null
          ? widget.tasks.first
          : widget.tasks.firstWhere(
              (t) => _isTaskAssignedToUser(t, user) && !_isTaskDone(t),
              orElse: () => widget.tasks.firstWhere(
                (t) => _isTaskAssignedToUser(t, user),
                orElse: () => widget.tasks.first,
              ),
            );
      _selectTask(preferred);
    }
  }

  void _selectTask(Map<String, dynamic> task) {
    _selectedTask = task;
    final st = _taskStatus(task).toUpperCase();
    _status = _statuses.contains(st) ? st : 'IN PROGRESS';
    _progress = (double.tryParse(
                '${task['overallProgress'] ?? task['overall_progress'] ?? 0}') ??
            0)
        .clamp(0, 100);
  }

  @override
  void dispose() {
    _summary.dispose();
    _plan.dispose();
    _blockers.dispose();
    _hours.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
      initialDate: _reportDate,
    );
    if (picked != null) setState(() => _reportDate = picked);
  }

  Future<void> _pickEvidence() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose image'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    final image = await ImagePicker().pickImage(
      source: source,
      imageQuality: 72,
      maxWidth: 1800,
      maxHeight: 1800,
    );
    if (image != null && mounted) setState(() => _evidence = image);
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false) || _saving) return;
    final task = _selectedTask;
    final user = ref.read(authControllerProvider).value;
    if (task == null || user == null) return;
    final taskId = _first(task, ['id'], '');
    if (taskId.isEmpty) return;

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final now = DateTime.now().toUtc();
      final effectiveProgress =
          _status == 'COMPLETED' ? 100 : _progress.round();
      final nested = task['task_data'] is Map
          ? Map<String, dynamic>.from(task['task_data'] as Map)
          : <String, dynamic>{...task};
      final reports = List<Map<String, dynamic>>.from(
          _maps(nested['dailyReports'] ?? task['dailyReports']));
      reports.add({
        'id': const Uuid().v4(),
        'taskId': taskId,
        'reportDate': DateFormat('yyyy-MM-dd').format(_reportDate),
        'employeeId': user.employeeId,
        'employeeName': user.name,
        'workDoneToday': _summary.text.trim(),
        'planForTomorrow': _plan.text.trim(),
        'blockersOrIssues': _blockers.text.trim(),
        'hoursSpent': double.tryParse(_hours.text.trim()),
        'progressPercentage': effectiveProgress,
        'processStatus': _mobileTaskStatus(_status),
        'submittedAt': now.toIso8601String(),
        'submittedTo': const ['Assigner'],
      });
      nested['dailyReports'] = reports;

      if (_evidence != null) {
        final bytes = await _evidence!.readAsBytes();
        if (bytes.length > 5 * 1024 * 1024) {
          throw Exception('Attachment must be 5 MB or smaller.');
        }
        final ext = _evidence!.name.split('.').last.toLowerCase();
        final mime = ext == 'png' ? 'image/png' : 'image/jpeg';
        final attachments = List<Map<String, dynamic>>.from(
            _maps(nested['attachments'] ?? task['attachments']));
        attachments.add({
          'id': const Uuid().v4(),
          'taskId': taskId,
          'fileName': _evidence!.name,
          'fileSize': '${(bytes.length / 1024).ceil()} KB',
          'fileType': mime,
          'fileUrl': 'data:$mime;base64,${base64Encode(bytes)}',
          'uploadedBy': user.name,
          'uploadedAt': now.toIso8601String(),
        });
        nested['attachments'] = attachments;
      }

      final updatedProgress = _applyAssigneeProgress(
        nested: nested,
        user: user,
        status: _status,
        progress: effectiveProgress,
        nowIso: now.toIso8601String(),
      );
      nested['overallStatus'] = _status;
      nested['overallProgress'] = updatedProgress;
      nested['updatedAt'] = now.toIso8601String();

      await ref.read(hrmsRepositoryProvider).updateTask(
            taskId,
            status: _status,
            progress: updatedProgress,
            taskData: nested,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Daily task report submitted.')),
      );
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Submit Daily Task Report',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _selectedTask == null
                      ? null
                      : _first(_selectedTask!, ['id'], ''),
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Select Task'),
                  items: widget.tasks
                      .map((t) => DropdownMenuItem(
                            value: _first(t, ['id'], ''),
                            child: Text(
                              '${_first(t, [
                                        'taskNumber',
                                        'task_number'
                                      ], '')} ${_first(t, ['title', 'task_name'], 'Task')}'
                                  .trim(),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ))
                      .toList(),
                  onChanged: _saving
                      ? null
                      : (id) {
                          final match = widget.tasks
                              .firstWhere((t) => _first(t, ['id'], '') == id);
                          setState(() => _selectTask(match));
                        },
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: _saving ? null : _pickDate,
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Report Date',
                            suffixIcon:
                                Icon(Icons.calendar_today_rounded, size: 18),
                          ),
                          child: Text(
                              DateFormat('dd MMM yyyy').format(_reportDate)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _status,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Status'),
                        items: _statuses
                            .map((s) => DropdownMenuItem(
                                  value: s,
                                  child: Text(_mobileTaskStatus(s)),
                                ))
                            .toList(),
                        onChanged: _saving
                            ? null
                            : (v) => setState(() {
                                  _status = v!;
                                  if (_status == 'COMPLETED') _progress = 100;
                                }),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text('Progress: ${_progress.round()}%',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                Slider(
                  value: _progress,
                  min: 0,
                  max: 100,
                  divisions: 20,
                  label: '${_progress.round()}%',
                  onChanged: _saving || _status == 'COMPLETED'
                      ? null
                      : (v) => setState(() => _progress = v),
                ),
                TextFormField(
                  controller: _summary,
                  enabled: !_saving,
                  minLines: 3,
                  maxLines: 5,
                  decoration:
                      const InputDecoration(labelText: 'Work done today *'),
                  validator: (v) => v == null || v.trim().isEmpty
                      ? 'Describe today\'s completed work.'
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _plan,
                  enabled: !_saving,
                  minLines: 2,
                  maxLines: 3,
                  decoration:
                      const InputDecoration(labelText: 'Plan for tomorrow'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: TextFormField(
                        controller: _blockers,
                        enabled: !_saving,
                        decoration: const InputDecoration(
                            labelText: 'Blockers / issues'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: _hours,
                        enabled: !_saving,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(labelText: 'Hours'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _saving ? null : _pickEvidence,
                  icon: const Icon(Icons.attach_file_rounded),
                  label: Text(_evidence == null
                      ? 'Attach photo evidence'
                      : _evidence!.name),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: _saving ? null : _submit,
                  icon: const Icon(Icons.check_rounded),
                  label: Text(_saving ? 'Submitting…' : 'Submit Daily Report'),
                ),
              ],
            ),
          ),
        ),
      );
}

class _TaskDetail extends ConsumerStatefulWidget {
  const _TaskDetail({
    required this.task,
    required this.onEditRequested,
    this.onTaskMutated,
  });
  final Map<String, dynamic> task;
  final Future<void> Function(Map<String, dynamic> task) onEditRequested;
  final VoidCallback? onTaskMutated;

  @override
  ConsumerState<_TaskDetail> createState() => _TaskDetailState();
}

class _TaskDetailState extends ConsumerState<_TaskDetail> {
  final _commentCtrl = TextEditingController();
  late Map<String, dynamic> _task;
  bool _saving = false;

  Map<String, dynamic> get task => _task;

  @override
  void initState() {
    super.initState();
    _task = Map<String, dynamic>.from(widget.task);
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _uploadAttachment() async {
    if (_saving) return;
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined,
                  color: AppTokens.brandPrimary),
              title: const Text('Choose image or screenshot'),
              onTap: () => Navigator.pop(context, 'gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined,
                  color: AppTokens.brandPrimary),
              title: const Text('Take photo'),
              onTap: () => Navigator.pop(context, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.description_outlined,
                  color: AppTokens.brandPrimary),
              title: const Text('Choose document (PDF, Excel, Word)'),
              onTap: () => Navigator.pop(context, 'document'),
            ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;

    final user = ref.read(authControllerProvider).value;
    if (user == null) return;
    final taskId = _first(task, ['id'], '');
    if (taskId.isEmpty) return;

    try {
      late final String fileName;
      late final Uint8List bytes;
      String? explicitMime;

      if (choice == 'document') {
        final picked = await FileShareHelper.pickDocument();
        if (picked == null || !mounted) return;
        final path = (picked['path'] ?? '').toString();
        if (path.isEmpty) return;
        fileName = (picked['name'] ?? 'document').toString();
        bytes = await File(path).readAsBytes();
      } else {
        final image = await ImagePicker().pickImage(
          source: choice == 'camera' ? ImageSource.camera : ImageSource.gallery,
          imageQuality: 80,
          maxWidth: 2000,
          maxHeight: 2000,
        );
        if (image == null || !mounted) return;
        fileName = image.name;
        bytes = await image.readAsBytes();
        explicitMime = image.mimeType;
      }

      if (bytes.isEmpty) {
        throw const AttachmentUnavailableException('Selected file is empty.');
      }
      if (bytes.length > 5 * 1024 * 1024) {
        throw const AttachmentUnavailableException(
          'Attachment must be 5 MB or smaller.',
        );
      }

      final mime =
          FileShareHelper.detectMimeType(fileName, explicitMime: explicitMime);
      final sizeStr = bytes.length < 1024 * 1024
          ? '${(bytes.length / 1024).toStringAsFixed(1)} KB'
          : '${(bytes.length / (1024 * 1024)).toStringAsFixed(1)} MB';
      final nowIso = DateTime.now().toUtc().toIso8601String();
      final newAtt = <String, dynamic>{
        'id': const Uuid().v4(),
        'taskId': taskId,
        'fileName': fileName,
        'fileSize': sizeStr,
        'fileType': mime,
        'fileUrl': 'data:$mime;base64,${base64Encode(bytes)}',
        'uploadedBy': user.name,
        'uploadedAt': nowIso,
      };

      final nested = task['task_data'] is Map
          ? Map<String, dynamic>.from(task['task_data'] as Map)
          : <String, dynamic>{...task};
      final nextAttachments = List<Map<String, dynamic>>.from(
        _maps(nested['attachments'] ?? task['attachments']),
      )..add(newAtt);
      nested['attachments'] = nextAttachments;
      nested['updatedAt'] = nowIso;

      setState(() => _saving = true);
      await ref.read(hrmsRepositoryProvider).updateTask(
            taskId,
            status: _taskStatus(task),
            progress: num.tryParse(
                    '${task['overallProgress'] ?? task['overall_progress'] ?? 0}') ??
                0,
            taskData: nested,
          );
      widget.onTaskMutated?.call();
      if (!mounted) return;
      setState(() {
        _task = {
          ..._task,
          'attachments': nextAttachments,
          'task_data': nested,
        };
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Uploaded $fileName')),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _postComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty || _saving) return;
    final user = ref.read(authControllerProvider).value;
    if (user == null) return;
    final taskId = _first(task, ['id'], '');
    if (taskId.isEmpty) return;

    final nested = task['task_data'] is Map
        ? Map<String, dynamic>.from(task['task_data'] as Map)
        : <String, dynamic>{...task};
    final comments = List<Map<String, dynamic>>.from(
        _maps(nested['comments'] ?? task['comments']));
    final now = DateTime.now().toUtc().toIso8601String();
    comments.add({
      'id': const Uuid().v4(),
      'userId': user.employeeId,
      'userName': user.name,
      'content': text,
      'createdAt': now,
    });
    nested['comments'] = comments;
    nested['updatedAt'] = now;

    setState(() => _saving = true);
    try {
      await ref.read(hrmsRepositoryProvider).updateTask(
            taskId,
            status: _taskStatus(task),
            progress: num.tryParse(
                    '${task['overallProgress'] ?? task['overall_progress'] ?? 0}') ??
                0,
            taskData: nested,
          );
      _commentCtrl.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Comment posted.')));
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _quickReview(
    String newStatus,
    num newProgress, {
    bool isReopen = false,
  }) async {
    if (_saving) return;
    final taskId = _first(task, ['id'], '');
    if (taskId.isEmpty) return;
    final user = ref.read(authControllerProvider).value;
    final nowIso = DateTime.now().toUtc().toIso8601String();
    final nested = task['task_data'] is Map
        ? Map<String, dynamic>.from(task['task_data'] as Map)
        : <String, dynamic>{...task};
    nested['overallStatus'] = newStatus;
    nested['overallProgress'] = newProgress;
    nested['updatedAt'] = nowIso;
    if (isReopen) {
      nested['reopenedAt'] = nowIso;
      if (user != null) {
        nested['reopenedBy'] = user.name;
        nested['reopenedById'] = user.employeeId;
      }
      final assignees = _maps(nested['assignees']);
      if (assignees.isNotEmpty) {
        nested['assignees'] = assignees.map((a) {
          final copy = Map<String, dynamic>.from(a);
          copy['individualStatus'] = newStatus;
          copy['progressPercentage'] = newProgress;
          copy['lastUpdatedAt'] = nowIso;
          return copy;
        }).toList(growable: false);
      }
    }

    setState(() => _saving = true);
    try {
      await ref.read(hrmsRepositoryProvider).updateTask(
            taskId,
            status: newStatus,
            progress: newProgress,
            taskData: nested,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isReopen
                ? 'Task reopened and returned to In Progress.'
                : 'Task marked as $newStatus.',
          ),
        ),
      );
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _update({required bool dailyReport}) async {
    final currentProgress = double.tryParse(
            '${task['overallProgress'] ?? task['overall_progress'] ?? 0}') ??
        0;
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _TaskProgressForm(
        initialStatus: _taskStatus(task),
        initialProgress: currentProgress,
        requireWorkSummary: dailyReport,
      ),
    );
    if (result == null || _saving) return;

    final user = ref.read(authControllerProvider).value;
    if (user == null) return;
    final taskId = _first(task, ['id'], '');
    if (taskId.isEmpty) return;
    final status = result['status'].toString();
    final progress = result['progress'] as num;
    final now = DateTime.now().toUtc();
    final nested = task['task_data'] is Map
        ? Map<String, dynamic>.from(task['task_data'] as Map)
        : <String, dynamic>{...task};

    if (dailyReport) {
      final reports = List<Map<String, dynamic>>.from(
          _maps(nested['dailyReports'] ?? task['dailyReports']));
      reports.add({
        'id': const Uuid().v4(),
        'taskId': taskId,
        'reportDate': DateFormat('yyyy-MM-dd').format(now.toLocal()),
        'employeeId': user.employeeId,
        'employeeName': user.name,
        'workDoneToday': result['summary'],
        'planForTomorrow': result['plan'],
        'blockersOrIssues': result['blockers'],
        'hoursSpent': result['hours'],
        'progressPercentage': progress,
        'processStatus': _mobileTaskStatus(status),
        'submittedAt': now.toIso8601String(),
        'submittedTo': const ['Assigner'],
      });
      nested['dailyReports'] = reports;
    }

    final attachment = result['attachment'];
    if (attachment is Map) {
      final attachments = List<Map<String, dynamic>>.from(
          _maps(nested['attachments'] ?? task['attachments']));
      attachments.add({
        ...Map<String, dynamic>.from(attachment),
        'taskId': taskId,
        'uploadedBy': user.name,
      });
      nested['attachments'] = attachments;
    }

    final effectiveProgress = _applyAssigneeProgress(
      nested: nested,
      user: user,
      status: status,
      progress: progress,
      nowIso: now.toIso8601String(),
    );
    nested['overallStatus'] = status;
    nested['overallProgress'] = effectiveProgress;
    nested['updatedAt'] = now.toIso8601String();

    setState(() => _saving = true);
    try {
      await ref.read(hrmsRepositoryProvider).updateTask(
            taskId,
            status: status,
            progress: effectiveProgress,
            taskData: nested,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(dailyReport
            ? 'Daily report saved to the task.'
            : 'Task status updated.'),
      ));
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value!;
    final title = _first(task, ['title', 'task_name'], 'Task');
    final description = _first(task, ['description'], 'No description');
    final status = _taskStatus(task);
    final priority = _first(task, ['priority'], 'Medium');
    final due = formatDisplayDate(_first(task, ['dueDate', 'due_date'], ''),
        fallback: 'Not set');
    final dueTime = _first(task, ['dueTime', 'due_time'], '');
    final creator = _first(
        task,
        ['assignedByName', 'assigned_by_name', 'assignedBy', 'assigned_by'],
        'Not available');
    final assignees = _maps(task['assignees']);
    final comments = _maps(task['comments']);
    final reports = _maps(task['dailyReports']).reversed.toList();
    final attachments = _maps(task['attachments']);
    final isAssigner = _isTaskAssignedByUser(task, user);
    final isAssignee = _isTaskAssignedToUser(task, user);
    final canReopenOrReview = user.isManagement || isAssigner;
    final statusUpper = status.toUpperCase();
    final isReopenable = statusUpper == 'COMPLETED' ||
        statusUpper == 'CLOSED' ||
        statusUpper == 'CANCELLED' ||
        statusUpper == 'UNDER REVIEW';

    return FractionallySizedBox(
      heightFactor: .94,
      child: ListView(
        padding: EdgeInsets.fromLTRB(
            20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 36),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(title,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 10),
              StatusPill(status),
            ],
          ),
          if (isAssigner || (canReopenOrReview && isReopenable)) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                if (isAssigner)
                  TextButton.icon(
                    onPressed:
                        _saving ? null : () => widget.onEditRequested(task),
                    icon: const Icon(Icons.edit_outlined, size: 17),
                    label: const Text('Edit Task'),
                  ),
                if (canReopenOrReview &&
                    isReopenable &&
                    statusUpper != 'UNDER REVIEW')
                  TextButton.icon(
                    onPressed: _saving
                        ? null
                        : () => _quickReview(
                              'IN PROGRESS',
                              50,
                              isReopen: true,
                            ),
                    icon: const Icon(Icons.replay_rounded, size: 17),
                    label: const Text('Reopen Task'),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          Text(description),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(children: [
                DetailKeyValueRow(label: 'Priority', value: priority),
                DetailKeyValueRow(
                  label: 'Due Date',
                  value: dueTime.isEmpty ? due : '$due · $dueTime',
                ),
                DetailKeyValueRow(
                  label: 'Department',
                  value: _first(task, ['department'], 'General'),
                ),
                DetailKeyValueRow(label: 'Assigned By', value: creator),
                DetailKeyValueRow(
                  label: 'Task Number',
                  value: _first(task, ['taskNumber', 'task_number'], ''),
                ),
              ]),
            ),
          ),
          if (canReopenOrReview && statusUpper == 'UNDER REVIEW') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _saving
                        ? null
                        : () => _quickReview(
                              'IN PROGRESS',
                              75,
                              isReopen: true,
                            ),
                    icon: const Icon(Icons.replay_rounded, size: 18),
                    label: const Text('Reopen'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed:
                        _saving ? null : () => _quickReview('COMPLETED', 100),
                    icon: const Icon(Icons.verified_outlined, size: 18),
                    label: const Text('Approve & Close'),
                  ),
                ),
              ],
            ),
          ],
          if (assignees.isNotEmpty) ...[
            const SizedBox(height: 18),
            _heading(context, 'Assignees (${assignees.length})'),
            const SizedBox(height: 6),
            for (final assignee in assignees)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  child: Text(initialsOf(_first(
                      assignee, ['employeeName', 'name', 'employeeId'], 'E'))),
                ),
                title: Text(_first(assignee,
                    ['employeeName', 'name', 'employeeId'], 'Employee')),
                subtitle: Text(_first(
                    assignee, ['individualStatus', 'status'], 'Assigned')),
                trailing: Text(
                    '${double.tryParse('${assignee['progressPercentage'] ?? 0}')?.round() ?? 0}%',
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
          ],
          const SizedBox(height: 16),
          _heading(context, 'Daily Reports (${reports.length})'),
          const SizedBox(height: 8),
          if (reports.isEmpty)
            Text('No daily reports submitted yet.',
                style: Theme.of(context).textTheme.bodySmall)
          else
            for (final report in reports)
              _activityCard(
                context,
                _formatDailyReportTitle(report),
                [
                  _first(report, ['workDoneToday', 'workDone', 'remarks'], ''),
                  if (_first(report, ['planForTomorrow'], '').isNotEmpty)
                    'Next: ${_first(report, ['planForTomorrow'], '')}',
                  if (_first(report, ['blockersOrIssues'], '').isNotEmpty)
                    'Blockers: ${_first(report, ['blockersOrIssues'], '')}',
                ].where((s) => s.isNotEmpty).join('\n'),
                formatDisplayDateTime(_first(
                    report, ['submittedAt', 'reportDate', 'createdAt'], '')),
              ),
          if (attachments.isNotEmpty ||
              isAssignee ||
              isAssigner ||
              user.isManagement) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child:
                      _heading(context, 'Attachments (${attachments.length})'),
                ),
                if (isAssignee || isAssigner || user.isManagement)
                  TextButton.icon(
                    onPressed: _saving ? null : _uploadAttachment,
                    style: TextButton.styleFrom(
                      foregroundColor: AppTokens.brandPrimary,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      visualDensity: VisualDensity.compact,
                    ),
                    icon: const Icon(Icons.upload_file_rounded, size: 17),
                    label: const Text(
                      'Add File',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            if (attachments.isEmpty)
              Text('No attachments uploaded yet.',
                  style: Theme.of(context).textTheme.bodySmall)
            else
              for (var i = 0; i < attachments.length; i++)
                _AttachmentPreviewCard(
                  att: attachments[i],
                  allAttachments: attachments,
                  index: i,
                ),
          ],
          const SizedBox(height: 16),
          _heading(context, 'Comments (${comments.length})'),
          const SizedBox(height: 8),
          for (final comment in comments)
            _activityCard(
              context,
              _first(comment, ['userName', 'employeeName'], 'Comment'),
              _first(comment, ['content', 'message'], ''),
              formatDisplayDateTime(
                  _first(comment, ['createdAt', 'updatedAt'], '')),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _commentCtrl,
                  enabled: !_saving,
                  decoration: const InputDecoration(
                    hintText: 'Add a quick comment…',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _saving ? null : _postComment,
                icon: const Icon(Icons.send_rounded, size: 19),
              ),
            ],
          ),
          if (isAssignee) ...[
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed:
                        _saving ? null : () => _update(dailyReport: false),
                    icon: const Icon(Icons.tune_rounded),
                    label: const Text('Update Status'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed:
                        _saving ? null : () => _update(dailyReport: true),
                    icon: const Icon(Icons.post_add_rounded),
                    label: const Text('Daily Report'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _formatDailyReportTitle(Map<String, dynamic> report) {
    final emp = _first(report, ['employeeName', 'employeeId'], 'Update');
    final st = _first(report, ['processStatus', 'status'], '');
    final rawPct =
        double.tryParse('${report['progressPercentage'] ?? 0}')?.round() ?? 0;
    final stLower = st.toLowerCase();
    final effectivePct =
        stLower.contains('complete') && rawPct <= 0 ? 100 : rawPct;
    final statusPart = st.isEmpty ? '' : ' · $st';
    final pctPart = effectivePct > 0 ? ' ($effectivePct%)' : '';
    return '$emp$statusPart$pctPart';
  }

  static Widget _heading(BuildContext context, String value) => Text(value,
      style: Theme.of(context)
          .textTheme
          .titleMedium
          ?.copyWith(fontWeight: FontWeight.w800));

  static Widget _activityCard(
          BuildContext context, String title, String body, String timestamp) =>
      Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (body.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(body),
              ],
              if (timestamp.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(timestamp, style: Theme.of(context).textTheme.bodySmall),
              ],
            ],
          ),
        ),
      );
}

class _AttachmentPreviewCard extends ConsumerStatefulWidget {
  const _AttachmentPreviewCard({
    required this.att,
    required this.allAttachments,
    required this.index,
  });

  final Map<String, dynamic> att;
  final List<Map<String, dynamic>> allAttachments;
  final int index;

  @override
  ConsumerState<_AttachmentPreviewCard> createState() =>
      _AttachmentPreviewCardState();
}

class _AttachmentPreviewCardState
    extends ConsumerState<_AttachmentPreviewCard> {
  bool _busy = false;
  String? _authToken;

  String get _fileName => _first(
        widget.att,
        ['fileName', 'name', 'file_name'],
        'Attachment',
      );

  String get _rawUrl => _first(
        widget.att,
        [
          'fileUrl',
          'url',
          'dataUrl',
          'file_url',
          'downloadUrl',
          'fileData',
          'content'
        ],
        '',
      );

  String get _explicitMime => _first(
        widget.att,
        ['fileType', 'mimeType', 'type', 'file_type'],
        '',
      );

  String get _fileSize => _first(
        widget.att,
        ['fileSize', 'size', 'file_size'],
        '',
      );

  String get _uploadedBy => _first(
        widget.att,
        ['uploadedBy', 'uploaded_by'],
        '',
      );

  @override
  void initState() {
    super.initState();
    _loadTokenForRemoteImage();
  }

  Future<void> _loadTokenForRemoteImage() async {
    final url = _rawUrl;
    if (FileShareHelper.isUnavailablePlaceholderUrl(url) ||
        url.toLowerCase().startsWith('data:')) {
      return;
    }
    try {
      final token = await ref.read(apiClientProvider).readAccessToken();
      if (mounted && token != null && token.isNotEmpty) {
        setState(() => _authToken = token);
      }
    } catch (_) {}
  }

  Future<String?> _readAuthToken() async {
    if (_authToken != null && _authToken!.isNotEmpty) return _authToken;
    try {
      final token = await ref.read(apiClientProvider).readAccessToken();
      _authToken = token;
      return token;
    } catch (_) {
      return null;
    }
  }

  Future<void> _downloadAttachment() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final token = await _readAuthToken();
      final resolved = await FileShareHelper.resolveAttachmentBytes(
        fileName: _fileName,
        rawUrl: _rawUrl,
        mimeType: _explicitMime.isEmpty ? null : _explicitMime,
        authToken: token,
      );
      await FileShareHelper.saveToDownloads(
        fileName: resolved.fileName,
        bytes: resolved.bytes,
        mimeType: resolved.mimeType,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text('Saved ${resolved.fileName} to Downloads'),
            action: SnackBarAction(
              label: 'Open',
              onPressed: () {
                FileShareHelper.openBytes(
                  fileName: resolved.fileName,
                  bytes: resolved.bytes,
                  mimeType: resolved.mimeType,
                );
              },
            ),
          ),
        );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _shareAttachment() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final token = await _readAuthToken();
      final resolved = await FileShareHelper.resolveAttachmentBytes(
        fileName: _fileName,
        rawUrl: _rawUrl,
        mimeType: _explicitMime.isEmpty ? null : _explicitMime,
        authToken: token,
      );
      await FileShareHelper.shareBytes(
        fileName: resolved.fileName,
        bytes: resolved.bytes,
        mimeType: resolved.mimeType,
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openPreviewOrFile() async {
    final rawUrl = _rawUrl;
    if (FileShareHelper.isUnavailablePlaceholderUrl(rawUrl)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text(
              'This file was uploaded on Web without file data (legacy 50 KB limit). Use "Add File" to re-upload it.',
            ),
          ),
        );
      return;
    }

    final mime = FileShareHelper.detectMimeType(
      _fileName,
      explicitMime: _explicitMime,
    );
    final isImage = FileShareHelper.isImageAttachment(
      fileName: _fileName,
      mimeType: mime,
      rawUrl: rawUrl,
    );

    if (isImage) {
      final galleryProofs = <ProofAttachment>[];
      var targetIdx = 0;
      for (var i = 0; i < widget.allAttachments.length; i++) {
        final item = widget.allAttachments[i];
        final itemUrl = _first(
          item,
          [
            'fileUrl',
            'url',
            'dataUrl',
            'file_url',
            'downloadUrl',
            'fileData',
            'content'
          ],
          '',
        );
        if (FileShareHelper.isUnavailablePlaceholderUrl(itemUrl)) continue;
        final itemName =
            _first(item, ['fileName', 'name', 'file_name'], 'Attachment');
        final itemSize = _first(item, ['fileSize', 'size', 'file_size'], '');
        final itemUploader = _first(item, ['uploadedBy', 'uploaded_by'], '');
        if (i == widget.index) targetIdx = galleryProofs.length;
        galleryProofs.add(
          ProofAttachment(
            title: itemName,
            url: itemUrl,
            subtitle: [
              if (itemSize.isNotEmpty) itemSize,
              if (itemUploader.isNotEmpty) itemUploader,
            ].join(' · '),
          ),
        );
      }
      if (galleryProofs.isNotEmpty && mounted) {
        await showProofViewerDialog(
          context,
          ref: ref,
          proofs: galleryProofs,
          initialIndex: targetIdx,
        );
        return;
      }
    }

    // For PDFs and non-image documents, resolve & open directly via native viewer.
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final token = await _readAuthToken();
      final resolved = await FileShareHelper.resolveAttachmentBytes(
        fileName: _fileName,
        rawUrl: rawUrl,
        mimeType: _explicitMime.isEmpty ? null : _explicitMime,
        authToken: token,
      );
      await FileShareHelper.openBytes(
        fileName: resolved.fileName,
        bytes: resolved.bytes,
        mimeType: resolved.mimeType,
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = _fileName;
    final url = _rawUrl;
    final isPlaceholder = FileShareHelper.isUnavailablePlaceholderUrl(url);
    final mime = FileShareHelper.detectMimeType(
      name,
      explicitMime: _explicitMime,
    );
    final isImage = !isPlaceholder &&
        FileShareHelper.isImageAttachment(
          fileName: name,
          mimeType: mime,
          rawUrl: url,
        );
    final isPdf = !isPlaceholder &&
        (mime == 'application/pdf' || isPdfProof(name) || isPdfProof(url));
    final isSheet = !isPlaceholder &&
        (mime.contains('excel') ||
            mime.contains('spreadsheet') ||
            mime == 'text/csv');

    final inlineBytes = isImage ? tryDecodeDataUriBytes(url) : null;
    final resolvedUrl = isPlaceholder ? '' : resolveProofUrl(url);
    final isRemoteImage = isImage &&
        inlineBytes == null &&
        resolvedUrl.isNotEmpty &&
        !resolvedUrl.toLowerCase().startsWith('data:');

    final IconData leadingIcon;
    final Color iconBg;
    final Color iconFg;
    if (isPlaceholder) {
      leadingIcon = Icons.cloud_off_rounded;
      iconBg = const Color(0xFFFEF3C7);
      iconFg = const Color(0xFFD97706);
    } else if (isImage) {
      leadingIcon = Icons.image_outlined;
      iconBg = AppTokens.brandTint;
      iconFg = AppTokens.brandPrimary;
    } else if (isPdf) {
      leadingIcon = Icons.picture_as_pdf_outlined;
      iconBg = const Color(0xFFFEE2E2);
      iconFg = const Color(0xFFDC2626);
    } else if (isSheet) {
      leadingIcon = Icons.table_chart_outlined;
      iconBg = const Color(0xFFDCFCE7);
      iconFg = const Color(0xFF16A34A);
    } else {
      leadingIcon = Icons.description_outlined;
      iconBg = AppTokens.brandTint;
      iconFg = AppTokens.brandPrimary;
    }

    final metaParts = <String>[
      if (_fileSize.isNotEmpty) _fileSize,
      if (isPlaceholder)
        'Not synced from Web · Re-upload to download'
      else if (_uploadedBy.isNotEmpty)
        _uploadedBy,
    ];
    final subtitleText = metaParts.isEmpty
        ? 'Tap to preview or download'
        : metaParts.join(' · ');

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (inlineBytes != null)
            InkWell(
              onTap: _openPreviewOrFile,
              child: Stack(
                children: [
                  Image.memory(
                    inlineBytes,
                    height: 156,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                  ),
                  Positioned(
                    right: 10,
                    bottom: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.62),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.zoom_in_rounded,
                              size: 13, color: Colors.white),
                          SizedBox(width: 4),
                          Text(
                            'Preview',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            )
          else if (isRemoteImage)
            InkWell(
              onTap: _openPreviewOrFile,
              child: Image.network(
                resolvedUrl,
                height: 156,
                width: double.infinity,
                fit: BoxFit.cover,
                headers: _authToken != null && _authToken!.isNotEmpty
                    ? {'Authorization': 'Bearer $_authToken'}
                    : null,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          InkWell(
            onTap: _openPreviewOrFile,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: iconBg,
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Icon(leadingIcon, size: 20, color: iconFg),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF1E293B),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitleText,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11.5,
                            color: isPlaceholder
                                ? const Color(0xFFB45309)
                                : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),
                  if (_busy)
                    const Padding(
                      padding: EdgeInsets.all(8),
                      child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppTokens.brandPrimary,
                        ),
                      ),
                    )
                  else if (!isPlaceholder) ...[
                    Material(
                      color: AppTokens.brandTint,
                      borderRadius: BorderRadius.circular(10),
                      child: IconButton(
                        tooltip: 'Download',
                        constraints: const BoxConstraints.tightFor(
                            width: 38, height: 38),
                        padding: EdgeInsets.zero,
                        onPressed: _downloadAttachment,
                        icon: const Icon(
                          Icons.download_rounded,
                          size: 19,
                          color: AppTokens.brandPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    IconButton(
                      tooltip: 'Share',
                      constraints:
                          const BoxConstraints.tightFor(width: 36, height: 36),
                      padding: EdgeInsets.zero,
                      onPressed: _shareAttachment,
                      icon: const Icon(
                        Icons.share_outlined,
                        size: 18,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ] else
                    IconButton(
                      tooltip: 'Why unavailable',
                      constraints:
                          const BoxConstraints.tightFor(width: 36, height: 36),
                      padding: EdgeInsets.zero,
                      onPressed: _openPreviewOrFile,
                      icon: const Icon(
                        Icons.info_outline_rounded,
                        size: 19,
                        color: Color(0xFFD97706),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TaskProgressForm extends StatefulWidget {
  const _TaskProgressForm({
    required this.initialStatus,
    required this.initialProgress,
    required this.requireWorkSummary,
  });

  final String initialStatus;
  final double initialProgress;
  final bool requireWorkSummary;

  @override
  State<_TaskProgressForm> createState() => _TaskProgressFormState();
}

class _TaskProgressFormState extends State<_TaskProgressForm> {
  final _formKey = GlobalKey<FormState>();
  final _summary = TextEditingController();
  final _plan = TextEditingController();
  final _blockers = TextEditingController();
  final _hours = TextEditingController();
  late String _status;
  late double _progress;
  XFile? _evidence;
  bool _processing = false;
  String? _error;

  static const statuses = [
    'OPEN',
    'IN PROGRESS',
    'UNDER REVIEW',
    'COMPLETED',
  ];

  @override
  void initState() {
    super.initState();
    final normalized = widget.initialStatus.trim().toUpperCase();
    _status = statuses.contains(normalized) ? normalized : 'OPEN';
    _progress = widget.initialProgress.clamp(0, 100);
  }

  @override
  void dispose() {
    _summary.dispose();
    _plan.dispose();
    _blockers.dispose();
    _hours.dispose();
    super.dispose();
  }

  Future<void> _pickEvidence() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose image'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    final image = await ImagePicker().pickImage(
      source: source,
      imageQuality: 72,
      maxWidth: 1800,
      maxHeight: 1800,
    );
    if (image != null && mounted) setState(() => _evidence = image);
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false) || _processing) return;
    setState(() {
      _processing = true;
      _error = null;
    });
    try {
      Map<String, dynamic>? attachment;
      final evidence = _evidence;
      if (evidence != null) {
        final bytes = await evidence.readAsBytes();
        if (bytes.length > 5 * 1024 * 1024) {
          throw Exception('Attachment must be 5 MB or smaller.');
        }
        final extension = evidence.name.split('.').last.toLowerCase();
        final mime = extension == 'png' ? 'image/png' : 'image/jpeg';
        attachment = {
          'id': const Uuid().v4(),
          'fileName': evidence.name,
          'fileSize': '${(bytes.length / 1024).ceil()} KB',
          'fileType': mime,
          'fileUrl': 'data:$mime;base64,${base64Encode(bytes)}',
          'uploadedAt': DateTime.now().toUtc().toIso8601String(),
        };
      }
      if (!mounted) return;
      Navigator.pop(context, <String, dynamic>{
        'status': _status,
        'progress': _status == 'COMPLETED' ? 100 : _progress.round(),
        'summary': _summary.text.trim(),
        'plan': _plan.text.trim(),
        'blockers': _blockers.text.trim(),
        'hours': double.tryParse(_hours.text.trim()),
        if (attachment != null) 'attachment': attachment,
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 28),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  widget.requireWorkSummary
                      ? 'Submit daily report'
                      : 'Update task status',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 18),
                DropdownButtonFormField<String>(
                  initialValue: _status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: statuses
                      .map((value) => DropdownMenuItem(
                          value: value, child: Text(_mobileTaskStatus(value))))
                      .toList(),
                  onChanged: _processing
                      ? null
                      : (value) => setState(() {
                            _status = value!;
                            if (_status == 'COMPLETED') _progress = 100;
                          }),
                ),
                const SizedBox(height: 16),
                Text('Progress: ${_progress.round()}%',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                Slider(
                  value: _progress,
                  min: 0,
                  max: 100,
                  divisions: 20,
                  label: '${_progress.round()}%',
                  onChanged: _processing || _status == 'COMPLETED'
                      ? null
                      : (value) => setState(() => _progress = value),
                ),
                if (widget.requireWorkSummary) ...[
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _summary,
                    minLines: 3,
                    maxLines: 6,
                    decoration:
                        const InputDecoration(labelText: 'Work done today'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Enter today\'s work summary.'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _plan,
                    minLines: 2,
                    maxLines: 4,
                    decoration:
                        const InputDecoration(labelText: 'Plan for tomorrow'),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _blockers,
                    minLines: 2,
                    maxLines: 4,
                    decoration:
                        const InputDecoration(labelText: 'Blockers or issues'),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _hours,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Hours spent'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _processing ? null : _pickEvidence,
                    icon: const Icon(Icons.attach_file_rounded),
                    label: Text(_evidence == null
                        ? 'Attach work evidence'
                        : _evidence!.name),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _processing ? null : _submit,
                  icon: const Icon(Icons.check_rounded),
                  label: Text(_processing ? 'Saving...' : 'Save update'),
                ),
              ],
            ),
          ),
        ),
      );
}

class _TaskForm extends ConsumerStatefulWidget {
  const _TaskForm({this.existingTask});
  final Map<String, dynamic>? existingTask;

  @override
  ConsumerState<_TaskForm> createState() => _TaskFormState();
}

class _TaskFormState extends ConsumerState<_TaskForm> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  late Future<List<Map<String, dynamic>>> _employees;
  Map<String, dynamic>? _assignee;
  List<Map<String, dynamic>> _selectedEmployees = const [];
  String? _department;
  DateTime _start = DateTime.now();
  DateTime _due = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _dueTime = const TimeOfDay(hour: 17, minute: 30);
  String _priority = 'Medium';
  bool _saving = false;
  bool _hydratedExisting = false;
  String? _error;

  bool get _isEdit => widget.existingTask != null;

  @override
  void initState() {
    super.initState();
    final existing = widget.existingTask;
    if (existing != null) {
      _title.text = _first(existing, ['title', 'task_name'], '');
      _description.text = _first(existing, ['description'], '');
      final prio = _first(existing, ['priority'], 'Medium');
      if (const ['Low', 'Medium', 'High', 'Urgent'].contains(prio)) {
        _priority = prio;
      }
      final dept = _first(existing, ['department'], '');
      if (dept.isNotEmpty) _department = dept;
      final parsedStart =
          DateTime.tryParse(_first(existing, ['startDate', 'start_date'], ''));
      if (parsedStart != null) _start = parsedStart;
      final parsedDue =
          DateTime.tryParse(_first(existing, ['dueDate', 'due_date'], ''));
      if (parsedDue != null) _due = parsedDue;
    }
    _employees = ref.read(hrmsRepositoryProvider).employees(activeOnly: true);
  }

  void _hydrateFromEmployees(List<Map<String, dynamic>> employees) {
    if (_hydratedExisting || widget.existingTask == null) return;
    _hydratedExisting = true;
    final existing = widget.existingTask!;
    final respId =
        _first(existing, ['responsiblePersonId', 'responsible_person_id'], '')
            .toLowerCase();
    for (final emp in employees) {
      if (_employeeCode(emp).toLowerCase() == respId ||
          (emp['id'] ?? '').toString().toLowerCase() == respId) {
        _assignee = emp;
        break;
      }
    }
    final existingAssignees = _maps(existing['assignees']);
    final matched = <Map<String, dynamic>>[];
    for (final a in existingAssignees) {
      final code = _first(a, ['employeeId', 'employee_id'], '').toLowerCase();
      for (final emp in employees) {
        if (_employeeCode(emp).toLowerCase() == code) {
          matched.add(emp);
          break;
        }
      }
    }
    if (matched.isNotEmpty) {
      _selectedEmployees = matched;
    } else if (_assignee != null) {
      _selectedEmployees = [_assignee!];
    }
  }

  Future<void> _pickDate() async {
    final firstAllowed = _isEdit
        ? DateTime(2020)
        : DateTime.now().subtract(const Duration(days: 1));
    final date = await showDatePicker(
      context: context,
      initialDate: _due.isBefore(firstAllowed) ? firstAllowed : _due,
      firstDate: firstAllowed,
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (date != null) setState(() => _due = date);
  }

  Future<void> _pickStartDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _start,
      firstDate: DateTime(2020),
      lastDate: _due.isAfter(DateTime.now())
          ? _due
          : DateTime.now().add(const Duration(days: 730)),
    );
    if (date != null) setState(() => _start = date);
  }

  Future<void> _pickDueTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: _dueTime,
    );
    if (time != null) setState(() => _dueTime = time);
  }

  Future<void> _save({required bool draft}) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_assignee == null) {
      setState(() => _error = 'Select a responsible employee.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final user = ref.read(authControllerProvider).value!;
      final employeeId = _employeeCode(_assignee!);
      final employeeName =
          _employeeDisplayName(_assignee!, fallback: employeeId);
      final department = (_assignee!['department'] ??
              _assignee!['department_name'] ??
              _department ??
              'General')
          .toString();
      final selected = _selectedEmployees.isEmpty
          ? <Map<String, dynamic>>[_assignee!]
          : _selectedEmployees;
      final assignees = selected.map((employee) {
        final selectedId = _employeeCode(employee);
        return <String, dynamic>{
          'employeeId': selectedId,
          'employeeName': _employeeDisplayName(employee, fallback: selectedId),
          'employeeDepartment':
              (employee['department'] ?? department).toString(),
          'designation': (employee['designation'] ?? '').toString(),
          'role': selectedId == employeeId ? 'RESPONSIBLE' : 'ASSIGNEE',
          'individualStatus': 'ASSIGNED',
          'progressPercentage': 0,
        };
      }).toList(growable: false);
      final due = DateFormat('yyyy-MM-dd').format(_due);
      final start = DateFormat('yyyy-MM-dd').format(_start);
      final dueTime =
          '${_dueTime.hour.toString().padLeft(2, '0')}:${_dueTime.minute.toString().padLeft(2, '0')}';

      if (_isEdit) {
        final existing = widget.existingTask!;
        final taskId = _first(existing, ['id'], '');
        final nested = existing['task_data'] is Map
            ? Map<String, dynamic>.from(existing['task_data'] as Map)
            : <String, dynamic>{...existing};
        final nextStatus = draft ? 'DRAFT' : _taskStatus(existing);
        final nextProgress = num.tryParse(
                '${existing['overallProgress'] ?? existing['overall_progress'] ?? 0}') ??
            0;
        nested
          ..['title'] = _title.text.trim()
          ..['description'] = _description.text.trim()
          ..['responsiblePersonId'] = employeeId
          ..['responsiblePersonName'] = employeeName
          ..['department'] = department
          ..['priority'] = _priority
          ..['startDate'] = start
          ..['dueDate'] = due
          ..['dueTime'] = dueTime
          ..['overallStatus'] = nextStatus
          ..['assignees'] = assignees
          ..['assignedEmployees'] =
              assignees.map((e) => e['employeeId']).toList()
          ..['updatedAt'] = DateTime.now().toUtc().toIso8601String();

        await ref.read(hrmsRepositoryProvider).updateTask(
          taskId,
          status: nextStatus,
          progress: nextProgress,
          taskData: nested,
          extraFields: {
            'title': _title.text.trim(),
            'responsible_person_id': employeeId,
            'responsible_person_name': employeeName,
            'department': department,
            'priority': _priority,
            'due_date': due,
          },
        );
      } else {
        final id = 'TSK-${const Uuid().v4()}';
        final number =
            'TSK-${DateTime.now().millisecondsSinceEpoch.toString().substring(5)}';
        final taskData = <String, dynamic>{
          'id': id,
          'taskNumber': number,
          'title': _title.text.trim(),
          'description': _description.text.trim(),
          'assignedBy': user.employeeId,
          'assignedByName': user.name,
          'responsiblePersonId': employeeId,
          'responsiblePersonName': employeeName,
          'department': department,
          'priority': _priority,
          'startDate': start,
          'dueDate': due,
          'dueTime': dueTime,
          'overallStatus': draft ? 'DRAFT' : 'OPEN',
          'overallProgress': 0,
          'assignees': assignees,
          'assignedEmployees':
              assignees.map((employee) => employee['employeeId']).toList(),
          'dailyReports': const [],
          'comments': const [],
          'attachments': const [],
          'createdAt': DateTime.now().toUtc().toIso8601String(),
        };
        await ref.read(hrmsRepositoryProvider).createTask({
          'id': id,
          'task_number': number,
          'title': _title.text.trim(),
          'assigned_by': user.employeeId,
          'responsible_person_id': employeeId,
          'responsible_person_name': employeeName,
          'department': department,
          'priority': _priority,
          'due_date': due,
          'overall_status': draft ? 'DRAFT' : 'OPEN',
          'overall_progress': 0,
          'task_data': taskData,
        });
      }
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickResponsible(List<Map<String, dynamic>> employees) async {
    final selected = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _TaskEmployeePicker(
        employees: employees,
        department: _department,
        title: 'Responsible employee',
      ),
    );
    if (selected == null) return;
    setState(() {
      _assignee = selected;
      final department = (selected['department'] ?? '').toString().trim();
      if (department.isNotEmpty) _department = department;
      final code = _employeeCode(selected);
      _selectedEmployees = [
        selected,
        ..._selectedEmployees.where((item) => _employeeCode(item) != code),
      ];
      _error = null;
    });
  }

  Future<void> _pickAssignees(List<Map<String, dynamic>> employees) async {
    if (_assignee == null) {
      setState(() => _error = 'Select the responsible employee first.');
      return;
    }
    final selected = await showModalBottomSheet<List<Map<String, dynamic>>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _TaskEmployeePicker(
        employees: employees,
        department: _department,
        title: 'Task assignees',
        multiple: true,
        initialSelection: _selectedEmployees,
        requiredEmployee: _assignee,
      ),
    );
    if (selected != null) setState(() => _selectedEmployees = selected);
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 8, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(_isEdit ? 'Edit task' : 'Assign task',
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 18),
                  TextFormField(
                    controller: _title,
                    enabled: !_saving,
                    decoration: const InputDecoration(labelText: 'Task title'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Enter a task title.'
                        : null,
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _description,
                    enabled: !_saving,
                    minLines: 3,
                    maxLines: 6,
                    decoration: const InputDecoration(labelText: 'Description'),
                  ),
                  const SizedBox(height: 14),
                  FutureBuilder<List<Map<String, dynamic>>>(
                    future: _employees,
                    builder: (context, snapshot) {
                      if (snapshot.connectionState != ConnectionState.done) {
                        return const LinearProgressIndicator();
                      }
                      if (snapshot.hasError) {
                        return AppErrorView(
                          error: snapshot.error!,
                          onRetry: () => setState(() => _employees = ref
                              .read(hrmsRepositoryProvider)
                              .employees(activeOnly: true)),
                        );
                      }
                      final employees = (snapshot.data ?? const [])
                          .where((employee) =>
                              _employeeCode(employee).isNotEmpty &&
                              _employeeDisplayName(employee).isNotEmpty)
                          .toList(growable: false);
                      _hydrateFromEmployees(employees);
                      final departments = employees
                          .map((employee) =>
                              (employee['department'] ?? '').toString().trim())
                          .where((value) => value.isNotEmpty)
                          .toSet()
                          .toList()
                        ..sort();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          DropdownButtonFormField<String>(
                            initialValue: departments.contains(_department)
                                ? _department
                                : null,
                            isExpanded: true,
                            decoration:
                                const InputDecoration(labelText: 'Department'),
                            hint: const Text('All departments'),
                            items: departments
                                .map((value) => DropdownMenuItem(
                                    value: value, child: Text(value)))
                                .toList(),
                            onChanged: _saving
                                ? null
                                : (value) => setState(() {
                                      _department = value;
                                    }),
                          ),
                          const SizedBox(height: 14),
                          _EmployeeSelectionField(
                            label: 'Responsible employee',
                            employee: _assignee,
                            enabled: !_saving,
                            onTap: () => _pickResponsible(employees),
                          ),
                          const SizedBox(height: 14),
                          OutlinedButton.icon(
                            onPressed: _saving
                                ? null
                                : () => _pickAssignees(employees),
                            icon: const Icon(Icons.groups_2_outlined),
                            label: Text(_selectedEmployees.isEmpty
                                ? 'Add team assignees'
                                : '${_selectedEmployees.length} assignee${_selectedEmployees.length == 1 ? '' : 's'} selected'),
                          ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    initialValue: _priority,
                    decoration: const InputDecoration(labelText: 'Priority'),
                    items: const ['Low', 'Medium', 'High', 'Urgent']
                        .map((value) =>
                            DropdownMenuItem(value: value, child: Text(value)))
                        .toList(),
                    onChanged: _saving
                        ? null
                        : (value) => setState(() => _priority = value!),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: InkWell(
                          onTap: _saving ? null : _pickStartDate,
                          child: InputDecorator(
                            decoration: const InputDecoration(
                              labelText: 'Start date',
                              suffixIcon: Icon(Icons.calendar_today_rounded),
                            ),
                            child:
                                Text(DateFormat('dd MMM yyyy').format(_start)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: InkWell(
                          onTap: _saving ? null : _pickDate,
                          child: InputDecorator(
                            decoration: const InputDecoration(
                              labelText: 'Due date',
                              suffixIcon: Icon(Icons.event_available_rounded),
                            ),
                            child: Text(DateFormat('dd MMM yyyy').format(_due)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  InkWell(
                    onTap: _saving ? null : _pickDueTime,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Due time',
                        suffixIcon: Icon(Icons.schedule_rounded),
                      ),
                      child: Text(_dueTime.format(context)),
                    ),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ),
                  const SizedBox(height: 20),
                  Row(children: [
                    if (!_isEdit) ...[
                      Expanded(
                          child: OutlinedButton(
                        onPressed: _saving ? null : () => _save(draft: true),
                        child: const Text('Save draft'),
                      )),
                      const SizedBox(width: 10),
                    ],
                    Expanded(
                        child: FilledButton(
                      onPressed: _saving ? null : () => _save(draft: false),
                      child: Text(_saving
                          ? 'Saving…'
                          : _isEdit
                              ? 'Save changes'
                              : 'Assign Task'),
                    )),
                  ]),
                ]),
          ),
        ),
      );
}

class _EmployeeSelectionField extends StatelessWidget {
  const _EmployeeSelectionField({
    required this.label,
    required this.employee,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final Map<String, dynamic>? employee;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(12),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            suffixIcon: const Icon(Icons.search_rounded),
          ),
          child: employee == null
              ? Text('Search and select employee',
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant))
              : _EmployeeIdentity(employee: employee!),
        ),
      );
}

class _TaskEmployeePicker extends StatefulWidget {
  const _TaskEmployeePicker({
    required this.employees,
    required this.title,
    this.department,
    this.multiple = false,
    this.initialSelection = const [],
    this.requiredEmployee,
  });

  final List<Map<String, dynamic>> employees;
  final String title;
  final String? department;
  final bool multiple;
  final List<Map<String, dynamic>> initialSelection;
  final Map<String, dynamic>? requiredEmployee;

  @override
  State<_TaskEmployeePicker> createState() => _TaskEmployeePickerState();
}

class _TaskEmployeePickerState extends State<_TaskEmployeePicker> {
  final _search = TextEditingController();
  late String? _department;
  late final Map<String, Map<String, dynamic>> _selected;

  @override
  void initState() {
    super.initState();
    _department = widget.department;
    _selected = {
      for (final employee in widget.initialSelection)
        _employeeCode(employee): employee,
    }..remove('');
    final required = widget.requiredEmployee;
    if (required != null && _employeeCode(required).isNotEmpty) {
      _selected[_employeeCode(required)] = required;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final departments = widget.employees
        .map((employee) => (employee['department'] ?? '').toString().trim())
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    final query = _search.text.trim().toLowerCase();
    final visible = widget.employees.where((employee) {
      final department = (employee['department'] ?? '').toString().trim();
      if (_department != null &&
          _department!.isNotEmpty &&
          department != _department) {
        return false;
      }
      if (query.isEmpty) return true;
      return [
        _employeeDisplayName(employee),
        _employeeCode(employee),
        department,
        (employee['designation'] ?? '').toString(),
      ].any((value) => value.toLowerCase().contains(query));
    }).toList(growable: false);

    return FractionallySizedBox(
      heightFactor: .9,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [
                  Expanded(
                    child: Text(widget.title,
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w800)),
                  ),
                  if (widget.multiple)
                    FilledButton(
                      onPressed: _selected.isEmpty
                          ? null
                          : () => Navigator.pop(context,
                              _selected.values.toList(growable: false)),
                      child: Text('Confirm (${_selected.length})'),
                    ),
                ]),
                const SizedBox(height: 14),
                SearchBar(
                  controller: _search,
                  hintText: 'Search name or employee ID',
                  leading: const Icon(Icons.search_rounded),
                  onChanged: (_) => setState(() {}),
                  trailing: _search.text.isEmpty
                      ? null
                      : [
                          IconButton(
                            onPressed: () {
                              _search.clear();
                              setState(() {});
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                        ],
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue:
                      departments.contains(_department) ? _department : '',
                  isExpanded: true,
                  decoration:
                      const InputDecoration(labelText: 'Department filter'),
                  items: [
                    const DropdownMenuItem(
                        value: '', child: Text('All departments')),
                    ...departments.map((value) =>
                        DropdownMenuItem(value: value, child: Text(value))),
                  ],
                  onChanged: (value) =>
                      setState(() => _department = value ?? ''),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: visible.isEmpty
                ? const EmptyState(
                    icon: Icons.person_search_outlined,
                    title: 'No active employees found',
                    message: 'Try another name, employee ID, or department.',
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                    itemCount: visible.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final employee = visible[index];
                      final code = _employeeCode(employee);
                      final selected = _selected.containsKey(code);
                      final requiredCode = widget.requiredEmployee == null
                          ? ''
                          : _employeeCode(widget.requiredEmployee!);
                      return ListTile(
                        minTileHeight: 70,
                        leading: _EmployeeAvatar(employee: employee),
                        title: _EmployeeIdentity(employee: employee),
                        trailing: widget.multiple
                            ? Checkbox(
                                value: selected,
                                onChanged: code == requiredCode
                                    ? null
                                    : (_) => _toggle(employee),
                              )
                            : const Icon(Icons.chevron_right_rounded),
                        onTap: widget.multiple
                            ? () => _toggle(employee)
                            : () => Navigator.pop(context, employee),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  void _toggle(Map<String, dynamic> employee) {
    final code = _employeeCode(employee);
    final requiredCode = widget.requiredEmployee == null
        ? ''
        : _employeeCode(widget.requiredEmployee!);
    if (code == requiredCode) return;
    setState(() {
      if (_selected.containsKey(code)) {
        _selected.remove(code);
      } else {
        _selected[code] = employee;
      }
    });
  }
}

class _EmployeeIdentity extends StatelessWidget {
  const _EmployeeIdentity({required this.employee});
  final Map<String, dynamic> employee;

  @override
  Widget build(BuildContext context) {
    final code = _employeeCode(employee);
    final department = (employee['department'] ?? '').toString().trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(_employeeDisplayName(employee, fallback: code),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 3),
        Text([code, department].where((value) => value.isNotEmpty).join(' • '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _EmployeeAvatar extends StatelessWidget {
  const _EmployeeAvatar({required this.employee});
  final Map<String, dynamic> employee;

  @override
  Widget build(BuildContext context) {
    final url = (employee['avatarUrl'] ?? '').toString().trim();
    final name =
        _employeeDisplayName(employee, fallback: _employeeCode(employee));
    return CircleAvatar(
      foregroundImage: url.startsWith('https://') ? NetworkImage(url) : null,
      child: Text(_initials(name)),
    );
  }
}

// -----------------------------------------------------------------------------
// Task Identity & Progress Helpers
// -----------------------------------------------------------------------------

bool _matchesUserIdentityOrName(AppUser user, dynamic raw) {
  if (raw == null) return false;
  if (user.matchesIdentity(raw)) return true;
  final clean = raw.toString().trim().toLowerCase();
  final myName = user.name.trim().toLowerCase();
  if (clean.isEmpty || myName.isEmpty) return false;
  if (clean == myName || clean.startsWith('$myName (')) return true;
  final stripped = clean.replaceAll(RegExp(r'\s*\([^)]*\)\s*$'), '').trim();
  return stripped == myName;
}

bool _isTaskAssignedToUser(Map<String, dynamic> task, AppUser user) {
  if (_matchesUserIdentityOrName(user, task['responsiblePersonId']) ||
      _matchesUserIdentityOrName(user, task['responsible_person_id']) ||
      _matchesUserIdentityOrName(user, task['responsiblePersonName']) ||
      _matchesUserIdentityOrName(user, task['responsible_person_name'])) {
    return true;
  }
  final assignees = task['assignees'];
  if (assignees is List) {
    for (final a in assignees) {
      if (a is String && _matchesUserIdentityOrName(user, a)) return true;
      if (a is Map &&
          (_matchesUserIdentityOrName(user, a['employeeId']) ||
              _matchesUserIdentityOrName(user, a['employee_id']) ||
              _matchesUserIdentityOrName(user, a['employeeName']) ||
              _matchesUserIdentityOrName(user, a['name']))) {
        return true;
      }
    }
  }
  final assignedEmps = task['assignedEmployees'];
  if (assignedEmps is List) {
    if (assignedEmps.any((e) => _matchesUserIdentityOrName(user, e))) {
      return true;
    }
  }
  return false;
}

bool _isTaskAssignedByUser(Map<String, dynamic> task, AppUser user) =>
    _matchesUserIdentityOrName(user, task['assignedBy']) ||
    _matchesUserIdentityOrName(user, task['assigned_by']) ||
    _matchesUserIdentityOrName(user, task['assignedByName']) ||
    _matchesUserIdentityOrName(user, task['assigned_by_name']) ||
    _matchesUserIdentityOrName(user, task['createdById']) ||
    _matchesUserIdentityOrName(user, task['created_by']);

String _taskStatus(Map<String, dynamic> task) =>
    _first(task, ['overallStatus', 'overall_status', 'status'], 'OPEN');

bool _isTaskDone(Map<String, dynamic> task) {
  final st = _taskStatus(task).toLowerCase();
  return st.contains('complete') || st == 'closed';
}

bool _isTaskDraft(Map<String, dynamic> task) =>
    _taskStatus(task).toLowerCase() == 'draft';

bool _isTaskOverdue(Map<String, dynamic> task, DateTime todayFloor) {
  if (_isTaskDone(task) || _isTaskDraft(task)) return false;
  final due = DateTime.tryParse('${task['due_date'] ?? task['dueDate'] ?? ''}');
  return due != null && due.isBefore(todayFloor);
}

num _applyAssigneeProgress({
  required Map<String, dynamic> nested,
  required AppUser user,
  required String status,
  required num progress,
  required String nowIso,
}) {
  final assignees = _maps(nested['assignees']);
  if (assignees.isEmpty) return progress;
  final updated = <Map<String, dynamic>>[];
  var touched = false;
  for (final a in assignees) {
    final copy = Map<String, dynamic>.from(a);
    if (_matchesUserIdentityOrName(user, copy['employeeId']) ||
        _matchesUserIdentityOrName(user, copy['employee_id']) ||
        _matchesUserIdentityOrName(user, copy['employeeName'])) {
      copy['individualStatus'] = status;
      copy['progressPercentage'] = progress;
      copy['lastUpdatedAt'] = nowIso;
      touched = true;
    }
    updated.add(copy);
  }
  nested['assignees'] = updated;
  if (!touched || updated.length == 1) return progress;
  final avg = updated.fold<double>(
        0,
        (s, a) => s + (double.tryParse('${a['progressPercentage'] ?? 0}') ?? 0),
      ) /
      updated.length;
  return avg.round();
}

String _mobileTaskStatus(String value) => switch (value.toUpperCase()) {
      'IN PROGRESS' => 'In Progress',
      'UNDER REVIEW' => 'Under Review',
      'COMPLETED' => 'Completed',
      _ => 'Pending',
    };

List<Map<String, dynamic>> _maps(dynamic value) => value is List
    ? value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false)
    : const [];

String _first(Map<String, dynamic> source, List<String> keys, String fallback) {
  for (final key in keys) {
    final value = source[key];
    if (value != null && value.toString().trim().isNotEmpty) {
      return value.toString().trim();
    }
  }
  return fallback;
}

String _employeeCode(Map<String, dynamic> employee) =>
    (employee['employeeId'] ?? employee['employee_id'] ?? employee['id'] ?? '')
        .toString()
        .trim();

String _employeeDisplayName(Map<String, dynamic> employee,
    {String fallback = ''}) {
  for (final key in ['name', 'fullName', 'full_name', 'employeeName']) {
    final value = employee[key]?.toString().trim() ?? '';
    if (value.isNotEmpty && value.toLowerCase() != 'employee') return value;
  }
  final combined = [
    employee['firstName'] ?? employee['first_name'],
    employee['lastName'] ?? employee['last_name'],
  ]
      .map((value) => value?.toString().trim() ?? '')
      .where((value) => value.isNotEmpty)
      .join(' ');
  return combined.isNotEmpty ? combined : fallback;
}

String _initials(String name) => name
    .trim()
    .split(RegExp(r'\s+'))
    .take(2)
    .where((part) => part.isNotEmpty)
    .map((part) => part[0].toUpperCase())
    .join();
