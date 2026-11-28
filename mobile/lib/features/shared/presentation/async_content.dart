import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_tokens.dart';

class AppErrorView extends StatelessWidget {
  const AppErrorView({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final apiError = error is ApiException ? error as ApiException : null;
    final title = switch (apiError?.statusCode) {
      401 => 'Session expired',
      403 => 'Access not permitted',
      404 => 'Information not found',
      _ when (apiError?.statusCode ?? 0) >= 500 => 'Unable to reach service',
      null when apiError?.isNetworkFailure == true => 'No network connection',
      _ => 'Couldn’t load this section',
    };
    final icon = switch (apiError?.statusCode) {
      401 => Icons.lock_clock_outlined,
      403 => Icons.shield_outlined,
      404 => Icons.search_off_rounded,
      _ => Icons.cloud_off_rounded,
    };
    final scheme = Theme.of(context).colorScheme;
    final details = error
        .toString()
        .replaceFirst('ApiException: ', '')
        .replaceFirst('Exception: ', '');

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: scheme.surfaceContainer,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, size: 28, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            details,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 18),
          FilledButton.tonalIcon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Try again'),
          ),
        ]),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: scheme.primaryContainer,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, size: 28, color: scheme.primary),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 18),
            FilledButton.tonal(
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
          ],
        ]),
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.value, {super.key, this.compact = false});
  final String value;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final normalized = value.trim().toLowerCase();
    final scheme = Theme.of(context).colorScheme;
    final Color color;

    if (normalized.contains('approv') ||
        normalized.contains('complete') ||
        normalized == 'active' ||
        normalized == 'paid' ||
        normalized == 'disbursed' ||
        normalized == 'reimbursed' ||
        normalized == 'confirmed' ||
        normalized == 'good gps' ||
        normalized == 'opted in' ||
        normalized == 'available' ||
        normalized == 'delivered' ||
        normalized == 'read' ||
        normalized.contains('present')) {
      color = AppTokens.success;
    } else if (normalized.contains('reject') ||
        normalized.contains('overdue') ||
        normalized.contains('absent') ||
        normalized.contains('fail') ||
        normalized.contains('cancel') ||
        normalized.contains('opted out') ||
        normalized.contains('inactive')) {
      color = AppTokens.danger;
    } else if (normalized.contains('pending') ||
        normalized.contains('miss') ||
        normalized == 'mu' ||
        normalized.contains('late') ||
        normalized.contains('correction') ||
        normalized.contains('partial') ||
        normalized.contains('maintenance') ||
        normalized.contains('auto closed') ||
        normalized.contains('half')) {
      color = AppTokens.warning;
    } else if (normalized.contains('progress') ||
        normalized.contains('distribut') ||
        normalized.contains('assigned') ||
        normalized.contains('process') ||
        normalized.contains('verified') ||
        normalized.contains('wfh')) {
      color = AppTokens.info;
    } else {
      color = scheme.primary;
    }

    final display = value.replaceAll('_', ' ').trim();
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppTokens.radiusPill),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        display,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: color,
          fontSize: compact ? 10.5 : 11.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.1,
        ),
      ),
    );
  }
}
