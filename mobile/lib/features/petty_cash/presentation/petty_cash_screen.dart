import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../app/providers.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/proof_viewer.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class PettyCashScreen extends ConsumerStatefulWidget {
  const PettyCashScreen({super.key});

  @override
  ConsumerState<PettyCashScreen> createState() => _PettyCashScreenState();
}

class _PettyCashScreenState extends ConsumerState<PettyCashScreen> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final repo = ref.read(hrmsRepositoryProvider);
    final result = await Future.wait([
      repo.pettyCashRequests(),
      repo.pettyCashDisbursements(),
      repo.pettyCashExpenses(),
      repo.pettyCashLedger(),
      repo.pettyCashCategories(),
      repo.activePettyCashCustodian(),
    ]);
    return {
      'requests': result[0],
      'disbursements': result[1],
      'expenses': result[2],
      'ledger': result[3],
      'categories': result[4],
      'custodian': result[5],
    };
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _create() async {
    final amount = TextEditingController();
    final purpose = TextEditingController();
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 8, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Request Petty Cash',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Requested amount (\u20B9)',
              prefixIcon: Icon(Icons.currency_rupee_rounded),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: purpose,
            minLines: 3,
            maxLines: 5,
            decoration: const InputDecoration(labelText: 'Purpose'),
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                final parsed = double.tryParse(amount.text.trim());
                if (parsed == null ||
                    parsed <= 0 ||
                    purpose.text.trim().length < 3) {
                  return;
                }
                Navigator.pop(context, {
                  'requestedAmount': parsed,
                  'purpose': purpose.text.trim(),
                  'requestDate':
                      DateFormat('yyyy-MM-dd').format(DateTime.now()),
                });
              },
              child: const Text('Submit Request'),
            ),
          ),
        ]),
      ),
    );
    amount.dispose();
    purpose.dispose();
    if (payload != null) {
      await _perform(
          () => ref.read(hrmsRepositoryProvider).requestPettyCash(payload));
    }
  }

  Future<void> _decide(String id, double requested, bool approve) async {
    final remarks = TextEditingController();
    final amount = TextEditingController(text: requested.toStringAsFixed(2));
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(approve ? 'Approve Petty Cash' : 'Reject Petty Cash'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          if (approve)
            TextField(
              controller: amount,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration:
                  const InputDecoration(labelText: 'Approved amount (\u20B9)'),
            ),
          const SizedBox(height: 12),
          TextField(
            controller: remarks,
            maxLines: 3,
            decoration: InputDecoration(
                labelText: approve ? 'Remarks (optional)' : 'Rejection reason'),
          ),
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(approve ? 'Approve' : 'Reject')),
        ],
      ),
    );
    final approved = double.tryParse(amount.text.trim());
    final note = remarks.text.trim();
    amount.dispose();
    remarks.dispose();
    if (confirmed != true || (approve && approved == null)) return;
    await _perform(() => ref.read(hrmsRepositoryProvider).decidePettyCash(id, {
          'action': approve ? 'APPROVE' : 'REJECT',
          if (approve) 'approvedAmount': approved,
          if (note.isNotEmpty) 'remarks': note,
        }));
  }

  Future<void> _disburse(String id, double amount) async {
    final refCtrl = TextEditingController(
      text: 'PC-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}',
    );
    final remarksCtrl = TextEditingController();
    var mode = 'Cash';
    String? paymentProofDataUri;
    String? proofName;

    final confirmed = await showModalBottomSheet<bool>(
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
                Text(
                  'Disburse Petty Cash (${_money(amount)})',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: mode,
                  decoration: const InputDecoration(labelText: 'Payment Mode'),
                  items: const ['Cash', 'Bank Transfer', 'UPI']
                      .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setSheetState(() => mode = v);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: refCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Payment Reference'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await _pickImageDataUri(context);
                    if (picked != null) {
                      setSheetState(() {
                        paymentProofDataUri = picked.$1;
                        proofName = picked.$2;
                      });
                    }
                  },
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: Text(proofName ?? 'Attach Payment Proof (optional)'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: remarksCtrl,
                  maxLines: 2,
                  decoration:
                      const InputDecoration(labelText: 'Remarks (optional)'),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('Confirm Disbursement'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    final paymentRef = refCtrl.text.trim().isEmpty
        ? 'MOBILE-${DateTime.now().millisecondsSinceEpoch}'
        : refCtrl.text.trim();
    final remarks = remarksCtrl.text.trim();
    refCtrl.dispose();
    remarksCtrl.dispose();
    if (confirmed != true) return;

    await _perform(
        () => ref.read(hrmsRepositoryProvider).disbursePettyCash(id, {
              'requestId': id,
              'disbursedAmount': amount,
              'paymentMode': mode,
              'paymentDate': DateFormat('yyyy-MM-dd').format(DateTime.now()),
              'paymentReference': paymentRef,
              if (paymentProofDataUri != null)
                'paymentProofUrl': paymentProofDataUri,
              'remarks': remarks.isNotEmpty
                  ? remarks
                  : 'Disbursement recorded from BUSINZ HRMS mobile',
            }));
  }

  Future<void> _confirmReceipt(String id, double amount) async {
    await _perform(
        () => ref.read(hrmsRepositoryProvider).confirmPettyCashReceipt({
              'disbursementId': id,
              'action': 'CONFIRM',
              'amountReceived': amount,
              'idempotencyKey': const Uuid().v4(),
            }));
  }

  Future<(String, String)?> _pickImageDataUri(BuildContext sheetContext) async {
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
    final image = await ImagePicker().pickImage(
      source: source,
      imageQuality: 72,
      maxWidth: 1600,
    );
    if (image == null) return null;
    final bytes = await image.readAsBytes();
    if (bytes.length > 4 * 1024 * 1024) {
      if (sheetContext.mounted) {
        ScaffoldMessenger.of(sheetContext).showSnackBar(
          const SnackBar(
              content: Text('Receipt image must be 4 MB or smaller.')),
        );
      }
      return null;
    }
    final ext = image.name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    return ('data:image/$ext;base64,${base64Encode(bytes)}', image.name);
  }

  Future<void> _recordExpense(List<Map<String, dynamic>> categories) async {
    final amount = TextEditingController();
    final reason = TextEditingController();
    String paymentMode = 'Cash';
    Map<String, dynamic>? category =
        categories.isEmpty ? null : categories.first;
    String? receiptData;
    String? receiptName;
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
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
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Add Daily Expense',
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 18),
                if (categories.isNotEmpty)
                  DropdownButtonFormField<String>(
                    initialValue: _value(category!, ['id']),
                    decoration: const InputDecoration(labelText: 'Category'),
                    items: categories
                        .map((item) => DropdownMenuItem(
                              value: _value(item, ['id']),
                              child: Text(_value(item, ['name'], 'Expense')),
                            ))
                        .toList(),
                    onChanged: (value) => setSheetState(() => category =
                        categories.firstWhere(
                            (item) => _value(item, ['id']) == value)),
                  )
                else
                  const Text('No active petty-cash categories are configured.'),
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
                  controller: reason,
                  minLines: 3,
                  maxLines: 5,
                  decoration: const InputDecoration(labelText: 'Description'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: paymentMode,
                  decoration: const InputDecoration(labelText: 'Payment Mode'),
                  items: ['Cash', 'UPI', 'Card', 'Other']
                      .map((value) =>
                          DropdownMenuItem(value: value, child: Text(value)))
                      .toList(),
                  onChanged: (value) =>
                      setSheetState(() => paymentMode = value!),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await _pickImageDataUri(context);
                    if (picked != null) {
                      setSheetState(() {
                        receiptData = picked.$1;
                        receiptName = picked.$2;
                      });
                    }
                  },
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: Text(receiptName ?? 'Attach Bill (Camera / Gallery)'),
                ),
                if (receiptData != null) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: ProofAttachmentChip(
                      title: 'Attached Bill Preview',
                      subtitle: receiptName,
                      url: receiptData!,
                      label: 'Preview Bill',
                      compact: true,
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: category == null
                      ? null
                      : () {
                          final parsed = double.tryParse(amount.text.trim());
                          if (parsed == null ||
                              parsed <= 0 ||
                              reason.text.trim().length < 3) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Enter a valid amount and description (min 3 chars).'),
                              ),
                            );
                            return;
                          }
                          Navigator.pop(context, {
                            'categoryId': _value(category!, ['id']),
                            'categoryName':
                                _value(category!, ['name'], 'Expense'),
                            'amount': parsed,
                            'expenseDate': DateFormat('yyyy-MM-dd')
                                .format(DateTime.now()),
                            'reason': reason.text.trim(),
                            'paymentMode': paymentMode,
                            if (receiptData != null)
                              'billAttachmentUrl': receiptData,
                            'idempotencyKey': const Uuid().v4(),
                          });
                        },
                  child: const Text('Record Expense'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    amount.dispose();
    reason.dispose();
    if (payload != null) {
      await _perform(() =>
          ref.read(hrmsRepositoryProvider).recordPettyCashExpense(payload));
    }
  }

  Future<void> _assignCustodian() async {
    final employees =
        await ref.read(hrmsRepositoryProvider).employees(activeOnly: true);
    if (!mounted || employees.isEmpty) return;
    Map<String, dynamic>? selected;
    final confirmed = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Assign Petty-Cash Custodian',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 18),
              DropdownButtonFormField<String>(
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Active employee'),
                items: employees.map((employee) {
                  final code =
                      _value(employee, ['employeeId', 'employee_id', 'id']);
                  final name =
                      _value(employee, ['name', 'fullName', 'full_name'], code);
                  return DropdownMenuItem(
                      value: code, child: Text('$name | $code'));
                }).toList(),
                onChanged: (value) => setSheetState(() => selected =
                    employees.firstWhere((employee) =>
                        _value(employee, ['employeeId', 'employee_id', 'id']) ==
                        value)),
              ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: selected == null
                    ? null
                    : () => Navigator.pop(context, selected),
                child: const Text('Assign Custodian'),
              ),
            ],
          ),
        ),
      ),
    );
    if (confirmed == null) return;
    final code = _value(confirmed, ['employeeId', 'employee_id', 'id']);
    final name = _value(confirmed, ['name', 'fullName', 'full_name'], code);
    await _perform(
        () => ref.read(hrmsRepositoryProvider).assignPettyCashCustodian({
              'employeeId': _value(confirmed, ['id'], code),
              'employeeName': name,
              'employeeCode': code,
              'lowBalanceThreshold': 1000,
              'assignmentDate': DateFormat('yyyy-MM-dd').format(DateTime.now()),
            }));
  }

  Future<void> _perform(Future<Object> Function() action) async {
    try {
      await action();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('The server confirmed this update.')),
        );
        _reload();
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final role = user.role.toLowerCase();
    final isCeo = user.isCeo || role == 'super admin';
    final isAccounts = user.isAccounts || role.contains('admin') || isCeo;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AppErrorView(error: snapshot.error!, onRetry: _reload);
          }
          final requests = snapshot.data?['requests'] ?? const [];
          final disbursements = snapshot.data?['disbursements'] ?? const [];
          final expenses = snapshot.data?['expenses'] ?? const [];
          final ledger = snapshot.data?['ledger'] ?? const [];
          final categories = snapshot.data?['categories'] ?? const [];
          final custodian = snapshot.data?['custodian'] is Map
              ? Map<String, dynamic>.from(snapshot.data!['custodian'] as Map)
              : <String, dynamic>{};
          final custodianId = _value(custodian,
              ['custodian_id', 'custodianId', 'employee_id', 'employeeId']);
          final custodianCode = _value(custodian, [
            'custodian_employee_id',
            'custodianEmployeeId',
            'employee_code'
          ]);
          final isCustodian = [user.id, user.employeeId]
              .map((value) => value.toLowerCase())
              .any((value) =>
                  value.isNotEmpty &&
                  [custodianId, custodianCode]
                      .map((item) => item.toLowerCase())
                      .contains(value));
          final balance = _number(custodian,
              ['available_balance', 'availableBalance', 'current_balance']);
          return RefreshIndicator(
            onRefresh: () async {
              _reload();
              await _future;
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 104),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Custodian Wallet',
                            style: Theme.of(context).textTheme.labelLarge),
                        const SizedBox(height: 6),
                        Text(_money(balance),
                            style: Theme.of(context)
                                .textTheme
                                .headlineMedium
                                ?.copyWith(fontWeight: FontWeight.w900)),
                        const SizedBox(height: 4),
                        Text(_value(
                            custodian,
                            ['custodian_name', 'custodianName'],
                            'No active custodian')),
                        const SizedBox(height: 14),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (isCustodian)
                              FilledButton.icon(
                                onPressed: () => _recordExpense(
                                    List<Map<String, dynamic>>.from(
                                        categories)),
                                icon: const Icon(Icons.add_card_rounded),
                                label: const Text('Add Expense'),
                              ),
                            if (isCustodian)
                              OutlinedButton.icon(
                                onPressed: _create,
                                icon: const Icon(Icons.request_quote_outlined),
                                label: const Text('Request Funds'),
                              ),
                            if (isCeo)
                              OutlinedButton.icon(
                                onPressed: _assignCustodian,
                                icon:
                                    const Icon(Icons.manage_accounts_outlined),
                                label: const Text('Assign Custodian'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text('Requests',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                if (requests.isEmpty)
                  const Card(
                      child: Padding(
                          padding: EdgeInsets.all(20),
                          child: Text('No petty-cash requests.')))
                else
                  for (final item in requests) ...[
                    _requestCard(item, isCeo, isAccounts),
                    const SizedBox(height: 10),
                  ],
                if (disbursements.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text('Disbursements & Receipts',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  for (final item in disbursements) ...[
                    _disbursementCard(item, isCustodian),
                    const SizedBox(height: 10),
                  ],
                ],
                if (expenses.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Text('Daily Expenses & Bills',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  for (final raw in expenses.take(30))
                    if (raw is Map)
                      _expenseCard(Map<String, dynamic>.from(raw)),
                ],
                if (ledger.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Text('Ledger',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  for (final raw in ledger.take(20))
                    if (raw is Map)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                          _number(Map<String, dynamic>.from(raw),
                                      ['credit_amount', 'creditAmount']) >
                                  0
                              ? Icons.arrow_downward_rounded
                              : Icons.arrow_upward_rounded,
                        ),
                        title: Text(_value(
                            Map<String, dynamic>.from(raw),
                            ['description', 'transaction_type', 'entry_type'],
                            'Ledger entry')),
                        subtitle: Text(formatDisplayDate(_value(
                            Map<String, dynamic>.from(raw),
                            ['created_at', 'transaction_date'],
                            ''))),
                        trailing: Text(_money(_number(
                            Map<String, dynamic>.from(raw),
                            ['amount', 'credit_amount', 'debit_amount']))),
                      ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _expenseCard(Map<String, dynamic> row) {
    final reason = _value(row, ['reason', 'description'], 'Expense');
    final category = _value(row, ['category_name', 'categoryName'], 'Petty cash');
    final amount = _number(row, ['amount']);
    final expenseDate =
        formatDisplayDate(_value(row, ['expense_date', 'expenseDate', 'created_at']));
    final paymentMode = _value(row, ['payment_mode', 'paymentMode']);
    final status = _value(row, ['status']);
    final billUrl = _value(row, [
      'bill_attachment_url',
      'billAttachmentUrl',
      'receipt_url',
      'receiptUrl',
    ]);

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CircleAvatar(
                  radius: 18,
                  child: Icon(Icons.receipt_long_outlined, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        reason,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 14.5),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        [
                          category,
                          if (paymentMode.isNotEmpty) paymentMode,
                          if (expenseDate != '—') expenseDate,
                        ].join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _money(amount),
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    if (status.isNotEmpty &&
                        status.toUpperCase() != 'RECORDED') ...[
                      const SizedBox(height: 4),
                      StatusPill(status),
                    ],
                  ],
                ),
              ],
            ),
            if (billUrl.isNotEmpty) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: ProofAttachmentChip(
                  title: '$category Bill Proof',
                  subtitle: '$reason · ${_money(amount)}',
                  url: billUrl,
                  label: 'View Bill Proof',
                  compact: true,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _requestCard(Map<String, dynamic> item, bool isCeo, bool isAccounts) {
    final id = _value(item, ['id']);
    final reqNumber = _value(item, ['request_number', 'requestNumber']);
    final purpose = _value(item, ['purpose'], 'Petty cash');
    final status = _value(
        item, ['status', 'request_status', 'approval_status'], 'Pending');
    final requested =
        _number(item, ['requested_amount', 'requestedAmount', 'amount']);
    final approved = _number(item, ['approved_amount', 'approvedAmount']);
    final normalized = status.trim().toUpperCase();
    final pending = normalized == 'PENDING_CEO_APPROVAL' ||
        normalized == 'PENDING_APPROVAL' ||
        normalized == 'PENDING' ||
        normalized == 'REQUESTED';
    final canPay = (normalized == 'APPROVED_BY_CEO' ||
            normalized == 'APPROVED') &&
        approved > 0;
    final supportingDoc = _value(
        item, ['supporting_document_url', 'supportingDocumentUrl']);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (reqNumber.isNotEmpty)
                    Text(
                      reqNumber,
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  Text(purpose,
                      style: const TextStyle(
                          fontSize: 15.5, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
            StatusPill(status),
          ]),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(_money(approved > 0 ? approved : requested),
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800)),
              ),
              if (supportingDoc.isNotEmpty)
                ProofAttachmentChip(
                  title: 'Petty Cash Supporting Proof',
                  subtitle: purpose,
                  url: supportingDoc,
                  label: 'View Proof',
                  compact: true,
                ),
            ],
          ),
          if (isCeo && pending && id.isNotEmpty) ...[
            const SizedBox(height: 14),
            Row(children: [
              Expanded(
                  child: OutlinedButton(
                      onPressed: () => _decide(id, requested, false),
                      child: const Text('Reject'))),
              const SizedBox(width: 10),
              Expanded(
                  child: FilledButton(
                      onPressed: () => _decide(id, requested, true),
                      child: const Text('Approve'))),
            ]),
          ],
          if (isAccounts && canPay && id.isNotEmpty) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => _disburse(id, approved),
                icon: const Icon(Icons.payments_outlined),
                label: const Text('Disburse Cash'),
              ),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _disbursementCard(Map<String, dynamic> item, bool isCustodian) {
    final id = _value(item, ['id']);
    final amount =
        _number(item, ['disbursed_amount', 'disbursedAmount', 'amount']);
    final status = _value(
        item, ['receipt_status', 'receiptStatus', 'status'], 'Pending receipt');
    final mode = _value(item, ['payment_mode', 'paymentMode']);
    final refNo = _value(item, ['payment_reference', 'paymentReference']);
    final payDate =
        formatDisplayDate(_value(item, ['payment_date', 'paymentDate']));
    final proofUrl = _value(item, ['payment_proof_url', 'paymentProofUrl']);
    final pending = !status.toLowerCase().contains('confirm') &&
        !status.toLowerCase().contains('completed');

    return Card(
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
                      Text(_money(amount),
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 15.5)),
                      Text(
                        [
                          status,
                          if (mode.isNotEmpty) mode,
                          if (refNo.isNotEmpty) refNo,
                          if (payDate != '—') payDate,
                        ].join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                if (pending && isCustodian && id.isNotEmpty)
                  FilledButton.tonal(
                    onPressed: () => _confirmReceipt(id, amount),
                    child: const Text('Confirm'),
                  )
                else if (!pending)
                  const Icon(Icons.check_circle_rounded, color: Colors.green),
              ],
            ),
            if (proofUrl.isNotEmpty) ...[
              const SizedBox(height: 10),
              ProofAttachmentChip(
                title: 'Disbursement Payment Proof',
                subtitle: '${_money(amount)} · $mode',
                url: proofUrl,
                label: 'View Payment Proof',
                compact: true,
              ),
            ],
          ],
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
