import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/app_tokens.dart';

bool isCupertinoPlatform(BuildContext context) {
  final platform = Theme.of(context).platform;
  return !kIsWeb &&
      (platform == TargetPlatform.iOS || platform == TargetPlatform.macOS);
}

/// Authentic BUSINZ logo container — never substitutes generic placeholder icons.
class BusinzBrandMark extends StatelessWidget {
  const BusinzBrandMark({
    super.key,
    this.size = 44,
    this.padding = 6,
    this.radius = 12,
    this.showBorder = true,
  });

  final double size;
  final double padding;
  final double radius;
  final bool showBorder;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        padding: EdgeInsets.all(padding),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(radius),
          border: showBorder
              ? Border.all(color: Theme.of(context).colorScheme.outlineVariant)
              : null,
        ),
        child: Image.asset(
          'assets/businz-logo.png',
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
          semanticLabel: 'BUSINZ logo',
        ),
      );
}

/// Compact, high-craft 2026 KPI card with tabular numbers and optional tap action.
class CompactKpiCard extends StatelessWidget {
  const CompactKpiCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.accentColor,
    this.subtitle,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? accentColor;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tint = accentColor ?? scheme.primary;
    return Material(
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.85)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: tint.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, size: 18, color: tint),
                  ),
                  const Spacer(),
                  if (onTap != null)
                    Icon(
                      Icons.arrow_outward_rounded,
                      size: 16,
                      color: scheme.onSurfaceVariant.withValues(alpha: 0.7),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              if (subtitle != null && subtitle!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: tint,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Editorial section heading with optional count pill and trailing action.
class AppSectionHeader extends StatelessWidget {
  const AppSectionHeader({
    super.key,
    required this.title,
    this.count,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final int? count;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              Flexible(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.25,
                      ),
                ),
              ),
              if (count != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(AppTokens.radiusPill),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      color: scheme.onPrimaryContainer,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (actionLabel != null && onAction != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              minimumSize: const Size(0, 34),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              actionLabel!,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
          ),
      ],
    );
  }
}

/// Adaptive iOS CupertinoSlidingSegmentedControl / Android Material 3 Segmented Pill Bar.
class AdaptiveSegmentedControl<T extends Object> extends StatelessWidget {
  const AdaptiveSegmentedControl({
    super.key,
    required this.values,
    required this.selected,
    required this.labelBuilder,
    required this.onChanged,
  });

  final List<T> values;
  final T selected;
  final String Function(T value) labelBuilder;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    if (isCupertinoPlatform(context) && values.length <= 4) {
      return SizedBox(
        width: double.infinity,
        child: CupertinoSlidingSegmentedControl<T>(
          groupValue: selected,
          children: {
            for (final item in values)
              item: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Text(
                  labelBuilder(item),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
          },
          onValueChanged: (value) {
            if (value != null) onChanged(value);
          },
        ),
      );
    }

    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.7)),
      ),
      child: Row(
        children: values.map((item) {
          final isSelected = item == selected;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(item),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? scheme.surface : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.05),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : null,
                ),
                child: Text(
                  labelBuilder(item),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
                    color:
                        isSelected ? scheme.primary : scheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
          );
        }).toList(growable: false),
      ),
    );
  }
}

/// Adaptive confirmation dialog (Cupertino on iOS, Material 3 on Android).
Future<bool> showAdaptiveConfirmDialog({
  required BuildContext context,
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  if (isCupertinoPlatform(context)) {
    final result = await showCupertinoDialog<bool>(
      context: context,
      builder: (context) => CupertinoAlertDialog(
        title: Text(title),
        content: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(message),
        ),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(context, false),
            child: Text(cancelLabel),
          ),
          CupertinoDialogAction(
            isDestructiveAction: destructive,
            isDefaultAction: !destructive,
            onPressed: () => Navigator.pop(context, true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return result == true;
  }

  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: Text(cancelLabel),
        ),
        FilledButton(
          style: destructive
              ? FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.error,
                  foregroundColor: Theme.of(context).colorScheme.onError,
                )
              : null,
          onPressed: () => Navigator.pop(context, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result == true;
}

/// Smooth lightweight skeleton loading list for fast perceived startup.
class AppSkeletonList extends StatelessWidget {
  const AppSkeletonList({super.key, this.itemCount = 5, this.height = 84});
  final int itemCount;
  final double height;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context)
        .colorScheme
        .surfaceContainerHigh
        .withValues(alpha: 0.7);
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      physics: const NeverScrollableScrollPhysics(),
      itemCount: itemCount,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, __) => Container(
        height: height,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        ),
      ),
    );
  }
}

/// Consistent key-value detail row for bottom sheets and profile cards.
class DetailKeyValueRow extends StatelessWidget {
  const DetailKeyValueRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.boldValue = true,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final bool boldValue;

  @override
  Widget build(BuildContext context) {
    if (value.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 4,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 6,
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: boldValue ? FontWeight.w700 : FontWeight.w500,
                    color: valueColor,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

String formatInr(num amount, {int decimals = 0}) {
  return NumberFormat.currency(
    locale: 'en_IN',
    symbol: '\u20B9',
    decimalDigits: decimals,
  ).format(amount);
}

String formatDisplayDate(String? raw, {String fallback = '—'}) {
  if (raw == null || raw.trim().isEmpty) return fallback;
  final parsed = DateTime.tryParse(raw.trim());
  if (parsed == null) return raw.trim();
  return DateFormat('dd MMM yyyy').format(parsed.toLocal());
}

String formatDisplayDateTime(String? raw, {String fallback = '—'}) {
  if (raw == null || raw.trim().isEmpty) return fallback;
  final parsed = DateTime.tryParse(raw.trim());
  if (parsed == null) return raw.trim();
  return DateFormat('dd MMM yyyy, hh:mm a').format(parsed.toLocal());
}

String initialsOf(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .take(2)
      .toList();
  if (parts.isEmpty) return 'U';
  return parts.map((p) => p[0].toUpperCase()).join();
}
