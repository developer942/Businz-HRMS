import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class ExpensesScreen extends ConsumerStatefulWidget {
  const ExpensesScreen({super.key});

  @override
  ConsumerState<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends ConsumerState<ExpensesScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(hrmsRepositoryProvider).expenses();
  }

  void _reload() =>
      setState(() => _future = ref.read(hrmsRepositoryProvider).expenses());

  Future<void> _create() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _ExpenseForm(),
    );
    if (saved == true) _reload();
  }

  Future<void> _approve(String id) async {
    await _perform(() => ref.read(hrmsRepositoryProvider).approveExpense(id));
  }

  Future<void> _reject(String id) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject expense claim'),
        content: TextField(
          controller: controller,
          minLines: 3,
          maxLines: 5,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Rejection reason'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                Navigator.pop(context, controller.text.trim());
              }
            },
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (reason != null) {
      await _perform(
          () => ref.read(hrmsRepositoryProvider).rejectExpense(id, reason));
    }
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

  Future<void> _disburse(String id, double amount) async {
    final paid = TextEditingController(text: amount.toStringAsFixed(2));
    final reference = TextEditingController();
    String mode = 'Bank Transfer';
    final payload = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Record payment'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(
                controller: paid,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount paid'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: mode,
                decoration: const InputDecoration(labelText: 'Payment mode'),
                items: ['Bank Transfer', 'UPI', 'Cheque', 'Cash']
                    .map((value) =>
                        DropdownMenuItem(value: value, child: Text(value)))
                    .toList(),
                onChanged: (value) => setDialogState(() => mode = value!),
              ),
              if (mode != 'Cash') ...[
                const SizedBox(height: 12),
                TextField(
                  controller: reference,
                  decoration:
                      const InputDecoration(labelText: 'Transaction reference'),
                ),
              ],
            ]),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final amountPaid = double.tryParse(paid.text);
                if (amountPaid == null || amountPaid <= 0) return;
                if (mode != 'Cash' && reference.text.trim().isEmpty) return;
                Navigator.pop(context, {
                  'amountPaid': amountPaid,
                  'paymentMode': mode,
                  if (reference.text.trim().isNotEmpty)
                    'transactionRef': reference.text.trim(),
                  'paymentDate':
                      DateFormat('yyyy-MM-dd').format(DateTime.now()),
                });
              },
              child: const Text('Confirm payment'),
            ),
          ],
        ),
      ),
    );
    paid.dispose();
    reference.dispose();
    if (payload != null) {
      await _perform(
          () => ref.read(hrmsRepositoryProvider).disburseExpense(id, payload));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value!;
    final role = user.role.toLowerCase();
    final canCreate = user.isEmployee || user.isHr || user.isAccounts;
    final canReview = user.isCeo || user.isHr || role.contains('admin');
    final canDisburse = user.isAccounts || user.isCeo || role.contains('admin');
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: _create,
              icon: const Icon(Icons.add_rounded),
              label: const Text('New claim'),
            )
          : null,
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AppErrorView(error: snapshot.error!, onRetry: _reload);
          }
          final items = snapshot.data ?? const [];
          if (items.isEmpty) {
            return const EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No expense claims',
              message:
                  'Submitted claims and their server-confirmed status will appear here.',
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              _reload();
              await _future;
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 104),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final item = items[index];
                final id = (item['id'] ?? '').toString();
                final category = (item['category'] ?? 'Expense').toString();
                final amount =
                    double.tryParse((item['amount'] ?? 0).toString()) ?? 0;
                final status =
                    (item['status'] ?? item['approval_status'] ?? 'Pending')
                        .toString();
                final pending = status.toLowerCase().contains('pending');
                final paymentStatus =
                    (item['payment_status'] ?? item['paymentStatus'] ?? '')
                        .toString()
                        .toLowerCase();
                final approved = status.toLowerCase().contains('approv');
                final unpaid = !paymentStatus.contains('paid') &&
                    !paymentStatus.contains('disburs');
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Expanded(
                                child: Text(category,
                                    style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w800))),
                            StatusPill(status),
                          ]),
                          const SizedBox(height: 10),
                          Text(
                              NumberFormat.currency(
                                      locale: 'en_IN', symbol: '\u20B9')
                                  .format(amount),
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w800)),
                          if (item['description'] != null) ...[
                            const SizedBox(height: 6),
                            Text(item['description'].toString()),
                          ],
                          if (canReview && pending && id.isNotEmpty) ...[
                            const SizedBox(height: 14),
                            Row(children: [
                              Expanded(
                                  child: OutlinedButton(
                                onPressed: () => _reject(id),
                                child: const Text('Reject'),
                              )),
                              const SizedBox(width: 10),
                              Expanded(
                                  child: FilledButton(
                                onPressed: () => _approve(id),
                                child: const Text('Approve'),
                              )),
                            ]),
                          ],
                          if (canDisburse &&
                              approved &&
                              unpaid &&
                              id.isNotEmpty) ...[
                            const SizedBox(height: 14),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed: () => _disburse(id, amount),
                                icon: const Icon(Icons.payments_outlined),
                                label: const Text('Record payment'),
                              ),
                            ),
                          ],
                        ]),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _ExpenseForm extends ConsumerStatefulWidget {
  const _ExpenseForm();

  @override
  ConsumerState<_ExpenseForm> createState() => _ExpenseFormState();
}

class _ExpenseFormState extends ConsumerState<_ExpenseForm> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _description = TextEditingController();
  String _category = 'Travel';
  final DateTime _date = DateTime.now();
  String? _receipt;
  String? _proofName;
  String? _error;
  bool _saving = false;

  Future<void> _pickProof(ImageSource source) async {
    final file = await ImagePicker().pickImage(
      source: source,
      imageQuality: 72,
      maxWidth: 1600,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.length > 2500000) {
      setState(() => _error =
          'The compressed receipt is too large. Choose a smaller image.');
      return;
    }
    final extension = file.name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    setState(() {
      _receipt = 'data:image/$extension;base64,${base64Encode(bytes)}';
      _proofName = file.name;
      _error = null;
    });
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_receipt == null) {
      setState(() => _error = 'Add a bill or receipt before submitting.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(hrmsRepositoryProvider).createExpense({
        'category': _category,
        'amount': double.parse(_amount.text),
        'date': DateFormat('yyyy-MM-dd').format(_date),
        'description': _description.text.trim(),
        'receiptUrl': _receipt,
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
    _amount.dispose();
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 16, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('New expense claim',
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 20),
                  DropdownButtonFormField<String>(
                    initialValue: _category,
                    decoration: const InputDecoration(labelText: 'Category'),
                    items: [
                      'Travel',
                      'Meals',
                      'Equipment',
                      'Training',
                      'Utilities',
                      'Other'
                    ]
                        .map((value) =>
                            DropdownMenuItem(value: value, child: Text(value)))
                        .toList(),
                    onChanged: _saving
                        ? null
                        : (value) => setState(() => _category = value!),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _amount,
                    enabled: !_saving,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                        labelText: 'Amount', prefixText: '₹ '),
                    validator: (value) {
                      final amount = double.tryParse(value ?? '');
                      if (amount == null || amount <= 0 || amount > 100000) {
                        return 'Enter a valid amount up to ₹1,00,000.';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _description,
                    enabled: !_saving,
                    minLines: 3,
                    maxLines: 5,
                    decoration: const InputDecoration(labelText: 'Description'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Describe the expense.'
                        : null,
                  ),
                  const SizedBox(height: 14),
                  Row(children: [
                    Expanded(
                        child: OutlinedButton.icon(
                      onPressed:
                          _saving ? null : () => _pickProof(ImageSource.camera),
                      icon: const Icon(Icons.camera_alt_outlined),
                      label: const Text('Camera'),
                    )),
                    const SizedBox(width: 10),
                    Expanded(
                        child: OutlinedButton.icon(
                      onPressed: _saving
                          ? null
                          : () => _pickProof(ImageSource.gallery),
                      icon: const Icon(Icons.photo_outlined),
                      label: const Text('Gallery'),
                    )),
                  ]),
                  if (_proofName != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('Attached: $_proofName',
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    child: Text(_saving ? 'Submitting…' : 'Submit claim'),
                  ),
                ]),
          ),
        ),
      );
}
