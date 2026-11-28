import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/employee_filters.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class PayrollScreen extends ConsumerStatefulWidget {
  const PayrollScreen({super.key});

  @override
  ConsumerState<PayrollScreen> createState() => _PayrollScreenState();
}

class _PayrollScreenState extends ConsumerState<PayrollScreen> {
  late int _month;
  late int _year;
  String _search = '';
  String _statusFilter = 'All';
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = now.month;
    _year = now.year;
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final user = ref.read(authControllerProvider).value ??
        await ref.read(authControllerProvider.future);
    if (user == null) return const <Map<String, dynamic>>[];
    final rows = await ref.read(hrmsRepositoryProvider).payrollRecords(
          month: _month,
          year: _year,
          employeeId: user.canViewCompanyPayroll ? null : user.employeeId,
        );
    return excludeCeoEmployees(rows);
  }

  void _reload() => setState(() => _future = _load());

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
              Text('Select Payroll Period',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 18),
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
                onChanged: (value) {
                  if (value != null) setSheetState(() => month = value);
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                initialValue: year,
                decoration: const InputDecoration(labelText: 'Year'),
                items: [
                  for (var value = DateTime.now().year + 1;
                      value >= DateTime.now().year - 5;
                      value--)
                    DropdownMenuItem(value: value, child: Text('$value')),
                ],
                onChanged: (value) {
                  if (value != null) setSheetState(() => year = value);
                },
              ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Apply Period'),
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

  Future<void> _openPayslip(Map<String, dynamic> record) async {
    final user = ref.read(authControllerProvider).value!;
    final employeeId =
        _text(record, ['employeeId', 'employee_id'], fallback: user.employeeId);
    final month = _integer(record, ['payrollMonth', 'payroll_month'], _month);
    final year = _integer(record, ['payrollYear', 'payroll_year'], _year);
    if (employeeId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Employee identity is missing.')),
      );
      return;
    }
    showDialog<void>(
      context: context,
      builder: (context) => Dialog.fullscreen(
        child: FutureBuilder<Map<String, dynamic>>(
          future: ref.read(hrmsRepositoryProvider).payslip(
                employeeId,
                month: month,
                year: year,
                fallbackRecord: record,
              ),
          builder: (context, snapshot) => Scaffold(
            appBar: AppBar(
              title: const Text('Official Employee Payslip'),
              leading: IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ),
            body: snapshot.connectionState != ConnectionState.done
                ? const Center(child: CircularProgressIndicator())
                : snapshot.hasError
                    ? AppErrorView(
                        error: snapshot.error!,
                        onRetry: () => Navigator.pop(context),
                      )
                    : _PayslipView(data: snapshot.data ?? const {}),
          ),
        ),
      ),
    );
  }

  Future<void> _markPaid(Map<String, dynamic> record) async {
    final user = ref.read(authControllerProvider).value!;
    final empName =
        _text(record, ['employeeName', 'employeeId'], fallback: 'Employee');
    final empCode = _text(record, ['employeeId', 'employee_id']);
    final net = _number(record, ['netSalary', 'net_salary', 'netTotal']);
    final refCtrl = TextEditingController();
    String mode = 'Bank Transfer';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Mark Salary Paid'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('$empName ($empCode)\nNet Pay: ${_money(net)}',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: mode,
                decoration: const InputDecoration(labelText: 'Payment Mode'),
                items: const [
                  DropdownMenuItem(
                      value: 'Bank Transfer',
                      child: Text('Bank Transfer / NEFT')),
                  DropdownMenuItem(value: 'UPI', child: Text('UPI')),
                  DropdownMenuItem(value: 'Cheque', child: Text('Cheque')),
                  DropdownMenuItem(value: 'Cash', child: Text('Cash')),
                ],
                onChanged: (v) {
                  if (v != null) setDialogState(() => mode = v);
                },
              ),
              const SizedBox(height: 10),
              TextField(
                controller: refCtrl,
                decoration: const InputDecoration(
                  labelText: 'UTR / Reference Number',
                  hintText: 'Optional transaction reference',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirm Paid'),
            ),
          ],
        ),
      ),
    );
    final txnRef = refCtrl.text.trim();
    refCtrl.dispose();
    if (confirmed != true) return;

    try {
      await ref.read(hrmsRepositoryProvider).markPayrollRecordPaid(
            id: _text(record, ['id']),
            employeeId: empCode,
            month: _integer(record, ['payrollMonth', 'payroll_month'], _month),
            year: _integer(record, ['payrollYear', 'payroll_year'], _year),
            paymentMode: mode,
            transactionRef: txnRef.isEmpty
                ? 'PAID-${DateTime.now().millisecondsSinceEpoch}'
                : txnRef,
            paidBy: user.name,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Marked $empName as Paid.')),
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
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const BusinzLoadingSkeleton(itemCount: 4, height: 96);
    }
    final period = DateFormat('MMMM yyyy').format(DateTime(_year, _month));
    final canDisburse = user.isCeo || user.isAccounts;
    final scheme = Theme.of(context).colorScheme;

    return Column(
      children: [
        // Month Selector Row
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _choosePeriod,
                  icon: const Icon(Icons.calendar_month_rounded, size: 18),
                  label: Text(period),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: 'Previous month',
                onPressed: () {
                  final prev = DateTime(_year, _month - 1);
                  setState(() {
                    _month = prev.month;
                    _year = prev.year;
                  });
                  _reload();
                },
                icon: const Icon(Icons.chevron_left_rounded),
              ),
              const SizedBox(width: 4),
              IconButton.filledTonal(
                tooltip: 'Next month',
                onPressed: () {
                  final next = DateTime(_year, _month + 1);
                  setState(() {
                    _month = next.month;
                    _year = next.year;
                  });
                  _reload();
                },
                icon: const Icon(Icons.chevron_right_rounded),
              ),
            ],
          ),
        ),
        if (user.canViewCompanyPayroll)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              children: [
                BusinzSearchBar(
                  hintText: 'Search employee name, ID, or department…',
                  onChanged: (value) => setState(() => _search = value),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['All', 'Processed', 'Paid'].map((st) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          selected: _statusFilter == st,
                          label: Text(st),
                          onSelected: (_) => setState(() => _statusFilter = st),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const BusinzLoadingSkeleton(itemCount: 4, height: 96);
              }
              if (snapshot.hasError) {
                return BusinzErrorState(
                    error: snapshot.error!, onRetry: _reload);
              }
              final all = snapshot.data ?? const [];
              final q = _search.trim().toLowerCase();
              final records = all.where((r) {
                if (user.canViewCompanyPayroll && _statusFilter != 'All') {
                  final st =
                      _text(r, ['status'], fallback: 'Processed').toLowerCase();
                  if (st != _statusFilter.toLowerCase()) return false;
                }
                if (q.isEmpty) return true;
                return _text(r, ['employeeName', 'employee_name'])
                        .toLowerCase()
                        .contains(q) ||
                    _text(r, ['employeeId', 'employee_id'])
                        .toLowerCase()
                        .contains(q) ||
                    _text(r, ['department']).toLowerCase().contains(q);
              }).toList(growable: false);

              if (records.isEmpty) {
                return BusinzEmptyState(
                  icon: Icons.payments_outlined,
                  title: 'No payroll record for $period',
                  message:
                      'Use the month arrows or period picker above to view another payroll cycle.',
                );
              }

              final totalGross = records.fold<double>(
                0,
                (sum, r) => sum + _number(r, ['grossSalary', 'gross_salary']),
              );
              final totalNet = records.fold<double>(
                0,
                (sum, r) =>
                    sum +
                    _number(r,
                        ['netSalary', 'net_salary', 'netTotal', 'net_total']),
              );
              final paidCount = records
                  .where((r) => _text(r, ['status']).toLowerCase() == 'paid')
                  .length;

              // Reference Employee Personal Payslip Layout (Cobalt Card + Salary Summary + View PDF)
              if (!user.canViewCompanyPayroll && records.length == 1) {
                final rec = records.first;
                final basic = _number(rec, ['basicSalary', 'basic_salary']);
                final gross = _number(rec, ['grossSalary', 'gross_salary']);
                final directAllow = _number(rec, ['allowances', 'hra']);
                final allowances = directAllow > 0
                    ? directAllow
                    : (gross - basic).clamp(0.0, double.infinity);
                final deductions = _number(rec, [
                  'totalDeductions',
                  'total_deductions',
                  'deductions',
                ]);
                final net = _number(rec,
                    ['netSalary', 'net_salary', 'netTotal', 'net_total']);
                final status =
                    _text(rec, ['status'], fallback: 'Processed');

                return RefreshIndicator(
                  onRefresh: () async {
                    ref.read(hrmsRepositoryProvider).invalidatePayrollCache();
                    _reload();
                    await _future;
                  },
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 48),
                    children: [
                      BusinzPayslipCard(
                        periodLabel: period,
                        subtitle: 'Monthly Payslip',
                        statusLabel: status,
                        onTap: () => _openPayslip(rec),
                        onDownloadTap: () => _openPayslip(rec),
                      ),
                      const SizedBox(height: 16),

                      // Reference Salary Summary Neo-Bento Card
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: scheme.surface,
                          borderRadius:
                              BorderRadius.circular(AppTokens.radiusCardLg),
                          border: Border.all(color: scheme.outlineVariant),
                          boxShadow: AppTokens.cardShadow(context),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Salary Summary',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 14),
                            _SummaryAmountRow(
                              label: 'Basic Pay',
                              amount: _money(basic),
                            ),
                            const SizedBox(height: 10),
                            _SummaryAmountRow(
                              label: 'Allowances',
                              amount: _money(allowances),
                            ),
                            const SizedBox(height: 10),
                            _SummaryAmountRow(
                              label: 'Deductions',
                              amount: deductions > 0
                                  ? '- ${_money(deductions)}'
                                  : _money(0),
                              amountColor: deductions > 0
                                  ? AppTokens.danger
                                  : scheme.onSurface,
                            ),
                            const SizedBox(height: 14),
                            // Soft Mint Net Pay Highlight Row
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 13,
                              ),
                              decoration: BoxDecoration(
                                color: AppTokens.pastelFor(
                                  context,
                                  AppTokens.pastelMint,
                                ),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Row(
                                children: [
                                  const Expanded(
                                    child: Text(
                                      'Net Pay',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 15,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    _money(net),
                                    style: AppTokens.kpiStyle(
                                      context,
                                      size: 20,
                                      color: scheme.onSurface,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // Reference "View Payslip (PDF) >" Row Card
                      Container(
                        decoration: BoxDecoration(
                          color: scheme.surface,
                          borderRadius:
                              BorderRadius.circular(AppTokens.radiusCard),
                          border: Border.all(color: scheme.outlineVariant),
                          boxShadow: AppTokens.cardShadow(context),
                        ),
                        child: Material(
                          type: MaterialType.transparency,
                          borderRadius:
                              BorderRadius.circular(AppTokens.radiusCard),
                          clipBehavior: Clip.antiAlias,
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 6,
                            ),
                            leading: Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: AppTokens.pastelFor(
                                  context,
                                  AppTokens.pastelMint,
                                ),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.picture_as_pdf_rounded,
                                color: AppTokens.brandPrimary,
                                size: 21,
                              ),
                            ),
                            title: const Text(
                              'View Payslip (PDF)',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 14.5,
                              ),
                            ),
                            trailing: const Icon(Icons.chevron_right_rounded),
                            onTap: () => _openPayslip(rec),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }

              return RefreshIndicator(
                onRefresh: () async {
                  ref.read(hrmsRepositoryProvider).invalidatePayrollCache();
                  _reload();
                  await _future;
                },
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 48),
                  children: [
                    if (user.canViewCompanyPayroll) ...[
                      BusinzPayslipCard(
                        periodLabel: period,
                        subtitle:
                            '${records.length} Employees · $paidCount Paid',
                        statusLabel: formatInr(totalNet),
                      ),
                      const SizedBox(height: 12),
                      BusinzBentoGrid(
                        minTileHeight: 124,
                        children: [
                          BusinzKpiCard(
                            label: 'Total Net Pay',
                            value: formatInr(totalNet),
                            subtitle: '$paidCount of ${records.length} paid',
                            icon: Icons.payments_rounded,
                            pastelColor: AppTokens.pastelMint,
                            accentColor: AppTokens.success,
                          ),
                          BusinzKpiCard(
                            label: 'Gross Payroll',
                            value: formatInr(totalGross),
                            subtitle: period,
                            icon: Icons.receipt_long_rounded,
                            pastelColor: AppTokens.pastelLavender,
                            accentColor: AppTokens.cobaltAccent,
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                    ],
                    ...records.map((record) {
                      final name = _text(
                        record,
                        ['employeeName', 'employee_name', 'employeeId'],
                        fallback: 'Employee payslip',
                      );
                      final empCode =
                          _text(record, ['employeeId', 'employee_id']);
                      final dept = _text(record, ['department']);
                      final gross =
                          _number(record, ['grossSalary', 'gross_salary']);
                      final net = _number(record,
                          ['netSalary', 'net_salary', 'netTotal', 'net_total']);
                      final paidDays = _number(
                          record, ['totalPaidDays', 'paidDays', 'presentDays']);
                      final calDays = _number(
                          record, ['calendarDays', 'calendarDaysInMonth']);
                      final workDays = _number(record, ['workingDays']);
                      final presDays = _number(record, ['presentDays']);
                      final woDays = _number(record, ['paidWeekOffDays']);
                      final holDays = _number(record, ['paidHolidayDays']);
                      final plDays = _number(record, ['paidLeaveDays']);
                      final lopDays = _number(record, ['lopDays']);
                      final dayBreakdownParts = <String>[
                        if (workDays > 0) 'Work: ${_fmtDays(workDays)}',
                        'Pres: ${_fmtDays(presDays)}',
                        if (woDays > 0) 'WO: ${_fmtDays(woDays)}',
                        if (holDays > 0) 'Hol: ${_fmtDays(holDays)}',
                        if (plDays > 0) 'PL: ${_fmtDays(plDays)}',
                        if (lopDays > 0) 'LOP: ${_fmtDays(lopDays)}',
                      ];
                      final status =
                          _text(record, ['status'], fallback: 'Processed');
                      final isPaid = status.toLowerCase() == 'paid';

                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(
                          color: scheme.surface,
                          borderRadius:
                              BorderRadius.circular(AppTokens.radiusCard),
                          border: Border.all(color: scheme.outlineVariant),
                          boxShadow: AppTokens.cardShadow(context),
                        ),
                        child: Material(
                          color: Colors.transparent,
                          borderRadius:
                              BorderRadius.circular(AppTokens.radiusCard),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: () => _openPayslip(record),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                children: [
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      CircleAvatar(
                                        backgroundColor:
                                            scheme.primaryContainer,
                                        child: Text(
                                          initialsOf(name),
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w800,
                                            color: scheme.onPrimaryContainer,
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
                                              name,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 15,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              [
                                                if (empCode.isNotEmpty) empCode,
                                                if (dept.isNotEmpty) dept,
                                              ].join(' · '),
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .bodySmall,
                                            ),
                                            const SizedBox(height: 6),
                                            Wrap(
                                              spacing: 8,
                                              runSpacing: 4,
                                              crossAxisAlignment:
                                                  WrapCrossAlignment.center,
                                              children: [
                                                BusinzStatusChip(status),
                                                if (calDays > 0)
                                                  Text(
                                                    '${_fmtDays(paidDays)} / ${_fmtDays(calDays)} days',
                                                    style: TextStyle(
                                                      fontSize: 12,
                                                      fontWeight:
                                                          FontWeight.w700,
                                                      color: scheme.onSurface,
                                                    ),
                                                  ),
                                              ],
                                            ),
                                            if (calDays > 0 &&
                                                dayBreakdownParts.isNotEmpty) ...[
                                              const SizedBox(height: 4),
                                              Text(
                                                dayBreakdownParts.join(' · '),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .labelSmall,
                                              ),
                                            ],
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            _money(net),
                                            style: AppTokens.kpiStyle(
                                              context,
                                              size: 16,
                                              color: scheme.primary,
                                            ),
                                          ),
                                          if (gross > 0 && gross != net)
                                            Text(
                                              'Gross ${_money(gross)}',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelSmall,
                                            ),
                                          const SizedBox(height: 4),
                                          Text(
                                            'View Payslip ›',
                                            style: TextStyle(
                                              fontSize: 11.5,
                                              fontWeight: FontWeight.w700,
                                              color: scheme.primary,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                  if (canDisburse && !isPaid) ...[
                                    const SizedBox(height: 10),
                                    const Divider(height: 1),
                                    const SizedBox(height: 8),
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.end,
                                      children: [
                                        TextButton.icon(
                                          onPressed: () => _openPayslip(record),
                                          icon: const Icon(
                                              Icons.picture_as_pdf_outlined,
                                              size: 16),
                                          label: const Text('Payslip PDF'),
                                        ),
                                        const SizedBox(width: 8),
                                        FilledButton.tonalIcon(
                                          onPressed: () => _markPaid(record),
                                          icon: const Icon(Icons.check_rounded,
                                              size: 16),
                                          label: const Text('Mark Paid'),
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
        ),
      ],
    );
  }
}

class _SummaryAmountRow extends StatelessWidget {
  const _SummaryAmountRow({
    required this.label,
    required this.amount,
    this.amountColor,
  });

  final String label;
  final String amount;
  final Color? amountColor;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
          Text(
            amount,
            style: TextStyle(
              fontFamily: AppTokens.fontKpi,
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: amountColor ?? Theme.of(context).colorScheme.onSurface,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      );
}

class _PayslipView extends StatelessWidget {
  const _PayslipView({required this.data});
  final Map<String, dynamic> data;

  List<_SlipLineItem> _buildEarningsLines() {
    final rawBreakdown = data['earningsBreakdown'];
    if (rawBreakdown is List && rawBreakdown.isNotEmpty) {
      return rawBreakdown
          .whereType<Map>()
          .map((m) => _SlipLineItem(
                name: (m['name'] ?? 'Earning').toString(),
                description: (m['description'] ?? '').toString(),
                amount: double.tryParse('${m['amount'] ?? 0}') ?? 0,
              ))
          .toList(growable: false);
    }
    final e = _map(data['earnings']);
    final items = <_SlipLineItem>[];
    void addIf(String label, List<String> keys) {
      final v = _number(e, keys);
      if (v > 0) {
        items.add(_SlipLineItem(name: label, description: '', amount: v));
      }
    }

    addIf('BASIC SALARY', ['basicSalary', 'basic_salary']);
    addIf('House Rent Allowance', ['hra', 'allowances']);
    addIf('Dearness Allowance', ['da']);
    addIf('Conveyance', ['conveyance']);
    addIf('Attendance Bonus', ['attendanceBonus']);
    addIf('Overtime Pay', ['overtimeAmount', 'ot_variable_amount']);
    addIf('Bonus', ['bonus']);
    addIf('Incentive', ['incentive']);
    addIf('Other Earnings', ['otherEarnings']);
    return items;
  }

  List<_SlipLineItem> _buildDeductionsLines() {
    final rawBreakdown = data['deductionsBreakdown'];
    final items = <_SlipLineItem>[];
    if (rawBreakdown is List && rawBreakdown.isNotEmpty) {
      for (final raw in rawBreakdown.whereType<Map>()) {
        items.add(_SlipLineItem(
          name: (raw['name'] ?? 'Deduction').toString(),
          description: (raw['description'] ?? '').toString(),
          amount: double.tryParse('${raw['amount'] ?? 0}') ?? 0,
        ));
      }
    }
    final d = _map(data['deductions']);
    bool hasAny(List<String> needles) => items.any((i) {
          final lower = i.name.toLowerCase();
          return needles.any(lower.contains);
        });
    void addMissing(String label, List<String> keys, List<String> needles) {
      final v = _number(d, keys);
      if (v > 0 && !hasAny(needles)) {
        items.add(_SlipLineItem(name: label, description: '', amount: v));
      }
    }

    const pfNeedles = ['pf', 'provident'];
    const esiNeedles = ['esi', 'state insurance'];

    addMissing('EPF Employee Contribution', ['pf', 'epfDeduction'], pfNeedles);
    addMissing('ESIC Contribution', ['esic', 'esiDeduction'], esiNeedles);
    if (!hasAny(pfNeedles)) {
      items.add(const _SlipLineItem(
        name: 'EPF Employee Contribution',
        description: 'Exempt (< 6 Months)',
        amount: 0,
      ));
    }
    if (!hasAny(esiNeedles)) {
      items.add(const _SlipLineItem(
        name: 'ESIC Contribution',
        description: 'Exempt (< 6 Months)',
        amount: 0,
      ));
    }
    addMissing(
      'Professional Tax',
      ['professionalTax'],
      const ['professional tax', 'pt'],
    );
    addMissing(
      'Late Attendance Deduction',
      ['lateAttendanceDeduction'],
      const ['late'],
    );
    addMissing(
      'Advance / Loan Recovery',
      ['advanceRecovery', 'loanRecovery'],
      const ['advance', 'loan'],
    );
    addMissing('Other Deductions', ['otherDeductions'], const ['other']);
    return items;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final company = _map(data['company']);
    final employee = _map(data['employee']);
    final payroll = _map(data['payroll']);
    final earnings = _map(data['earnings']);
    final deductions = _map(data['deductions']);

    final fullName = _text(employee, ['fullName'],
        fallback: [employee['firstName'], employee['lastName']]
            .where((p) => p != null && p.toString().trim().isNotEmpty)
            .join(' '));
    final periodUpper = '${_text(payroll, [
          'monthName'
        ]).toUpperCase()} ${_text(payroll, ['year'])}';
    final status = _text(payroll, ['status'], fallback: 'Processed');
    final calDays = _number(payroll, ['calendarDays', 'calendarDaysInMonth']);
    final workingDays = _number(payroll, ['workingDays']);
    final presentDays = _number(payroll, ['presentDays']);
    final paidWeekOff = _number(payroll, ['paidWeekOffDays']);
    final paidHoliday = _number(payroll, ['paidHolidayDays']);
    final paidLeave = _number(payroll, ['paidLeaveDays']);
    final lopDays = _number(payroll, ['lopDays']);
    final totalPaidDays = _number(payroll, ['totalPaidDays', 'paidDays']);
    final monthlyCtc = _number(employee, ['monthlyCtc', 'monthlySalary']);
    final grossEarnings = _number(earnings, ['grossSalary', 'gross_salary']);
    final totalDeductions =
        _number(deductions, ['totalDeductions', 'total_deductions']);
    final netSalary = _number(data, ['netSalary', 'net_salary']);
    final earningLines = _buildEarningsLines();
    final deductionLines = _buildDeductionsLines();

    final legalName = _text(company, ['legalName', 'companyName'],
        fallback: 'VRM STRUCTURES INDIA PRIVATE LIMITED');
    final regdAddress = _text(company, ['registeredAddress', 'address']);
    final branchAddress = _text(company, ['branchAddress']);
    final metaLine = [
      if (_text(company, ['phone']).isNotEmpty)
        'Phone: ${_text(company, ['phone'])}',
      if (_text(company, ['website']).isNotEmpty)
        'Web: ${_text(company, ['website'])}',
      if (_text(company, ['gst']).isNotEmpty) 'GST: ${_text(company, ['gst'])}',
      if (_text(company, ['registrationNumber']).isNotEmpty)
        'Reg: ${_text(company, ['registrationNumber'])}',
    ].join('  |  ');

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 40),
      children: [
        // Official Company Header Card
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        legalName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    StatusPill(status),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'PAYSLIP FOR $periodUpper',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: scheme.primary,
                    letterSpacing: 0.4,
                  ),
                ),
                if (regdAddress.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text('Regd: $regdAddress',
                      style: Theme.of(context).textTheme.bodySmall),
                ],
                if (branchAddress.isNotEmpty)
                  Text('Branch: $branchAddress',
                      style: Theme.of(context).textTheme.bodySmall),
                if (metaLine.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(metaLine, style: Theme.of(context).textTheme.labelSmall),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Employee Details Grid Card
        _InfoCard(
          title: fullName.isEmpty ? 'Employee Details' : fullName,
          rows: {
            'Employee ID': _text(employee, ['employeeId', 'id']),
            'Department': _text(employee, ['department']),
            'Designation': _text(employee, ['designation']),
            'Date of Joining': formatDisplayDate(
                _text(employee, ['joiningDate']),
                fallback: ''),
            if (monthlyCtc > 0) 'Employee CTC': _money(monthlyCtc),
            'Bank Account': _text(employee, ['accountNumber']),
            'PAN': _text(employee, ['panNumber']),
            'Working Days': _fmtDays(workingDays),
            'Paid Days': calDays > 0
                ? '${_fmtDays(totalPaidDays)} / ${_fmtDays(calDays)}'
                : _fmtDays(totalPaidDays),
            'Payroll Month':
                '${_text(payroll, ['monthName'])} ${_text(payroll, ['year'])}',
            'Payment Status': status,
          },
        ),
        const SizedBox(height: 12),

        // Calendar Attendance Breakdown Card
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Attendance Summary',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (calDays > 0)
                      _AttendanceChip('Calendar Days', _fmtDays(calDays)),
                    _AttendanceChip('Working Days', _fmtDays(workingDays)),
                    _AttendanceChip('Present Days', _fmtDays(presentDays)),
                    _AttendanceChip('Paid Week Off', _fmtDays(paidWeekOff)),
                    _AttendanceChip('Paid Holiday', _fmtDays(paidHoliday)),
                    _AttendanceChip('Paid Leave', _fmtDays(paidLeave)),
                    _AttendanceChip(
                      'LOP Days',
                      _fmtDays(lopDays),
                      valueColor: lopDays > 0 ? AppTokens.danger : null,
                    ),
                    _AttendanceChip(
                      'Total Paid Days',
                      _fmtDays(totalPaidDays),
                      valueColor: scheme.primary,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Itemized Earnings Card
        _BreakdownCard(
          title: 'Earnings',
          items: earningLines,
          totalLabel: 'Gross Earnings',
          totalAmount: grossEarnings,
          accentColor: scheme.primary,
        ),
        const SizedBox(height: 12),

        // Itemized Deductions Card
        _BreakdownCard(
          title: 'Deductions',
          items: deductionLines,
          totalLabel: 'Total Deductions',
          totalAmount: totalDeductions,
          accentColor: AppTokens.danger,
        ),
        const SizedBox(height: 14),

        // NET PAY Banner
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: scheme.primaryContainer,
            borderRadius: BorderRadius.circular(AppTokens.radiusCard),
            border: Border.all(color: scheme.primary.withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'NET PAY',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.8,
                      color: scheme.onPrimaryContainer,
                    ),
                  ),
                  Text(
                    'Take-home payable salary',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
              Text(
                _money(netSalary),
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: scheme.primary,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _previewPdf,
          icon: const Icon(Icons.picture_as_pdf_outlined),
          label: const Text('Download / Share Official PDF'),
        ),
      ],
    );
  }

  Future<void> _previewPdf() async {
    final payroll = _map(data['payroll']);
    final employee = _map(data['employee']);
    final employeeId =
        _text(employee, ['employeeId', 'id'], fallback: 'employee');
    final period = '${_text(payroll, [
          'monthName'
        ], fallback: 'payslip')}_${_text(payroll, ['year'])}';
    await Printing.layoutPdf(
      name: 'BUSINZ_Payslip_${employeeId}_$period.pdf',
      onLayout: (_) => _buildPdf().save(),
    );
  }

  pw.Document _buildPdf() {
    final company = _map(data['company']);
    final employee = _map(data['employee']);
    final payroll = _map(data['payroll']);
    final earnings = _map(data['earnings']);
    final deductions = _map(data['deductions']);
    final earningLines = _buildEarningsLines();
    final deductionLines = _buildDeductionsLines();

    final employeeName = _text(employee, ['fullName'],
        fallback: [employee['firstName'], employee['lastName']]
            .where((p) => p != null && p.toString().trim().isNotEmpty)
            .join(' '));
    final calDays = _number(payroll, ['calendarDays', 'calendarDaysInMonth']);
    final totalPaidDays = _number(payroll, ['totalPaidDays', 'paidDays']);
    final monthlyCtc = _number(employee, ['monthlyCtc', 'monthlySalary']);

    final document = pw.Document(
      title: 'BUSINZ HRMS Official Payslip',
      author: 'BUSINZ HRMS',
    );
    document.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(28),
      build: (_) => [
        pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    _text(company, ['legalName', 'companyName'],
                        fallback: 'VRM STRUCTURES INDIA PRIVATE LIMITED'),
                    style: const pw.TextStyle(
                        fontSize: 16, fontWeight: pw.FontWeight.bold),
                  ),
                  if (_text(company, ['registeredAddress', 'address'])
                      .isNotEmpty)
                    pw.Text(
                      'Regd: ${_text(company, [
                            'registeredAddress',
                            'address'
                          ])}',
                      style: const pw.TextStyle(fontSize: 9),
                    ),
                  if (_text(company, ['branchAddress']).isNotEmpty)
                    pw.Text('Branch: ${_text(company, ['branchAddress'])}',
                        style: const pw.TextStyle(fontSize: 9)),
                  pw.Text(
                    [
                      if (_text(company, ['phone']).isNotEmpty)
                        'Phone: ${_text(company, ['phone'])}',
                      if (_text(company, ['website']).isNotEmpty)
                        'Web: ${_text(company, ['website'])}',
                      if (_text(company, ['gst']).isNotEmpty)
                        'GST: ${_text(company, ['gst'])}',
                      if (_text(company, ['registrationNumber']).isNotEmpty)
                        'Reg: ${_text(company, ['registrationNumber'])}',
                    ].join(' | '),
                    style: const pw.TextStyle(
                        fontSize: 8.5, color: PdfColors.grey700),
                  ),
                ],
              ),
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: [
                pw.Text(
                  'PAYSLIP FOR ${_text(payroll, [
                        'monthName'
                      ]).toUpperCase()} ${_text(payroll, ['year'])}',
                  style: const pw.TextStyle(
                    fontSize: 12,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColor.fromInt(0xFF0E7490),
                  ),
                ),
                pw.Text(
                    'Status: ${_text(payroll, [
                          'status'
                        ], fallback: 'Processed')}',
                    style: const pw.TextStyle(fontSize: 9.5)),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 10),
        pw.Divider(color: const PdfColor.fromInt(0xFF0E7490), thickness: 1.5),
        pw.SizedBox(height: 10),
        _pdfTable({
          'Employee Name': employeeName,
          'Employee ID': _text(employee, ['employeeId', 'id']),
          'Department': _text(employee, ['department']),
          'Designation': _text(employee, ['designation']),
          if (_text(employee, ['joiningDate']).isNotEmpty)
            'Date of Joining': _text(employee, ['joiningDate']),
          if (monthlyCtc > 0) 'Employee CTC': _pdfMoney(monthlyCtc),
          if (_text(employee, ['accountNumber']).isNotEmpty)
            'Bank Account': _text(employee, ['accountNumber']),
          if (_text(employee, ['panNumber']).isNotEmpty)
            'PAN': _text(employee, ['panNumber']),
          'Paid Days': calDays > 0
              ? '${_fmtDays(totalPaidDays)} / ${_fmtDays(calDays)}'
              : _fmtDays(totalPaidDays),
        }),
        pw.SizedBox(height: 12),
        pw.Text('Attendance Breakdown',
            style: const pw.TextStyle(
                fontSize: 11, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 4),
        _pdfTable({
          'Calendar Days': _fmtDays(calDays),
          'Working Days': _fmtDays(_number(payroll, ['workingDays'])),
          'Present Days': _fmtDays(_number(payroll, ['presentDays'])),
          'Paid Week Off': _fmtDays(_number(payroll, ['paidWeekOffDays'])),
          'Paid Holiday': _fmtDays(_number(payroll, ['paidHolidayDays'])),
          'Paid Leave': _fmtDays(_number(payroll, ['paidLeaveDays'])),
          'LOP Days': _fmtDays(_number(payroll, ['lopDays'])),
          'Total Paid Days': _fmtDays(totalPaidDays),
        }),
        pw.SizedBox(height: 14),
        pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Expanded(
            child: _pdfBreakdownSection(
              'Earnings',
              earningLines,
              'Gross Earnings',
              _number(earnings, ['grossSalary', 'gross_salary']),
            ),
          ),
          pw.SizedBox(width: 16),
          pw.Expanded(
            child: _pdfBreakdownSection(
              'Deductions',
              deductionLines,
              'Total Deductions',
              _number(deductions, ['totalDeductions', 'total_deductions']),
            ),
          ),
        ]),
        pw.SizedBox(height: 18),
        pw.Container(
          padding: const pw.EdgeInsets.all(12),
          color: const PdfColor.fromInt(0xFFECFEFF),
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text('NET PAY',
                  style: const pw.TextStyle(
                      fontSize: 13, fontWeight: pw.FontWeight.bold)),
              pw.Text(_pdfMoney(_number(data, ['netSalary', 'net_salary'])),
                  style: const pw.TextStyle(
                    fontSize: 15,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColor.fromInt(0xFF0E7490),
                  )),
            ],
          ),
        ),
        pw.SizedBox(height: 20),
        pw.Text(
          'This is a computer-generated official payslip issued by BUSINZ HRMS.',
          style: const pw.TextStyle(fontSize: 8.5, color: PdfColors.grey700),
        ),
      ],
    ));
    return document;
  }

  static pw.Widget _pdfTable(Map<String, String> values) => pw.Table(
        border: pw.TableBorder.all(color: PdfColors.grey300, width: .5),
        children: values.entries
            .where((row) => row.value.isNotEmpty)
            .map((row) => pw.TableRow(children: [
                  pw.Padding(
                      padding: const pw.EdgeInsets.all(5),
                      child: pw.Text(row.key,
                          style: const pw.TextStyle(
                              fontSize: 9.5, color: PdfColors.grey700))),
                  pw.Padding(
                      padding: const pw.EdgeInsets.all(5),
                      child: pw.Text(row.value,
                          style: const pw.TextStyle(
                              fontSize: 9.5, fontWeight: pw.FontWeight.bold))),
                ]))
            .toList(),
      );

  static pw.Widget _pdfBreakdownSection(
    String title,
    List<_SlipLineItem> items,
    String totalLabel,
    double totalAmount,
  ) =>
      pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          pw.Container(
            padding: const pw.EdgeInsets.all(6),
            color: PdfColors.grey200,
            child: pw.Text(title,
                style: const pw.TextStyle(
                    fontSize: 10, fontWeight: pw.FontWeight.bold)),
          ),
          for (final row in items)
            pw.Padding(
              padding:
                  const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 4),
              child: pw.Row(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Expanded(
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Text(row.name,
                            style: const pw.TextStyle(fontSize: 9.5)),
                        if (row.description.isNotEmpty)
                          pw.Text(row.description,
                              style: const pw.TextStyle(
                                  fontSize: 7.5, color: PdfColors.grey700)),
                      ],
                    ),
                  ),
                  pw.Text(_pdfMoney(row.amount),
                      style: const pw.TextStyle(fontSize: 9.5)),
                ],
              ),
            ),
          pw.Divider(color: PdfColors.grey400, thickness: 0.7),
          pw.Padding(
            padding: const pw.EdgeInsets.symmetric(vertical: 3, horizontal: 4),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text(totalLabel,
                    style: const pw.TextStyle(
                        fontSize: 10, fontWeight: pw.FontWeight.bold)),
                pw.Text(_pdfMoney(totalAmount),
                    style: const pw.TextStyle(
                        fontSize: 10, fontWeight: pw.FontWeight.bold)),
              ],
            ),
          ),
        ],
      );
}

class _SlipLineItem {
  const _SlipLineItem({
    required this.name,
    required this.description,
    required this.amount,
  });
  final String name;
  final String description;
  final double amount;
}

class _AttendanceChip extends StatelessWidget {
  const _AttendanceChip(this.label, this.value, {this.valueColor});
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.7)),
      ),
      child: RichText(
        text: TextSpan(
          style: Theme.of(context).textTheme.bodySmall,
          children: [
            TextSpan(text: '$label: '),
            TextSpan(
              text: value,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: valueColor ?? scheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BreakdownCard extends StatelessWidget {
  const _BreakdownCard({
    required this.title,
    required this.items,
    required this.totalLabel,
    required this.totalAmount,
    required this.accentColor,
  });
  final String title;
  final List<_SlipLineItem> items;
  final String totalLabel;
  final double totalAmount;
  final Color accentColor;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    title,
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  Text('Amount', style: Theme.of(context).textTheme.labelSmall),
                ],
              ),
              const Divider(height: 16),
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text('₹0.00',
                      style: Theme.of(context).textTheme.bodySmall),
                )
              else
                for (final row in items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(row.name,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13.5)),
                              if (row.description.isNotEmpty)
                                Text(
                                  row.description,
                                  style: Theme.of(context).textTheme.labelSmall,
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _money(row.amount),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
              const Divider(height: 18),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(totalLabel,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(
                    _money(totalAmount),
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 15,
                      color: accentColor,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.rows});
  final String title;
  final Map<String, String> rows;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const Divider(height: 16),
              for (final row in rows.entries)
                if (row.value.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(row.key,
                              style: Theme.of(context).textTheme.bodySmall),
                        ),
                        Flexible(
                          child: Text(row.value,
                              textAlign: TextAlign.end,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      );
}

Map<String, dynamic> _map(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

String _text(Map<String, dynamic> value, List<String> keys,
    {String fallback = ''}) {
  for (final key in keys) {
    final candidate = value[key];
    if (candidate != null && candidate.toString().trim().isNotEmpty) {
      return candidate.toString();
    }
  }
  return fallback;
}

int _integer(Map<String, dynamic> value, List<String> keys, int fallback) {
  for (final key in keys) {
    final candidate = value[key];
    if (candidate is num) return candidate.toInt();
    final parsed = int.tryParse(candidate?.toString() ?? '');
    if (parsed != null) return parsed;
  }
  return fallback;
}

double _number(Map<String, dynamic> value, List<String> keys) {
  for (final key in keys) {
    final candidate = value[key];
    if (candidate is num) return candidate.toDouble();
    final parsed = double.tryParse(candidate?.toString() ?? '');
    if (parsed != null) return parsed;
  }
  return 0;
}

String _fmtDays(double value) => value == value.roundToDouble()
    ? '${value.toInt()}'
    : value.toStringAsFixed(1);

String _money(double value) =>
    NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2)
        .format(value);

String _pdfMoney(double value) =>
    NumberFormat.currency(locale: 'en_IN', symbol: 'INR ', decimalDigits: 2)
        .format(value);
