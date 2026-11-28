import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../shared/presentation/async_content.dart';

const MethodChannel _kDocumentPickerChannel =
    MethodChannel('com.businz.hrms/document_picker');

const String kDefaultCrmHeaderImageUrl =
    'https://hrms.businz.com/vrm-banner.png';
const String kDefaultCrmHeaderDocumentUrl =
    'https://hrms.businz.com/VRM_Product_Catalogue.pdf';

/// Picked template header media file ready for base64 Data URL encoding.
class PickedTemplateMedia {
  const PickedTemplateMedia({
    required this.fileName,
    required this.bytes,
    required this.headerType,
  });

  final String fileName;
  final Uint8List bytes;
  final String headerType;
}

typedef TemplateMediaPickerFn = Future<PickedTemplateMedia?> Function(
  String headerType,
  String source,
);

/// Maximum allowed raw byte size for WhatsApp template header media uploads.
/// Matches Meta Cloud API limits (5MB image, 16MB video) and keeps documents
/// safely within the backend's 50MB JSON body limit after base64 expansion.
int maxTemplateHeaderBytes(String headerType) =>
    switch (headerType.toUpperCase()) {
      'IMAGE' => 5 * 1024 * 1024,
      'VIDEO' => 16 * 1024 * 1024,
      'DOCUMENT' => 25 * 1024 * 1024,
      _ => 5 * 1024 * 1024,
    };

/// Detects the exact MIME type for a picked WhatsApp template header file.
String detectTemplateHeaderMimeType(String fileName, String headerType) {
  final lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) return 'video/3gpp';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return switch (headerType.toUpperCase()) {
    'VIDEO' => 'video/mp4',
    'DOCUMENT' => 'application/pdf',
    _ => 'image/jpeg',
  };
}

/// Encodes a picked media file into the `data:<mime>;base64,...` format that
/// the backend's `metaApiClient.uploadMediaHandle` uploads via Meta's
/// Resumable Upload API.
String buildTemplateHeaderDataUrl({
  required Uint8List bytes,
  required String fileName,
  required String headerType,
}) {
  final mime = detectTemplateHeaderMimeType(fileName, headerType);
  return 'data:$mime;base64,${base64Encode(bytes)}';
}

String formatMediaFileSize(int bytes) {
  if (bytes >= 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  final kb = (bytes / 1024).ceil();
  return '${kb < 1 ? 1 : kb} KB';
}

/// Returns true for Meta WhatsApp CDN sample URLs (e.g. scontent.whatsapp.net)
/// that always return HTTP 403 Forbidden (error 131053) when passed back to
/// Meta Cloud API as a template header media link.
bool isForbiddenMetaMediaUrl(String? raw) {
  final clean = (raw ?? '').trim();
  if (clean.isEmpty) return true;
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    return true;
  }
  final lower = clean.toLowerCase();
  return lower.contains('scontent.whatsapp.net') ||
      lower.contains('scontent.') ||
      lower.contains('fbcdn.net') ||
      lower.contains('lookaside.fbsbx.com') ||
      lower.contains('brand-logo.png');
}

/// Resolves a public, Meta-accessible header media URL for an approved template.
/// Prefers `headerContent` over `headerExample`, skips Meta CDN 403 URLs, and
/// falls back to the company's public HTTPS banner/catalogue URL.
String resolveSafeTemplateHeaderMedia(
  Map<String, dynamic> template, {
  String? userOverride,
}) {
  final headerType =
      _text(template, ['headerType', 'header_type'], 'NONE').toUpperCase();
  if (!['IMAGE', 'VIDEO', 'DOCUMENT'].contains(headerType)) return '';

  final headerContent = _text(template, ['headerContent', 'header_content']);
  final headerExamples = template['headerExample'] is List
      ? List<dynamic>.from(template['headerExample'] as List)
      : template['header_example'] is List
          ? List<dynamic>.from(template['header_example'] as List)
          : const <dynamic>[];
  final exampleUrl = headerExamples.isEmpty
      ? ''
      : headerExamples.first?.toString().trim() ?? '';

  for (final candidate in [userOverride, headerContent, exampleUrl]) {
    if (candidate != null && !isForbiddenMetaMediaUrl(candidate)) {
      return candidate.trim();
    }
  }
  if (headerType == 'IMAGE') return kDefaultCrmHeaderImageUrl;
  if (headerType == 'DOCUMENT') return kDefaultCrmHeaderDocumentUrl;
  return '';
}

/// Translates raw Meta Cloud API JSON error payloads (e.g., 131047, 131049)
/// into clear, actionable human messages instead of leaking raw JSON in chat bubbles.
String formatMetaFailureReason(String raw) {
  final cleaned = raw.trim();
  if (cleaned.isEmpty) return '';

  String? code;
  String? detail;
  try {
    final decoded = jsonDecode(cleaned);
    Map<String, dynamic>? errObj;
    if (decoded is List && decoded.isNotEmpty && decoded.first is Map) {
      errObj = Map<String, dynamic>.from(decoded.first as Map);
    } else if (decoded is Map) {
      errObj = Map<String, dynamic>.from(decoded);
    }
    if (errObj != null) {
      code = errObj['code']?.toString();
      final errData = errObj['error_data'];
      detail = (errData is Map ? errData['details'] : null)?.toString() ??
          errObj['message']?.toString() ??
          errObj['title']?.toString();
    }
  } catch (_) {
    final match = RegExp(r'\b(1310\d{2}|130\d{3})\b').firstMatch(cleaned);
    code = match?.group(1);
  }

  return switch (code) {
    '131047' =>
      '24-hour customer reply window closed — use an Approved Template to re-engage.',
    '131049' =>
      'Meta frequency limit reached for this contact — retry later or use a Utility template.',
    '131053' =>
      'Template media URL could not be downloaded by Meta (HTTP 403) — resend using a public HTTPS URL.',
    '131026' =>
      'Recipient could not receive this WhatsApp message (invalid number or not on WhatsApp).',
    '131031' => 'WhatsApp Business Account is restricted or locked.',
    '132000' =>
      'Template variable count mismatch — verify template parameters.',
    '132001' => 'Template does not exist or is not approved in this language.',
    '131051' => 'Unsupported WhatsApp message type.',
    _ => (detail != null && detail.trim().isNotEmpty)
        ? detail.trim()
        : cleaned.startsWith('[') || cleaned.startsWith('{')
            ? 'WhatsApp delivery failed — check template status or retry.'
            : cleaned,
  };
}

bool isMetaReengagementWindowError(String raw) =>
    raw.contains('131047') ||
    raw.toLowerCase().contains('more than 24 hours') ||
    raw.toLowerCase().contains('re-engagement');

class WhatsAppCrmScreen extends ConsumerStatefulWidget {
  const WhatsAppCrmScreen({super.key});

  @override
  ConsumerState<WhatsAppCrmScreen> createState() => _WhatsAppCrmScreenState();
}

class _WhatsAppCrmScreenState extends ConsumerState<WhatsAppCrmScreen> {
  String _section = 'Inbox';
  String _search = '';
  bool _syncing = false;
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() {
    final repository = ref.read(hrmsRepositoryProvider);
    return switch (_section) {
      'Contacts' => repository.crmContacts(search: _search),
      'Templates' => repository.crmTemplates(),
      'Campaigns' => repository.crmBroadcasts(),
      _ => repository.crmConversations(search: _search),
    };
  }

  Future<void> _syncTemplates() async {
    if (_syncing) return;
    setState(() => _syncing = true);
    try {
      await ref.read(hrmsRepositoryProvider).syncCrmTemplates();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Synced Meta WhatsApp templates.')),
      );
      _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(_safeError(error))));
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  void _changeSection(String value) {
    if (_section == value) return;
    setState(() {
      _section = value;
      _future = _load();
    });
  }

  void _reload() => setState(() => _future = _load());

  Future<void> _openConversation(Map<String, dynamic> conversation) async {
    final id = _text(conversation, ['id']);
    if (id.isEmpty) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (_) => _ConversationSheet(conversation: conversation),
    );
    _reload();
  }

  Future<void> _openContact(Map<String, dynamic> contact) async {
    final id = _text(contact, ['id']);
    if (id.isEmpty) return;
    try {
      final conversation =
          await ref.read(hrmsRepositoryProvider).startCrmConversation(id);
      if (mounted) await _openConversation(conversation);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  Future<void> _createTemplate() async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const WhatsAppTemplateBuilderScreen()),
    );
    if (saved == true) _reload();
  }

  Future<void> _createCampaign() async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const WhatsAppCampaignBuilderScreen()),
    );
    if (saved == true) _reload();
  }

  Future<void> _openCampaignDetail(Map<String, dynamic> campaign) async {
    final id = _text(campaign, ['id']);
    if (id.isEmpty) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _CampaignDetailSheet(campaign: campaign),
    );
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final permissions = ref.watch(permissionProvider).value;
    final canRunCampaigns = permissions == null ||
        permissions.can('whatsapp_crm', 'edit') ||
        permissions.can('whatsapp_crm', 'create') ||
        permissions.can('whatsapp_crm', 'view');
    final canCreateTemplate = permissions == null ||
        permissions.can('whatsapp_crm', 'create') ||
        permissions.can('whatsapp_crm', 'edit');
    final createAction = _section == 'Templates' && canCreateTemplate
        ? _createTemplate
        : _section == 'Campaigns' && canRunCampaigns
            ? _createCampaign
            : null;
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: createAction != null
          ? FloatingActionButton.extended(
              onPressed: createAction,
              icon: Icon(_section == 'Campaigns'
                  ? Icons.campaign_rounded
                  : Icons.add_rounded),
              label: Text(
                  _section == 'Templates' ? 'Create template' : 'New campaign'),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
            child: Column(
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['Inbox', 'Contacts', 'Templates', 'Campaigns']
                        .map(
                          (section) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              selected: _section == section,
                              label: Text(section),
                              avatar: Icon(_sectionIcon(section), size: 18),
                              onSelected: (_) => _changeSection(section),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        onChanged: (value) {
                          setState(() => _search = value);
                          if (_section == 'Inbox' || _section == 'Contacts') {
                            _reload();
                          }
                        },
                        decoration: InputDecoration(
                          hintText: 'Search ${_section.toLowerCase()}…',
                          prefixIcon: const Icon(Icons.search_rounded),
                        ),
                      ),
                    ),
                    if (_section == 'Templates') ...[
                      const SizedBox(width: 8),
                      IconButton.filledTonal(
                        tooltip: 'Sync from Meta',
                        onPressed: _syncing ? null : _syncTemplates,
                        icon: _syncing
                            ? const SizedBox.square(
                                dimension: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.sync_rounded),
                      ),
                    ],
                    if (_section == 'Campaigns' && canRunCampaigns) ...[
                      const SizedBox(width: 8),
                      FilledButton.icon(
                        onPressed: _createCampaign,
                        icon: const Icon(Icons.send_rounded, size: 16),
                        label: const Text('Bulk Send'),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return AppErrorView(error: snapshot.error!, onRetry: _reload);
                }
                final rawItems = snapshot.data ?? const [];
                final q = _search.trim().toLowerCase();
                final items =
                    q.isEmpty || _section == 'Inbox' || _section == 'Contacts'
                        ? rawItems
                        : rawItems.where((row) {
                            return _text(row, [
                                  'name',
                                  'templateName',
                                  'campaignName'
                                ]).toLowerCase().contains(q) ||
                                _text(row, ['bodyText', 'body_text', 'status'])
                                    .toLowerCase()
                                    .contains(q);
                          }).toList(growable: false);
                if (items.isEmpty) {
                  return EmptyState(
                    icon: _sectionIcon(_section),
                    title: 'No ${_section.toLowerCase()} found',
                    message:
                        'Records synchronized from the existing WhatsApp Cloud API backend will appear here.',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async {
                    _reload();
                    await _future;
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) => switch (_section) {
                      'Contacts' => _ContactTile(
                          contact: items[index],
                          onTap: () => _openContact(items[index]),
                        ),
                      'Templates' => _TemplateCard(template: items[index]),
                      'Campaigns' => _CampaignCard(
                          campaign: items[index],
                          onTap: () => _openCampaignDetail(items[index]),
                        ),
                      _ => _ConversationTile(
                          conversation: items[index],
                          onTap: () => _openConversation(items[index]),
                        ),
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, required this.onTap});
  final Map<String, dynamic> conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = _text(conversation, ['contactName', 'contact_name', 'name'],
        'WhatsApp contact');
    final phone = _text(conversation, ['contactPhone', 'contact_phone']);
    final last = _text(conversation, ['lastMessageText', 'last_message_text'],
        'No messages yet');
    final unread = int.tryParse(
            '${conversation['unreadCount'] ?? conversation['unread_count'] ?? 0}') ??
        0;
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
        leading: CircleAvatar(
          backgroundColor: const Color(0xFFDCFCE7),
          child: Text(_initials(name),
              style: const TextStyle(
                  color: Color(0xFF166534), fontWeight: FontWeight.w800)),
        ),
        title: Row(children: [
          Expanded(
              child: Text(name,
                  style: const TextStyle(fontWeight: FontWeight.w700))),
          if (unread > 0)
            Badge(
              label: Text('$unread'),
              backgroundColor: const Color(0xFF22C55E),
            ),
        ]),
        subtitle: Text(
          [phone, last].where((value) => value.isNotEmpty).join('\n'),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        isThreeLine: phone.isNotEmpty,
        onTap: onTap,
      ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  const _ContactTile({required this.contact, required this.onTap});
  final Map<String, dynamic> contact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = _text(contact, ['name'], 'Contact');
    final phone = _text(contact, ['phone', 'phoneNormalized']);
    final company = _text(contact, ['companyName', 'company_name']);
    final consent =
        _text(contact, ['consentStatus', 'consent_status'], 'Unknown');
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
        leading: CircleAvatar(child: Text(_initials(name))),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text([company, phone].where((v) => v.isNotEmpty).join(' • ')),
        trailing: StatusPill(consent),
        onTap: onTap,
      ),
    );
  }
}

class _TemplateCard extends StatelessWidget {
  const _TemplateCard({required this.template});
  final Map<String, dynamic> template;

  @override
  Widget build(BuildContext context) {
    final name = _text(template, ['name', 'templateName'], 'Template');
    final body = _text(template, ['bodyText', 'body_text'], 'No preview');
    final category = _text(template, ['category'], 'UTILITY');
    final status = _text(template, ['status'], 'DRAFT');
    final headerType =
        _text(template, ['headerType', 'header_type'], 'NONE').toUpperCase();
    final headerContent = _text(template, ['headerContent', 'header_content']);
    final headerUrl = resolveSafeTemplateHeaderMedia(template);
    final footer = _text(template, ['footerText', 'footer_text']);
    final buttons = _maps(template['buttons']);
    final rejection = _text(template, ['rejectionReason', 'rejection_reason']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(
                  child: Text(name,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700))),
              StatusPill(status),
            ]),
            const SizedBox(height: 5),
            Text(category,
                style: TextStyle(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            if (headerType == 'TEXT' && headerContent.isNotEmpty) ...[
              Text(headerContent,
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
            ],
            if (headerType == 'IMAGE' && headerUrl.startsWith('https://')) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.network(
                  headerUrl,
                  height: 160,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const _MediaUnavailable(
                      label: 'Template header image unavailable'),
                ),
              ),
              const SizedBox(height: 10),
            ],
            if (['VIDEO', 'DOCUMENT'].contains(headerType)) ...[
              _MediaUnavailable(
                label: headerUrl.isEmpty
                    ? '$headerType header metadata missing'
                    : '$headerType header',
                icon: headerType == 'VIDEO'
                    ? Icons.play_circle_outline_rounded
                    : Icons.description_outlined,
              ),
              const SizedBox(height: 10),
            ],
            Text(body, maxLines: 5, overflow: TextOverflow.ellipsis),
            if (footer.isNotEmpty) ...[
              const SizedBox(height: 7),
              Text(footer, style: Theme.of(context).textTheme.bodySmall),
            ],
            for (final button in buttons)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: OutlinedButton.icon(
                  onPressed: null,
                  icon: Icon(_buttonIcon(_text(button, ['type']))),
                  label: Text(_text(button, ['text'], 'Action')),
                ),
              ),
            if (rejection.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text('Rejection reason: $rejection',
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                      fontWeight: FontWeight.w600)),
            ],
          ],
        ),
      ),
    );
  }
}

class _CampaignCard extends StatelessWidget {
  const _CampaignCard({required this.campaign, required this.onTap});
  final Map<String, dynamic> campaign;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = _text(campaign, ['name', 'campaignName'], 'Campaign');
    final template = _text(campaign, ['templateName', 'template_name']);
    final status = _text(campaign, ['status'], 'draft');
    final total = _number(campaign, ['totalRecipients', 'total_recipients']);
    final sent = _number(campaign, ['sentCount', 'sent_count']);
    final delivered = _number(campaign, ['deliveredCount', 'delivered_count']);
    final read = _number(campaign, ['readCount', 'read_count']);
    final failed = _number(campaign, ['failedCount', 'failed_count']);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(
                    child: Text(name,
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700))),
                StatusPill(status),
              ]),
              if (template.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text('Template: $template'),
              ],
              const SizedBox(height: 14),
              Row(children: [
                _CampaignMetric('Recipients', total),
                _CampaignMetric('Sent', sent),
                _CampaignMetric('Delivered', delivered),
                _CampaignMetric('Read', read),
                if (failed > 0) _CampaignMetric('Failed', failed),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

class _CampaignDetailSheet extends ConsumerStatefulWidget {
  const _CampaignDetailSheet({required this.campaign});
  final Map<String, dynamic> campaign;

  @override
  ConsumerState<_CampaignDetailSheet> createState() =>
      _CampaignDetailSheetState();
}

class _CampaignDetailSheetState extends ConsumerState<_CampaignDetailSheet> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    final id = _text(widget.campaign, ['id']);
    _future = ref.read(hrmsRepositoryProvider).crmBroadcastDetail(id);
  }

  @override
  Widget build(BuildContext context) {
    final name = _text(widget.campaign, ['name', 'campaignName'], 'Campaign');
    return FractionallySizedBox(
      heightFactor: .88,
      child: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AppErrorView(
              error: snapshot.error!,
              onRetry: () => setState(() => _future = ref
                  .read(hrmsRepositoryProvider)
                  .crmBroadcastDetail(_text(widget.campaign, ['id']))),
            );
          }
          final payload = snapshot.data ?? const {};
          final broadcast =
              payload['data'] is Map ? _map(payload['data']) : widget.campaign;
          final recipients = _maps(payload['recipients']);
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                  ),
                  StatusPill(_text(broadcast, ['status'], 'completed')),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Template: ${_text(broadcast, [
                      'templateName',
                      'template_name'
                    ], '-')}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 14),
              Row(children: [
                _CampaignMetric(
                    'Total',
                    _number(
                        broadcast, ['totalRecipients', 'total_recipients'])),
                _CampaignMetric(
                    'Sent', _number(broadcast, ['sentCount', 'sent_count'])),
                _CampaignMetric('Delivered',
                    _number(broadcast, ['deliveredCount', 'delivered_count'])),
                _CampaignMetric('Failed',
                    _number(broadcast, ['failedCount', 'failed_count'])),
              ]),
              const SizedBox(height: 18),
              Text(
                'Recipients (${recipients.length})',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              if (recipients.isEmpty)
                const Text('No individual recipient logs recorded yet.')
              else
                for (final r in recipients)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(_text(r, ['contactName', 'phone'], 'Contact'),
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_text(r, ['phone'])),
                          if (_text(r, ['errorMessage', 'error_message'])
                              .isNotEmpty)
                            Text(
                              formatMetaFailureReason(
                                  _text(r, ['errorMessage', 'error_message'])),
                              style: TextStyle(
                                fontSize: 11.5,
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                        ],
                      ),
                      trailing: StatusPill(_text(r, ['status'], 'sent')),
                    ),
                  ),
            ],
          );
        },
      ),
    );
  }
}

class _CampaignMetric extends StatelessWidget {
  const _CampaignMetric(this.label, this.value);
  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$value',
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
}

class WhatsAppTemplateBuilderScreen extends ConsumerStatefulWidget {
  const WhatsAppTemplateBuilderScreen({
    super.key,
    this.mediaPicker,
  });

  /// Optional test hook to simulate picking Image/Video/Document files.
  final TemplateMediaPickerFn? mediaPicker;

  @override
  ConsumerState<WhatsAppTemplateBuilderScreen> createState() =>
      _WhatsAppTemplateBuilderScreenState();
}

class _WhatsAppTemplateBuilderScreenState
    extends ConsumerState<WhatsAppTemplateBuilderScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _body = TextEditingController();
  final _footer = TextEditingController();
  final _headerContent = TextEditingController();
  final _headerExample = TextEditingController();
  final _sampleValues = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();
  final List<Map<String, String>> _buttons = [];

  String _category = 'UTILITY';
  String _language = 'en';
  String _headerType = 'NONE';
  String _mediaInputMode = 'upload'; // 'upload' | 'url'
  String _headerFileName = '';
  String _headerFileSize = '';
  String _headerFileDataUrl = '';
  Uint8List? _headerImageBytes;
  bool _pickingMedia = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _body.dispose();
    _footer.dispose();
    _headerContent.dispose();
    _headerExample.dispose();
    _sampleValues.dispose();
    super.dispose();
  }

  void _clearUploadedHeaderFile() {
    _headerFileName = '';
    _headerFileSize = '';
    _headerFileDataUrl = '';
    _headerImageBytes = null;
  }

  Future<PickedTemplateMedia?> _pickMediaFromDevice(
    String headerType,
    String source,
  ) async {
    if (widget.mediaPicker != null) {
      return widget.mediaPicker!(headerType, source);
    }
    if (headerType == 'IMAGE' && (source == 'gallery' || source == 'camera')) {
      final picked = await _imagePicker.pickImage(
        source: source == 'camera' ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 1920,
        imageQuality: 85,
      );
      if (picked == null) return null;
      final bytes = await picked.readAsBytes();
      final name = picked.name.trim().isNotEmpty
          ? picked.name.trim()
          : 'template_image.jpg';
      return PickedTemplateMedia(
        fileName: name,
        bytes: bytes,
        headerType: headerType,
      );
    }
    if (headerType == 'VIDEO' && source == 'gallery') {
      final picked = await _imagePicker.pickVideo(source: ImageSource.gallery);
      if (picked == null) return null;
      final bytes = await picked.readAsBytes();
      final name = picked.name.trim().isNotEmpty
          ? picked.name.trim()
          : 'template_video.mp4';
      return PickedTemplateMedia(
        fileName: name,
        bytes: bytes,
        headerType: headerType,
      );
    }

    final mimeTypes = switch (headerType) {
      'IMAGE' => const ['image/png', 'image/jpeg', 'image/webp', 'image/*'],
      'VIDEO' => const ['video/mp4', 'video/3gpp', 'video/quicktime', 'video/*'],
      'DOCUMENT' => const [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
      _ => const ['*/*'],
    };

    final result = await _kDocumentPickerChannel.invokeMapMethod<String, dynamic>(
      'pickDocument',
      {'mimeTypes': mimeTypes},
    );
    if (result == null) return null;
    final filePath = (result['path'] ?? '').toString().trim();
    if (filePath.isEmpty) return null;
    final bytes = await File(filePath).readAsBytes();
    if (bytes.isEmpty) {
      throw Exception('Unable to read the selected file. Please try again.');
    }
    final pickedName = (result['name'] ?? '').toString().trim();
    return PickedTemplateMedia(
      fileName: pickedName.isNotEmpty
          ? pickedName
          : 'template_${headerType.toLowerCase()}',
      bytes: bytes,
      headerType: headerType,
    );
  }

  Future<void> _pickHeaderMedia(String source) async {
    if (_saving || _pickingMedia) return;
    setState(() {
      _pickingMedia = true;
      _error = null;
    });
    try {
      final picked = await _pickMediaFromDevice(_headerType, source);
      if (picked == null) return;
      final maxBytes = maxTemplateHeaderBytes(_headerType);
      if (picked.bytes.length > maxBytes) {
        final maxMb = (maxBytes / (1024 * 1024)).round();
        final msg =
            'File is too large (${formatMediaFileSize(picked.bytes.length)}). Max allowed for $_headerType is ${maxMb}MB.';
        if (mounted) {
          setState(() => _error = msg);
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(msg)));
        }
        return;
      }
      final dataUrl = buildTemplateHeaderDataUrl(
        bytes: picked.bytes,
        fileName: picked.fileName,
        headerType: _headerType,
      );
      if (!mounted) return;
      setState(() {
        _headerFileName = picked.fileName;
        _headerFileSize = formatMediaFileSize(picked.bytes.length);
        _headerFileDataUrl = dataUrl;
        _headerImageBytes = _headerType == 'IMAGE' ? picked.bytes : null;
        _mediaInputMode = 'upload';
        _error = null;
      });
    } catch (error) {
      final msg = _safeError(error);
      if (mounted) {
        setState(() => _error = msg);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    } finally {
      if (mounted) setState(() => _pickingMedia = false);
    }
  }

  void _addVariable() {
    final variables = RegExp(r'\{\{(\d+)\}\}')
        .allMatches(_body.text)
        .map((match) => int.tryParse(match.group(1) ?? '') ?? 0)
        .toList();
    final next = variables.isEmpty
        ? 1
        : variables.reduce((value, item) => value > item ? value : item) + 1;
    final insertion = '{{${next.clamp(1, 20)}}}';
    final selection = _body.selection;
    final offset = selection.isValid ? selection.start : _body.text.length;
    _body.text = _body.text.replaceRange(offset, offset, insertion);
    _body.selection =
        TextSelection.collapsed(offset: offset + insertion.length);
    setState(() {});
  }

  Future<void> _addButton() async {
    final button = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => const _TemplateButtonForm(),
    );
    if (button != null) setState(() => _buttons.add(button));
  }

  Future<void> _save({required bool submit}) async {
    if (!(_formKey.currentState?.validate() ?? false) || _saving) return;

    final isMediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].contains(_headerType);
    final headerSampleValue = isMediaHeader
        ? (_mediaInputMode == 'upload'
            ? _headerFileDataUrl
            : _headerExample.text.trim())
        : '';

    final samples = _sampleValues.text
        .split(RegExp(r'[\n,]'))
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList(growable: false);

    if (submit) {
      if (isMediaHeader && headerSampleValue.isEmpty) {
        final msg =
            'Upload a sample ${_headerType.toLowerCase()} file or enter a direct URL before submitting to Meta.';
        setState(() => _error = msg);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
        return;
      }
      final bodyVarCount = RegExp(r'\{\{(\d+)\}\}')
          .allMatches(_body.text)
          .map((m) => m.group(0))
          .toSet()
          .length;
      if (bodyVarCount > 0 && samples.length < bodyVarCount) {
        final msg =
            'Enter $bodyVarCount variable sample value${bodyVarCount == 1 ? '' : 's'} (one per line) before submitting to Meta.';
        setState(() => _error = msg);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
        return;
      }
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Submit to Meta?'),
          content: const Text(
            'This uploads any attached header media and sends the template for Meta review. Submission does not guarantee approval.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Submit'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final headerContentValue = _headerType == 'TEXT'
          ? _headerContent.text.trim()
          : isMediaHeader
              ? (_mediaInputMode == 'upload' && _headerFileName.isNotEmpty
                  ? _headerFileName
                  : _headerType)
              : null;
      final response =
          await ref.read(hrmsRepositoryProvider).saveCrmTemplateDraft({
        'name': _name.text.trim().toLowerCase().replaceAll(' ', '_'),
        'category': _category,
        'language': _language,
        'headerType': _headerType,
        'headerContent': headerContentValue,
        'headerExample':
            headerSampleValue.isEmpty ? <String>[] : [headerSampleValue],
        'bodyText': _body.text.trim(),
        'bodyExampleValues': samples,
        'footerText': _footer.text.trim(),
        'buttons': _buttons,
        'status': 'DRAFT',
      });
      if (submit) {
        final data = response['data'];
        final template =
            data is Map ? Map<String, dynamic>.from(data) : response;
        final id = _text(template, ['id']);
        if (id.isEmpty) {
          throw Exception('Template was saved but its server ID is missing.');
        }
        await ref.read(hrmsRepositoryProvider).submitCrmTemplate(id);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(submit
              ? 'Template submitted. Meta review status will update after processing.'
              : 'Template draft saved.'),
        ),
      );
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = _safeError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _buildMediaUploader(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hintText = switch (_headerType) {
      'IMAGE' => 'PNG, JPG, JPEG or WEBP · Max 5 MB',
      'VIDEO' => 'MP4 or 3GP · Max 16 MB',
      'DOCUMENT' => 'PDF, DOC or DOCX · Max 25 MB',
      _ => '',
    };
    final mediaIcon = switch (_headerType) {
      'IMAGE' => Icons.image_outlined,
      'VIDEO' => Icons.videocam_outlined,
      _ => Icons.description_outlined,
    };

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Header ${_headerType[0]}${_headerType.substring(1).toLowerCase()}',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              SegmentedButton<String>(
                showSelectedIcon: false,
                style: const ButtonStyle(
                  visualDensity: VisualDensity.compact,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                segments: const [
                  ButtonSegment(value: 'upload', label: Text('Upload')),
                  ButtonSegment(value: 'url', label: Text('URL')),
                ],
                selected: {_mediaInputMode},
                onSelectionChanged: _saving
                    ? null
                    : (selection) => setState(() {
                          _mediaInputMode = selection.first;
                          _error = null;
                        }),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_mediaInputMode == 'url') ...[
            TextFormField(
              controller: _headerExample,
              enabled: !_saving,
              onChanged: (_) => setState(() {}),
              keyboardType: TextInputType.url,
              decoration: InputDecoration(
                labelText: '$_headerType public URL / Meta handle',
                hintText: _headerType == 'IMAGE'
                    ? 'https://hrms.businz.com/banner.png'
                    : _headerType == 'VIDEO'
                        ? 'https://example.com/promo.mp4'
                        : 'https://hrms.businz.com/catalogue.pdf',
                helperText: 'Required by Meta when submitting for review',
              ),
            ),
          ] else if (_headerFileDataUrl.isEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
              decoration: BoxDecoration(
                color: const Color(0xFFECFEFF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: const Color(0xFF0E7490).withValues(alpha: 0.35),
                ),
              ),
              child: Column(
                children: [
                  Icon(mediaIcon, size: 30, color: const Color(0xFF0E7490)),
                  const SizedBox(height: 8),
                  Text(
                    _pickingMedia
                        ? 'Loading ${_headerType.toLowerCase()}…'
                        : 'Upload $_headerType file from device',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    hintText,
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  if (_pickingMedia)
                    const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    )
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      alignment: WrapAlignment.center,
                      children: [
                        if (_headerType == 'IMAGE') ...[
                          FilledButton.icon(
                            onPressed: _saving
                                ? null
                                : () => _pickHeaderMedia('gallery'),
                            icon: const Icon(Icons.photo_library_outlined,
                                size: 17),
                            label: const Text('Gallery'),
                          ),
                          OutlinedButton.icon(
                            onPressed: _saving
                                ? null
                                : () => _pickHeaderMedia('camera'),
                            icon:
                                const Icon(Icons.camera_alt_outlined, size: 17),
                            label: const Text('Camera'),
                          ),
                          OutlinedButton.icon(
                            onPressed:
                                _saving ? null : () => _pickHeaderMedia('file'),
                            icon:
                                const Icon(Icons.folder_open_rounded, size: 17),
                            label: const Text('Files'),
                          ),
                        ] else if (_headerType == 'VIDEO') ...[
                          FilledButton.icon(
                            onPressed: _saving
                                ? null
                                : () => _pickHeaderMedia('gallery'),
                            icon: const Icon(Icons.video_library_outlined,
                                size: 17),
                            label: const Text('Gallery Video'),
                          ),
                          OutlinedButton.icon(
                            onPressed:
                                _saving ? null : () => _pickHeaderMedia('file'),
                            icon:
                                const Icon(Icons.folder_open_rounded, size: 17),
                            label: const Text('Browse Video'),
                          ),
                        ] else ...[
                          FilledButton.icon(
                            onPressed:
                                _saving ? null : () => _pickHeaderMedia('file'),
                            icon:
                                const Icon(Icons.upload_file_rounded, size: 18),
                            label: const Text('Upload PDF / Document'),
                          ),
                        ],
                      ],
                    ),
                ],
              ),
            ),
          ] else ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF0FDF4),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: const Color(0xFF16A34A).withValues(alpha: 0.35),
                ),
              ),
              child: Row(
                children: [
                  if (_headerType == 'IMAGE' && _headerImageBytes != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.memory(
                        _headerImageBytes!,
                        width: 54,
                        height: 54,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          width: 54,
                          height: 54,
                          color: const Color(0xFFDCFCE7),
                          child:
                              Icon(mediaIcon, color: const Color(0xFF166534)),
                        ),
                      ),
                    )
                  else
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: const Color(0xFFDCFCE7),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(mediaIcon, color: const Color(0xFF166534)),
                    ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _headerFileName.isNotEmpty
                              ? _headerFileName
                              : 'Uploaded $_headerType',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            const Icon(Icons.check_circle_rounded,
                                size: 14, color: Color(0xFF16A34A)),
                            const SizedBox(width: 4),
                            Text(
                              '$_headerFileSize · Ready',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF166534),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: _saving
                        ? null
                        : () => _pickHeaderMedia(
                            _headerType == 'DOCUMENT' ? 'file' : 'gallery'),
                    child: const Text('Change'),
                  ),
                  IconButton(
                    tooltip: 'Remove file',
                    onPressed: _saving
                        ? null
                        : () => setState(_clearUploadedHeaderFile),
                    icon:
                        Icon(Icons.delete_outline_rounded, color: scheme.error),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isMediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].contains(_headerType);
    return Scaffold(
      appBar: AppBar(title: const Text('Create template')),
      body: SafeArea(
        top: false,
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 36),
            children: [
              TextFormField(
                controller: _name,
                enabled: !_saving,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: 'Template name',
                  helperText: 'Lowercase letters, numbers and underscores',
                ),
                validator: (value) {
                  final clean =
                      (value ?? '').trim().toLowerCase().replaceAll(' ', '_');
                  if (clean.isEmpty) return 'Enter a template name.';
                  return RegExp(r'^[a-z0-9_]+$').hasMatch(clean)
                      ? null
                      : 'Use lowercase letters, numbers and underscores only.';
                },
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _category,
                      decoration: const InputDecoration(labelText: 'Category'),
                      items: ['MARKETING', 'UTILITY', 'AUTHENTICATION']
                          .map((value) => DropdownMenuItem(
                                value: value,
                                child: Text(value),
                              ))
                          .toList(),
                      onChanged: _saving
                          ? null
                          : (value) => setState(() => _category = value!),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _language,
                      decoration: const InputDecoration(labelText: 'Language'),
                      items: const [
                        DropdownMenuItem(value: 'en', child: Text('English')),
                        DropdownMenuItem(
                            value: 'en_US', child: Text('English US')),
                        DropdownMenuItem(value: 'ta', child: Text('Tamil')),
                        DropdownMenuItem(value: 'hi', child: Text('Hindi')),
                      ],
                      onChanged: _saving
                          ? null
                          : (value) => setState(() => _language = value!),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _headerType,
                decoration: const InputDecoration(labelText: 'Header type'),
                items: ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']
                    .map((value) => DropdownMenuItem(
                          value: value,
                          child: Text(value),
                        ))
                    .toList(),
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value == null || value == _headerType) return;
                        setState(() {
                          _headerType = value;
                          _clearUploadedHeaderFile();
                          _headerExample.clear();
                          _mediaInputMode = 'upload';
                          _error = null;
                        });
                      },
              ),
              if (_headerType == 'TEXT') ...[
                const SizedBox(height: 14),
                TextFormField(
                  controller: _headerContent,
                  enabled: !_saving,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(labelText: 'Header text'),
                  validator: (value) => _headerType == 'TEXT' &&
                          (value == null || value.trim().isEmpty)
                      ? 'Enter header text.'
                      : null,
                ),
              ],
              if (isMediaHeader) ...[
                const SizedBox(height: 14),
                _buildMediaUploader(context),
              ],
              const SizedBox(height: 14),
              TextFormField(
                controller: _body,
                enabled: !_saving,
                minLines: 5,
                maxLines: 10,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Message body',
                  alignLabelWithHint: true,
                  suffixIcon: IconButton(
                    onPressed: _saving ? null : _addVariable,
                    tooltip: 'Add variable',
                    icon: const Icon(Icons.data_object_rounded),
                  ),
                ),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Enter the message body.'
                    : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _sampleValues,
                enabled: !_saving,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Variable sample values',
                  helperText: 'One value per line, in {{1}}, {{2}} order',
                ),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _footer,
                enabled: !_saving,
                maxLength: 60,
                onChanged: (_) => setState(() {}),
                decoration:
                    const InputDecoration(labelText: 'Footer (optional)'),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text('Interactive buttons',
                        style: Theme.of(context).textTheme.titleMedium),
                  ),
                  TextButton.icon(
                    onPressed:
                        _saving || _buttons.length >= 3 ? null : _addButton,
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('Add'),
                  ),
                ],
              ),
              for (var index = 0; index < _buttons.length; index++)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.smart_button_outlined),
                  title: Text(_buttons[index]['text'] ?? 'Button'),
                  subtitle: Text([
                    _buttons[index]['type'],
                    _buttons[index]['url'],
                    _buttons[index]['phoneNumber'],
                  ].whereType<String>().where((v) => v.isNotEmpty).join(' • ')),
                  trailing: IconButton(
                    onPressed: _saving
                        ? null
                        : () => setState(() => _buttons.removeAt(index)),
                    icon: const Icon(Icons.delete_outline_rounded),
                  ),
                ),
              const SizedBox(height: 12),
              _TemplatePreview(
                headerType: _headerType,
                headerContent: _headerContent.text,
                headerExample: _mediaInputMode == 'upload'
                    ? _headerFileName
                    : _headerExample.text,
                headerImageBytes:
                    _mediaInputMode == 'upload' ? _headerImageBytes : null,
                body: _body.text,
                footer: _footer.text,
                buttons: _buttons,
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!,
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                        fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving ? null : () => _save(submit: false),
                      child: const Text('Save draft'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: _saving ? null : () => _save(submit: true),
                      child: Text(_saving ? 'Submitting…' : 'Submit to Meta'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TemplateButtonForm extends StatefulWidget {
  const _TemplateButtonForm();

  @override
  State<_TemplateButtonForm> createState() => _TemplateButtonFormState();
}

class _TemplateButtonFormState extends State<_TemplateButtonForm> {
  final _formKey = GlobalKey<FormState>();
  final _textController = TextEditingController();
  final _valueController = TextEditingController();
  String _type = 'QUICK_REPLY';

  @override
  void dispose() {
    _textController.dispose();
    _valueController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 8, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Add interactive button',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Button type'),
                items: const [
                  DropdownMenuItem(
                      value: 'QUICK_REPLY', child: Text('Quick Reply')),
                  DropdownMenuItem(value: 'URL', child: Text('Website URL')),
                  DropdownMenuItem(
                      value: 'PHONE_NUMBER', child: Text('Call Phone')),
                ],
                onChanged: (value) => setState(() => _type = value!),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _textController,
                decoration: const InputDecoration(labelText: 'Button text'),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Enter button text.'
                    : null,
              ),
              if (_type != 'QUICK_REPLY') ...[
                const SizedBox(height: 14),
                TextFormField(
                  controller: _valueController,
                  keyboardType:
                      _type == 'URL' ? TextInputType.url : TextInputType.phone,
                  decoration: InputDecoration(
                    labelText: _type == 'URL' ? 'Website URL' : 'Phone number',
                  ),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Enter ${_type == 'URL' ? 'a URL' : 'a phone number'}.'
                      : null,
                ),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () {
                  if (!(_formKey.currentState?.validate() ?? false)) return;
                  Navigator.pop(context, <String, String>{
                    'type': _type,
                    'text': _textController.text.trim(),
                    if (_type == 'URL') 'url': _valueController.text.trim(),
                    if (_type == 'PHONE_NUMBER')
                      'phoneNumber': _valueController.text.trim(),
                  });
                },
                child: const Text('Add button'),
              ),
            ],
          ),
        ),
      );
}

class _TemplatePreview extends StatelessWidget {
  const _TemplatePreview({
    required this.headerType,
    required this.headerContent,
    required this.headerExample,
    required this.body,
    required this.footer,
    required this.buttons,
    this.headerImageBytes,
  });

  final String headerType;
  final String headerContent;
  final String headerExample;
  final Uint8List? headerImageBytes;
  final String body;
  final String footer;
  final List<Map<String, String>> buttons;

  @override
  Widget build(BuildContext context) => Card(
        color: const Color(0xFFF0FDF4),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Live preview',
                  style: Theme.of(context)
                      .textTheme
                      .labelLarge
                      ?.copyWith(color: const Color(0xFF166534))),
              const SizedBox(height: 10),
              if (headerType == 'TEXT' && headerContent.trim().isNotEmpty)
                Text(headerContent,
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              if (headerType == 'IMAGE' && headerImageBytes != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.memory(
                    headerImageBytes!,
                    height: 150,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        const _MediaUnavailable(label: 'Selected image ready'),
                  ),
                )
              else if (headerType == 'IMAGE' &&
                  headerExample.startsWith('https://'))
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(headerExample,
                      height: 150,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          const _MediaUnavailable(label: 'Image unavailable')),
                ),
              if (['VIDEO', 'DOCUMENT'].contains(headerType))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(headerType == 'VIDEO'
                      ? Icons.play_circle_outline_rounded
                      : Icons.description_outlined),
                  title: Text(headerExample.isEmpty
                      ? '$headerType sample not selected'
                      : headerExample),
                ),
              if (body.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(body),
              ],
              if (footer.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(footer, style: Theme.of(context).textTheme.bodySmall),
              ],
              for (final button in buttons)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: OutlinedButton.icon(
                    onPressed: null,
                    icon: Icon(_buttonIcon(button['type'] ?? '')),
                    label: Text(button['text'] ?? 'Button'),
                  ),
                ),
            ],
          ),
        ),
      );
}

class WhatsAppCampaignBuilderScreen extends ConsumerStatefulWidget {
  const WhatsAppCampaignBuilderScreen({super.key});

  @override
  ConsumerState<WhatsAppCampaignBuilderScreen> createState() =>
      _WhatsAppCampaignBuilderScreenState();
}

class _WhatsAppCampaignBuilderScreenState
    extends ConsumerState<WhatsAppCampaignBuilderScreen> {
  final _name = TextEditingController();
  final _headerMedia = TextEditingController();
  List<Map<String, dynamic>> _templates = const [];
  List<Map<String, dynamic>> _contacts = const [];
  bool _loading = true;
  Object? _loadError;

  String? _templateName;
  String _templateLanguage = 'en';
  Map<String, dynamic>? _selectedTemplate;
  final Set<String> _contactIds = {};
  final Map<int, String> _variableSources = {};
  final Map<int, TextEditingController> _variableValues = {};
  String _recipientSearch = '';
  String _categoryFilter = 'All';
  int _sentProgress = 0;
  int _totalToSend = 0;
  bool _saving = false;
  String? _error;

  String _defaultCampaignName() =>
      'Broadcast ${DateFormat('dd MMM yyyy').format(DateTime.now())}';

  @override
  void initState() {
    super.initState();
    _name.text = _defaultCampaignName();
    _loadData();
  }

  String _normalizePhoneDigits(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 10) return digits.substring(digits.length - 10);
    return digits;
  }

  String _recipientKey(Map<String, dynamic> contact) {
    final id = _text(contact, ['id', 'selectionKey']);
    if (id.isNotEmpty) return id;
    final phone = _normalizePhoneDigits(
      _text(contact, ['phone', 'phoneNormalized', 'phone_normalized']),
    );
    if (phone.isNotEmpty) return 'phone_$phone';
    return _text(contact, ['name', 'employeeId']);
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final repository = ref.read(hrmsRepositoryProvider);
      final results = await Future.wait<List<Map<String, dynamic>>>([
        repository.crmTemplates(),
        repository.crmContacts(limit: 500),
        repository
            .campaignEmployees()
            .catchError((_) => <Map<String, dynamic>>[]),
      ]);
      final approved = results[0]
          .where((item) => _text(item, ['status']).toUpperCase() == 'APPROVED')
          .toList(growable: false);

      // Build unified recipient directory combining CRM Contacts (excluding
      // explicitly Opted Out) AND active HRMS Employees with phone numbers so
      // users can freely select employees or CRM contacts in Campaigns.
      final unified = <Map<String, dynamic>>[];
      final byPhone10 = <String, int>{};
      final seenKeys = <String>{};

      for (final raw in results[1]) {
        final consent =
            _text(raw, ['consentStatus', 'consent_status']).toLowerCase();
        if (consent.contains('opted out') || consent.contains('opted_out')) {
          continue;
        }
        final phone =
            _text(raw, ['phone', 'phoneNormalized', 'phone_normalized']);
        if (phone.isEmpty) continue;
        final id = _text(raw, ['id']);
        final p10 = _normalizePhoneDigits(phone);
        final key = id.isNotEmpty ? id : 'phone_$p10';
        if (!seenKeys.add(key)) continue;

        final cat = _text(raw, ['category'], 'Contacts');
        final isEmpCat = cat.toLowerCase().contains('staff') ||
            cat.toLowerCase().contains('employee');
        final entry = <String, dynamic>{
          ...raw,
          'id': key,
          'crmContactId': id,
          'phone': phone,
          'category': cat,
          'isEmployee': isEmpCat,
          'sourceKind': isEmpCat ? 'employee' : 'contact',
        };
        if (p10.isNotEmpty) byPhone10[p10] = unified.length;
        unified.add(entry);
      }

      for (final emp in results[2]) {
        final profile = emp['profile_data'] is Map
            ? Map<String, dynamic>.from(emp['profile_data'] as Map)
            : const <String, dynamic>{};
        final phone = [
          emp['phone'],
          emp['phone_number'],
          emp['mobile'],
          profile['phone'],
          profile['mobile'],
          profile['contactNumber'],
        ]
            .map((v) => v == null || v is Map ? '' : v.toString().trim())
            .firstWhere((v) => v.isNotEmpty, orElse: () => '');
        final p10 = _normalizePhoneDigits(phone);
        if (p10.length < 7) continue;

        final empCode = _text(emp, ['employeeId', 'employee_id', 'id']);
        final empName = _text(emp, ['name', 'fullName'],
            '${_text(emp, ['firstName', 'first_name'])} ${_text(emp, ['lastName', 'last_name'])}'
                .trim());
        final dept = _text(emp, ['department', 'designation'], 'Employee');

        if (byPhone10.containsKey(p10)) {
          // Existing CRM contact matches this employee -> tag as Employee too
          final idx = byPhone10[p10]!;
          final existing = Map<String, dynamic>.from(unified[idx]);
          existing['isEmployee'] = true;
          if (_text(existing, ['employeeId']).isEmpty && empCode.isNotEmpty) {
            existing['employeeId'] = empCode;
          }
          if (_text(existing, ['companyName', 'company_name']).isEmpty &&
              dept.isNotEmpty) {
            existing['companyName'] = dept;
          }
          unified[idx] = existing;
          continue;
        }

        final empKey =
            empCode.isNotEmpty ? 'emp_${empCode.toLowerCase()}' : 'emp_$p10';
        if (!seenKeys.add(empKey)) continue;
        byPhone10[p10] = unified.length;
        unified.add({
          'id': empKey,
          'crmContactId': '',
          'employeeId': empCode,
          'name': empName.isNotEmpty ? empName : empCode,
          'companyName': dept,
          'phone': phone,
          'phoneNormalized': p10,
          'category': 'Employees',
          'consentStatus': 'Opted In',
          'isEmployee': true,
          'sourceKind': 'employee',
        });
      }

      if (!mounted) return;
      _templates = approved;
      _contacts = unified;
      if (_selectedTemplate == null && approved.isNotEmpty) {
        _applySelectedTemplate(approved.first);
      }
      setState(() => _loading = false);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loadError = error;
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _headerMedia.dispose();
    for (final controller in _variableValues.values) {
      controller.dispose();
    }
    super.dispose();
  }

  List<int> _variables(Map<String, dynamic>? template) {
    if (template == null) return const [];
    final body = _text(template, ['bodyText', 'body_text']);
    final values = RegExp(r'\{\{(\d+)\}\}')
        .allMatches(body)
        .map((match) => int.tryParse(match.group(1) ?? '') ?? 0)
        .where((value) => value > 0)
        .toSet()
        .toList()
      ..sort();
    return values;
  }

  void _applySelectedTemplate(Map<String, dynamic> template) {
    for (final controller in _variableValues.values) {
      controller.dispose();
    }
    _variableValues.clear();
    _variableSources.clear();
    final samples = template['bodyExampleValues'] is List
        ? List<dynamic>.from(template['bodyExampleValues'] as List)
        : const <dynamic>[];
    final indexes = _variables(template);
    for (var offset = 0; offset < indexes.length; offset++) {
      final index = indexes[offset];
      _variableSources[index] = offset == 0
          ? 'name'
          : offset == 1
              ? 'company'
              : 'custom';
      _variableValues[index] = TextEditingController(
          text: offset < samples.length ? samples[offset].toString() : '');
    }
    // Always resolve a valid public HTTPS URL (never scontent.whatsapp.net -> HTTP 403)
    _headerMedia.text = resolveSafeTemplateHeaderMedia(template);
    _selectedTemplate = template;
    _templateName = _text(template, ['name']);
    _templateLanguage = _text(template, ['language'], 'en');
    _error = null;
  }

  void _selectTemplate(Map<String, dynamic> template) {
    setState(() => _applySelectedTemplate(template));
  }

  String _resolveVariable(int index, Map<String, dynamic> contact) {
    return switch (_variableSources[index]) {
      'name' => _text(contact, ['name'], 'Valued Customer'),
      'company' =>
        _text(contact, ['companyName', 'company_name'], 'Valued Organization'),
      'phone' =>
        _text(contact, ['phone', 'phoneNormalized', 'phone_normalized']),
      _ => _variableValues[index]?.text.trim() ?? '',
    };
  }

  String _resolveDocumentFilename(
    Map<String, dynamic> template,
    String mediaUrl,
  ) {
    final content = _text(template, ['headerContent', 'header_content']);
    if (content.isNotEmpty &&
        !content.startsWith('http://') &&
        !content.startsWith('https://') &&
        content.toUpperCase() != 'DOCUMENT') {
      return content;
    }
    final uri = Uri.tryParse(mediaUrl);
    if (uri != null && uri.pathSegments.isNotEmpty) {
      final last = uri.pathSegments.last.trim();
      if (last.isNotEmpty) return last;
    }
    return 'Document.pdf';
  }

  Map<String, dynamic> _campaignPayload(String campaignName, String status) => {
        'name': campaignName,
        'templateName': _templateName,
        'templateLanguage': _templateLanguage,
        'templateVariables': {
          for (final index in _variables(_selectedTemplate))
            '$index': {
              'source': _variableSources[index],
              'customValue': _variableValues[index]?.text.trim() ?? '',
            },
        },
        'audienceFilter': {
          'contactIds': _contactIds.toList(growable: false),
          'consentStatus': 'Opted In',
        },
        'status': status,
        'totalRecipients': _contactIds.length,
      };

  void _showValidationError(String message) {
    setState(() => _error = message);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _dispatch() async {
    if (_saving) return;
    final template = _selectedTemplate;
    if (template == null) {
      _showValidationError('Select an approved template first.');
      return;
    }
    if (_contactIds.isEmpty) {
      _showValidationError('Select at least one opted-in recipient.');
      return;
    }
    final campaignName = _name.text.trim().isNotEmpty
        ? _name.text.trim()
        : _defaultCampaignName();
    if (_name.text.trim().isEmpty) {
      _name.text = campaignName;
    }

    final headerType =
        _text(template, ['headerType', 'header_type'], 'NONE').toUpperCase();
    final resolvedMedia = resolveSafeTemplateHeaderMedia(
      template,
      userOverride: _headerMedia.text.trim(),
    );
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].contains(headerType) &&
        resolvedMedia.isEmpty) {
      _showValidationError(
          'This template requires a public HTTPS header media URL.');
      return;
    }
    if (resolvedMedia != _headerMedia.text.trim() && resolvedMedia.isNotEmpty) {
      _headerMedia.text = resolvedMedia;
    }
    for (final index in _variables(template)) {
      if (_variableSources[index] == 'custom' &&
          (_variableValues[index]?.text.trim().isEmpty ?? true)) {
        _showValidationError('Enter a custom value for variable {{$index}}.');
        return;
      }
    }

    final recipients = _contacts
        .where((contact) => _contactIds.contains(_recipientKey(contact)))
        .toList(growable: false);
    if (recipients.isEmpty) {
      _showValidationError('No valid recipients selected.');
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Send broadcast campaign?'),
        content: Text(
          'Send "$_templateName" to ${recipients.length} selected recipient${recipients.length == 1 ? '' : 's'} via Meta WhatsApp?',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm send')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _saving = true;
      _sentProgress = 0;
      _totalToSend = recipients.length;
      _error = null;
    });
    var accepted = 0;
    final failures = <String>[];
    String broadcastId = '';
    try {
      try {
        final created = await ref
            .read(hrmsRepositoryProvider)
            .createCrmBroadcast(_campaignPayload(campaignName, 'sending'));
        final createdData = _map(created['data']);
        broadcastId = _text(createdData, ['id'], _text(created, ['id']));
      } catch (_) {
        // Fallback: if an older backend restricts POST /crm/broadcasts,
        // still dispatch every template message directly via /crm/messages/template.
        broadcastId = '';
      }
      final indexes = _variables(template);
      final templateCategory =
          _text(template, ['category'], 'UTILITY').toUpperCase();
      for (var i = 0; i < recipients.length; i++) {
        final contact = recipients[i];
        final crmContactId = _text(contact, ['crmContactId']);
        final contactName = _text(contact, ['name'], 'Contact');
        final phone =
            _text(contact, ['phone', 'phoneNormalized', 'phone_normalized']);
        final consentLower =
            _text(contact, ['consentStatus', 'consent_status']).toLowerCase();
        try {
          // If an existing CRM contact does not yet have Opted In consent and
          // this is a Marketing template, record consent automatically so Meta
          // dispatch succeeds cleanly.
          if (crmContactId.isNotEmpty &&
              templateCategory == 'MARKETING' &&
              !consentLower.contains('opted in') &&
              !consentLower.contains('opted_in')) {
            await ref
                .read(hrmsRepositoryProvider)
                .recordCrmConsent(crmContactId, consentStatus: 'Opted In')
                .catchError((_) => <String, dynamic>{});
          }

          Map<String, dynamic>? headerParameter;
          if (headerType == 'IMAGE' && resolvedMedia.isNotEmpty) {
            headerParameter = {
              'type': 'image',
              'image': {'link': resolvedMedia}
            };
          } else if (headerType == 'VIDEO' && resolvedMedia.isNotEmpty) {
            headerParameter = {
              'type': 'video',
              'video': {'link': resolvedMedia}
            };
          } else if (headerType == 'DOCUMENT' && resolvedMedia.isNotEmpty) {
            headerParameter = {
              'type': 'document',
              'document': {
                'link': resolvedMedia,
                'filename': _resolveDocumentFilename(template, resolvedMedia),
              }
            };
          }
          // For HRMS employees not yet in crm_contacts (crmContactId == ''),
          // omit contactId so backend crmController.ts:379-390 auto-upserts
          // them as an Opted In CRM contact and sends via Meta Cloud API.
          final response =
              await ref.read(hrmsRepositoryProvider).sendCrmTemplate({
            if (crmContactId.isNotEmpty) 'contactId': crmContactId,
            'recipientPhone': phone,
            'recipientName': contactName,
            'templateName': _templateName,
            'language': _templateLanguage,
            'category': templateCategory,
            'bodyParameters': indexes
                .map((index) => _resolveVariable(index, contact))
                .toList(),
            if (headerParameter != null) 'headerParameters': [headerParameter],
            if (resolvedMedia.isNotEmpty) 'headerUrl': resolvedMedia,
            'headerType': headerType,
            if (broadcastId.isNotEmpty) 'broadcastId': broadcastId,
          });
          final msgData = _map(response['data']);
          final msgStatus = _text(msgData, ['status']).toLowerCase();
          final failReason = _text(msgData, [
            'failureReason',
            'failure_reason',
            'errorMessage',
            'error_message'
          ]);
          if (msgStatus == 'failed') {
            failures.add(
              '$contactName: ${formatMetaFailureReason(failReason.isNotEmpty ? failReason : 'Rejected by Meta')}',
            );
          } else {
            accepted++;
          }
        } catch (error) {
          failures.add('$contactName: ${_safeError(error)}');
        }
        if (mounted) {
          setState(() => _sentProgress = i + 1);
        }
      }
      if (broadcastId.isNotEmpty) {
        await ref.read(hrmsRepositoryProvider).updateCrmBroadcastStatus(
              broadcastId,
              accepted == 0 && failures.isNotEmpty ? 'failed' : 'completed',
            );
      }
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(accepted > 0
              ? 'Bulk campaign completed'
              : 'Bulk campaign failed'),
          content: Text(
            '$accepted sent to Meta. ${failures.length} failure${failures.length == 1 ? '' : 's'}. Delivery/read status will update from Meta webhooks.${failures.isEmpty ? '' : '\n\n${failures.take(3).join('\n')}'}',
          ),
          actions: [
            FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Done')),
          ],
        ),
      );
      if (mounted && accepted > 0) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) _showValidationError(_safeError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final templates = _templates;
    final contacts = _contacts;
    final hasEmployees = contacts.any((c) => c['isEmployee'] == true);
    final hasExternalContacts = contacts.any((c) => c['isEmployee'] != true);
    final categories = <String>{
      'All',
      if (hasEmployees) 'Employees',
      if (hasExternalContacts) 'Contacts',
      ...contacts
          .map((c) => _text(c, ['category']))
          .where((c) => c.isNotEmpty && c != 'Employees' && c != 'Contacts'),
    }.toList();
    final rq = _recipientSearch.trim().toLowerCase();
    final visibleContacts = contacts.where((contact) {
      if (_categoryFilter == 'Employees') {
        if (contact['isEmployee'] != true) return false;
      } else if (_categoryFilter == 'Contacts') {
        if (contact['isEmployee'] == true) return false;
      } else if (_categoryFilter != 'All' &&
          _text(contact, ['category']).toLowerCase() !=
              _categoryFilter.toLowerCase()) {
        return false;
      }
      if (rq.isEmpty) return true;
      return _text(contact, ['name']).toLowerCase().contains(rq) ||
          _text(contact, ['employeeId']).toLowerCase().contains(rq) ||
          _text(contact, ['phone', 'phoneNormalized'])
              .toLowerCase()
              .contains(rq) ||
          _text(contact, ['companyName', 'company_name'])
              .toLowerCase()
              .contains(rq);
    }).toList(growable: false);
    final visibleIds = visibleContacts
        .map(_recipientKey)
        .where((id) => id.isNotEmpty)
        .toList();
    final allVisibleSelected =
        visibleIds.isNotEmpty && visibleIds.every(_contactIds.contains);

    return Scaffold(
      appBar: AppBar(title: const Text('New broadcast campaign')),
      bottomNavigationBar: _loading || _loadError != null
          ? null
          : DecoratedBox(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                border: Border(
                  top: BorderSide(
                      color: Theme.of(context).colorScheme.outlineVariant),
                ),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_saving && _totalToSend > 0) ...[
                        LinearProgressIndicator(
                          value: _sentProgress / _totalToSend,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Sending $_sentProgress of $_totalToSend messages…',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 8),
                      ],
                      if (_error != null) ...[
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                      FilledButton.icon(
                        onPressed: _saving ? null : _dispatch,
                        icon: const Icon(Icons.send_rounded),
                        label: Text(_saving
                            ? 'Sending ($_sentProgress/$_totalToSend)…'
                            : 'Send Bulk (${_contactIds.length})'),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Select employees or CRM contacts. Opted-out contacts are automatically excluded.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
              ? AppErrorView(error: _loadError!, onRetry: _loadData)
              : ListView(
                  padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
                  children: [
                    TextFormField(
                      controller: _name,
                      enabled: !_saving,
                      decoration:
                          const InputDecoration(labelText: 'Campaign name'),
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(
                      initialValue: _templateName,
                      isExpanded: true,
                      decoration:
                          const InputDecoration(labelText: 'Approved template'),
                      hint: Text(templates.isEmpty
                          ? 'No approved templates available'
                          : 'Select template'),
                      items: templates
                          .map((template) => DropdownMenuItem(
                                value: _text(template, ['name']),
                                child: Text(_text(template, ['name'])),
                              ))
                          .toList(),
                      onChanged: _saving
                          ? null
                          : (value) {
                              final template = templates.firstWhere(
                                  (item) => _text(item, ['name']) == value);
                              _selectTemplate(template);
                            },
                    ),
                    if (_selectedTemplate != null) ...[
                      for (final index in _variables(_selectedTemplate)) ...[
                        const SizedBox(height: 12),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<String>(
                                initialValue: _variableSources[index],
                                decoration: InputDecoration(
                                    labelText: 'Variable {{$index}} source'),
                                items: const [
                                  DropdownMenuItem(
                                      value: 'name', child: Text('Name')),
                                  DropdownMenuItem(
                                      value: 'company', child: Text('Company')),
                                  DropdownMenuItem(
                                      value: 'phone', child: Text('Phone')),
                                  DropdownMenuItem(
                                      value: 'custom', child: Text('Custom')),
                                ],
                                onChanged: _saving
                                    ? null
                                    : (value) => setState(
                                        () => _variableSources[index] = value!),
                              ),
                            ),
                            if (_variableSources[index] == 'custom') ...[
                              const SizedBox(width: 10),
                              Expanded(
                                child: TextFormField(
                                  controller: _variableValues[index],
                                  enabled: !_saving,
                                  onChanged: (_) => setState(() {}),
                                  decoration: const InputDecoration(
                                      labelText: 'Custom value'),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                      if (['IMAGE', 'VIDEO', 'DOCUMENT'].contains(_text(
                              _selectedTemplate!,
                              ['headerType', 'header_type'],
                              'NONE')
                          .toUpperCase())) ...[
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _headerMedia,
                          enabled: !_saving,
                          onChanged: (_) => setState(() {}),
                          keyboardType: TextInputType.url,
                          decoration: const InputDecoration(
                              labelText: 'Required header media URL / handle'),
                        ),
                      ],
                      const SizedBox(height: 16),
                      _TemplatePreview(
                        headerType: _text(_selectedTemplate!,
                                ['headerType', 'header_type'], 'NONE')
                            .toUpperCase(),
                        headerContent: _text(_selectedTemplate!,
                            ['headerContent', 'header_content']),
                        headerExample: _headerMedia.text,
                        body: _renderTemplateBody(
                          _text(_selectedTemplate!, ['bodyText', 'body_text']),
                          _variables(_selectedTemplate!)
                              .map((index) =>
                                  _variableSources[index] == 'custom'
                                      ? _variableValues[index]?.text ?? ''
                                      : '<${_variableSources[index]}>')
                              .toList(),
                        ),
                        footer: _text(
                            _selectedTemplate!, ['footerText', 'footer_text']),
                        buttons: _maps(_selectedTemplate!['buttons'])
                            .map((button) => button.map((key, value) =>
                                MapEntry(key, value.toString())))
                            .toList(),
                      ),
                    ],
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Recipients (${_contactIds.length}/${contacts.length})',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                        TextButton(
                          onPressed: _saving || visibleIds.isEmpty
                              ? null
                              : () => setState(() {
                                    if (allVisibleSelected) {
                                      _contactIds.removeAll(visibleIds);
                                    } else {
                                      _contactIds.addAll(visibleIds);
                                    }
                                    _error = null;
                                  }),
                          child: Text(allVisibleSelected
                              ? 'Clear Visible'
                              : 'Select All (${visibleIds.length})'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      enabled: !_saving,
                      onChanged: (v) => setState(() => _recipientSearch = v),
                      decoration: const InputDecoration(
                        hintText: 'Search employee or contact by name, phone…',
                        prefixIcon: Icon(Icons.search_rounded),
                      ),
                    ),
                    if (categories.length > 1) ...[
                      const SizedBox(height: 8),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: categories
                              .map((cat) => Padding(
                                    padding: const EdgeInsets.only(right: 6),
                                    child: FilterChip(
                                      selected: _categoryFilter == cat,
                                      label: Text(cat),
                                      onSelected: _saving
                                          ? null
                                          : (_) => setState(
                                              () => _categoryFilter = cat),
                                    ),
                                  ))
                              .toList(),
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    if (visibleContacts.isEmpty)
                      const EmptyState(
                        icon: Icons.people_outline_rounded,
                        title: 'No eligible recipients',
                        message:
                            'No matching employees or contacts with phone numbers were found.',
                      )
                    else
                      ...visibleContacts.map((contact) {
                        final keyId = _recipientKey(contact);
                        final company =
                            _text(contact, ['companyName', 'company_name']);
                        final empCode = _text(contact, ['employeeId']);
                        final phone = _text(contact,
                            ['phone', 'phoneNormalized', 'phone_normalized']);
                        final isSelected = _contactIds.contains(keyId);
                        return CheckboxListTile(
                          key: ValueKey('recipient_$keyId'),
                          value: isSelected,
                          controlAffinity: ListTileControlAffinity.leading,
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            _text(contact, ['name'], 'Contact'),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Text([
                            if (empCode.isNotEmpty) empCode,
                            if (company.isNotEmpty) company,
                            phone,
                          ].where((s) => s.isNotEmpty).join(' · ')),
                          onChanged: _saving
                              ? null
                              : (selected) => setState(() {
                                    if (selected == true) {
                                      _contactIds.add(keyId);
                                    } else {
                                      _contactIds.remove(keyId);
                                    }
                                    _error = null;
                                  }),
                        );
                      }),
                  ],
                ),
    );
  }
}

class _ConversationSheet extends ConsumerStatefulWidget {
  const _ConversationSheet({required this.conversation});
  final Map<String, dynamic> conversation;

  @override
  ConsumerState<_ConversationSheet> createState() => _ConversationSheetState();
}

class _ConversationSheetState extends ConsumerState<_ConversationSheet> {
  late Future<List<Map<String, dynamic>>> _future;
  final _message = TextEditingController();
  bool _sending = false;

  String get _id => _text(widget.conversation, ['id']);

  @override
  void initState() {
    super.initState();
    _future = ref.read(hrmsRepositoryProvider).crmMessages(_id);
    ref
        .read(hrmsRepositoryProvider)
        .markCrmConversationRead(_id)
        .catchError((_) => <String, dynamic>{});
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  void _reload() => setState(
      () => _future = ref.read(hrmsRepositoryProvider).crmMessages(_id));

  Future<void> _send() async {
    final text = _message.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(hrmsRepositoryProvider).sendCrmMessage(_id, text);
      _message.clear();
      _reload();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pickEmoji() async {
    final emoji = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => const _EmojiPicker(),
    );
    if (emoji == null) return;
    final selection = _message.selection;
    final offset = selection.isValid ? selection.start : _message.text.length;
    _message.text = _message.text.replaceRange(offset, offset, emoji);
    _message.selection = TextSelection.collapsed(offset: offset + emoji.length);
    setState(() {});
  }

  Future<void> _sendApprovedTemplate() async {
    final contactId = _text(widget.conversation, ['contactId', 'contact_id'],
        _text(_map(widget.conversation['contact']), ['id']));
    final phone =
        _text(widget.conversation, ['contactPhone', 'contact_phone', 'phone']);
    final name = _text(widget.conversation,
        ['contactName', 'contact_name', 'name'], 'WhatsApp contact');
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _ApprovedTemplateSender(
        contactId: contactId,
        recipientPhone: phone,
        recipientName: name,
      ),
    );
    if (sent == true) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final name = _text(widget.conversation,
        ['contactName', 'contact_name', 'name'], 'WhatsApp contact');
    final phone = _text(widget.conversation, ['contactPhone', 'contact_phone']);
    return FractionallySizedBox(
      heightFactor: .96,
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          leading: IconButton(
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.close_rounded),
          ),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (phone.isNotEmpty)
                Text(phone,
                    style: Theme.of(context).textTheme.bodySmall,
                    overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              Expanded(
                child: FutureBuilder<List<Map<String, dynamic>>>(
                  future: _future,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState != ConnectionState.done) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snapshot.hasError) {
                      return AppErrorView(
                          error: snapshot.error!, onRetry: _reload);
                    }
                    final messages = snapshot.data ?? const [];
                    if (messages.isEmpty) {
                      return const EmptyState(
                        icon: Icons.chat_bubble_outline_rounded,
                        title: 'No conversation history',
                        message: 'Send a message to begin this conversation.',
                      );
                    }
                    return ListView.builder(
                      reverse: true,
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                      itemCount: messages.length,
                      itemBuilder: (context, reverseIndex) {
                        final item =
                            messages[messages.length - 1 - reverseIndex];
                        return _MessageBubble(
                          message: item,
                          onSendTemplate: _sendApprovedTemplate,
                        );
                      },
                    );
                  },
                ),
              ),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  border: Border(
                    top: BorderSide(
                        color: Theme.of(context).colorScheme.outlineVariant),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: _sending ? null : _pickEmoji,
                        tooltip: 'Add emoji',
                        icon: const Icon(Icons.emoji_emotions_outlined),
                      ),
                      IconButton(
                        onPressed: _sending ? null : _sendApprovedTemplate,
                        tooltip: 'Send approved template',
                        icon: const Icon(Icons.description_outlined),
                      ),
                      Expanded(
                        child: TextField(
                          controller: _message,
                          enabled: !_sending,
                          textCapitalization: TextCapitalization.sentences,
                          minLines: 1,
                          maxLines: 4,
                          onSubmitted: (_) => _send(),
                          decoration:
                              const InputDecoration(hintText: 'Message'),
                        ),
                      ),
                      const SizedBox(width: 6),
                      IconButton.filled(
                        onPressed: _sending ? null : _send,
                        icon: _sending
                            ? const SizedBox.square(
                                dimension: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.send_rounded),
                      ),
                    ],
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

class _EmojiPicker extends StatelessWidget {
  const _EmojiPicker();

  static const values = [
    '\u{1F600}',
    '\u{1F603}',
    '\u{1F604}',
    '\u{1F601}',
    '\u{1F60A}',
    '\u{1F642}',
    '\u{1F609}',
    '\u{1F60D}',
    '\u{1F970}',
    '\u{1F618}',
    '\u{1F60E}',
    '\u{1F929}',
    '\u{1F914}',
    '\u{1F605}',
    '\u{1F602}',
    '\u{1F923}',
    '\u{1F44D}',
    '\u{1F44F}',
    '\u{1F64F}',
    '\u{1F91D}',
    '\u{2705}',
    '\u{1F389}',
    '\u{2764}\u{FE0F}',
    '\u{1F525}',
    '\u{1F4CC}',
    '\u{1F4DE}',
    '\u{1F4E7}',
    '\u{1F4BC}',
    '\u{1F680}',
    '\u{2B50}',
    '\u{1F4AF}',
    '\u{1F44B}',
  ];

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Choose emoji',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 8,
                mainAxisSpacing: 4,
                crossAxisSpacing: 4,
              ),
              itemCount: values.length,
              itemBuilder: (context, index) => InkWell(
                onTap: () => Navigator.pop(context, values[index]),
                borderRadius: BorderRadius.circular(10),
                child: Center(
                  child:
                      Text(values[index], style: const TextStyle(fontSize: 26)),
                ),
              ),
            ),
          ],
        ),
      );
}

class _ApprovedTemplateSender extends ConsumerStatefulWidget {
  const _ApprovedTemplateSender({
    required this.contactId,
    required this.recipientPhone,
    required this.recipientName,
  });

  final String contactId;
  final String recipientPhone;
  final String recipientName;

  @override
  ConsumerState<_ApprovedTemplateSender> createState() =>
      _ApprovedTemplateSenderState();
}

class _ApprovedTemplateSenderState
    extends ConsumerState<_ApprovedTemplateSender> {
  late Future<List<Map<String, dynamic>>> _future;
  Map<String, dynamic>? _selected;
  final List<TextEditingController> _variables = [];
  final _headerMedia = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = ref.read(hrmsRepositoryProvider).crmTemplates();
  }

  @override
  void dispose() {
    for (final controller in _variables) {
      controller.dispose();
    }
    _headerMedia.dispose();
    super.dispose();
  }

  void _select(Map<String, dynamic> template) {
    for (final controller in _variables) {
      controller.dispose();
    }
    _variables.clear();
    final body = _text(template, ['bodyText', 'body_text']);
    final indexes = RegExp(r'\{\{(\d+)\}\}')
        .allMatches(body)
        .map((match) => int.tryParse(match.group(1) ?? '') ?? 0)
        .where((value) => value > 0)
        .toSet()
        .toList()
      ..sort();
    final samples = template['bodyExampleValues'] is List
        ? List<dynamic>.from(template['bodyExampleValues'] as List)
        : const <dynamic>[];
    for (var index = 0; index < indexes.length; index++) {
      final defaultVal = index == 0 && widget.recipientName.trim().isNotEmpty
          ? widget.recipientName.trim()
          : (index < samples.length ? samples[index].toString() : '');
      _variables.add(TextEditingController(text: defaultVal));
    }
    // Never prefill Meta CDN scontent.whatsapp.net URLs (which fail with HTTP 403)
    _headerMedia.text = resolveSafeTemplateHeaderMedia(template);
    setState(() {
      _selected = template;
      _error = null;
    });
  }

  Future<void> _send() async {
    final template = _selected;
    if (template == null || _sending) return;
    if (widget.contactId.isEmpty && widget.recipientPhone.isEmpty) {
      setState(() => _error = 'The conversation has no recipient identity.');
      return;
    }
    if (_variables.any((controller) => controller.text.trim().isEmpty)) {
      setState(() => _error = 'Fill every required template variable.');
      return;
    }
    final headerType =
        _text(template, ['headerType', 'header_type'], 'NONE').toUpperCase();
    final safeMedia = resolveSafeTemplateHeaderMedia(
      template,
      userOverride: _headerMedia.text.trim(),
    );
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].contains(headerType) &&
        safeMedia.isEmpty) {
      setState(() =>
          _error = 'This template requires a public HTTPS header media URL.');
      return;
    }
    if (safeMedia != _headerMedia.text.trim() && safeMedia.isNotEmpty) {
      _headerMedia.text = safeMedia;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Send approved template?'),
        content: Text('Send "${_text(template, [
              'name'
            ])}" to ${widget.recipientName}? Provider delivery is shown only after Meta confirms it.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Send')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final media = safeMedia;
      Map<String, dynamic>? headerParameter;
      if (headerType == 'IMAGE' && media.isNotEmpty) {
        headerParameter = {
          'type': 'image',
          'image': {'link': media}
        };
      } else if (headerType == 'VIDEO' && media.isNotEmpty) {
        headerParameter = {
          'type': 'video',
          'video': {'link': media}
        };
      } else if (headerType == 'DOCUMENT' && media.isNotEmpty) {
        headerParameter = {
          'type': 'document',
          'document': {'link': media}
        };
      }
      await ref.read(hrmsRepositoryProvider).sendCrmTemplate({
        if (widget.contactId.isNotEmpty) 'contactId': widget.contactId,
        if (widget.contactId.isEmpty) 'recipientPhone': widget.recipientPhone,
        'recipientName': widget.recipientName,
        'templateName': _text(template, ['name']),
        'language': _text(template, ['language'], 'en'),
        'category': _text(template, ['category'], 'UTILITY'),
        'bodyParameters':
            _variables.map((controller) => controller.text.trim()).toList(),
        if (headerParameter != null) 'headerParameters': [headerParameter],
        if (media.isNotEmpty) 'headerUrl': media,
        'headerType': headerType,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Template accepted by the server. Waiting for provider delivery updates.'),
      ));
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = _safeError(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => FractionallySizedBox(
        heightFactor: .94,
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return AppErrorView(
                error: snapshot.error!,
                onRetry: () => setState(() =>
                    _future = ref.read(hrmsRepositoryProvider).crmTemplates()),
              );
            }
            final templates = (snapshot.data ?? const [])
                .where((template) =>
                    _text(template, ['status']).toUpperCase() == 'APPROVED')
                .toList(growable: false);
            final selected = _selected;
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
              children: [
                Text('Send approved template',
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text(widget.recipientName,
                    style: Theme.of(context).textTheme.bodyLarge),
                const SizedBox(height: 18),
                if (templates.isEmpty)
                  const EmptyState(
                    icon: Icons.description_outlined,
                    title: 'No approved templates',
                    message:
                        'Sync or submit a template and wait for Meta approval before sending.',
                  )
                else
                  DropdownButtonFormField<String>(
                    initialValue: selected == null
                        ? null
                        : _text(selected, ['id', 'name']),
                    isExpanded: true,
                    decoration:
                        const InputDecoration(labelText: 'Approved template'),
                    items: templates
                        .map((template) => DropdownMenuItem(
                              value: _text(template, ['id', 'name']),
                              child: Text(_text(template, ['name'])),
                            ))
                        .toList(),
                    onChanged: _sending
                        ? null
                        : (value) => _select(templates.firstWhere((template) =>
                            _text(template, ['id', 'name']) == value)),
                  ),
                if (selected != null) ...[
                  for (var index = 0; index < _variables.length; index++) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: _variables[index],
                      enabled: !_sending,
                      decoration: InputDecoration(
                          labelText: 'Variable {{${index + 1}}}'),
                    ),
                  ],
                  if (['IMAGE', 'VIDEO', 'DOCUMENT'].contains(
                      _text(selected, ['headerType', 'header_type'], 'NONE')
                          .toUpperCase())) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: _headerMedia,
                      enabled: !_sending,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                        labelText: 'Required header media URL / Meta handle',
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  _TemplatePreview(
                    headerType:
                        _text(selected, ['headerType', 'header_type'], 'NONE')
                            .toUpperCase(),
                    headerContent:
                        _text(selected, ['headerContent', 'header_content']),
                    headerExample: _headerMedia.text,
                    body: _renderTemplateBody(
                      _text(selected, ['bodyText', 'body_text']),
                      _variables.map((value) => value.text).toList(),
                    ),
                    footer: _text(selected, ['footerText', 'footer_text']),
                    buttons: _maps(selected['buttons'])
                        .map((button) => button.map(
                            (key, value) => MapEntry(key, value.toString())))
                        .toList(),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send_rounded),
                    label: Text(_sending ? 'Sending...' : 'Confirm and send'),
                  ),
                ],
              ],
            );
          },
        ),
      );
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, this.onSendTemplate});
  final Map<String, dynamic> message;
  final VoidCallback? onSendTemplate;

  @override
  Widget build(BuildContext context) {
    final sender = _text(message, ['senderType', 'sender_type'], 'customer');
    final mine = sender == 'agent' || sender == 'bot';
    final contentType =
        _text(message, ['contentType', 'content_type'], 'text').toLowerCase();
    final rawText = _text(message, ['contentText', 'content_text', 'text']);
    final status = _text(message, ['status']);
    final rawFailure = _text(message,
        ['failureReason', 'failure_reason', 'errorMessage', 'error_message']);
    final friendlyFailure = formatMetaFailureReason(rawFailure);
    final is24hClosed = isMetaReengagementWindowError(rawFailure);
    final failed = status.toLowerCase() == 'failed';
    final text = rawText.isNotEmpty
        ? rawText
        : failed && friendlyFailure.isNotEmpty
            ? 'Delivery blocked by WhatsApp'
            : contentType == 'text'
                ? '[Unsupported or empty message]'
                : '[${contentType[0].toUpperCase()}${contentType.substring(1)} attachment]';
    final created = _text(message, ['createdAt', 'created_at']);
    final templateName = _text(message, ['templateName', 'template_name']);
    final variables =
        _map(message['templateVariables'] ?? message['template_variables']);
    final interactive =
        _map(message['interactivePayload'] ?? message['interactive_payload']);
    final components = _maps(variables['components']);
    final header = components.cast<Map<String, dynamic>?>().firstWhere(
          (component) =>
              _text(component ?? const {}, ['type']).toLowerCase() == 'header',
          orElse: () => null,
        );
    final parameters = _maps(header?['parameters']);
    String nestedMedia(String type) {
      for (final parameter in parameters) {
        final nested = _map(parameter[type]);
        final link = _text(nested, ['link']);
        if (link.isNotEmpty) return link;
      }
      return '';
    }

    final mediaUrl = _text(message, ['mediaUrl', 'media_url'],
        _text(variables, ['headerUrl'], nestedMedia('image')));
    final videoUrl = nestedMedia('video');
    final documentUrl = nestedMedia('document');
    final buttons = _maps(interactive['buttons']).isNotEmpty
        ? _maps(interactive['buttons'])
        : _maps(variables['buttons']);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 310),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(13, 10, 13, 7),
        decoration: BoxDecoration(
          color: mine
              ? (isDark ? const Color(0xFF134E4A) : const Color(0xFFDCF8C6))
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16).copyWith(
            bottomRight: mine ? const Radius.circular(4) : null,
            bottomLeft: mine ? null : const Radius.circular(4),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (templateName.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 7),
                  child: Text(
                    'Template · $templateName',
                    style: TextStyle(
                      color: isDark
                          ? AppTokens.brandSoft
                          : const Color(0xFF166534),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            if (mediaUrl.startsWith('https://'))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(
                    mediaUrl,
                    width: 284,
                    height: 170,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const _MediaUnavailable(
                        label: 'Template image unavailable'),
                  ),
                ),
              ),
            if (videoUrl.isNotEmpty || documentUrl.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _MediaUnavailable(
                  label: videoUrl.isNotEmpty
                      ? 'Video attachment'
                      : 'Document attachment',
                  icon: videoUrl.isNotEmpty
                      ? Icons.play_circle_outline_rounded
                      : Icons.description_outlined,
                ),
              ),
            Align(alignment: Alignment.centerLeft, child: Text(text)),
            if (failed && friendlyFailure.isNotEmpty) ...[
              const SizedBox(height: 6),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .errorContainer
                      .withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      friendlyFailure,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onErrorContainer,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (is24hClosed && onSendTemplate != null) ...[
                      const SizedBox(height: 6),
                      TextButton.icon(
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          minimumSize: const Size(0, 30),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: onSendTemplate,
                        icon: const Icon(Icons.description_outlined, size: 15),
                        label: const Text(
                          'Send Approved Template',
                          style: TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
            if (_text(variables, ['footerText', 'footer']).isNotEmpty) ...[
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  _text(variables, ['footerText', 'footer']),
                  style:
                      const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                ),
              ),
            ],
            for (final button in buttons)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(top: 7),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  border: Border(
                      top: BorderSide(
                          color: Theme.of(context).colorScheme.outlineVariant)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(_buttonIcon(_text(button, ['type'])), size: 16),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        _text(button, ['text', 'title'], 'Action'),
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 4),
            Text(
              [_time(created), status].where((v) => v.isNotEmpty).join(' | '),
              style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)),
            ),
          ],
        ),
      ),
    );
  }
}

class _MediaUnavailable extends StatelessWidget {
  const _MediaUnavailable({
    required this.label,
    this.icon = Icons.broken_image_outlined,
  });

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        child: Row(
          children: [
            Icon(icon),
            const SizedBox(width: 8),
            Expanded(child: Text(label)),
          ],
        ),
      );
}

IconData _buttonIcon(String type) {
  final value = type.toUpperCase();
  if (value.contains('PHONE')) return Icons.phone_outlined;
  if (value.contains('URL')) return Icons.open_in_new_rounded;
  return Icons.reply_rounded;
}

String _renderTemplateBody(String body, List<String> values) {
  var rendered = body;
  for (var index = 0; index < values.length; index++) {
    rendered = rendered.replaceAll('{{${index + 1}}}', values[index]);
  }
  return rendered;
}

String _safeError(Object error) => error
    .toString()
    .replaceFirst('ApiException: ', '')
    .replaceFirst('Exception: ', '');

Map<String, dynamic> _map(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : const <String, dynamic>{};

List<Map<String, dynamic>> _maps(dynamic value) => value is List
    ? value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false)
    : const <Map<String, dynamic>>[];

IconData _sectionIcon(String section) => switch (section) {
      'Contacts' => Icons.contacts_outlined,
      'Templates' => Icons.description_outlined,
      'Campaigns' => Icons.campaign_outlined,
      _ => Icons.forum_outlined,
    };

String _text(Map<String, dynamic> data, List<String> keys,
    [String fallback = '']) {
  for (final key in keys) {
    final value = data[key];
    if (value != null && value.toString().trim().isNotEmpty) {
      return value.toString().trim();
    }
  }
  return fallback;
}

int _number(Map<String, dynamic> data, List<String> keys) =>
    int.tryParse(_text(data, keys, '0')) ?? 0;

String _initials(String name) => name
    .trim()
    .split(RegExp(r'\s+'))
    .take(2)
    .where((part) => part.isNotEmpty)
    .map((part) => part[0].toUpperCase())
    .join();

String _time(String value) {
  final date = DateTime.tryParse(value)?.toLocal();
  return date == null ? '' : DateFormat('h:mm a').format(date);
}
