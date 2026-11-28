import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/proof_viewer.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

enum _PaymentFilter { pending, claims, pettyCash, payroll, advances, history }

class PaymentDisbursementScreen extends ConsumerStatefulWidget {
  const PaymentDisbursementScreen({super.key});

  @override
  ConsumerState<PaymentDisbursementScreen> createState() =>
      _PaymentDisbursementScreenState();
}

class _PaymentDisbursementScreenState
    extends ConsumerState<PaymentDisbursementScreen> {
  late Future<List<_PaymentQueueItem>> _future;
  _PaymentFilter _filter = _PaymentFilter.pending;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<_PaymentQueueItem>> _load() async {
    final repo = ref.read(hrmsRepositoryProvider);
    final results = await Future.wait<dynamic>([
      repo.fieldAllowanceRequests().catchError((_) => <Map<String, dynamic>>[]),
      repo.fieldAllowanceDistributions().catchError((_) => <Map<String, dynamic>>[]),
      repo.expenses().catchError((_) => <Map<String, dynamic>>[]),
      repo.pettyCashRequests().catchError((_) => <Map<String, dynamic>>[]),
      repo.pettyCashDisbursements().catchError((_) => <Map<String, dynamic>>[]),
      repo.loanRecords().catchError((_) => <Map<String, dynamic>>[]),
      repo.payrollRecords().catchError((_) => <Map<String, dynamic>>[]),
    ]);

    final items = <_PaymentQueueItem>[];

    final fieldDistsByReq = <String, Map<String, dynamic>>{};
    for (final d in results[1] as List<Map<String, dynamic>>) {
      final reqId = (d['request_id'] ?? d['requestId'] ?? '').toString();
      if (reqId.isNotEmpty) fieldDistsByReq[reqId] = d;
    }

    // 1. Finance & Claims (exact parity with Web AccountsPaymentDashboard.tsx)
    for (final row in results[0] as List<Map<String, dynamic>>) {
      final id = row['id']?.toString() ?? '';
      final status = (row['status'] ?? '').toString().trim().toUpperCase();
      final tripCode =
          (row['trip_code'] ?? row['request_number'] ?? 'CLAIM').toString();
      final empName =
          (row['employee_name'] ?? row['employeeName'] ?? 'Employee')
              .toString();
      final purpose =
          (row['purpose'] ?? row['destination'] ?? 'Field visit').toString();
      final destination = (row['destination'] ?? '').toString();
      final subtitle = destination.isNotEmpty && destination != purpose
          ? '$purpose · $destination'
          : purpose;
      final advReq =
          row['advance_required'] != false && row['advanceRequired'] != false;
      final approvedAmt = double.tryParse(
              '${row['approved_amount'] ?? row['approvedAmount'] ?? 0}') ??
          0;
      final allocatedAmt = double.tryParse(
              '${row['allocated_amount'] ?? row['allocatedAmount'] ?? 0}') ??
          0;
      final spentAmt =
          double.tryParse('${row['total_spent'] ?? row['totalSpent'] ?? 0}') ??
              0;
      final returnedAmt = double.tryParse(
              '${row['returned_amount'] ?? row['returnedAmount'] ?? 0}') ??
          0;
      final balanceAmt = double.tryParse('${row['balance'] ?? 0}') ?? 0;
      final balReturnStatus =
          (row['balance_return_status'] ?? row['balanceReturnStatus'] ?? '')
              .toString()
              .trim()
              .toUpperCase();

      final tripProofs = <ProofAttachment>[];
      final reports = row['daily_reports'] ?? row['dailyReports'];
      if (reports is List) {
        for (final r in reports) {
          if (r is! Map) continue;
          final url =
              (r['attachment_path'] ?? r['attachmentPath'] ?? '').toString().trim();
          if (url.isEmpty) continue;
          tripProofs.add(ProofAttachment(
            title: '${r['category'] ?? 'Expense'} Bill Proof',
            subtitle: (r['description'] ?? '').toString(),
            url: url,
          ));
        }
      }
      final balProof =
          (row['balance_return_proof_path'] ?? '').toString().trim();
      if (balProof.isNotEmpty) {
        tripProofs.add(ProofAttachment(
          title: '$tripCode Balance Settlement Proof',
          url: balProof,
        ));
      }
      final dist = fieldDistsByReq[id];
      final distProof =
          (dist?['payment_proof_path'] ?? dist?['paymentProofPath'] ?? '')
              .toString()
              .trim();
      if (distProof.isNotEmpty) {
        tripProofs.add(ProofAttachment(
          title: '$tripCode Accounts Payout Proof',
          url: distProof,
        ));
      }

      // 1a. Initial Advance Disbursement — strictly ONLY when advance_required && approved > 0
      if (advReq && approvedAmt > 0) {
        final isPending =
            status == 'APPROVED' || status == 'PENDING_DISTRIBUTION';
        final isDone = status == 'AMOUNT_DISTRIBUTED' ||
            status == 'ACTIVE_VISIT' ||
            status == 'IN_PROGRESS' ||
            status == 'COMPLETED' ||
            status == 'SETTLED';
        if (isPending || isDone) {
          items.add(_PaymentQueueItem(
            id: id,
            source: _PaymentSource.fieldAllowance,
            typeLabel: 'Finance & Claim Advance',
            reference: tripCode,
            employeeName: empName,
            subtitle: subtitle,
            amount: isDone && allocatedAmt > 0 ? allocatedAmt : approvedAmt,
            dateLabel: formatDisplayDate(
                (row['decided_at'] ?? row['updated_at'] ?? row['created_at'])
                    ?.toString()),
            pending: isPending,
            statusLabel: isPending ? 'Pending Payout' : 'Disbursed',
            proofs: tripProofs,
          ));
        }
      }

      // 1b. Direct Employee Reimbursement (PENDING_REIMBURSEMENT)
      if (status == 'PENDING_REIMBURSEMENT') {
        final reimbAmt =
            balanceAmt.abs() > 0 ? balanceAmt.abs() : spentAmt;
        if (reimbAmt > 0) {
          items.add(_PaymentQueueItem(
            id: id,
            source: _PaymentSource.fieldAllowance,
            typeLabel: 'Finance & Claims Reimbursement',
            reference: '$tripCode-CLM',
            employeeName: empName,
            subtitle: subtitle,
            amount: reimbAmt,
            dateLabel: formatDisplayDate(
                (row['updated_at'] ?? row['created_at'])?.toString()),
            pending: true,
            statusLabel: 'Pending Reimbursement',
            proofs: tripProofs,
          ));
        }
      }

      // 1c. Balance Return / Settlement submitted to Accounts
      final settleAmt =
          returnedAmt > 0 ? returnedAmt : (allocatedAmt - spentAmt).abs();
      if (settleAmt > 0 &&
          (balReturnStatus == 'SUBMITTED_TO_ACCOUNTS' ||
              balReturnStatus == 'RECEIVED_BY_ACCOUNTS')) {
        final isPendingReturn = balReturnStatus == 'SUBMITTED_TO_ACCOUNTS';
        items.add(_PaymentQueueItem(
          id: id,
          source: _PaymentSource.fieldAllowanceBalance,
          typeLabel: spentAmt > allocatedAmt
              ? 'Claim Expense Settlement'
              : 'Claim Balance Return',
          reference: '$tripCode-STL',
          employeeName: empName,
          subtitle: subtitle,
          amount: settleAmt,
          dateLabel: formatDisplayDate(
              (row['balance_returned_at'] ?? row['updated_at'])?.toString()),
          pending: isPendingReturn,
          statusLabel: isPendingReturn ? 'Pending Receipt' : 'Settled',
          proofs: tripProofs,
        ));
      }
    }

    // 2. Live Expense Reimbursements (authoritative public.expenses only — deleted rows excluded)
    for (final row in results[2] as List<Map<String, dynamic>>) {
      final status = (row['status'] ?? '').toString().trim().toLowerCase();
      final isPending = status == 'approved';
      final isDone = status == 'reimbursed' || status == 'paid';
      if (!isPending && !isDone) continue;
      final amt = double.tryParse('${row['amount'] ?? 0}') ?? 0;
      if (amt <= 0) continue;
      final proofs = <ProofAttachment>[];
      final receiptUrl =
          (row['receiptUrl'] ?? row['receipt_url'] ?? '').toString().trim();
      if (receiptUrl.isNotEmpty) {
        proofs.add(ProofAttachment(
          title: '${row['category'] ?? 'Expense'} Bill Proof',
          url: receiptUrl,
        ));
      }
      final payProof =
          (row['paymentProofPath'] ?? row['payment_proof_path'] ?? '')
              .toString()
              .trim();
      if (payProof.isNotEmpty) {
        proofs.add(ProofAttachment(
          title: 'Expense Payout Proof',
          url: payProof,
        ));
      }
      final rawId = row['id']?.toString() ?? '';
      items.add(_PaymentQueueItem(
        id: rawId,
        source: _PaymentSource.expense,
        typeLabel: 'Expense (${row['category'] ?? 'General'})',
        reference: rawId.startsWith('EXP-')
            ? rawId
            : 'EXP-${rawId.padRight(6).substring(0, 6).trim().toUpperCase()}',
        employeeName:
            (row['employeeName'] ?? row['employee_name'] ?? 'Staff').toString(),
        subtitle: (row['description'] ?? 'Expense reimbursement').toString(),
        amount: amt,
        dateLabel:
            formatDisplayDate((row['date'] ?? row['created_at'])?.toString()),
        pending: isPending,
        statusLabel: isPending ? 'Pending Payout' : 'Reimbursed',
        proofs: proofs,
      ));
    }

    // 3. Petty Cash Requests (exact backend statuses: APPROVED_BY_CEO / DISBURSED_PENDING_RECEIPT / COMPLETED)
    final pcDisbByReqId = <String, Map<String, dynamic>>{};
    for (final d in results[4] as List<Map<String, dynamic>>) {
      final reqId = (d['request_id'] ?? d['requestId'] ?? '').toString();
      if (reqId.isNotEmpty) pcDisbByReqId[reqId] = d;
    }
    for (final row in results[3] as List<Map<String, dynamic>>) {
      final id = row['id']?.toString() ?? '';
      final status = (row['status'] ?? '').toString().trim().toUpperCase();
      final isPending = status == 'APPROVED_BY_CEO' ||
          status == 'APPROVED' ||
          status == 'PARTIALLY_DISBURSED';
      final isDone = status == 'DISBURSED_PENDING_RECEIPT' ||
          status == 'DISBURSED' ||
          status == 'COMPLETED';
      if (!isPending && !isDone) continue;
      final amt = double.tryParse(
              '${row['approved_amount'] ?? row['requested_amount'] ?? 0}') ??
          0;
      final proofs = <ProofAttachment>[];
      final docUrl = (row['supporting_document_url'] ??
              row['supportingDocumentUrl'] ??
              '')
          .toString()
          .trim();
      if (docUrl.isNotEmpty) {
        proofs.add(ProofAttachment(
          title: 'Petty Cash Request Proof',
          url: docUrl,
        ));
      }
      final disb = pcDisbByReqId[id];
      final disbProof =
          (disb?['payment_proof_url'] ?? disb?['paymentProofUrl'] ?? '')
              .toString()
              .trim();
      if (disbProof.isNotEmpty) {
        proofs.add(ProofAttachment(
          title: 'Petty Cash Disbursement Proof',
          url: disbProof,
        ));
      }
      items.add(_PaymentQueueItem(
        id: id,
        source: _PaymentSource.pettyCash,
        typeLabel: 'Petty Cash',
        reference: (row['request_number'] ?? 'PC').toString(),
        employeeName: (row['employee_name'] ??
                row['custodian_name'] ??
                row['requested_by_name'] ??
                'Custodian')
            .toString(),
        subtitle: (row['purpose'] ?? 'Petty cash replenishment').toString(),
        amount: amt,
        dateLabel: formatDisplayDate(
            (row['ceo_action_at'] ?? row['created_at'])?.toString()),
        pending: isPending,
        statusLabel: isPending ? 'Pending Payout' : 'Disbursed',
        proofs: proofs,
      ));
    }

    // 4. Advance Salary / Loans
    for (final row in results[5] as List<Map<String, dynamic>>) {
      final status = (row['status'] ?? '').toString().trim().toLowerCase();
      final isPending = status == 'approved';
      final isDone = status == 'disbursed' || status == 'active';
      if (!isPending && !isDone) continue;
      final amt = double.tryParse(
              '${row['approvedAmount'] ?? row['requestedAmount'] ?? 0}') ??
          0;
      final proofs = <ProofAttachment>[];
      final disbDetails = row['disbursementDetails'];
      if (disbDetails is Map) {
        final url = (disbDetails['paymentProofUrl'] ?? '').toString().trim();
        if (url.isNotEmpty) {
          proofs.add(ProofAttachment(
            title: 'Advance Salary Payout Proof',
            url: url,
          ));
        }
      }
      items.add(_PaymentQueueItem(
        id: row['id']?.toString() ?? '',
        source: _PaymentSource.advance,
        typeLabel: (row['requestType'] ?? 'Advance Salary').toString(),
        reference: row['id']?.toString() ?? 'ADV',
        employeeName: (row['employeeName'] ?? 'Employee').toString(),
        subtitle: (row['purpose'] ?? 'Salary advance').toString(),
        amount: amt,
        dateLabel: formatDisplayDate(row['requestedDate']?.toString()),
        pending: isPending,
        statusLabel: isPending ? 'Pending Payout' : 'Disbursed',
        proofs: proofs,
      ));
    }

    // 5. Payroll Salary Records forwarded to Accounts (exact Web parity: Sent to Accounts / Paid)
    for (final row in results[6] as List<Map<String, dynamic>>) {
      final status = (row['status'] ?? '').toString().trim().toLowerCase();
      final isPending = status == 'sent to accounts';
      final isDone = status == 'paid';
      if (!isPending && !isDone) continue;
      final amt =
          double.tryParse('${row['netSalary'] ?? row['net_salary'] ?? 0}') ?? 0;
      final m = row['payrollMonth'] ?? row['month'] ?? '';
      final y = row['payrollYear'] ?? row['year'] ?? '';
      items.add(_PaymentQueueItem(
        id: row['id']?.toString() ?? '',
        source: _PaymentSource.payroll,
        typeLabel: 'Monthly Salary',
        reference: 'PAY-$m/$y',
        employeeName:
            (row['employeeName'] ?? row['employeeId'] ?? 'Staff').toString(),
        subtitle: '${row['designation'] ?? 'Salary'} · $m/$y',
        amount: amt,
        dateLabel: '$m/$y',
        pending: isPending,
        statusLabel: isPending ? 'Ready to Pay' : 'Paid',
        employeeId: row['employeeId']?.toString(),
        payrollMonth: int.tryParse('$m'),
        payrollYear: int.tryParse('$y'),
      ));
    }

    return items;
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _openDisburseSheet(_PaymentQueueItem item) async {
    final user = ref.read(authControllerProvider).value;
    if (user == null) return;
    final amountCtrl =
        TextEditingController(text: item.amount.toStringAsFixed(0));
    final refCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    var mode = item.source == _PaymentSource.pettyCash ? 'Cash' : 'Bank Transfer';
    var submitting = false;
    String? paymentProofDataUri;
    String? paymentProofName;

    final allowedModes = item.source == _PaymentSource.pettyCash
        ? const ['Cash', 'Bank Transfer', 'UPI']
        : const ['Cash', 'Bank Transfer', 'UPI', 'NEFT', 'IMPS', 'Cheque'];

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            4,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  item.source == _PaymentSource.fieldAllowanceBalance
                      ? 'Confirm Balance Receipt'
                      : 'Confirm Disbursement',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  '${item.employeeName} · ${item.typeLabel} (${item.reference})',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
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
                  initialValue: mode,
                  decoration: const InputDecoration(
                    labelText: 'Payment Mode',
                    prefixIcon: Icon(Icons.account_balance_outlined),
                  ),
                  items: allowedModes
                      .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setModalState(() => mode = v);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: refCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Transaction Reference / UTR',
                    prefixIcon: Icon(Icons.tag_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final source = await showModalBottomSheet<ImageSource>(
                      context: context,
                      showDragHandle: true,
                      builder: (ctx) => SafeArea(
                        child: Wrap(
                          children: [
                            ListTile(
                              leading: const Icon(Icons.photo_camera_outlined),
                              title: const Text('Capture with Camera'),
                              onTap: () =>
                                  Navigator.pop(ctx, ImageSource.camera),
                            ),
                            ListTile(
                              leading: const Icon(Icons.photo_library_outlined),
                              title: const Text('Choose from Gallery'),
                              onTap: () =>
                                  Navigator.pop(ctx, ImageSource.gallery),
                            ),
                          ],
                        ),
                      ),
                    );
                    if (source == null) return;
                    final file = await ImagePicker().pickImage(
                      source: source,
                      imageQuality: 72,
                      maxWidth: 1600,
                    );
                    if (file == null) return;
                    final bytes = await file.readAsBytes();
                    if (bytes.length > 4 * 1024 * 1024) return;
                    final ext = file.name.toLowerCase().endsWith('.png')
                        ? 'png'
                        : 'jpeg';
                    setModalState(() {
                      paymentProofDataUri =
                          'data:image/$ext;base64,${base64Encode(bytes)}';
                      paymentProofName = file.name;
                    });
                  },
                  icon: const Icon(Icons.upload_file_outlined),
                  label: Text(
                    paymentProofName ??
                        (item.source == _PaymentSource.fieldAllowance &&
                                mode != 'Cash'
                            ? 'Attach Payment Proof (Required) *'
                            : 'Attach Payment Proof (optional)'),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notesCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Remarks (optional)',
                  ),
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: submitting
                      ? null
                      : () async {
                          final amt =
                              double.tryParse(amountCtrl.text.trim()) ?? 0;
                          if (amt <= 0) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content:
                                      Text('Enter a valid payout amount.')),
                            );
                            return;
                          }
                          if (item.source == _PaymentSource.fieldAllowance &&
                              mode != 'Cash' &&
                              (paymentProofDataUri == null ||
                                  paymentProofDataUri!.isEmpty)) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Attach payment proof for non-cash claim payout.'),
                              ),
                            );
                            return;
                          }
                          setModalState(() => submitting = true);
                          try {
                            final repo = ref.read(hrmsRepositoryProvider);
                            final today =
                                DateFormat('yyyy-MM-dd').format(DateTime.now());
                            final txRef = refCtrl.text.trim().isEmpty
                                ? 'TXN-${DateTime.now().millisecondsSinceEpoch}'
                                : refCtrl.text.trim();
                            final remarks = notesCtrl.text.trim();
                            switch (item.source) {
                              case _PaymentSource.fieldAllowance:
                                await repo.distributeFieldAllowance(item.id, {
                                  'distributedAmount': amt,
                                  'distributionDate': today,
                                  'paymentMethod': mode,
                                  'referenceNumber': txRef,
                                  if (paymentProofDataUri != null)
                                    'paymentProofPath': paymentProofDataUri,
                                  if (remarks.isNotEmpty) 'remarks': remarks,
                                });
                              case _PaymentSource.fieldAllowanceBalance:
                                await repo
                                    .confirmFieldAllowanceBalance(item.id, {
                                  'paymentMethod': mode,
                                  'referenceNumber': txRef,
                                  if (paymentProofDataUri != null)
                                    'paymentProofPath': paymentProofDataUri,
                                  'remarks': remarks.isNotEmpty
                                      ? remarks
                                      : 'Balance receipt confirmed by Accounts',
                                });
                              case _PaymentSource.expense:
                                await repo.disburseExpense(item.id, {
                                  'amount': amt,
                                  'paymentMode': mode,
                                  'transactionRef': txRef,
                                  if (paymentProofDataUri != null)
                                    'paymentProofPath': paymentProofDataUri,
                                  if (remarks.isNotEmpty) 'remarks': remarks,
                                });
                              case _PaymentSource.pettyCash:
                                await repo.disbursePettyCash(item.id, {
                                  'requestId': item.id,
                                  'disbursedAmount': amt,
                                  'paymentMode': mode,
                                  'paymentDate': today,
                                  'paymentReference': txRef,
                                  if (paymentProofDataUri != null)
                                    'paymentProofUrl': paymentProofDataUri,
                                  if (remarks.isNotEmpty) 'remarks': remarks,
                                });
                              case _PaymentSource.advance:
                                await repo.disburseLoanRequest(
                                  id: item.id,
                                  amount: amt,
                                  paymentMode: mode,
                                  transactionRef: txRef,
                                  disbursedBy: user.name,
                                  notes: remarks,
                                  paymentProofUrl: paymentProofDataUri,
                                );
                              case _PaymentSource.payroll:
                                await repo.markPayrollRecordPaid(
                                  id: item.id,
                                  paymentMode: mode,
                                  transactionRef: txRef,
                                  paidBy: user.name,
                                  employeeId: item.employeeId,
                                  month: item.payrollMonth,
                                  year: item.payrollYear,
                                );
                            }
                            if (!context.mounted) return;
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                    'Recorded ${formatInr(amt)} for ${item.employeeName}.'),
                              ),
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
                  icon: const Icon(Icons.check_circle_outline_rounded),
                  label: Text(submitting
                      ? 'Processing…'
                      : item.source == _PaymentSource.fieldAllowanceBalance
                          ? 'Confirm Balance Received'
                          : 'Mark as Disbursed'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    amountCtrl.dispose();
    refCtrl.dispose();
    notesCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<_PaymentQueueItem>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const AppSkeletonList(itemCount: 5, height: 96);
        }
        if (snapshot.hasError) {
          return AppErrorView(error: snapshot.error!, onRetry: _reload);
        }
        final all = snapshot.data ?? const [];
        final pendingItems = all.where((e) => e.pending).toList();
        final historyItems = all.where((e) => !e.pending).toList();
        final pendingTotal =
            pendingItems.fold<double>(0, (sum, item) => sum + item.amount);
        final paidTotal =
            historyItems.fold<double>(0, (sum, item) => sum + item.amount);

        final filtered = all.where((item) {
          final matchesTab = switch (_filter) {
            _PaymentFilter.pending => item.pending,
            _PaymentFilter.claims => item.pending &&
                (item.source == _PaymentSource.fieldAllowance ||
                    item.source == _PaymentSource.fieldAllowanceBalance ||
                    item.source == _PaymentSource.expense),
            _PaymentFilter.pettyCash =>
                item.pending && item.source == _PaymentSource.pettyCash,
            _PaymentFilter.payroll =>
                item.pending && item.source == _PaymentSource.payroll,
            _PaymentFilter.advances =>
                item.pending && item.source == _PaymentSource.advance,
            _PaymentFilter.history => !item.pending,
          };
          if (!matchesTab) return false;
          if (_search.trim().isEmpty) return true;
          final q = _search.trim().toLowerCase();
          return item.employeeName.toLowerCase().contains(q) ||
              item.reference.toLowerCase().contains(q) ||
              item.typeLabel.toLowerCase().contains(q) ||
              item.subtitle.toLowerCase().contains(q);
        }).toList(growable: false);

        return RefreshIndicator(
          onRefresh: () async {
            _reload();
            await _future;
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 108),
            children: [
              Row(
                children: [
                  Expanded(
                    child: CompactKpiCard(
                      label: 'Pending Queue',
                      value: '${pendingItems.length}',
                      subtitle: formatInr(pendingTotal),
                      icon: Icons.pending_actions_rounded,
                      accentColor: AppTokens.warning,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: CompactKpiCard(
                      label: 'Disbursed',
                      value: '${historyItems.length}',
                      subtitle: formatInr(paidTotal),
                      icon: Icons.check_circle_outline_rounded,
                      accentColor: AppTokens.success,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                onChanged: (value) => setState(() => _search = value),
                decoration: const InputDecoration(
                  hintText: 'Search employee, reference, or payout type…',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _chip(_PaymentFilter.pending,
                        'Pending (${pendingItems.length})'),
                    const SizedBox(width: 8),
                    _chip(_PaymentFilter.claims, 'Claims'),
                    const SizedBox(width: 8),
                    _chip(_PaymentFilter.pettyCash, 'Petty Cash'),
                    const SizedBox(width: 8),
                    _chip(_PaymentFilter.payroll, 'Payroll'),
                    const SizedBox(width: 8),
                    _chip(_PaymentFilter.advances, 'Advances'),
                    const SizedBox(width: 8),
                    _chip(_PaymentFilter.history,
                        'History (${historyItems.length})'),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              if (filtered.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 32),
                  child: EmptyState(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'No matching disbursements',
                    message:
                        'Approved claims, petty cash, advances, and salaries forwarded to Accounts appear here.',
                  ),
                )
              else
                ...filtered.map(
                  (item) => Card(
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
                                      item.employeeName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 15,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${item.typeLabel} · ${item.reference}',
                                      style:
                                          Theme.of(context).textTheme.bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    formatInr(item.amount),
                                    style: TextStyle(
                                      fontSize: 15.5,
                                      fontWeight: FontWeight.w800,
                                      color:
                                          Theme.of(context).colorScheme.primary,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  StatusPill(item.statusLabel),
                                ],
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${item.subtitle} · ${item.dateLabel}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          if (item.proofs.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Material(
                                color: AppTokens.brandTint,
                                borderRadius: BorderRadius.circular(
                                    AppTokens.radiusPill),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(
                                      AppTokens.radiusPill),
                                  onTap: () => showProofViewerDialog(
                                    context,
                                    ref: ref,
                                    proofs: item.proofs,
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 10, vertical: 6),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(
                                          Icons.receipt_long_rounded,
                                          size: 14,
                                          color: AppTokens.brandPrimary,
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          item.proofs.length == 1
                                              ? 'View Proof'
                                              : 'View Proofs (${item.proofs.length})',
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
                              ),
                            ),
                          ],
                          if (item.pending) ...[
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed: () => _openDisburseSheet(item),
                                icon: const Icon(Icons.payments_outlined,
                                    size: 18),
                                label: Text(
                                  item.source ==
                                          _PaymentSource.fieldAllowanceBalance
                                      ? 'Confirm Balance Received'
                                      : 'Disburse Payment',
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _chip(_PaymentFilter filter, String label) => FilterChip(
        selected: _filter == filter,
        label: Text(label),
        onSelected: (_) => setState(() => _filter = filter),
      );
}

enum _PaymentSource {
  fieldAllowance,
  fieldAllowanceBalance,
  expense,
  pettyCash,
  advance,
  payroll,
}

class _PaymentQueueItem {
  const _PaymentQueueItem({
    required this.id,
    required this.source,
    required this.typeLabel,
    required this.reference,
    required this.employeeName,
    required this.subtitle,
    required this.amount,
    required this.dateLabel,
    required this.pending,
    required this.statusLabel,
    this.proofs = const [],
    this.employeeId,
    this.payrollMonth,
    this.payrollYear,
  });

  final String id;
  final _PaymentSource source;
  final String typeLabel;
  final String reference;
  final String employeeName;
  final String subtitle;
  final double amount;
  final String dateLabel;
  final bool pending;
  final String statusLabel;
  final List<ProofAttachment> proofs;
  final String? employeeId;
  final int? payrollMonth;
  final int? payrollYear;
}
