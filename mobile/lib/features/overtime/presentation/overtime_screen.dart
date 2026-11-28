import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/overtime_calculator.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../auth/application/auth_controller.dart';

/// Daily Overtime screen showing daily OT hours — and OT ₹ amount strictly
/// for employees covered by an active Web OT Policy (other employees display
/// OT hours only).
class OvertimeScreen extends ConsumerStatefulWidget {
  const OvertimeScreen({super.key});

  @override
  ConsumerState<OvertimeScreen> createState() => _OvertimeScreenState();
}

class _OvertimeScreenState extends ConsumerState<OvertimeScreen> {
  late int _month;
  late int _year;
  String _search = '';
  late Future<_OvertimeScreenData> _future;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = now.month;
    _year = now.year;
    _future = _load();
  }

  Future<_OvertimeScreenData> _load() async {
    final user = ref.read(authControllerProvider).value ??
        await ref.read(authControllerProvider.future);
    if (user == null) {
      return const _OvertimeScreenData(
        entries: [],
        selfEligibility: null,
        isManagementView: false,
      );
    }

    final isMgmt = user.isCeo || user.isHr;
    final bundle = await ref.read(hrmsRepositoryProvider).overtimeBundle(
          month: _month,
          year: _year,
          employeeId: isMgmt ? null : user.employeeId,
        );

    final fallbackSelf = <String, dynamic>{
      'id': user.id,
      'employeeId': user.employeeId,
      'employee_id': user.employeeId,
      'name': user.name,
      'department': user.department,
      'designation': user.designation,
      'role': user.role,
    };

    final entries = OvertimeCalculator.buildDailyEntries(
      month: _month,
      year: _year,
      employees: bundle.employees,
      attendanceRecords: bundle.attendanceRecords,
      overtimeRecords: bundle.overtimeRecords,
      departmentOtPolicies: bundle.departmentOtPolicies,
      employeeOtPolicies: bundle.employeeOtPolicies,
      overtimePolicy: bundle.overtimePolicy,
      payrollConfig: bundle.payrollConfig,
      filterEmployeeId: isMgmt ? null : user.employeeId,
      fallbackCurrentEmployee: fallbackSelf,
    );

    OvertimeEligibility? selfElig;
    if (!isMgmt) {
      final matchedSelf = bundle.employees.firstWhere(
        (e) {
          final code = (e['employeeId'] ?? e['employee_id'] ?? '')
              .toString()
              .trim()
              .toLowerCase();
          final uid = (e['id'] ?? '').toString().trim().toLowerCase();
          return (user.employeeId.isNotEmpty &&
                  code == user.employeeId.trim().toLowerCase()) ||
              (user.id.isNotEmpty && uid == user.id.trim().toLowerCase());
        },
        orElse: () => fallbackSelf,
      );
      selfElig = OvertimeCalculator.resolveEligibility(
        employee: matchedSelf,
        departmentOtPolicies: bundle.departmentOtPolicies,
        employeeOtPolicies: bundle.employeeOtPolicies,
        overtimePolicy: bundle.overtimePolicy,
      );
    }

    return _OvertimeScreenData(
      entries: entries,
      selfEligibility: selfElig,
      isManagementView: isMgmt,
    );
  }

  void _reload({bool invalidate = false}) {
    if (invalidate) {
      ref.read(hrmsRepositoryProvider).invalidatePayrollCache();
    }
    setState(() => _future = _load());
  }

  Future<void> _choosePeriod() async {
    var month = _month;
    var year = _year;
    final accepted = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Select Overtime Month',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<int>(
                initialValue: month,
                decoration: const InputDecoration(labelText: 'Month'),
                items: [
                  for (var value = 1; value <= 12; value++)
                    DropdownMenuItem(
                      value: value,
                      child:
                          Text(DateFormat.MMMM().format(DateTime(2024, value))),
                    ),
                ],
                onChanged: (v) {
                  if (v != null) setSheetState(() => month = v);
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                initialValue: year,
                decoration: const InputDecoration(labelText: 'Year'),
                items: [
                  for (var value = DateTime.now().year + 1;
                      value >= DateTime.now().year - 3;
                      value--)
                    DropdownMenuItem(value: value, child: Text('$value')),
                ],
                onChanged: (v) {
                  if (v != null) setSheetState(() => year = v);
                },
              ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Apply'),
              ),
            ],
          ),
        ),
      ),
    );
    if (accepted == true && mounted) {
      _month = month;
      _year = year;
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final periodLabel = DateFormat('MMMM yyyy').format(DateTime(_year, _month));

    return Column(
      children: [
        // Compact Month Bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _choosePeriod,
                  icon: const Icon(Icons.calendar_month_rounded, size: 18),
                  label: Text(periodLabel),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: 'Previous month',
                onPressed: () {
                  final prev = DateTime(_year, _month - 1);
                  _month = prev.month;
                  _year = prev.year;
                  _reload();
                },
                icon: const Icon(Icons.chevron_left_rounded),
              ),
              const SizedBox(width: 4),
              IconButton.filledTonal(
                tooltip: 'Next month',
                onPressed: () {
                  final next = DateTime(_year, _month + 1);
                  _month = next.month;
                  _year = next.year;
                  _reload();
                },
                icon: const Icon(Icons.chevron_right_rounded),
              ),
            ],
          ),
        ),
        Expanded(
          child: FutureBuilder<_OvertimeScreenData>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const BusinzLoadingSkeleton(itemCount: 4, height: 86);
              }
              if (snapshot.hasError) {
                return BusinzErrorState(
                  error: snapshot.error!,
                  onRetry: () => _reload(invalidate: true),
                );
              }

              final data = snapshot.data!;
              final q = _search.trim().toLowerCase();
              final entries = q.isEmpty
                  ? data.entries
                  : data.entries.where((e) {
                      return e.employeeName.toLowerCase().contains(q) ||
                          e.employeeId.toLowerCase().contains(q) ||
                          e.department.toLowerCase().contains(q) ||
                          e.dateIso.contains(q);
                    }).toList(growable: false);

              final totalHours =
                  entries.fold<double>(0, (sum, e) => sum + e.otHours);
              final eligibleEntries =
                  entries.where((e) => e.showAmount).toList(growable: false);
              final totalAmount = eligibleEntries.fold<double>(
                0,
                (sum, e) => sum + (e.amount ?? 0),
              );

              // Show OT Amount summary ONLY when the user (or at least one
              // visible employee in management view) is covered by Web OT Policy.
              final showAmountSummary = data.isManagementView
                  ? eligibleEntries.isNotEmpty
                  : (data.selfEligibility?.isEligible ?? false);

              return RefreshIndicator(
                onRefresh: () async {
                  _reload(invalidate: true);
                  await _future;
                },
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 36),
                  children: [
                    if (data.isManagementView) ...[
                      BusinzSearchBar(
                        hintText: 'Search employee name, ID, or department…',
                        onChanged: (v) => setState(() => _search = v),
                      ),
                      const SizedBox(height: 10),
                    ],

                    // Clean Pure-White Summary Strip
                    if (showAmountSummary)
                      BusinzBentoGrid(
                        minTileHeight: 126,
                        children: [
                          BusinzKpiCard(
                            label: 'Total OT Hours',
                            value: totalHours.toStringAsFixed(1),
                            unitOrSecondary: 'h',
                            subtitle:
                                '${entries.length} ${entries.length == 1 ? 'day' : 'days'} logged',
                            icon: Icons.more_time_rounded,
                            pastelColor: AppTokens.pastelLavender,
                            accentColor: AppTokens.violet,
                          ),
                          BusinzKpiCard(
                            label: 'OT Amount',
                            value: formatInr(totalAmount),
                            subtitle: data.isManagementView
                                ? '${eligibleEntries.length} policy-eligible'
                                : (data.selfEligibility?.defaultMultiplier ??
                                    'OT Policy Applied'),
                            icon: Icons.currency_rupee_rounded,
                            pastelColor: AppTokens.pastelMint,
                            accentColor: AppTokens.brandPrimary,
                          ),
                        ],
                      )
                    else
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: scheme.surface,
                          borderRadius:
                              BorderRadius.circular(AppTokens.radiusCard),
                          border: Border.all(color: scheme.outlineVariant),
                          boxShadow: AppTokens.cardShadow(context),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: AppTokens.pastelFor(
                                  context,
                                  AppTokens.pastelLavender,
                                ),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.more_time_rounded,
                                color: AppTokens.violet,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Total Overtime Hours',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(fontWeight: FontWeight.w700),
                                  ),
                                  const SizedBox(height: 2),
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.baseline,
                                    textBaseline: TextBaseline.alphabetic,
                                    children: [
                                      Text(
                                        totalHours.toStringAsFixed(1),
                                        style: AppTokens.kpiStyle(
                                          context,
                                          size: 24,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        'hrs · ${entries.length} ${entries.length == 1 ? 'day' : 'days'}',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall
                                            ?.copyWith(
                                              color: scheme.onSurfaceVariant,
                                              fontWeight: FontWeight.w600,
                                            ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 14),

                    if (entries.isEmpty)
                      BusinzEmptyState(
                        icon: Icons.more_time_rounded,
                        title: 'No overtime recorded',
                        message:
                            'No daily overtime entries found for $periodLabel.',
                      )
                    else
                      ...entries.map(
                        (entry) => _DailyOvertimeCard(
                          entry: entry,
                          showEmployeeName: data.isManagementView,
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _DailyOvertimeCard extends StatelessWidget {
  const _DailyOvertimeCard({
    required this.entry,
    required this.showEmployeeName,
  });

  final DailyOvertimeEntry entry;
  final bool showEmployeeName;

  String _formatDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    return DateFormat('EEE, dd MMM yyyy').format(dt);
  }

  String _formatPunchTime(String raw) {
    final clean = raw.trim();
    if (clean.isEmpty || clean == '--:--') return '';
    final dt = DateTime.tryParse(clean);
    if (dt != null) return DateFormat('hh:mm a').format(dt.toLocal());
    return clean;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final inFmt = _formatPunchTime(entry.checkIn);
    final outFmt = _formatPunchTime(entry.checkOut);
    final punchWindow = [
      if (inFmt.isNotEmpty) 'In $inFmt',
      if (outFmt.isNotEmpty) 'Out $outFmt',
    ].join(' · ');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppTokens.pastelFor(context, AppTokens.pastelLavender),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.schedule_rounded,
              color: AppTokens.violet,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  showEmployeeName
                      ? entry.employeeName
                      : _formatDate(entry.dateIso),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  showEmployeeName
                      ? [
                          _formatDate(entry.dateIso),
                          if (entry.department.isNotEmpty) entry.department,
                        ].join(' · ')
                      : (punchWindow.isNotEmpty
                          ? punchWindow
                          : (entry.workingHours > 0
                              ? 'Worked ${entry.workingHours.toStringAsFixed(1)}h'
                              : entry.status)),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 5),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    BusinzStatusChip(entry.status),
                    if (entry.showAmount &&
                        entry.hourlyRate != null &&
                        entry.hourlyRate! > 0)
                      Text(
                        '${formatInr(entry.hourlyRate!)}/hr',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '+${entry.otHours.toStringAsFixed(1)} h',
                style: AppTokens.kpiStyle(
                  context,
                  size: 16,
                  color: AppTokens.violet,
                ),
              ),
              if (entry.showAmount && entry.amount != null) ...[
                const SizedBox(height: 2),
                Text(
                  formatInr(entry.amount!),
                  style: AppTokens.kpiStyle(
                    context,
                    size: 14,
                    color: AppTokens.brandPrimary,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _OvertimeScreenData {
  const _OvertimeScreenData({
    required this.entries,
    required this.selfEligibility,
    required this.isManagementView,
  });

  final List<DailyOvertimeEntry> entries;
  final OvertimeEligibility? selfEligibility;
  final bool isManagementView;
}
