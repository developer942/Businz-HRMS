import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/employee_filters.dart';
import '../../../core/utils/file_share_helper.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

// =============================================================================
// 1. ADVANCE SALARY & EMPLOYEE LOANS SCREEN
// =============================================================================

class AdvanceSalaryScreen extends ConsumerStatefulWidget {
  const AdvanceSalaryScreen({super.key});

  @override
  ConsumerState<AdvanceSalaryScreen> createState() =>
      _AdvanceSalaryScreenState();
}

class _AdvanceSalaryScreenState extends ConsumerState<AdvanceSalaryScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  String _statusFilter = 'All';

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final user = ref.read(authControllerProvider).value;
    if (user == null) return const [];
    final rows = await ref.read(hrmsRepositoryProvider).loanRecords();
    if (user.isCeo || user.isHr || user.isAccounts) return rows;
    return rows
        .where((r) =>
            user.matchesIdentity(r['employeeId']) ||
            user.matchesIdentity(r['employee_id']) ||
            (r['employeeName']?.toString().trim().toLowerCase() ==
                user.name.trim().toLowerCase()))
        .toList(growable: false);
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _openApplySheet() async {
    final user = ref.read(authControllerProvider).value;
    if (user == null) return;
    final amountCtrl = TextEditingController();
    final purposeCtrl = TextEditingController();
    final monthsCtrl = TextEditingController(text: '3');
    var requestType = 'Advance Salary';
    var submitting = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
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
                Text('Request Advance Salary',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: requestType,
                  decoration: const InputDecoration(labelText: 'Request Type'),
                  items: const ['Advance Salary', 'Employee Loan']
                      .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setModalState(() => requestType = v);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Requested Amount (\u20B9)',
                    prefixIcon: Icon(Icons.currency_rupee_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: monthsCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Repayment Installments (Months)',
                    prefixIcon: Icon(Icons.calendar_month_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: purposeCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Purpose / Reason',
                  ),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: submitting
                      ? null
                      : () async {
                          final amt =
                              double.tryParse(amountCtrl.text.trim()) ?? 0;
                          final months =
                              (int.tryParse(monthsCtrl.text.trim()) ?? 1)
                                  .clamp(1, 24);
                          if (amt <= 0 || purposeCtrl.text.trim().isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text(
                                      'Enter a valid amount and purpose.')),
                            );
                            return;
                          }
                          setModalState(() => submitting = true);
                          try {
                            final now = DateTime.now();
                            final id =
                                'ADV-${DateFormat('yyyyMMddHHmmss').format(now)}';
                            final empCode = user.employeeId.isNotEmpty
                                ? user.employeeId
                                : user.id;
                            final emi = (amt / months).round();
                            final firstDeductDate =
                                DateTime(now.year, now.month + 1, 1);
                            final deductionStartMonth =
                                DateFormat('MMM yyyy').format(firstDeductDate);
                            final todayStr =
                                DateFormat('yyyy-MM-dd').format(now);
                            final tsStr =
                                DateFormat('yyyy-MM-dd HH:mm').format(now);
                            final schedule = List.generate(months, (idx) {
                              final d = DateTime(
                                  now.year, now.month + 1 + idx, 1);
                              final scheduled = idx == months - 1
                                  ? amt - (emi * (months - 1))
                                  : emi.toDouble();
                              final remaining =
                                  (amt - (emi * (idx + 1))).clamp(0, amt);
                              return {
                                'installmentNumber': idx + 1,
                                'periodMonth': DateFormat('MMM yyyy').format(d),
                                'scheduledAmount': scheduled,
                                'actualDeducted': 0,
                                'remainingBalance': remaining,
                                'status': 'Pending',
                              };
                            });
                            await ref
                                .read(hrmsRepositoryProvider)
                                .submitLoanRequest({
                              'id': id,
                              'employeeId': empCode,
                              'employeeName': user.name,
                              'department': user.department ?? 'General',
                              'designation': user.designation ?? 'Staff',
                              'requestType': requestType,
                              'requestedAmount': amt,
                              'installmentMonths': months,
                              'monthlyDeduction': emi,
                              'deductionStartMonth': deductionStartMonth,
                              'outstandingBalance': amt,
                              'purpose': purposeCtrl.text.trim(),
                              'neededByDate': todayStr,
                              'requestedDate': todayStr,
                              'status': 'Pending',
                              'repaymentSchedule': schedule,
                              'auditLogs': [
                                {
                                  'id': 'LOG-${now.millisecondsSinceEpoch}-1',
                                  'loanId': id,
                                  'action': 'Loan Requested',
                                  'performedBy': '${user.name} ($empCode)',
                                  'performedByRole': user.role,
                                  'timestamp': tsStr,
                                  'notes':
                                      'Requested from BUSINZ HRMS mobile. Reason: ${purposeCtrl.text.trim()}',
                                }
                              ],
                            });
                            if (!context.mounted) return;
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text(
                                      'Advance salary request submitted.')),
                            );
                            _reload();
                          } catch (error) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(error.toString()),
                                backgroundColor:
                                    Theme.of(context).colorScheme.error,
                              ),
                            );
                          } finally {
                            if (context.mounted) {
                              setModalState(() => submitting = false);
                            }
                          }
                        },
                  child: Text(submitting ? 'Submitting…' : 'Submit Request'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    amountCtrl.dispose();
    purposeCtrl.dispose();
    monthsCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return Scaffold(
      floatingActionButton: user.isCeo
          ? null
          : FloatingActionButton.extended(
              onPressed: _openApplySheet,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Apply Advance'),
            ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppSkeletonList(itemCount: 4, height: 96);
          }
          if (snapshot.hasError) {
            return AppErrorView(error: snapshot.error!, onRetry: _reload);
          }
          final all = snapshot.data ?? const [];
          final filtered = _statusFilter == 'All'
              ? all
              : all.where((r) {
                  final st = (r['status'] ?? '').toString().trim().toLowerCase();
                  if (_statusFilter == 'Disbursed') {
                    return st == 'disbursed' || st == 'active';
                  }
                  return st == _statusFilter.toLowerCase();
                }).toList(growable: false);

          final totalOutstanding = all.fold<double>(
            0,
            (s, r) =>
                s + (double.tryParse('${r['outstandingBalance'] ?? 0}') ?? 0),
          );

          return RefreshIndicator(
            onRefresh: () async {
              _reload();
              await _future;
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: CompactKpiCard(
                        label: 'Requests',
                        value: '${all.length}',
                        icon: Icons.receipt_outlined,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: CompactKpiCard(
                        label: 'Outstanding',
                        value: formatInr(totalOutstanding),
                        icon: Icons.currency_rupee_rounded,
                        accentColor: AppTokens.warning,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children:
                        ['All', 'Pending', 'Approved', 'Disbursed', 'Rejected']
                            .map((st) => Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: FilterChip(
                                    selected: _statusFilter == st,
                                    label: Text(st),
                                    onSelected: (_) =>
                                        setState(() => _statusFilter = st),
                                  ),
                                ))
                            .toList(),
                  ),
                ),
                const SizedBox(height: 12),
                if (filtered.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 32),
                    child: EmptyState(
                      icon: Icons.currency_rupee_rounded,
                      title: 'No advance salary records',
                      message:
                          'Submitted salary advance and employee loan records appear here.',
                    ),
                  )
                else
                  ...filtered.map((row) {
                    final id = row['id']?.toString() ?? '';
                    final name = (row['employeeName'] ?? 'Employee').toString();
                    final status = (row['status'] ?? 'Pending').toString();
                    final reqAmt =
                        double.tryParse('${row['requestedAmount'] ?? 0}') ?? 0;
                    final emi =
                        double.tryParse('${row['monthlyDeduction'] ?? 0}') ?? 0;
                    final months = row['installmentMonths'] ?? 1;
                    final purpose = (row['purpose'] ?? '').toString();
                    final isPending = status.toLowerCase() == 'pending';

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
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(name,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15)),
                                      Text(
                                        '${row['requestType'] ?? 'Advance Salary'} · $months mo EMI (${formatInr(emi)}/mo)',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall,
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      formatInr(reqAmt),
                                      style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    StatusPill(status),
                                  ],
                                ),
                              ],
                            ),
                            if (purpose.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Text(purpose,
                                  style: Theme.of(context).textTheme.bodySmall),
                            ],
                            if (isPending && (user.isCeo || user.isHr)) ...[
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: () async {
                                        try {
                                          await ref
                                              .read(hrmsRepositoryProvider)
                                              .reviewLoanRequest(
                                                id: id,
                                                status: 'Rejected',
                                                reviewedBy: user.name,
                                              );
                                          if (!context.mounted) return;
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(
                                            const SnackBar(
                                                content: Text(
                                                    'Advance salary request rejected.')),
                                          );
                                          _reload();
                                        } catch (err) {
                                          if (!context.mounted) return;
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(
                                            SnackBar(
                                              content: Text(err.toString()),
                                              backgroundColor: Theme.of(context)
                                                  .colorScheme
                                                  .error,
                                            ),
                                          );
                                        }
                                      },
                                      child: const Text('Reject'),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: FilledButton(
                                      onPressed: () async {
                                        try {
                                          await ref
                                              .read(hrmsRepositoryProvider)
                                              .reviewLoanRequest(
                                                id: id,
                                                status: 'Approved',
                                                reviewedBy: user.name,
                                                approvedAmount: reqAmt,
                                              );
                                          if (!context.mounted) return;
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(
                                            const SnackBar(
                                                content: Text(
                                                    'Advance salary request approved.')),
                                          );
                                          _reload();
                                        } catch (err) {
                                          if (!context.mounted) return;
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(
                                            SnackBar(
                                              content: Text(err.toString()),
                                              backgroundColor: Theme.of(context)
                                                  .colorScheme
                                                  .error,
                                            ),
                                          );
                                        }
                                      },
                                      child: const Text('Approve'),
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
            ),
          );
        },
      ),
    );
  }
}

// =============================================================================
// 2. HOLIDAY CALENDAR SCREEN
// =============================================================================

class HolidaysScreen extends ConsumerStatefulWidget {
  const HolidaysScreen({super.key});

  @override
  ConsumerState<HolidaysScreen> createState() => _HolidaysScreenState();
}

class _HolidaysScreenState extends ConsumerState<HolidaysScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(hrmsRepositoryProvider).holidays();
  }

  void _reload() =>
      setState(() => _future = ref.read(hrmsRepositoryProvider).holidays());

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const AppSkeletonList(itemCount: 6, height: 74);
        }
        if (snapshot.hasError) {
          return AppErrorView(error: snapshot.error!, onRetry: _reload);
        }
        final items =
            List<Map<String, dynamic>>.from(snapshot.data ?? const []);
        items.sort((a, b) => (a['date'] ?? '')
            .toString()
            .compareTo((b['date'] ?? '').toString()));
        if (items.isEmpty) {
          return const EmptyState(
            icon: Icons.beach_access_outlined,
            title: 'No holidays configured',
            message: 'Published company holidays will appear here.',
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            _reload();
            await _future;
          },
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final row = items[index];
              final rawDate = (row['date'] ?? '').toString();
              final parsed = DateTime.tryParse(rawDate);
              final upcoming = parsed != null &&
                  !parsed.isBefore(DateTime(now.year, now.month, now.day));
              final title =
                  (row['name'] ?? row['title'] ?? 'Holiday').toString();
              final type =
                  (row['type'] ?? row['policyName'] ?? 'Public Holiday')
                      .toString();

              return Card(
                child: ListTile(
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  leading: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: (upcoming
                              ? Theme.of(context).colorScheme.primary
                              : Theme.of(context).colorScheme.outline)
                          .withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          parsed != null
                              ? DateFormat('dd').format(parsed)
                              : '—',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: upcoming
                                ? Theme.of(context).colorScheme.primary
                                : Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                          ),
                        ),
                        Text(
                          parsed != null
                              ? DateFormat('MMM').format(parsed).toUpperCase()
                              : '',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: upcoming
                                ? Theme.of(context).colorScheme.primary
                                : Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  title: Text(title,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                    parsed != null
                        ? '${DateFormat('EEEE').format(parsed)} · $type'
                        : type,
                  ),
                  trailing: StatusPill(upcoming ? 'Upcoming' : 'Completed'),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

// =============================================================================
// 3. ATTENDANCE & WORKFORCE REPORT SCREEN (Single Date / Range + Excel & PDF)
// =============================================================================

enum _ReportCategory {
  present('Present', Icons.how_to_reg_rounded),
  absent('Absent', Icons.person_off_outlined),
  leave('Leave', Icons.event_busy_outlined),
  late('Late', Icons.schedule_rounded),
  halfDay('Half Day', Icons.timelapse_rounded),
  overtime('All Employee OT', Icons.more_time_rounded);

  const _ReportCategory(this.label, this.icon);
  final String label;
  final IconData icon;
}

class _ReportRow {
  const _ReportRow({
    required this.employeeId,
    required this.employeeName,
    required this.department,
    required this.designation,
    required this.dateLabel,
    required this.checkIn,
    required this.checkOut,
    required this.workingHours,
    required this.otHours,
    required this.statusLabel,
    required this.remarks,
  });

  final String employeeId;
  final String employeeName;
  final String department;
  final String designation;
  final String dateLabel;
  final String checkIn;
  final String checkOut;
  final String workingHours;
  final String otHours;
  final String statusLabel;
  final String remarks;
}

class _ReportBundle {
  const _ReportBundle({
    required this.employees,
    required this.presentRows,
    required this.absentRows,
    required this.leaveRows,
    required this.lateRows,
    required this.halfDayRows,
    required this.otRows,
  });

  final List<Map<String, dynamic>> employees;
  final List<_ReportRow> presentRows;
  final List<_ReportRow> absentRows;
  final List<_ReportRow> leaveRows;
  final List<_ReportRow> lateRows;
  final List<_ReportRow> halfDayRows;
  final List<_ReportRow> otRows;

  List<_ReportRow> rowsFor(_ReportCategory category) => switch (category) {
        _ReportCategory.present => presentRows,
        _ReportCategory.absent => absentRows,
        _ReportCategory.leave => leaveRows,
        _ReportCategory.late => lateRows,
        _ReportCategory.halfDay => halfDayRows,
        _ReportCategory.overtime => otRows,
      };
}

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  late DateTime _fromDate;
  late DateTime _toDate;
  bool _isRangeMode = false;
  _ReportCategory _category = _ReportCategory.present;
  String _search = '';
  bool _exporting = false;
  late Future<_ReportBundle> _future;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _fromDate = DateTime(now.year, now.month, now.day);
    _toDate = _fromDate;
    _future = _load();
  }

  DateTime get _effectiveEnd =>
      _isRangeMode ? (_toDate.isBefore(_fromDate) ? _fromDate : _toDate) : _fromDate;

  String get _periodLabel {
    final startFmt = DateFormat('dd MMM yyyy').format(_fromDate);
    if (!_isRangeMode || _effectiveEnd == _fromDate) return startFmt;
    return '$startFmt – ${DateFormat('dd MMM yyyy').format(_effectiveEnd)}';
  }

  void _reload() => setState(() => _future = _load());

  Future<_ReportBundle> _load() async {
    final repo = ref.read(hrmsRepositoryProvider);
    final fromIso = DateFormat('yyyy-MM-dd').format(_fromDate);
    final toIso = DateFormat('yyyy-MM-dd').format(_effectiveEnd);

    final results = await Future.wait<dynamic>([
      repo
          .employees(activeOnly: true)
          .catchError((_) => <Map<String, dynamic>>[]),
      repo
          .fetchAttendanceRange(
            fromIso: fromIso,
            toIso: toIso,
            descending: true,
            limit: 3000,
          )
          .catchError((_) => <Map<String, dynamic>>[]),
      repo.leaves().catchError((_) => <Map<String, dynamic>>[]),
      repo.holidays().catchError((_) => <Map<String, dynamic>>[]),
      repo.overtimeRecords().catchError((_) => <Map<String, dynamic>>[]),
      if (fromIso == toIso)
        repo
            .attendance(date: fromIso)
            .catchError((_) => <Map<String, dynamic>>[])
      else
        Future.value(<Map<String, dynamic>>[]),
    ]);

    final employees = excludeCeoEmployees(
      (results[0] as List<Map<String, dynamic>>),
    )..sort((a, b) => _empCode(a).compareTo(_empCode(b)));

    final gatewayAtt = results[1] as List<Map<String, dynamic>>;
    final fallbackDayAtt = results[5] as List<Map<String, dynamic>>;
    final rawAttendance = gatewayAtt.isNotEmpty ? gatewayAtt : fallbackDayAtt;
    final leaves = results[2] as List<Map<String, dynamic>>;
    final holidays = results[3] as List<Map<String, dynamic>>;
    final otRecords = results[4] as List<Map<String, dynamic>>;

    // Build holiday ISO set
    final holidayDates = <String>{};
    for (final h in holidays) {
      final d = _isoDate(h['date'] ?? h['holiday_date']);
      if (d.isNotEmpty) holidayDates.add(d);
    }

    // Build employee lookup by code, uuid, and lower name
    final empById = <String, Map<String, dynamic>>{};
    for (final e in employees) {
      final code = _empCode(e).toLowerCase();
      final uuid = (e['id'] ?? '').toString().trim().toLowerCase();
      if (code.isNotEmpty) empById[code] = e;
      if (uuid.isNotEmpty) empById[uuid] = e;
    }

    // Index attendance by (employeeCode|date)
    final attByEmpDate = <String, Map<String, dynamic>>{};
    for (final rec in rawAttendance) {
      final dIso = _isoDate(rec['date'] ?? rec['shift_date'] ?? rec['shiftDate']);
      if (dIso.isEmpty ||
          dIso.compareTo(fromIso) < 0 ||
          dIso.compareTo(toIso) > 0) {
        continue;
      }
      final rawEmp =
          (rec['employee_id'] ?? rec['employeeId'] ?? '').toString().trim();
      final emp = empById[rawEmp.toLowerCase()];
      if (emp == null) continue; // skips CEO & inactive staff
      final key = '${_empCode(emp).toUpperCase()}|$dIso';
      final existing = attByEmpDate[key];
      if (existing == null ||
          (_hasText(rec['check_out'] ?? rec['checkOut']) &&
              !_hasText(existing['check_out'] ?? existing['checkOut']))) {
        attByEmpDate[key] = rec;
      }
    }

    // Index approved leaves overlapping [fromIso, toIso] by (employeeCode|date)
    final leaveByEmpDate = <String, Map<String, dynamic>>{};
    for (final lr in leaves) {
      final st = (lr['status'] ?? '').toString().trim().toLowerCase();
      if (st != 'approved') continue;
      final sIso = _isoDate(lr['startDate'] ?? lr['start_date']);
      final eIso = _isoDate(lr['endDate'] ?? lr['end_date'] ?? sIso);
      if (sIso.isEmpty || eIso.isEmpty) continue;
      if (eIso.compareTo(fromIso) < 0 || sIso.compareTo(toIso) > 0) continue;
      final rawEmp =
          (lr['employeeId'] ?? lr['employee_id'] ?? '').toString().trim();
      final emp = empById[rawEmp.toLowerCase()];
      if (emp == null) continue;
      final code = _empCode(emp).toUpperCase();
      final startDt = DateTime.tryParse(sIso);
      final endDt = DateTime.tryParse(eIso);
      if (startDt == null || endDt == null) continue;
      var cursor = startDt;
      while (!cursor.isAfter(endDt)) {
        final dIso = DateFormat('yyyy-MM-dd').format(cursor);
        if (dIso.compareTo(fromIso) >= 0 && dIso.compareTo(toIso) <= 0) {
          leaveByEmpDate['$code|$dIso'] = lr;
        }
        cursor = cursor.add(const Duration(days: 1));
      }
    }

    // Index approved/logged OT records by (employeeCode|date)
    final otByEmpDate = <String, double>{};
    for (final ot in otRecords) {
      final dIso = _isoDate(ot['date'] ?? ot['overtimeDate']);
      if (dIso.isEmpty ||
          dIso.compareTo(fromIso) < 0 ||
          dIso.compareTo(toIso) > 0) {
        continue;
      }
      final st = (ot['status'] ?? '').toString().trim().toLowerCase();
      if (st == 'rejected' || st == 'cancelled') continue;
      final rawEmp =
          (ot['employeeId'] ?? ot['employee_id'] ?? '').toString().trim();
      final emp = empById[rawEmp.toLowerCase()];
      if (emp == null) continue;
      final hrs = double.tryParse(
              '${ot['approvedOtHours'] ?? ot['otHours'] ?? ot['hours'] ?? 0}') ??
          0;
      if (hrs <= 0) continue;
      final key = '${_empCode(emp).toUpperCase()}|$dIso';
      if (hrs > (otByEmpDate[key] ?? 0)) {
        otByEmpDate[key] = hrs;
      }
    }

    // Enumerate all dates in [fromDate, effectiveEnd]
    final dates = <DateTime>[];
    var cur = _fromDate;
    final todayFloor = DateTime(
      DateTime.now().year,
      DateTime.now().month,
      DateTime.now().day,
    );
    while (!cur.isAfter(_effectiveEnd)) {
      dates.add(cur);
      cur = cur.add(const Duration(days: 1));
    }

    final presentRows = <_ReportRow>[];
    final absentRows = <_ReportRow>[];
    final leaveRows = <_ReportRow>[];
    final lateRows = <_ReportRow>[];
    final halfDayRows = <_ReportRow>[];
    final otPerEmployee = <String, _OtAccumulator>{};

    for (final day in dates) {
      final dIso = DateFormat('yyyy-MM-dd').format(day);
      final dLabel = DateFormat('dd MMM yyyy').format(day);
      final isSunday = day.weekday == DateTime.sunday;
      final isHoliday = holidayDates.contains(dIso);
      final isFuture = day.isAfter(todayFloor);

      for (final emp in employees) {
        final code = _empCode(emp).toUpperCase();
        final name = _empName(emp);
        final dept = (emp['department'] ?? emp['departmentName'] ?? '')
            .toString()
            .trim();
        final desig =
            (emp['designation'] ?? emp['jobTitle'] ?? '').toString().trim();
        final key = '$code|$dIso';
        final att = attByEmpDate[key];
        final lr = leaveByEmpDate[key];

        // Overtime aggregation from both attendance_records & overtime_requests
        final attOt = double.tryParse(
                '${att?['calculated_ot_hours'] ?? att?['overtimeHours'] ?? att?['ot_hours'] ?? 0}') ??
            0;
        final reqOt = otByEmpDate[key] ?? 0;
        final dayOt = attOt > reqOt ? attOt : reqOt;
        if (dayOt > 0) {
          final acc = otPerEmployee.putIfAbsent(
            code,
            () => _OtAccumulator(
              employeeId: code,
              employeeName: name,
              department: dept,
              designation: desig,
            ),
          );
          acc.totalHours += dayOt;
          acc.days += 1;
          acc.lastDateLabel = dLabel;
        }

        if (lr != null) {
          final lType = (lr['leaveType'] ?? lr['leave_type'] ?? 'Leave')
              .toString()
              .trim();
          final reason = (lr['reason'] ?? '').toString().trim();
          leaveRows.add(_ReportRow(
            employeeId: code,
            employeeName: name,
            department: dept,
            designation: desig,
            dateLabel: dLabel,
            checkIn: '-',
            checkOut: '-',
            workingHours: '-',
            otHours: '-',
            statusLabel: lType,
            remarks: reason.isEmpty ? 'Approved Leave' : reason,
          ));
          continue;
        }

        if (att != null) {
          final stRaw = (att['status'] ?? 'Present').toString().trim();
          final stLower = stRaw.toLowerCase();
          final checkIn = _fmtTime(att['check_in'] ?? att['checkIn']);
          final checkOut = _fmtTime(att['check_out'] ?? att['checkOut']);
          final workHrs = _computeWorkHours(att);
          final workLabel = workHrs > 0 ? '${workHrs.toStringAsFixed(1)}h' : '-';
          final otLabel = dayOt > 0 ? '${dayOt.toStringAsFixed(1)}h' : '-';
          final lateMins = int.tryParse(
                  '${att['late_duration_minutes'] ?? att['lateMinutes'] ?? 0}') ??
              0;
          final lateStatus =
              (att['late_status'] ?? att['lateStatus'] ?? '').toString().toLowerCase();
          final isLate = stLower == 'late' ||
              lateStatus.contains('late') ||
              lateMins > 0;
          final isHalfDay = stLower.contains('half') ||
              stLower == 'hd' ||
              (checkOut != '-' && workHrs > 0 && workHrs < 6.3);

          if (stLower == 'absent') {
            absentRows.add(_ReportRow(
              employeeId: code,
              employeeName: name,
              department: dept,
              designation: desig,
              dateLabel: dLabel,
              checkIn: '-',
              checkOut: '-',
              workingHours: '-',
              otHours: '-',
              statusLabel: 'Absent',
              remarks: 'Marked Absent',
            ));
          } else if (stLower.contains('leave')) {
            leaveRows.add(_ReportRow(
              employeeId: code,
              employeeName: name,
              department: dept,
              designation: desig,
              dateLabel: dLabel,
              checkIn: '-',
              checkOut: '-',
              workingHours: '-',
              otHours: '-',
              statusLabel: stRaw,
              remarks: 'On Leave',
            ));
          } else {
            presentRows.add(_ReportRow(
              employeeId: code,
              employeeName: name,
              department: dept,
              designation: desig,
              dateLabel: dLabel,
              checkIn: checkIn,
              checkOut: checkOut,
              workingHours: workLabel,
              otHours: otLabel,
              statusLabel: isHalfDay
                  ? 'Half Day'
                  : (isLate ? 'Late' : stRaw),
              remarks: lateMins > 0 ? 'Late by ${lateMins}m' : 'On Time',
            ));
            if (isLate) {
              lateRows.add(_ReportRow(
                employeeId: code,
                employeeName: name,
                department: dept,
                designation: desig,
                dateLabel: dLabel,
                checkIn: checkIn,
                checkOut: checkOut,
                workingHours: workLabel,
                otHours: otLabel,
                statusLabel: lateMins > 0 ? 'Late (${lateMins}m)' : 'Late',
                remarks: 'Check-in: $checkIn',
              ));
            }
            if (isHalfDay) {
              halfDayRows.add(_ReportRow(
                employeeId: code,
                employeeName: name,
                department: dept,
                designation: desig,
                dateLabel: dLabel,
                checkIn: checkIn,
                checkOut: checkOut,
                workingHours: workLabel,
                otHours: otLabel,
                statusLabel: 'Half Day',
                remarks: workHrs > 0
                    ? 'Worked ${workHrs.toStringAsFixed(1)} hrs (< 70% shift)'
                    : 'Half day attendance',
              ));
            }
          }
        } else if (!isSunday && !isHoliday && !isFuture) {
          absentRows.add(_ReportRow(
            employeeId: code,
            employeeName: name,
            department: dept,
            designation: desig,
            dateLabel: dLabel,
            checkIn: '-',
            checkOut: '-',
            workingHours: '-',
            otHours: '-',
            statusLabel: 'Absent',
            remarks: 'No punch recorded',
          ));
        }
      }
    }

    final otRows = otPerEmployee.values.map((acc) {
      return _ReportRow(
        employeeId: acc.employeeId,
        employeeName: acc.employeeName,
        department: acc.department,
        designation: acc.designation,
        dateLabel: _isRangeMode ? '${acc.days} day(s)' : acc.lastDateLabel,
        checkIn: '-',
        checkOut: '-',
        workingHours: '-',
        otHours: '${acc.totalHours.toStringAsFixed(1)}h',
        statusLabel: 'OT ${acc.totalHours.toStringAsFixed(1)} hrs',
        remarks: '${acc.days} day(s) with overtime',
      );
    }).toList()
      ..sort((a, b) => b.otHours.compareTo(a.otHours));

    return _ReportBundle(
      employees: employees,
      presentRows: presentRows,
      absentRows: absentRows,
      leaveRows: leaveRows,
      lateRows: lateRows,
      halfDayRows: halfDayRows,
      otRows: otRows,
    );
  }

  Future<void> _pickSingleDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(2024, 1, 1),
      lastDate: DateTime.now().add(const Duration(days: 30)),
      initialDate: _fromDate,
    );
    if (picked != null && mounted) {
      setState(() {
        _fromDate = picked;
        _toDate = picked;
      });
      _reload();
    }
  }

  Future<void> _pickRange({required bool isStart}) async {
    final picked = await showDatePicker(
      context: context,
      firstDate: isStart ? DateTime(2024, 1, 1) : _fromDate,
      lastDate: DateTime.now().add(const Duration(days: 30)),
      initialDate: isStart ? _fromDate : _effectiveEnd,
    );
    if (picked != null && mounted) {
      setState(() {
        if (isStart) {
          _fromDate = picked;
          if (_toDate.isBefore(_fromDate)) _toDate = _fromDate;
        } else {
          _toDate = picked;
        }
      });
      _reload();
    }
  }

  Future<void> _exportExcel(List<_ReportRow> rows) async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      final headers = _category == _ReportCategory.overtime
          ? const [
              'Emp ID',
              'Employee Name',
              'Department',
              'Designation',
              'OT Days / Date',
              'Total OT Hours',
              'Remarks',
            ]
          : const [
              'Emp ID',
              'Employee Name',
              'Department',
              'Designation',
              'Date',
              'Check In',
              'Check Out',
              'Work Hrs',
              'OT Hrs',
              'Status',
              'Remarks',
            ];
      final tableRows = rows
          .map((r) => _category == _ReportCategory.overtime
              ? [
                  r.employeeId,
                  r.employeeName,
                  r.department,
                  r.designation,
                  r.dateLabel,
                  r.otHours,
                  r.remarks,
                ]
              : [
                  r.employeeId,
                  r.employeeName,
                  r.department,
                  r.designation,
                  r.dateLabel,
                  r.checkIn,
                  r.checkOut,
                  r.workingHours,
                  r.otHours,
                  r.statusLabel,
                  r.remarks,
                ])
          .toList(growable: false);

      final slug = _category.label.toLowerCase().replaceAll(' ', '_');
      final dateSlug = DateFormat('yyyyMMdd').format(_fromDate);
      final bytes = FileShareHelper.buildExcelSpreadsheetXml(
        sheetName: _category.label,
        title: 'BUSINZ HRMS — ${_category.label} Report',
        subtitle: 'Period: $_periodLabel  |  Total Records: ${rows.length}',
        headers: headers,
        rows: tableRows,
      );
      await FileShareHelper.shareBytes(
        fileName: 'BUSINZ_${slug}_report_$dateSlug.xls',
        bytes: bytes,
        mimeType: 'application/vnd.ms-excel',
      );
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Excel export failed: $err')),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _exportPdf(List<_ReportRow> rows) async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      final isOt = _category == _ReportCategory.overtime;
      final headers = isOt
          ? const ['Emp ID', 'Employee Name', 'Department', 'OT Days', 'OT Hrs', 'Remarks']
          : const ['Emp ID', 'Employee Name', 'Department', 'Date', 'In', 'Out', 'Hrs', 'Status'];
      final tableData = rows
          .map((r) => isOt
              ? [
                  r.employeeId,
                  r.employeeName,
                  r.department,
                  r.dateLabel,
                  r.otHours,
                  r.remarks,
                ]
              : [
                  r.employeeId,
                  r.employeeName,
                  r.department,
                  r.dateLabel,
                  r.checkIn,
                  r.checkOut,
                  r.workingHours,
                  r.statusLabel,
                ])
          .toList(growable: false);

      final doc = pw.Document(
        title: 'BUSINZ HRMS ${_category.label} Report',
        author: 'BUSINZ HRMS',
      );
      doc.addPage(
        pw.MultiPage(
          pageFormat: PdfPageFormat.a4.landscape,
          margin: const pw.EdgeInsets.all(24),
          build: (_) => [
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'BUSINZ HRMS — ${_category.label.toUpperCase()} REPORT',
                      style: const pw.TextStyle(
                        fontSize: 15,
                        fontWeight: pw.FontWeight.bold,
                        color: PdfColor.fromInt(0xFF0E7490),
                      ),
                    ),
                    pw.SizedBox(height: 3),
                    pw.Text(
                      'Period: $_periodLabel  |  Records: ${rows.length}',
                      style: const pw.TextStyle(
                        fontSize: 9.5,
                        color: PdfColors.grey700,
                      ),
                    ),
                  ],
                ),
                pw.Text(
                  'Generated: ${DateFormat('dd MMM yyyy, hh:mm a').format(DateTime.now())}',
                  style: const pw.TextStyle(
                    fontSize: 8.5,
                    color: PdfColors.grey600,
                  ),
                ),
              ],
            ),
            pw.SizedBox(height: 12),
            if (tableData.isEmpty)
              pw.Padding(
                padding: const pw.EdgeInsets.symmetric(vertical: 20),
                child: pw.Text(
                  'No records found for the selected filter and period.',
                  style: const pw.TextStyle(fontSize: 11),
                ),
              )
            else
              pw.TableHelper.fromTextArray(
                headers: headers,
                data: tableData,
                headerStyle: const pw.TextStyle(
                  fontSize: 9,
                  fontWeight: pw.FontWeight.bold,
                  color: PdfColors.white,
                ),
                headerDecoration: const pw.BoxDecoration(
                  color: PdfColor.fromInt(0xFF0E7490),
                ),
                cellStyle: const pw.TextStyle(fontSize: 8.5),
                oddRowDecoration: const pw.BoxDecoration(
                  color: PdfColor.fromInt(0xFFF8FAFC),
                ),
                border: pw.TableBorder.all(
                  color: PdfColors.grey300,
                  width: 0.5,
                ),
                cellPadding: const pw.EdgeInsets.symmetric(
                  horizontal: 6,
                  vertical: 5,
                ),
              ),
          ],
        ),
      );
      final slug = _category.label.toLowerCase().replaceAll(' ', '_');
      final dateSlug = DateFormat('yyyyMMdd').format(_fromDate);
      await Printing.layoutPdf(
        name: 'BUSINZ_${slug}_report_$dateSlug.pdf',
        onLayout: (_) => doc.save(),
      );
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('PDF export failed: $err')),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final now = DateTime.now();
    final todayFloor = DateTime(now.year, now.month, now.day);
    final isTodaySelected = !_isRangeMode && _fromDate == todayFloor;

    return FutureBuilder<_ReportBundle>(
      future: _future,
      builder: (context, snapshot) {
        final bundle = snapshot.data;
        final isReady = snapshot.connectionState == ConnectionState.done;
        final rawRows = bundle?.rowsFor(_category) ?? const <_ReportRow>[];
        final q = _search.trim().toLowerCase();
        final visibleRows = q.isEmpty
            ? rawRows
            : rawRows.where((r) {
                return r.employeeName.toLowerCase().contains(q) ||
                    r.employeeId.toLowerCase().contains(q) ||
                    r.department.toLowerCase().contains(q) ||
                    r.statusLabel.toLowerCase().contains(q);
              }).toList(growable: false);

        const gridOrder = [
          _ReportCategory.present,
          _ReportCategory.absent,
          _ReportCategory.late,
          _ReportCategory.leave,
          _ReportCategory.halfDay,
          _ReportCategory.overtime,
        ];

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
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Row 1: Compact Mode Switch + Single-Line Excel & PDF Export Pills
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              color: scheme.surfaceContainerHighest
                                  .withValues(alpha: 0.65),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                _ReportModeTab(
                                  label: 'Single Date',
                                  selected: !_isRangeMode,
                                  onTap: () {
                                    if (_isRangeMode) {
                                      setState(() {
                                        _isRangeMode = false;
                                        _toDate = _fromDate;
                                      });
                                      _reload();
                                    }
                                  },
                                ),
                                _ReportModeTab(
                                  label: 'Date Range',
                                  selected: _isRangeMode,
                                  onTap: () {
                                    if (!_isRangeMode) {
                                      setState(() {
                                        _isRangeMode = true;
                                        _fromDate = DateTime(
                                          _toDate.year,
                                          _toDate.month,
                                          1,
                                        );
                                      });
                                      _reload();
                                    }
                                  },
                                ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          _ReportExportPill(
                            label: 'Excel',
                            semanticsLabel: 'Download Excel',
                            icon: Icons.table_view_rounded,
                            filled: false,
                            onTap: (_exporting || !isReady)
                                ? null
                                : () => _exportExcel(visibleRows),
                          ),
                          const SizedBox(width: 6),
                          _ReportExportPill(
                            label: 'PDF',
                            semanticsLabel: 'Download PDF',
                            icon: Icons.picture_as_pdf_rounded,
                            filled: true,
                            onTap: (_exporting || !isReady)
                                ? null
                                : () => _exportPdf(visibleRows),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),

                      // Row 2: Sleek Single-Line Date Stepper / Range Selector
                      Container(
                        height: 44,
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        decoration: BoxDecoration(
                          color: scheme.surface,
                          borderRadius: BorderRadius.circular(13),
                          border: Border.all(color: scheme.outlineVariant),
                        ),
                        child: !_isRangeMode
                            ? Row(
                                children: [
                                  IconButton(
                                    visualDensity: VisualDensity.compact,
                                    tooltip: 'Previous day',
                                    onPressed: () {
                                      setState(() {
                                        _fromDate = _fromDate
                                            .subtract(const Duration(days: 1));
                                        _toDate = _fromDate;
                                      });
                                      _reload();
                                    },
                                    icon: const Icon(
                                        Icons.chevron_left_rounded,
                                        size: 20),
                                  ),
                                  Expanded(
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(8),
                                      onTap: _pickSingleDate,
                                      child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                            Icons.calendar_today_rounded,
                                            size: 15,
                                            color: scheme.primary,
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            DateFormat('EEE, dd MMM yyyy')
                                                .format(_fromDate),
                                            style: const TextStyle(
                                              fontSize: 13.5,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                  if (!isTodaySelected)
                                    TextButton(
                                      style: TextButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8),
                                        minimumSize: const Size(0, 32),
                                      ),
                                      onPressed: () {
                                        setState(() {
                                          _fromDate = todayFloor;
                                          _toDate = todayFloor;
                                        });
                                        _reload();
                                      },
                                      child: const Text(
                                        'Today',
                                        style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w800),
                                      ),
                                    ),
                                  IconButton(
                                    visualDensity: VisualDensity.compact,
                                    tooltip: 'Next day',
                                    onPressed: () {
                                      setState(() {
                                        _fromDate = _fromDate
                                            .add(const Duration(days: 1));
                                        _toDate = _fromDate;
                                      });
                                      _reload();
                                    },
                                    icon: const Icon(
                                        Icons.chevron_right_rounded,
                                        size: 20),
                                  ),
                                ],
                              )
                            : Row(
                                children: [
                                  Expanded(
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(8),
                                      onTap: () => _pickRange(isStart: true),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 8),
                                        child: Row(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Icon(Icons.calendar_today_outlined,
                                                size: 14,
                                                color: scheme.primary),
                                            const SizedBox(width: 5),
                                            Text(
                                              DateFormat('dd MMM yyyy')
                                                  .format(_fromDate),
                                              style: const TextStyle(
                                                fontSize: 12.5,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                  Icon(Icons.arrow_forward_rounded,
                                      size: 15,
                                      color: scheme.onSurfaceVariant),
                                  Expanded(
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(8),
                                      onTap: () => _pickRange(isStart: false),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 8),
                                        child: Row(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Icon(Icons.event_outlined,
                                                size: 14,
                                                color: scheme.primary),
                                            const SizedBox(width: 5),
                                            Text(
                                              DateFormat('dd MMM yyyy')
                                                  .format(_effectiveEnd),
                                              style: const TextStyle(
                                                fontSize: 12.5,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                      ),
                      const SizedBox(height: 10),

                      // 3x2 At-a-Glance Category Selector Grid (zero horizontal scroll!)
                      GridView.builder(
                        shrinkWrap: true,
                        padding: EdgeInsets.zero,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: gridOrder.length,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                          mainAxisExtent: 56,
                        ),
                        itemBuilder: (context, idx) {
                          final cat = gridOrder[idx];
                          final selected = _category == cat;
                          final count = bundle?.rowsFor(cat).length ?? 0;
                          final shortLabel = cat == _ReportCategory.overtime
                              ? 'OT'
                              : cat.label;
                          final accent = _categoryAccent(cat);
                          return Material(
                            color: selected
                                ? scheme.primaryContainer
                                    .withValues(alpha: 0.55)
                                : scheme.surface,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(13),
                              side: BorderSide(
                                color: selected
                                    ? scheme.primary
                                    : scheme.outlineVariant,
                                width: selected ? 1.5 : 1,
                              ),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: InkWell(
                              onTap: () => setState(() => _category = cat),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 7),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            shortLabel,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: selected
                                                  ? scheme.primary
                                                  : scheme.onSurfaceVariant,
                                            ),
                                          ),
                                        ),
                                        Container(
                                          width: 6,
                                          height: 6,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: accent,
                                          ),
                                        ),
                                      ],
                                    ),
                                    Text(
                                      '$count',
                                      style: AppTokens.kpiStyle(
                                        context,
                                        size: 18,
                                        color: selected
                                            ? scheme.primary
                                            : scheme.onSurface,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 10),
                      BusinzSearchBar(
                        hintText: 'Search employee name, ID, or department…',
                        onChanged: (v) => setState(() => _search = v),
                      ),
                    ],
                  ),
                ),
              ),
              if (!isReady)
                const SliverFillRemaining(
                  child: BusinzLoadingSkeleton(itemCount: 5, height: 72),
                )
              else if (snapshot.hasError)
                SliverFillRemaining(
                  child: BusinzErrorState(
                      error: snapshot.error!, onRetry: _reload),
                )
              else if (visibleRows.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyState(
                    icon: _category.icon,
                    title: 'No ${_category.label.toLowerCase()} records',
                    message:
                        'No matching records found for $_periodLabel.',
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(
                    16,
                    2,
                    16,
                    AppTokens.floatingNavClearance + 20,
                  ),
                  sliver: SliverList.separated(
                    itemCount: visibleRows.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final r = visibleRows[index];
                      final metaParts = <String>[
                        if (_isRangeMode) r.dateLabel,
                        if (r.checkIn != '-') 'In ${r.checkIn}',
                        if (r.checkOut != '-') 'Out ${r.checkOut}',
                        if (r.workingHours != '-') r.workingHours,
                        if (r.otHours != '-') 'OT ${r.otHours}',
                        if (r.remarks.isNotEmpty &&
                            r.remarks != 'On Time' &&
                            !r.remarks.startsWith('Check-in:'))
                          r.remarks,
                      ];
                      return Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 13, vertical: 11),
                        decoration: BoxDecoration(
                          color: scheme.surface,
                          borderRadius: BorderRadius.circular(15),
                          border: Border.all(color: scheme.outlineVariant),
                          boxShadow: AppTokens.cardShadow(context),
                        ),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 18,
                              backgroundColor: scheme.primaryContainer,
                              child: Text(
                                initialsOf(r.employeeName),
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800,
                                  color: scheme.onPrimaryContainer,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    r.employeeName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 1),
                                  Text(
                                    [r.employeeId, r.department]
                                        .where((s) => s.isNotEmpty)
                                        .join(' · '),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(fontSize: 11.5),
                                  ),
                                  if (metaParts.isNotEmpty) ...[
                                    const SizedBox(height: 3),
                                    Text(
                                      metaParts.join(' · '),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelSmall
                                          ?.copyWith(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: scheme.onSurfaceVariant,
                                          ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            StatusPill(r.statusLabel),
                          ],
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  static Color _categoryAccent(_ReportCategory cat) => switch (cat) {
        _ReportCategory.present => AppTokens.success,
        _ReportCategory.absent => AppTokens.danger,
        _ReportCategory.late => AppTokens.warning,
        _ReportCategory.leave => AppTokens.info,
        _ReportCategory.halfDay => AppTokens.solarAccent,
        _ReportCategory.overtime => AppTokens.violet,
      };

  static String _empCode(Map<String, dynamic> emp) =>
      (emp['employeeId'] ?? emp['employee_id'] ?? emp['id'] ?? '')
          .toString()
          .trim();

  static String _empName(Map<String, dynamic> emp) {
    final full = (emp['name'] ?? '').toString().trim();
    if (full.isNotEmpty) return full;
    final joined = [emp['firstName'] ?? emp['first_name'], emp['lastName'] ?? emp['last_name']]
        .where((p) => p != null && p.toString().trim().isNotEmpty)
        .join(' ')
        .trim();
    return joined.isNotEmpty ? joined : _empCode(emp);
  }

  static String _isoDate(dynamic value) {
    final raw = (value ?? '').toString().trim();
    if (raw.isEmpty) return '';
    if (raw.length >= 10 && RegExp(r'^\d{4}-\d{2}-\d{2}').hasMatch(raw)) {
      return raw.substring(0, 10);
    }
    final parsed = DateTime.tryParse(raw);
    if (parsed != null) return DateFormat('yyyy-MM-dd').format(parsed);
    return '';
  }

  static bool _hasText(dynamic value) {
    final s = (value ?? '').toString().trim().toLowerCase();
    return s.isNotEmpty &&
        s != '--:--' &&
        !s.contains('missed') &&
        !s.contains('progress');
  }

  static String _fmtTime(dynamic value) {
    final raw = (value ?? '').toString().trim();
    if (raw.isEmpty || raw == '--:--') return '-';
    final dt = DateTime.tryParse(raw);
    if (dt != null) return DateFormat('hh:mm a').format(dt.toLocal());
    return raw;
  }

  static double _computeWorkHours(Map<String, dynamic> att) {
    final direct =
        double.tryParse('${att['working_hours'] ?? att['workingHours'] ?? 0}') ??
            0;
    if (direct > 0) return direct;
    final inRaw = (att['check_in'] ?? att['checkIn'] ?? '').toString().trim();
    final outRaw =
        (att['check_out'] ?? att['checkOut'] ?? '').toString().trim();
    if (!_hasText(inRaw) || !_hasText(outRaw)) return 0;
    final inDt = DateTime.tryParse(inRaw);
    final outDt = DateTime.tryParse(outRaw);
    if (inDt != null && outDt != null) {
      final mins = outDt.difference(inDt).inMinutes;
      return mins > 0 ? mins / 60.0 : 0;
    }
    return 0;
  }
}

class _OtAccumulator {
  _OtAccumulator({
    required this.employeeId,
    required this.employeeName,
    required this.department,
    required this.designation,
  });

  final String employeeId;
  final String employeeName;
  final String department;
  final String designation;
  double totalHours = 0;
  int days = 0;
  String lastDateLabel = '';
}

class _ReportModeTab extends StatelessWidget {
  const _ReportModeTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? scheme.primary : Colors.transparent,
      borderRadius: BorderRadius.circular(9),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : scheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}

class _ReportExportPill extends StatelessWidget {
  const _ReportExportPill({
    required this.label,
    required this.semanticsLabel,
    required this.icon,
    required this.filled,
    required this.onTap,
  });

  final String label;
  final String semanticsLabel;
  final IconData icon;
  final bool filled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final enabled = onTap != null;
    final bg = filled
        ? (enabled ? scheme.primary : scheme.primary.withValues(alpha: 0.45))
        : scheme.surface;
    final fg = filled
        ? Colors.white
        : (enabled ? scheme.primary : scheme.onSurfaceVariant);
    return Semantics(
      button: true,
      label: semanticsLabel,
      child: Tooltip(
        message: semanticsLabel,
        child: Material(
          color: bg,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(11),
            side: BorderSide(
              color: filled
                  ? Colors.transparent
                  : scheme.outlineVariant,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 15, color: fg),
                  const SizedBox(width: 4),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: fg,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
