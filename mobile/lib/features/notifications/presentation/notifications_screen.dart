import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../auth/application/auth_controller.dart';
import '../../shared/presentation/async_content.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  late Future<Map<String, dynamic>> _future;
  bool _updating = false;

  @override
  void initState() {
    super.initState();
    _future = ref.read(hrmsRepositoryProvider).notificationFeed();
  }

  void _reload() => setState(
      () => _future = ref.read(hrmsRepositoryProvider).notificationFeed());

  Future<void> _markRead(Map<String, dynamic> item) async {
    if (item['read'] == true || _updating) return;
    final id = item['id']?.toString() ?? '';
    if (id.isEmpty) return;
    setState(() => _updating = true);
    try {
      await ref.read(hrmsRepositoryProvider).markNotificationRead(id);
      ref.invalidate(unreadNotificationCountProvider);
      _reload();
      await _future;
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _markAll() async {
    if (_updating) return;
    setState(() => _updating = true);
    try {
      await ref.read(hrmsRepositoryProvider).markAllNotificationsRead();
      ref.invalidate(unreadNotificationCountProvider);
      _reload();
      await _future;
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _open(Map<String, dynamic> item) async {
    await _markRead(item);
    if (!mounted) return;
    var target = _targetFor(item);
    final user = ref.read(authControllerProvider).value;
    if (target == 'accounts_payment' && user != null && !user.isAccounts) {
      target = 'field_allowance';
    }
    if (target != null) context.push('/module/$target');
  }

  void _message(String value) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(value)));

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AppErrorView(error: snapshot.error!, onRetry: _reload);
          }
          final payload = snapshot.data ?? const {};
          final raw = payload['data'];
          final items = raw is List
              ? raw
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList(growable: false)
              : const <Map<String, dynamic>>[];
          final meta = payload['meta'] is Map
              ? Map<String, dynamic>.from(payload['meta'] as Map)
              : const <String, dynamic>{};
          final unread = int.tryParse('${meta['unread'] ?? 0}') ?? 0;
          if (items.isEmpty) {
            return const EmptyState(
              icon: Icons.notifications_none_rounded,
              title: 'No notifications',
              message: 'Your authorized HRMS updates will appear here.',
            );
          }
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
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            unread == 0
                                ? 'You’re all caught up'
                                : '$unread unread ${unread == 1 ? 'update' : 'updates'}',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        if (unread > 0)
                          TextButton(
                            onPressed: _updating ? null : _markAll,
                            child: const Text('Mark all read'),
                          ),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      final read = item['read'] == true;
                      final title = _text(item, ['title'], 'HRMS update');
                      final message = _text(item, ['message'], '');
                      final category = _text(item, ['category'], 'Update');
                      final time = _notificationTime(item);
                      return Card(
                        elevation: 0,
                        color: read
                            ? null
                            : Theme.of(context)
                                .colorScheme
                                .primaryContainer
                                .withValues(alpha: .35),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () => _open(item),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                CircleAvatar(
                                  backgroundColor:
                                      _categoryColor(context, category)
                                          .withValues(alpha: .14),
                                  foregroundColor:
                                      _categoryColor(context, category),
                                  child:
                                      Icon(_categoryIcon(category), size: 20),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(title,
                                                style: TextStyle(
                                                    fontWeight: read
                                                        ? FontWeight.w600
                                                        : FontWeight.w800)),
                                          ),
                                          if (!read)
                                            Container(
                                              width: 8,
                                              height: 8,
                                              decoration: BoxDecoration(
                                                shape: BoxShape.circle,
                                                color: Theme.of(context)
                                                    .colorScheme
                                                    .primary,
                                              ),
                                            ),
                                        ],
                                      ),
                                      if (message.isNotEmpty) ...[
                                        const SizedBox(height: 5),
                                        Text(message,
                                            maxLines: 3,
                                            overflow: TextOverflow.ellipsis),
                                      ],
                                      const SizedBox(height: 8),
                                      Text('$category · $time',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall),
                                    ],
                                  ),
                                ),
                              ],
                            ),
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
      );

  static String? _targetFor(Map<String, dynamic> item) {
    final link = _text(item, ['link'], '').toLowerCase();
    final category = _text(item, ['category'], '').toLowerCase();
    if (link.contains('task') || category.contains('task')) return 'tasks';
    if (link.contains('leave') || category.contains('leave')) return 'leave';
    if (link.contains('petty') || category.contains('petty')) {
      return 'petty_cash';
    }
    if (link.contains('advance') ||
        link.contains('loan') ||
        category.contains('advance')) {
      return 'advance_salary';
    }
    if (link.contains('payment') || link.contains('disburse')) {
      return 'accounts_payment';
    }
    if (link.contains('expense') ||
        category.contains('expense') ||
        link.contains('field') ||
        category.contains('field') ||
        category.contains('claim')) {
      return 'field_allowance';
    }
    if (link.contains('track') || category.contains('track')) return 'tracking';
    if (link.contains('attendance') || category.contains('attendance')) {
      return 'attendance_log';
    }
    if (link.contains('shift') || category.contains('shift')) return 'shifts';
    if (link.contains('payroll') || category.contains('payroll')) {
      return 'payroll';
    }
    if (link.contains('asset') || category.contains('asset')) return 'assets';
    return null;
  }

  static String _notificationTime(Map<String, dynamic> item) {
    final raw = _text(item, ['createdAt', 'created_at'], '');
    final date = DateTime.tryParse(raw)?.toLocal();
    if (date == null) return _text(item, ['timestamp'], 'Recently');
    final now = DateTime.now();
    final difference = now.difference(date);
    if (difference.inMinutes < 1) return 'Just now';
    if (difference.inHours < 1) return '${difference.inMinutes}m ago';
    if (difference.inDays < 1) return '${difference.inHours}h ago';
    if (difference.inDays < 7) return '${difference.inDays}d ago';
    return DateFormat.yMMMd().format(date);
  }

  static IconData _categoryIcon(String category) {
    final value = category.toLowerCase();
    if (value.contains('task')) return Icons.task_alt_outlined;
    if (value.contains('leave')) return Icons.event_available_outlined;
    if (value.contains('attendance')) return Icons.fingerprint_rounded;
    if (value.contains('expense') || value.contains('finance')) {
      return Icons.receipt_long_outlined;
    }
    return Icons.notifications_none_rounded;
  }

  static Color _categoryColor(BuildContext context, String category) {
    final value = category.toLowerCase();
    if (value.contains('expense') || value.contains('finance')) {
      return const Color(0xFFF39C12);
    }
    if (value.contains('leave')) return const Color(0xFF22C55E);
    return Theme.of(context).colorScheme.primary;
  }

  static String _text(
      Map<String, dynamic> item, List<String> keys, String fallback) {
    for (final key in keys) {
      final value = item[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
    return fallback;
  }
}
