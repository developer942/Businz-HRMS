import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../../../core/widgets/proof_viewer.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class FieldAllowanceScreen extends ConsumerStatefulWidget {
  const FieldAllowanceScreen({super.key});

  @override
  ConsumerState<FieldAllowanceScreen> createState() =>
      _FieldAllowanceScreenState();
}

class _FieldAllowanceScreenState extends ConsumerState<FieldAllowanceScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  final _search = TextEditingController();
  String _statusFilter = 'ALL';

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  /// Strictly loads authoritative Finance & Claims (`field_allowance_requests`)
  /// matching Web `FieldAllowanceModule.tsx` — never merges deleted legacy expenses.
  Future<List<Map<String, dynamic>>> _load() async {
    return ref
        .read(hrmsRepositoryProvider)
        .fieldAllowanceRequests()
        .catchError((_) => <Map<String, dynamic>>[]);
  }

  void _reload() => setState(() => _future = _load());

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _FieldRequestForm(),
    );
    if (saved == true) _reload();
  }

  Future<void> _openDetails(Map<String, dynamic> summaryRow) async {
    final id = _value(summaryRow, ['id']);
    if (id.isEmpty) return;
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _FieldClaimDetailSheet(
        claimId: id,
        initialRow: summaryRow,
      ),
    );
    if (changed == true) _reload();
  }

  Future<void> _decide(
      String id, String decision, double requestedAmount) async {
    final remarks = TextEditingController();
    final amount = TextEditingController(
        text: requestedAmount > 0 ? requestedAmount.toStringAsFixed(2) : '0');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(decision == 'APPROVED'
            ? 'Approve Finance & Claim'
            : decision == 'CORRECTION_REQUESTED'
                ? 'Request Correction'
                : 'Reject Request'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          if (decision == 'APPROVED' && requestedAmount > 0)
            TextField(
              controller: amount,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration:
                  const InputDecoration(labelText: 'Approved amount (\u20B9)'),
            ),
          Padding(
            padding: EdgeInsets.only(
                top: (decision == 'APPROVED' && requestedAmount > 0) ? 12 : 0),
            child: TextField(
              controller: remarks,
              maxLines: 3,
              decoration: InputDecoration(
                  labelText: decision == 'APPROVED'
                      ? 'Remarks (optional)'
                      : decision == 'CORRECTION_REQUESTED'
                          ? 'Required correction'
                          : 'Rejection reason'),
            ),
          ),
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(decision == 'APPROVED'
                  ? 'Approve'
                  : decision == 'CORRECTION_REQUESTED'
                      ? 'Request correction'
                      : 'Reject')),
        ],
      ),
    );
    final approved =
        requestedAmount > 0 ? double.tryParse(amount.text.trim()) : 0.0;
    final note = remarks.text.trim();
    amount.dispose();
    remarks.dispose();
    if (confirmed != true) return;
    if (decision == 'APPROVED' && (approved == null || approved < 0)) {
      _message('Enter a valid approved amount.');
      return;
    }
    if (decision != 'APPROVED' && note.isEmpty) {
      _message(decision == 'CORRECTION_REQUESTED'
          ? 'Describe the correction required.'
          : 'A rejection reason is required.');
      return;
    }
    await _perform(
        () => ref.read(hrmsRepositoryProvider).decideFieldAllowance(id, {
              'decision': decision,
              if (decision == 'APPROVED') 'approvedAmount': approved ?? 0,
              if (note.isNotEmpty) 'remarks': note,
            }));
  }

  Future<void> _distribute(
    String id,
    double amountDue, {
    bool isReimbursement = false,
  }) async {
    if (amountDue <= 0) {
      _message('No payable advance or reimbursement amount for this request.');
      return;
    }
    final amountCtrl = TextEditingController(text: amountDue.toStringAsFixed(2));
    final refCtrl = TextEditingController();
    final remarksCtrl = TextEditingController();
    var paymentMethod = 'Cash';
    String? paymentProofPath;
    String? proofName;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            4,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  isReimbursement
                      ? 'Confirm Reimbursement Payout'
                      : 'Distribute Cash / Advance',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: amountCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Amount (\u20B9)',
                    prefixIcon: Icon(Icons.currency_rupee_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: paymentMethod,
                  decoration: const InputDecoration(labelText: 'Payment Method'),
                  items: const ['Cash', 'Bank Transfer', 'UPI', 'NEFT', 'Cheque']
                      .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setSheetState(() => paymentMethod = v);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: refCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Reference / UTR (optional)',
                  ),
                ),
                if (paymentMethod != 'Cash') ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final picked = await _pickProofImage(context);
                      if (picked != null) {
                        setSheetState(() {
                          paymentProofPath = picked.$1;
                          proofName = picked.$2;
                        });
                      }
                    },
                    icon: const Icon(Icons.upload_file_outlined),
                    label: Text(
                      proofName ?? 'Attach Payment Proof (Required) *',
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: remarksCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Remarks (optional)',
                  ),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: () {
                    final parsed = double.tryParse(amountCtrl.text.trim()) ?? 0;
                    if (parsed <= 0) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('Enter a valid amount greater than 0.')),
                      );
                      return;
                    }
                    if (paymentMethod != 'Cash' &&
                        (paymentProofPath == null || paymentProofPath!.isEmpty)) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                              'Payment proof is required for non-cash payout.'),
                        ),
                      );
                      return;
                    }
                    Navigator.pop(context, true);
                  },
                  child: Text(isReimbursement
                      ? 'Confirm Reimbursement'
                      : 'Confirm Distribution'),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    final finalAmount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    final refNo = refCtrl.text.trim();
    final remarks = remarksCtrl.text.trim();
    amountCtrl.dispose();
    refCtrl.dispose();
    remarksCtrl.dispose();

    if (saved != true || finalAmount <= 0) return;

    await _perform(
        () => ref.read(hrmsRepositoryProvider).distributeFieldAllowance(id, {
              'distributedAmount': finalAmount,
              'distributionDate':
                  DateFormat('yyyy-MM-dd').format(DateTime.now()),
              'paymentMethod': paymentMethod,
              if (refNo.isNotEmpty) 'referenceNumber': refNo,
              if (paymentProofPath != null)
                'paymentProofPath': paymentProofPath,
              'remarks': remarks.isNotEmpty
                  ? remarks
                  : 'Distribution recorded from BUSINZ HRMS mobile',
            }));
  }

  Future<void> _addDailyExpense(String id) async {
    final amount = TextEditingController();
    final description = TextEditingController();
    var category = 'TRAVEL';
    var date = DateTime.now();
    String? attachmentPath;
    String? attachmentName;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
              20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Add Daily Expense',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: category,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: const [
                    'TRAVEL',
                    'BUS',
                    'TRAIN',
                    'TAXI_AUTO',
                    'FUEL',
                    'FOOD',
                    'ROOM',
                    'PARKING',
                    'TOLL',
                    'OTHER',
                  ]
                      .map((value) => DropdownMenuItem(
                          value: value,
                          child: Text(value.replaceAll('_', ' / '))))
                      .toList(),
                  onChanged: (value) {
                    if (value != null) setSheetState(() => category = value);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amount,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Amount (\u20B9)',
                    prefixIcon: Icon(Icons.currency_rupee_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: description,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Description'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final selected = await showDatePicker(
                      context: context,
                      firstDate:
                          DateTime.now().subtract(const Duration(days: 90)),
                      lastDate: DateTime.now().add(const Duration(days: 90)),
                      initialDate: date,
                    );
                    if (selected != null) setSheetState(() => date = selected);
                  },
                  icon: const Icon(Icons.calendar_today_outlined),
                  label: Text(DateFormat.yMMMd().format(date)),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await _pickProofImage(context);
                    if (picked != null) {
                      setSheetState(() {
                        attachmentPath = picked.$1;
                        attachmentName = picked.$2;
                      });
                    }
                  },
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: Text(
                    attachmentName ?? 'Attach Bill / Proof (Mandatory) *',
                  ),
                ),
                if (attachmentPath != null) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: ProofAttachmentChip(
                      title: 'Attached Receipt Preview',
                      subtitle: attachmentName,
                      url: attachmentPath!,
                      label: 'Preview Receipt',
                      compact: true,
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: () {
                    final value = double.tryParse(amount.text.trim());
                    final note = description.text.trim();
                    if (value == null || value <= 0 || note.length < 2) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Enter a valid amount and description.'),
                        ),
                      );
                      return;
                    }
                    if (attachmentPath == null || attachmentPath!.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                              'Bill / receipt proof is mandatory for every daily expense.'),
                        ),
                      );
                      return;
                    }
                    Navigator.pop(context, true);
                  },
                  child: const Text('Submit Expense'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    final value = double.tryParse(amount.text.trim());
    final note = description.text.trim();
    amount.dispose();
    description.dispose();
    if (saved != true ||
        value == null ||
        value <= 0 ||
        note.length < 2 ||
        attachmentPath == null) {
      return;
    }
    await _perform(() =>
        ref.read(hrmsRepositoryProvider).addFieldAllowanceDailyReport(id, {
          'expenseDate': DateFormat('yyyy-MM-dd').format(date),
          'category': category,
          'amount': value,
          'description': note,
          'attachmentPath': attachmentPath,
        }));
  }

  Future<(String, String)?> _pickProofImage(BuildContext sheetContext) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: sheetContext,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Capture with Camera'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return null;
    final file = await ImagePicker().pickImage(
      source: source,
      imageQuality: 72,
      maxWidth: 1600,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    if (bytes.length > 4 * 1024 * 1024) {
      if (sheetContext.mounted) {
        ScaffoldMessenger.of(sheetContext).showSnackBar(
          const SnackBar(content: Text('Receipt file must be 4 MB or smaller.')),
        );
      }
      return null;
    }
    final extension =
        file.name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    return (
      'data:image/$extension;base64,${base64Encode(bytes)}',
      file.name,
    );
  }

  Future<void> _complete(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Complete field visit?'),
        content: const Text(
            'Confirm only after every daily expense has been submitted.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Complete')),
        ],
      ),
    );
    if (confirmed == true) {
      await _perform(
          () => ref.read(hrmsRepositoryProvider).completeFieldAllowance(id));
    }
  }

  Future<void> _submitBalance(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Submit remaining balance?'),
        content: const Text(
            'This records that the calculated cash balance was returned to Accounts.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Submit')),
        ],
      ),
    );
    if (confirmed == true) {
      await _perform(() =>
          ref.read(hrmsRepositoryProvider).submitFieldAllowanceBalance(id, {
            'paymentMethod': 'Cash',
            'remarks': 'Remaining balance returned from BUSINZ HRMS mobile',
          }));
    }
  }

  Future<void> _confirmBalance(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm balance receipt?'),
        content: const Text(
            'Use this only after Accounts has physically received the returned amount.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm receipt')),
        ],
      ),
    );
    if (confirmed == true) {
      await _perform(() =>
          ref.read(hrmsRepositoryProvider).confirmFieldAllowanceBalance(id, {
            'paymentMethod': 'Cash',
            'remarks': 'Balance receipt confirmed from BUSINZ HRMS mobile',
          }));
    }
  }

  Future<void> _perform(Future<Object> Function() action) async {
    try {
      await action();
      if (mounted) {
        _message('The server confirmed this workflow update.');
        _reload();
      }
    } catch (error) {
      if (mounted) _message(error.toString());
    }
  }

  void _message(String value) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(value)));

  static List<ProofAttachment> _extractProofs(Map<String, dynamic> item) {
    final proofs = <ProofAttachment>[];
    final reports = item['daily_reports'] ?? item['dailyReports'];
    if (reports is List) {
      for (final raw in reports) {
        if (raw is! Map) continue;
        final map = Map<String, dynamic>.from(raw);
        final url = _value(map, ['attachment_path', 'attachmentPath']);
        if (url.isEmpty) continue;
        final category = _value(map, ['category'], 'Expense');
        final desc = _value(map, ['description']);
        final amt = _number(map, ['amount']);
        final dt = formatDisplayDate(_value(map, ['expense_date', 'expenseDate']));
        proofs.add(ProofAttachment(
          title: '$category Bill Proof',
          subtitle: [
            if (amt > 0) _money(amt),
            if (dt != '—') dt,
            if (desc.isNotEmpty) desc,
          ].join(' · '),
          url: url,
        ));
      }
    }
    final distributions = item['distributions'];
    if (distributions is List) {
      for (final raw in distributions) {
        if (raw is! Map) continue;
        final map = Map<String, dynamic>.from(raw);
        final url = _value(map, ['payment_proof_path', 'paymentProofPath']);
        if (url.isEmpty) continue;
        final amt = _number(map, ['distributed_amount', 'distributedAmount']);
        final method = _value(map, ['payment_method', 'paymentMethod'], 'Payout');
        proofs.add(ProofAttachment(
          title: 'Advance / Payout Proof',
          subtitle: '${_money(amt)} · $method',
          url: url,
        ));
      }
    }
    final balanceProof = _value(
      item,
      ['balance_return_proof_path', 'balanceReturnProofPath'],
    );
    if (balanceProof.isNotEmpty) {
      proofs.add(ProofAttachment(
        title: 'Balance Settlement Proof',
        subtitle: _value(item, ['trip_code', 'tripCode']),
        url: balanceProof,
      ));
    }
    return proofs;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final canDecide = user.canApproveFinanceClaims;
    final canDistribute = user.canDisbursePayments;

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: user.isCeo
          ? null
          : FloatingActionButton.extended(
              onPressed: _create,
              icon: const Icon(Icons.add_rounded),
              label: const Text('New Claim'),
            ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AppSkeletonList(itemCount: 5, height: 96);
          }
          if (snapshot.hasError) {
            return AppErrorView(error: snapshot.error!, onRetry: _reload);
          }
          final items = snapshot.data ?? const [];
          final query = _search.text.trim().toLowerCase();
          final filtered = items.where((item) {
            final status = _value(
              item,
              ['status', 'request_status', 'approval_status'],
              'PENDING_APPROVAL',
            ).toUpperCase();
            final matchesStatus = switch (_statusFilter) {
              'ALL' => true,
              'PENDING' => status == 'PENDING_APPROVAL' ||
                  status == 'PENDING_ADVANCE_APPROVAL' ||
                  status == 'CLAIM_SUBMITTED' ||
                  status == 'PENDING_SETTLEMENT_VERIFICATION' ||
                  status == 'CORRECTION_REQUESTED',
              'ACTIVE' => status == 'AMOUNT_DISTRIBUTED' ||
                  status == 'ACTIVE_VISIT' ||
                  status == 'IN_PROGRESS',
              'APPROVED' => status == 'APPROVED' ||
                  status == 'PENDING_DISTRIBUTION' ||
                  status == 'PENDING_REIMBURSEMENT',
              'COMPLETED' => status == 'COMPLETED' || status == 'SETTLED',
              'REJECTED' => status == 'REJECTED',
              _ => true,
            };
            if (!matchesStatus) return false;
            if (query.isEmpty) return true;
            return [
              _value(item, ['employee_name', 'employeeName']),
              _value(item, ['employee_id', 'employeeId']),
              _value(item, ['trip_code', 'tripCode']),
              _value(item, ['destination']),
              _value(item, ['purpose']),
            ].any((value) => value.toLowerCase().contains(query));
          }).toList(growable: false);

          final pendingCount = items.where((item) {
            final status = _value(item, ['status']).toUpperCase();
            return status == 'PENDING_APPROVAL' ||
                status == 'PENDING_ADVANCE_APPROVAL' ||
                status == 'CLAIM_SUBMITTED' ||
                status == 'PENDING_SETTLEMENT_VERIFICATION' ||
                status == 'CORRECTION_REQUESTED';
          }).length;
          final distributed = items.fold<double>(
            0,
            (sum, item) =>
                sum +
                _number(item, [
                  'allocated_amount',
                  'allocatedAmount',
                  'distributed_amount',
                  'distributedAmount',
                ]),
          );
          final spent = items.fold<double>(
            0,
            (sum, item) =>
                sum +
                _number(item, [
                  'total_spent',
                  'totalSpent',
                  'valid_expense_amount',
                  'validExpenseAmount',
                ]),
          );

          return RefreshIndicator(
            onRefresh: () async {
              _reload();
              await _future;
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 104),
              children: [
                _FinanceSummary(
                  total: items.length,
                  pending: pendingCount,
                  distributed: distributed,
                  spent: spent,
                ),
                const SizedBox(height: 10),
                BusinzSearchBar(
                  hintText: 'Search employee, trip #, or destination…',
                  onChanged: (value) {
                    _search.text = value;
                    setState(() {});
                  },
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: {
                      'ALL': 'All (${items.length})',
                      'PENDING': 'Pending ($pendingCount)',
                      'ACTIVE': 'Active',
                      'APPROVED': 'Approved',
                      'COMPLETED': 'Completed',
                      'REJECTED': 'Rejected',
                    }
                        .entries
                        .map((entry) => Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: FilterChip(
                                selected: _statusFilter == entry.key,
                                label: Text(entry.value),
                                onSelected: (_) =>
                                    setState(() => _statusFilter = entry.key),
                              ),
                            ))
                        .toList(),
                  ),
                ),
                const SizedBox(height: 10),
                if (filtered.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 28),
                    child: EmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'No matching finance claims',
                      message:
                          'Field visit advances and expense claims appear here once submitted.',
                    ),
                  )
                else
                  for (final item in filtered)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _buildClaimCard(
                        context,
                        item,
                        user,
                        canDecide,
                        canDistribute,
                      ),
                    ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildClaimCard(
    BuildContext context,
    Map<String, dynamic> item,
    dynamic user,
    bool canDecide,
    bool canDistribute,
  ) {
    final id = _value(item, ['id']);
    final tripCode = _value(item, ['trip_code', 'tripCode']);
    final status = _value(
        item, ['status', 'request_status', 'approval_status'], 'Pending');
    final purpose = _value(item, ['purpose'], 'Finance claim');
    final destination = _value(item, ['destination'], '');
    final empName = _value(item, ['employee_name', 'employeeName'], '');
    final requested = _number(item, ['requested_amount', 'requestedAmount']);
    final approved = _number(item, ['approved_amount', 'approvedAmount']);
    final allocated = _number(item, ['allocated_amount', 'allocatedAmount']);
    final spent = _number(item, ['total_spent', 'totalSpent']);
    final balance = _number(item, ['balance']);
    final normalizedStatus = status.toUpperCase();
    final pendingApproval = normalizedStatus == 'PENDING_APPROVAL' ||
        normalizedStatus == 'PENDING_ADVANCE_APPROVAL' ||
        normalizedStatus == 'CLAIM_SUBMITTED' ||
        normalizedStatus == 'PENDING_SETTLEMENT_VERIFICATION';
    final ownerId = _value(item, ['employee_id', 'employeeId']);
    final isOwner = ownerId.isNotEmpty &&
        (ownerId.toLowerCase() == user.employeeId.toString().toLowerCase() ||
            ownerId.toLowerCase() == user.id.toString().toLowerCase());
    final advanceRequired =
        item['advance_required'] == true ||
        item['advanceRequired'] == true ||
        (item['advance_required'] == null &&
            item['advanceRequired'] == null &&
            (approved > 0 || requested > 0));
    final canDistributeAdvance = canDistribute &&
        (normalizedStatus == 'APPROVED' ||
            normalizedStatus == 'PENDING_DISTRIBUTION') &&
        advanceRequired &&
        approved > 0;
    final reimbursableAmt =
        balance.abs() > 0 ? balance.abs() : spent;
    final canDisburseReimbursement = canDistribute &&
        normalizedStatus == 'PENDING_REIMBURSEMENT' &&
        reimbursableAmt > 0;
    final canReport = isOwner &&
        (normalizedStatus == 'AMOUNT_DISTRIBUTED' ||
            normalizedStatus == 'ACTIVE_VISIT' ||
            normalizedStatus == 'IN_PROGRESS' ||
            (normalizedStatus == 'APPROVED' && !advanceRequired));
    final balanceStatus =
        _value(item, ['balance_return_status', 'balanceReturnStatus'])
            .toUpperCase();
    final proofs = _extractProofs(item);
    final displayAmount = approved > 0
        ? approved
        : (spent > 0 ? spent : requested);

    final scheme = Theme.of(context).colorScheme;
    final hasAnyAmount = allocated > 0 || spent > 0;

    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: id.isEmpty ? null : () => _openDetails(item),
          child: Padding(
            padding: const EdgeInsets.all(13),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    if (tripCode.isNotEmpty)
                      Text(
                        tripCode,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: scheme.primary,
                        ),
                      ),
                    const Spacer(),
                    StatusPill(status),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  purpose,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (empName.isNotEmpty || destination.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    [empName, destination]
                        .where((s) => s.isNotEmpty)
                        .join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(fontSize: 12),
                  ),
                ],
                const SizedBox(height: 10),
                Divider(
                  height: 1,
                  color: scheme.outlineVariant.withValues(alpha: 0.7),
                ),
                const SizedBox(height: 9),
                Row(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          Text(
                            !advanceRequired && displayAmount == 0
                                ? 'No Advance'
                                : _money(displayAmount),
                            style: TextStyle(
                              fontFamily: AppTokens.fontKpi,
                              fontSize: 14.5,
                              fontWeight: FontWeight.w800,
                              color: !advanceRequired && displayAmount == 0
                                  ? scheme.onSurfaceVariant
                                  : scheme.primary,
                            ),
                          ),
                          if (hasAnyAmount) ...[
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                'Alloc ${_FinanceMoney.format(allocated)} · Spent ${_FinanceMoney.format(spent)}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context)
                                    .textTheme
                                    .labelSmall
                                    ?.copyWith(fontSize: 11),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (proofs.isNotEmpty)
                      Material(
                        color: AppTokens.brandTint,
                        borderRadius:
                            BorderRadius.circular(AppTokens.radiusPill),
                        child: InkWell(
                          borderRadius:
                              BorderRadius.circular(AppTokens.radiusPill),
                          onTap: () => showProofViewerDialog(
                            context,
                            ref: ref,
                            proofs: proofs,
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 5),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.receipt_long_rounded,
                                  size: 13.5,
                                  color: AppTokens.brandPrimary,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  proofs.length == 1
                                      ? 'View Proof'
                                      : '${proofs.length} Proofs',
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w700,
                                    color: AppTokens.brandPrimary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      )
                    else
                      Icon(
                        Icons.chevron_right_rounded,
                        size: 20,
                        color: scheme.onSurfaceVariant,
                      ),
                  ],
                ),
              if (canDecide && pendingApproval && id.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: () => _decide(id, 'REJECTED', requested),
                      child: const Text('Reject'),
                    ),
                    OutlinedButton(
                      onPressed: () =>
                          _decide(id, 'CORRECTION_REQUESTED', requested),
                      child: const Text('Correction'),
                    ),
                    FilledButton(
                      onPressed: () => _decide(id, 'APPROVED', requested),
                      child: const Text('Approve'),
                    ),
                  ],
                ),
              ],
              if (canDistributeAdvance && id.isNotEmpty) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => _distribute(id, approved),
                    icon: const Icon(Icons.payments_outlined),
                    label: const Text('Distribute Cash / Advance'),
                  ),
                ),
              ],
              if (canDisburseReimbursement && id.isNotEmpty) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => _distribute(
                      id,
                      reimbursableAmt,
                      isReimbursement: true,
                    ),
                    icon: const Icon(Icons.payments_outlined),
                    label: Text(
                      'Disburse Reimbursement (${_money(reimbursableAmt)})',
                    ),
                  ),
                ),
              ],
              if (canReport && id.isNotEmpty) ...[
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _addDailyExpense(id),
                      icon: const Icon(Icons.receipt_long_outlined),
                      label: const Text('Add Expense'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.tonal(
                      onPressed: () => _complete(id),
                      child: const Text('Complete Visit'),
                    ),
                  ),
                ]),
              ],
              if (isOwner &&
                  (normalizedStatus == 'COMPLETED' ||
                      normalizedStatus == 'PENDING_RETURN') &&
                  balance > 0 &&
                  balanceStatus != 'SUBMITTED_TO_ACCOUNTS' &&
                  balanceStatus != 'RECEIVED_BY_ACCOUNTS' &&
                  id.isNotEmpty) ...[
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => _submitBalance(id),
                    child: Text('Return Balance (${_money(balance)}) to Accounts'),
                  ),
                ),
              ],
              if (canDistribute &&
                  balanceStatus == 'SUBMITTED_TO_ACCOUNTS' &&
                  id.isNotEmpty) ...[
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonalIcon(
                    onPressed: () => _confirmBalance(id),
                    icon: const Icon(Icons.verified_outlined),
                    label: const Text('Confirm Balance Received'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      ),
    );
  }

  static String _value(Map<String, dynamic> item, List<String> keys,
      [String fallback = '']) {
    for (final key in keys) {
      if (item[key] != null && item[key].toString().trim().isNotEmpty) {
        return item[key].toString();
      }
    }
    return fallback;
  }

  static double _number(Map<String, dynamic> item, List<String> keys) {
    for (final key in keys) {
      final parsed = double.tryParse((item[key] ?? '').toString());
      if (parsed != null) return parsed;
    }
    return 0;
  }

  static String _money(double value) =>
      NumberFormat.currency(locale: 'en_IN', symbol: '\u20B9').format(value);
}

class _FieldClaimDetailSheet extends ConsumerStatefulWidget {
  const _FieldClaimDetailSheet({
    required this.claimId,
    required this.initialRow,
  });

  final String claimId;
  final Map<String, dynamic> initialRow;

  @override
  ConsumerState<_FieldClaimDetailSheet> createState() =>
      _FieldClaimDetailSheetState();
}

class _FieldClaimDetailSheetState
    extends ConsumerState<_FieldClaimDetailSheet> {
  late Future<Map<String, dynamic>> _detailFuture;

  @override
  void initState() {
    super.initState();
    _detailFuture = ref
        .read(hrmsRepositoryProvider)
        .fieldAllowanceDetail(widget.claimId)
        .catchError((_) => widget.initialRow);
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.82,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      builder: (context, scrollController) => FutureBuilder<Map<String, dynamic>>(
        future: _detailFuture,
        builder: (context, snapshot) {
          final data = snapshot.data ?? widget.initialRow;
          final tripCode =
              _FieldAllowanceScreenState._value(data, ['trip_code', 'tripCode'], 'Claim');
          final purpose =
              _FieldAllowanceScreenState._value(data, ['purpose'], 'Finance & Claim');
          final destination =
              _FieldAllowanceScreenState._value(data, ['destination']);
          final empName = _FieldAllowanceScreenState._value(
              data, ['employee_name', 'employeeName'], 'Employee');
          final status = _FieldAllowanceScreenState._value(
              data, ['status', 'request_status'], 'Pending');
          final advReq =
              data['advance_required'] == true || data['advanceRequired'] == true;
          final requested = _FieldAllowanceScreenState._number(
              data, ['requested_amount', 'requestedAmount']);
          final allocated = _FieldAllowanceScreenState._number(
              data, ['allocated_amount', 'allocatedAmount']);
          final spent = _FieldAllowanceScreenState._number(
              data, ['total_spent', 'totalSpent']);
          final balance = _FieldAllowanceScreenState._number(data, ['balance']);
          final startDate = formatDisplayDate(
              _FieldAllowanceScreenState._value(data, ['start_date', 'startDate']));
          final endDate = formatDisplayDate(
              _FieldAllowanceScreenState._value(data, ['end_date', 'endDate']));

          final dailyReports = ((data['daily_reports'] ?? data['dailyReports'])
                      as List? ??
                  const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList(growable: false);
          final distributions = (data['distributions'] as List? ?? const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList(growable: false);
          final balanceProofUrl = _FieldAllowanceScreenState._value(
              data, ['balance_return_proof_path', 'balanceReturnProofPath']);

          return ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tripCode,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          purpose,
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          [empName, destination, '$startDate → $endDate']
                              .where((s) => s.isNotEmpty && s != '— → —')
                              .join(' · '),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  StatusPill(status),
                ],
              ),
              if (snapshot.connectionState != ConnectionState.done) ...[
                const SizedBox(height: 12),
                const LinearProgressIndicator(),
              ],
              const SizedBox(height: 14),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
                childAspectRatio: 2.2,
                children: [
                  _MiniStat(
                    label: 'Requested',
                    value: !advReq && requested == 0
                        ? 'No Advance'
                        : _FieldAllowanceScreenState._money(requested),
                  ),
                  _MiniStat(
                    label: 'Allocated',
                    value: _FieldAllowanceScreenState._money(allocated),
                  ),
                  _MiniStat(
                    label: 'Spent',
                    value: _FieldAllowanceScreenState._money(spent),
                  ),
                  _MiniStat(
                    label: 'Balance',
                    value: _FieldAllowanceScreenState._money(balance),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Text(
                'Daily Expenses & Bill Proofs (${dailyReports.length})',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              if (dailyReports.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No daily expenses logged for this trip yet.'),
                  ),
                )
              else
                for (final rep in dailyReports)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _FieldAllowanceScreenState._value(
                                      rep, ['description'], 'Daily Expense'),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700),
                                ),
                              ),
                              Text(
                                _FieldAllowanceScreenState._money(
                                    _FieldAllowanceScreenState._number(
                                        rep, ['amount'])),
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: Theme.of(context).colorScheme.primary,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  [
                                    _FieldAllowanceScreenState._value(
                                        rep, ['category'], 'EXPENSE'),
                                    formatDisplayDate(
                                        _FieldAllowanceScreenState._value(rep,
                                            ['expense_date', 'expenseDate'])),
                                  ].where((s) => s.isNotEmpty && s != '—').join(' · '),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                              if (_FieldAllowanceScreenState._value(rep,
                                      ['attachment_path', 'attachmentPath'])
                                  .isNotEmpty)
                                ProofAttachmentChip(
                                  title:
                                      '${_FieldAllowanceScreenState._value(rep, ['category'], 'Expense')} Bill Proof',
                                  subtitle: _FieldAllowanceScreenState._value(
                                      rep, ['description']),
                                  url: _FieldAllowanceScreenState._value(rep,
                                      ['attachment_path', 'attachmentPath']),
                                  label: 'View Proof',
                                  compact: true,
                                )
                              else
                                Text(
                                  'No Bill',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
              if (distributions.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'Payment Distributions (${distributions.length})',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                for (final dist in distributions)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _FieldAllowanceScreenState._money(
                                      _FieldAllowanceScreenState._number(dist, [
                                    'distributed_amount',
                                    'distributedAmount',
                                  ])),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800, fontSize: 15),
                                ),
                                Text(
                                  [
                                    _FieldAllowanceScreenState._value(dist,
                                        ['payment_method', 'paymentMethod']),
                                    formatDisplayDate(
                                        _FieldAllowanceScreenState._value(dist, [
                                      'distribution_date',
                                      'distributionDate',
                                    ])),
                                    _FieldAllowanceScreenState._value(dist, [
                                      'reference_number',
                                      'referenceNumber',
                                    ]),
                                  ]
                                      .where((s) => s.isNotEmpty && s != '—')
                                      .join(' · '),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                          if (_FieldAllowanceScreenState._value(dist,
                                  ['payment_proof_path', 'paymentProofPath'])
                              .isNotEmpty)
                            ProofAttachmentChip(
                              title: 'Distribution Payment Proof',
                              subtitle: _FieldAllowanceScreenState._value(
                                  dist, ['reference_number', 'payment_method']),
                              url: _FieldAllowanceScreenState._value(dist,
                                  ['payment_proof_path', 'paymentProofPath']),
                              label: 'View Proof',
                              compact: true,
                            ),
                        ],
                      ),
                    ),
                  ),
              ],
              if (balanceProofUrl.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'Balance Return Proof',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: ProofAttachmentChip(
                    title: '$tripCode Balance Settlement Proof',
                    url: balanceProofUrl,
                    label: 'View Settlement Proof',
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppTokens.surfaceSubtleLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTokens.borderLight),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
            ),
          ],
        ),
      );
}

class _FinanceSummary extends StatelessWidget {
  const _FinanceSummary({
    required this.total,
    required this.pending,
    required this.distributed,
    required this.spent,
  });

  final int total;
  final int pending;
  final double distributed;
  final double spent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dividerColor = scheme.outlineVariant.withValues(alpha: 0.75);
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Column(
        children: [
          IntrinsicHeight(
            child: Row(
              children: [
                Expanded(
                  child: _FinanceMetricCell(
                    label: 'Requests',
                    value: '$total',
                    dotColor: scheme.primary,
                  ),
                ),
                VerticalDivider(width: 1, thickness: 1, color: dividerColor),
                Expanded(
                  child: _FinanceMetricCell(
                    label: 'Pending',
                    value: '$pending',
                    dotColor:
                        pending > 0 ? AppTokens.warning : AppTokens.success,
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, thickness: 1, color: dividerColor),
          IntrinsicHeight(
            child: Row(
              children: [
                Expanded(
                  child: _FinanceMetricCell(
                    label: 'Distributed',
                    value: _FinanceMoney.format(distributed),
                    dotColor: AppTokens.info,
                  ),
                ),
                VerticalDivider(width: 1, thickness: 1, color: dividerColor),
                Expanded(
                  child: _FinanceMetricCell(
                    label: 'Spent',
                    value: _FinanceMoney.format(spent),
                    dotColor: AppTokens.violet,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FinanceMetricCell extends StatelessWidget {
  const _FinanceMetricCell({
    required this.label,
    required this.value,
    required this.dotColor,
  });

  final String label;
  final String value;
  final Color dotColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(shape: BoxShape.circle, color: dotColor),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: scheme.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTokens.kpiStyle(
                    context,
                    size: 17,
                    color: scheme.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

abstract final class _FinanceMoney {
  static String format(double value) =>
      NumberFormat.compactCurrency(locale: 'en_IN', symbol: '\u20B9')
          .format(value);
}

class _FieldRequestForm extends ConsumerStatefulWidget {
  const _FieldRequestForm();

  @override
  ConsumerState<_FieldRequestForm> createState() => _FieldRequestFormState();
}

class _FieldRequestFormState extends ConsumerState<_FieldRequestForm> {
  final _form = GlobalKey<FormState>();
  final _purpose = TextEditingController();
  final _destination = TextEditingController();
  final _amount = TextEditingController();
  DateTime _start = DateTime.now();
  DateTime _end = DateTime.now();
  bool _advance = true;
  bool _saving = false;
  String? _error;

  Future<void> _pick(bool start) async {
    final selected = await showDatePicker(
      context: context,
      initialDate: start ? _start : _end,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (selected == null) return;
    setState(() {
      if (start) {
        _start = selected;
        if (_end.isBefore(selected)) _end = selected;
      } else {
        _end = selected;
      }
    });
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(hrmsRepositoryProvider).createFieldAllowance({
        'purpose': _purpose.text.trim(),
        'destination': _destination.text.trim(),
        'startDate': DateFormat('yyyy-MM-dd').format(_start),
        'endDate': DateFormat('yyyy-MM-dd').format(_end),
        'advanceRequired': _advance,
        'requestedAmount': _advance ? double.parse(_amount.text) : 0,
        'submit': true,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _purpose.dispose();
    _destination.dispose();
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 16, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
        child: SingleChildScrollView(
          child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Finance & Claims Request',
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _purpose,
                  decoration: const InputDecoration(labelText: 'Purpose'),
                  validator: (value) => value == null || value.trim().length < 3
                      ? 'Enter a clear purpose.'
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _destination,
                  decoration: const InputDecoration(labelText: 'Destination'),
                  validator: (value) => value == null || value.trim().length < 2
                      ? 'Enter the destination.'
                      : null,
                ),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(
                      child: _FieldDate(
                          label: 'Start',
                          date: _start,
                          tap: () => _pick(true))),
                  const SizedBox(width: 10),
                  Expanded(
                      child: _FieldDate(
                          label: 'End', date: _end, tap: () => _pick(false))),
                ]),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Advance required'),
                  value: _advance,
                  onChanged: _saving
                      ? null
                      : (value) => setState(() => _advance = value),
                ),
                if (_advance)
                  TextFormField(
                    controller: _amount,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration:
                        const InputDecoration(labelText: 'Requested amount'),
                    validator: (value) {
                      if (!_advance) return null;
                      final parsed = double.tryParse(value ?? '');
                      return parsed == null || parsed <= 0
                          ? 'Enter a valid amount.'
                          : null;
                    },
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(_error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ),
                const SizedBox(height: 18),
                FilledButton(
                    onPressed: _saving ? null : _save,
                    child: Text(_saving ? 'Submitting…' : 'Submit request')),
              ],
            ),
          ),
        ),
      );
}

class _FieldDate extends StatelessWidget {
  const _FieldDate(
      {required this.label, required this.date, required this.tap});
  final String label;
  final DateTime date;
  final VoidCallback tap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: tap,
        child: InputDecorator(
          decoration: InputDecoration(labelText: label),
          child: Text(DateFormat('dd MMM yyyy').format(date)),
        ),
      );
}
