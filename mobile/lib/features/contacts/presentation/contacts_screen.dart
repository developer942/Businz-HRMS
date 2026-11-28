import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/providers.dart';
import '../../shared/presentation/async_content.dart';

class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  final _search = TextEditingController();
  bool _scanning = false;

  @override
  void initState() {
    super.initState();
    _future = ref.read(hrmsRepositoryProvider).customers();
  }

  void _reload() =>
      setState(() => _future = ref.read(hrmsRepositoryProvider).customers());

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _capture(ImageSource source) async {
    final image = await ImagePicker().pickImage(
      source: source,
      imageQuality: 78,
      maxWidth: 1800,
    );
    if (image == null) return;
    final bytes = await image.readAsBytes();
    if (bytes.length > 5 * 1024 * 1024) {
      _error('The compressed card image exceeds the 5 MB server limit.');
      return;
    }
    final lower = image.name.toLowerCase();
    final mime = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
    final encoded = base64Encode(bytes);
    setState(() => _scanning = true);
    try {
      final extracted =
          await ref.read(hrmsRepositoryProvider).scanContactCard(encoded, mime);
      if (!mounted) return;
      final saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _ContactReviewForm(
          extracted: extracted,
          cardDataUrl: 'data:$mime;base64,$encoded',
        ),
      );
      if (saved == true) _reload();
    } catch (error) {
      if (mounted) _error(error.toString());
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _chooseCapture() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Scan business card',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Use camera'),
              subtitle: const Text('Capture the card with the native camera'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose existing image'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source != null) await _capture(source);
  }

  void _error(String message) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.transparent,
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _scanning ? null : _chooseCapture,
          icon: _scanning
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.document_scanner_outlined),
          label: Text(_scanning ? 'Reading card…' : 'Scan card'),
        ),
        body: FutureBuilder<List<Map<String, dynamic>>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return AppErrorView(error: snapshot.error!, onRetry: _reload);
            }
            final all = snapshot.data ?? const [];
            final query = _search.text.trim().toLowerCase();
            final contacts = all.where((contact) {
              if (query.isEmpty) return true;
              return [
                _value(contact, ['customerName', 'customer_name', 'name']),
                _value(contact, ['companyName', 'company_name']),
                _value(contact, ['contactNumber', 'contact_number', 'phone']),
                _value(contact, ['email']),
              ].any((value) => value.toLowerCase().contains(query));
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
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                      child: SearchBar(
                        controller: _search,
                        hintText: 'Search contacts',
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
                    ),
                  ),
                  if (contacts.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(
                        icon: Icons.contact_page_outlined,
                        title: 'No contacts found',
                        message:
                            'Scan a visiting card, review the extracted details, and save it to the existing customer directory.',
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 104),
                      sliver: SliverList.separated(
                        itemCount: contacts.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final contact = contacts[index];
                          final name = _value(
                              contact,
                              ['customerName', 'customer_name', 'name'],
                              'Contact');
                          final company =
                              _value(contact, ['companyName', 'company_name']);
                          final phone = _value(contact,
                              ['contactNumber', 'contact_number', 'phone']);
                          final consent = _value(contact,
                              ['consentStatus', 'consent_status'], 'Unknown');
                          return Card(
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 7),
                              leading:
                                  CircleAvatar(child: Text(_initials(name))),
                              title: Text(name,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              subtitle: Text([
                                company,
                                phone,
                              ].where((value) => value.isNotEmpty).join(' • ')),
                              trailing: StatusPill(consent),
                              onTap: () => showModalBottomSheet<void>(
                                context: context,
                                useSafeArea: true,
                                showDragHandle: true,
                                builder: (_) =>
                                    _ContactDetails(contact: contact),
                              ),
                            ),
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
}

class _ContactReviewForm extends ConsumerStatefulWidget {
  const _ContactReviewForm({
    required this.extracted,
    required this.cardDataUrl,
  });

  final Map<String, dynamic> extracted;
  final String cardDataUrl;

  @override
  ConsumerState<_ContactReviewForm> createState() => _ContactReviewFormState();
}

class _ContactReviewFormState extends ConsumerState<_ContactReviewForm> {
  final _key = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _company;
  late final TextEditingController _designation;
  late final TextEditingController _phone;
  late final TextEditingController _email;
  late final TextEditingController _website;
  late final TextEditingController _address;
  String _consent = 'Unknown';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.extracted;
    _name = TextEditingController(
        text: _value(e, ['customerName', 'person_name', 'name']));
    _company =
        TextEditingController(text: _value(e, ['companyName', 'company_name']));
    _designation =
        TextEditingController(text: _value(e, ['designation', 'jobTitle']));
    _phone = TextEditingController(
        text: _value(e, ['contactNumber', 'phone', 'phoneNumber'],
            _firstList(e, ['phone_numbers', 'phones'])));
    _email = TextEditingController(
        text: _value(e, ['email'], _firstList(e, ['emails'])));
    _website = TextEditingController(text: _value(e, ['website']));
    _address = TextEditingController(text: _value(e, ['address']));
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _company,
      _designation,
      _phone,
      _email,
      _website,
      _address,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_key.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final duplicateResponse = await ref
          .read(hrmsRepositoryProvider)
          .checkCustomerDuplicate(_phone.text.trim());
      final duplicateData = duplicateResponse['data'];
      final isDuplicate =
          duplicateData is Map && duplicateData['isDuplicate'] == true;
      if (isDuplicate) {
        final existing = duplicateData['existingCustomer'];
        final existingName = existing is Map
            ? _value(Map<String, dynamic>.from(existing),
                ['customerName', 'name'], 'an existing contact')
            : 'an existing contact';
        throw StateError('This phone number already belongs to $existingName.');
      }
      await ref.read(hrmsRepositoryProvider).saveCustomer({
        'customerName': _name.text.trim(),
        'companyName': _company.text.trim(),
        'designation': _designation.text.trim(),
        'contactNumber': _phone.text.trim(),
        'email': _email.text.trim(),
        'website': _website.text.trim(),
        'address': _address.text.trim(),
        'visitingCardUrl': widget.cardDataUrl,
        'consentStatus': _consent,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final needsReview = widget.extracted['review_required_fields'];
    return FractionallySizedBox(
      heightFactor: .94,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          4,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: SingleChildScrollView(
          child: Form(
            key: _key,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Review scanned contact',
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                const Text(
                    'OCR can make mistakes. Confirm every field before saving.'),
                if (needsReview is List && needsReview.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text('Needs review: ${needsReview.join(', ')}',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                          fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 18),
                _field(_name, 'Name', required: true),
                _field(_company, 'Company'),
                _field(_designation, 'Designation'),
                _field(_phone, 'Phone number',
                    required: true, keyboard: TextInputType.phone),
                _field(_email, 'Email', keyboard: TextInputType.emailAddress),
                _field(_website, 'Website', keyboard: TextInputType.url),
                _field(_address, 'Address', lines: 3),
                DropdownButtonFormField<String>(
                  initialValue: _consent,
                  decoration:
                      const InputDecoration(labelText: 'WhatsApp consent'),
                  items: ['Unknown', 'Opted In', 'Not Opted In']
                      .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                      .toList(),
                  onChanged: _saving
                      ? null
                      : (value) => setState(() => _consent = value!),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: const Text('Check duplicate & save'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    bool required = false,
    TextInputType? keyboard,
    int lines = 1,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: controller,
          enabled: !_saving,
          keyboardType: keyboard,
          minLines: lines,
          maxLines: lines,
          decoration: InputDecoration(labelText: label),
          validator: required
              ? (value) => value == null || value.trim().isEmpty
                  ? '$label is required'
                  : null
              : null,
        ),
      );
}

class _ContactDetails extends StatelessWidget {
  const _ContactDetails({required this.contact});
  final Map<String, dynamic> contact;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
                _value(contact, ['customerName', 'customer_name', 'name'],
                    'Contact'),
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            _info(Icons.business_outlined,
                _value(contact, ['companyName', 'company_name'], 'No company')),
            _info(
                Icons.phone_outlined,
                _value(contact, ['contactNumber', 'contact_number', 'phone'],
                    'No phone')),
            _info(Icons.email_outlined, _value(contact, ['email'], 'No email')),
            _info(Icons.location_on_outlined,
                _value(contact, ['address'], 'No address')),
          ],
        ),
      );

  Widget _info(IconData icon, String text) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon),
        title: Text(text),
      );
}

String _firstList(Map<String, dynamic> data, List<String> keys) {
  for (final key in keys) {
    final value = data[key];
    if (value is List && value.isNotEmpty) return value.first.toString();
  }
  return '';
}

String _value(Map<String, dynamic> data, List<String> keys,
    [String fallback = '']) {
  for (final key in keys) {
    final value = data[key];
    if (value != null && value.toString().trim().isNotEmpty) {
      return value.toString().trim();
    }
  }
  return fallback;
}

String _initials(String name) => name
    .trim()
    .split(RegExp(r'\s+'))
    .take(2)
    .where((part) => part.isNotEmpty)
    .map((part) => part[0].toUpperCase())
    .join();
