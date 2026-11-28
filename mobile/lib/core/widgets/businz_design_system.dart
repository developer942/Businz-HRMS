import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../features/shared/presentation/async_content.dart';
import '../theme/app_tokens.dart';
import 'adaptive_components.dart';

// =============================================================================
// 1. BUSINZ APP SHELL & FLOATING ROLE-BASED NAVIGATION
// =============================================================================

class BusinzNavItem {
  const BusinzNavItem({
    required this.key,
    required this.label,
    required this.pageTitle,
    required this.icon,
    required this.selectedIcon,
  });

  final String key;
  final String label;
  final String pageTitle;
  final IconData icon;
  final IconData selectedIcon;
}

/// Centralized responsive app shell supporting:
/// - Clean rounded white bottom navigation bar on mobile with equal-width,
///   same-baseline tabs (NO floating/elevated center button):
///     • Employee / HR / Accounts: Home | Tasks | Attendance | Leave | More
///     • CEO: Home | Tasks | Reports | More
/// - Adaptive NavigationRail on tablet/desktop viewports
class BusinzAppShell extends StatelessWidget {
  const BusinzAppShell({
    super.key,
    required this.tabs,
    required this.selectedIndex,
    required this.onSelectTab,
    required this.body,
    this.appBar,
    this.showFaceAttendanceCenterButton = false,
    this.isPunchedIn = false,
    this.onFaceAttendanceTap,
  });

  final List<BusinzNavItem> tabs;
  final int selectedIndex;
  final ValueChanged<int> onSelectTab;
  final Widget body;
  final PreferredSizeWidget? appBar;
  final bool showFaceAttendanceCenterButton;
  final bool isPunchedIn;
  final VoidCallback? onFaceAttendanceTap;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final useRail = width >= AppTokens.tabletBreakpoint;

    if (useRail) {
      return Scaffold(
        appBar: appBar,
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: selectedIndex.clamp(0, math.max(0, tabs.length - 1)),
              onDestinationSelected: onSelectTab,
              labelType: NavigationRailLabelType.all,
              destinations: tabs
                  .map(
                    (tab) => NavigationRailDestination(
                      icon: Icon(tab.icon),
                      selectedIcon: Icon(tab.selectedIcon),
                      label: Text(tab.label),
                    ),
                  )
                  .toList(growable: false),
            ),
            const VerticalDivider(width: 1),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      extendBody: true,
      appBar: appBar,
      body: body,
      bottomNavigationBar: BusinzFloatingNavigation(
        tabs: tabs,
        selectedIndex: selectedIndex,
        onSelectTab: onSelectTab,
      ),
    );
  }
}

/// Clean rounded white bottom navigation container where every tab — including
/// Attendance for Employee/HR/Accounts — is a normal equal-width navigation item
/// aligned on the exact same baseline inside the phone safe area.
class BusinzFloatingNavigation extends StatelessWidget {
  const BusinzFloatingNavigation({
    super.key,
    required this.tabs,
    required this.selectedIndex,
    required this.onSelectTab,
    this.showFaceAttendanceCenterButton = false,
    this.isPunchedIn = false,
    this.onFaceAttendanceTap,
  });

  final List<BusinzNavItem> tabs;
  final int selectedIndex;
  final ValueChanged<int> onSelectTab;
  final bool showFaceAttendanceCenterButton;
  final bool isPunchedIn;
  final VoidCallback? onFaceAttendanceTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(14, 0, 14, math.max(10, bottomInset + 6)),
      child: Container(
        height: 64,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.85),
          ),
          boxShadow: AppTokens.floatingNavShadow(context),
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(24),
          clipBehavior: Clip.antiAlias,
          child: Row(
            children: [
              for (var i = 0; i < tabs.length; i++)
                Expanded(
                  child: _FloatingNavTabButton(
                    item: tabs[i],
                    selected: selectedIndex == i,
                    onTap: () => onSelectTab(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FloatingNavTabButton extends StatelessWidget {
  const _FloatingNavTabButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final BusinzNavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final activeColor = scheme.primary;
    final inactiveColor = scheme.onSurfaceVariant;

    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: selected ? activeColor : Colors.transparent,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  selected ? item.selectedIcon : item.icon,
                  size: 20,
                  color: selected ? Colors.white : inactiveColor,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                item.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  color: selected ? activeColor : inactiveColor,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Iconic circular elevated center Face Attendance action button.
/// Strictly visible for Employee, HR, and Accounts — NEVER rendered for CEO.
class BusinzFaceAttendanceButton extends StatelessWidget {
  const BusinzFaceAttendanceButton({
    super.key,
    required this.onTap,
    this.isPunchedIn = false,
    this.compact = false,
  });

  final VoidCallback onTap;
  final bool isPunchedIn;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final buttonSize = compact ? 50.0 : 56.0;

    return Semantics(
      button: true,
      label: isPunchedIn
          ? 'Face Attendance — Punch Out'
          : 'Face Attendance — Punch In',
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: buttonSize,
              height: buttonSize,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: isPunchedIn
                      ? const [AppTokens.brandEmerald, AppTokens.brandPrimary]
                      : const [AppTokens.brandSecondary, AppTokens.brandDeep],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                border: Border.all(
                  color: scheme.surface,
                  width: 3.5,
                ),
                boxShadow: [
                  BoxShadow(
                    color: (isPunchedIn
                            ? AppTokens.brandEmerald
                            : AppTokens.brandPrimary)
                        .withValues(alpha: 0.36),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Icon(
                    Icons.face_retouching_natural_rounded,
                    color: Colors.white,
                    size: compact ? 24 : 26,
                  ),
                  Positioned(
                    right: 9,
                    top: 9,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: isPunchedIn
                            ? const Color(0xFFDCFCE7)
                            : Colors.white,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        isPunchedIn
                            ? Icons.check_rounded
                            : Icons.add_rounded,
                        size: 11,
                        color: isPunchedIn
                            ? AppTokens.success
                            : AppTokens.brandDeep,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (!compact) ...[
              const SizedBox(height: 2),
              Text(
                'Face Attendance',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: scheme.onSurface,
                  letterSpacing: -0.2,
                  height: 1.1,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// 2. BUSINZ APP HEADER (Reference Greeting + Avatar + Notification Bell)
// =============================================================================

class BusinzAppHeader extends StatelessWidget {
  const BusinzAppHeader({
    super.key,
    required this.name,
    required this.subtitle,
    this.avatarUrl,
    this.greeting,
    this.unreadCount = 0,
    this.onAvatarTap,
    this.onNotificationsTap,
    this.showBrandLogo = false,
  });

  final String name;
  final String subtitle;
  final String? avatarUrl;
  final String? greeting;
  final int unreadCount;
  final VoidCallback? onAvatarTap;
  final VoidCallback? onNotificationsTap;
  final bool showBrandLogo;

  static String defaultGreeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasNetworkAvatar =
        avatarUrl != null && avatarUrl!.startsWith('https://');

    return Row(
      children: [
        InkWell(
          onTap: onAvatarTap,
          borderRadius: BorderRadius.circular(28),
          child: showBrandLogo
              ? const BusinzBrandMark(size: 46, padding: 6, radius: 14)
              : Container(
                  padding: const EdgeInsets.all(2.5),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: scheme.primary.withValues(alpha: 0.3),
                      width: 2,
                    ),
                  ),
                  child: CircleAvatar(
                    radius: 22,
                    backgroundColor: scheme.primaryContainer,
                    foregroundImage:
                        hasNetworkAvatar ? NetworkImage(avatarUrl!) : null,
                    child: Text(
                      initialsOf(name),
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: scheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                greeting ?? 'Hello ${name.trim()}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontSize: 19.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                      height: 1.15,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.25,
                    ),
              ),
            ],
          ),
        ),
        if (onNotificationsTap != null)
          Material(
            color: scheme.surface,
            shape: CircleBorder(
              side: BorderSide(color: scheme.outlineVariant),
            ),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onNotificationsTap,
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Badge(
                  isLabelVisible: unreadCount > 0,
                  backgroundColor: AppTokens.danger,
                  label: Text(unreadCount > 99 ? '99+' : '$unreadCount'),
                  child: Icon(
                    Icons.notifications_none_rounded,
                    size: 22,
                    color: scheme.onSurface,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// =============================================================================
// 3. BUSINZ GRADIENT ATTENDANCE CARD (Reference Today's Shift Wave Hero)
// =============================================================================

class BusinzGradientAttendanceCard extends StatelessWidget {
  const BusinzGradientAttendanceCard({
    super.key,
    required this.title,
    required this.subtitle,
    this.statusLabel = '',
    this.secondaryText,
    this.isOnDuty = false,
    this.isCompleted = false,
    this.onTap,
  });

  final String title;
  final String subtitle;
  final String statusLabel;
  final String? secondaryText;
  final bool isOnDuty;
  final bool isCompleted;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final gradientColors = isCompleted
        ? const [Color(0xFF007A78), Color(0xFF0D9488), Color(0xFF14B8A6)]
        : isOnDuty
            ? const [AppTokens.brandPrimary, Color(0xFF0284A8), AppTokens.brandOcean]
            : const [AppTokens.brandDeep, AppTokens.brandPrimary, Color(0xFF1294B8)];

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppTokens.radiusCardLg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: gradientColors,
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(AppTokens.radiusCardLg),
            boxShadow: [
              BoxShadow(
                color: AppTokens.brandPrimary.withValues(alpha: 0.24),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTokens.radiusCardLg),
            child: CustomPaint(
              painter: const _WaveOverlayPainter(),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(13),
                          ),
                          child: Icon(
                            isCompleted
                                ? Icons.verified_rounded
                                : Icons.event_available_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16.5,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.25,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                subtitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.92),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (secondaryText != null && secondaryText!.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              isOnDuty
                                  ? Icons.access_time_filled_rounded
                                  : Icons.face_retouching_natural_rounded,
                              size: 14,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 7),
                            Expanded(
                              child: Text(
                                secondaryText!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (onTap != null)
                              const Icon(
                                Icons.chevron_right_rounded,
                                size: 16,
                                color: Colors.white,
                              ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _WaveOverlayPainter extends CustomPainter {
  const _WaveOverlayPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint1 = Paint()
      ..color = Colors.white.withValues(alpha: 0.10)
      ..style = PaintingStyle.fill;
    final path1 = Path()
      ..moveTo(0, size.height * 0.72)
      ..quadraticBezierTo(
        size.width * 0.30,
        size.height * 0.45,
        size.width * 0.62,
        size.height * 0.74,
      )
      ..quadraticBezierTo(
        size.width * 0.85,
        size.height * 0.94,
        size.width,
        size.height * 0.56,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path1, paint1);

    final paint2 = Paint()
      ..color = Colors.white.withValues(alpha: 0.08)
      ..style = PaintingStyle.fill;
    final path2 = Path()
      ..moveTo(size.width * 0.25, size.height)
      ..quadraticBezierTo(
        size.width * 0.62,
        size.height * 0.58,
        size.width,
        size.height * 0.78,
      )
      ..lineTo(size.width, size.height)
      ..close();
    canvas.drawPath(path2, paint2);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// =============================================================================
// 4. BUSINZ CLEAN WHITE KPI CARD & COMPACT BENTO GRID
// =============================================================================

class BusinzKpiCard extends StatelessWidget {
  const BusinzKpiCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.pastelColor,
    required this.accentColor,
    this.unitOrSecondary,
    this.subtitle,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color pastelColor;
  final Color accentColor;
  final String? unitOrSecondary;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final iconBg = AppTokens.pastelFor(context, pastelColor);
    final scheme = Theme.of(context).colorScheme;

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
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
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
                        color: iconBg,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(icon, size: 18, color: accentColor),
                    ),
                    const Spacer(),
                    if (onTap != null)
                      Icon(
                        Icons.arrow_outward_rounded,
                        size: 15,
                        color: scheme.onSurfaceVariant.withValues(alpha: 0.65),
                      ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: 2),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: RichText(
                        maxLines: 1,
                        text: TextSpan(
                          children: [
                            TextSpan(
                              text: value,
                              style: AppTokens.kpiStyle(
                                context,
                                size: 22,
                                color: scheme.onSurface,
                              ),
                            ),
                            if (unitOrSecondary != null &&
                                unitOrSecondary!.isNotEmpty)
                              TextSpan(
                                text: ' $unitOrSecondary',
                                style: TextStyle(
                                  fontFamily: AppTokens.fontBody,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: accentColor,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: accentColor,
                              fontWeight: FontWeight.w700,
                              fontSize: 11,
                            ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class BusinzBentoGrid extends StatelessWidget {
  const BusinzBentoGrid({
    super.key,
    required this.children,
    this.mobileColumns = 2,
    this.tabletColumns = 4,
    this.childAspectRatio = 1.42,
    this.minTileHeight = 114,
  });

  final List<Widget> children;
  final int mobileColumns;
  final int tabletColumns;
  final double childAspectRatio;
  final double minTileHeight;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final isWide = constraints.maxWidth >= AppTokens.tabletBreakpoint;
          final cols = isWide ? tabletColumns : mobileColumns;
          final textScale = MediaQuery.textScalerOf(context).scale(1.0);
          final tileExtent =
              (minTileHeight * textScale.clamp(1.0, 1.35)).ceilToDouble();
          return GridView.builder(
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: children.length,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: cols,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              mainAxisExtent: tileExtent,
            ),
            itemBuilder: (_, index) => children[index],
          );
        },
      );
}

// =============================================================================
// 5. BUSINZ WEEKLY DATE STRIP & TASK PROGRESS CARD (Tasks Reference)
// =============================================================================

class BusinzDateStrip extends StatelessWidget {
  const BusinzDateStrip({
    super.key,
    required this.selectedDate,
    required this.onSelectDate,
    this.anchorDate,
  });

  final DateTime? selectedDate;
  final ValueChanged<DateTime?> onSelectDate;
  final DateTime? anchorDate;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final now = anchorDate ?? DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final monday = today.subtract(Duration(days: today.weekday - 1));
    final days = List.generate(7, (i) => monday.add(Duration(days: i)));

    bool sameDay(DateTime? a, DateTime b) =>
        a != null && a.year == b.year && a.month == b.month && a.day == b.day;

    return SizedBox(
      height: 70,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: days.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          if (index == 0) {
            final isAll = selectedDate == null;
            return GestureDetector(
              onTap: () => onSelectDate(null),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 54,
                decoration: BoxDecoration(
                  color: isAll ? scheme.primary : scheme.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isAll ? scheme.primary : scheme.outlineVariant,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.calendar_view_week_rounded,
                      size: 16,
                      color: isAll ? Colors.white : scheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'All',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: isAll ? Colors.white : scheme.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }

          final day = days[index - 1];
          final active = sameDay(selectedDate, day);
          final isToday = sameDay(today, day);
          return GestureDetector(
            onTap: () => onSelectDate(active ? null : day),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 54,
              decoration: BoxDecoration(
                color: active ? scheme.primary : scheme.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: active
                      ? scheme.primary
                      : isToday
                          ? scheme.primary.withValues(alpha: 0.45)
                          : scheme.outlineVariant,
                ),
                boxShadow: active
                    ? [
                        BoxShadow(
                          color: scheme.primary.withValues(alpha: 0.26),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : null,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    DateFormat('E').format(day),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: active
                          ? Colors.white.withValues(alpha: 0.9)
                          : scheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${day.day}',
                    style: TextStyle(
                      fontFamily: AppTokens.fontKpi,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: active ? Colors.white : scheme.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class BusinzProgressCard extends StatelessWidget {
  const BusinzProgressCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.progress,
    this.icon = Icons.task_alt_rounded,
    this.accentColor = AppTokens.brandEmerald,
  });

  final String title;
  final String subtitle;
  final double progress;
  final IconData icon;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    final pct = (progress.clamp(0.0, 1.0) * 100).round();
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppTokens.radiusCard),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppTokens.pastelFor(context, AppTokens.pastelLavender),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 20, color: AppTokens.cobaltAccent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14.5,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              Text(
                '$pct%',
                style: AppTokens.kpiStyle(
                  context,
                  size: 18,
                  color: accentColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress.clamp(0.0, 1.0),
              minHeight: 7,
              backgroundColor: scheme.surfaceContainer,
              color: accentColor,
            ),
          ),
        ],
      ),
    );
  }
}

/// Standardized Neo-Bento Task Card matching the Tasks reference screen.
class BusinzTaskCard extends StatelessWidget {
  const BusinzTaskCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.priority,
    required this.status,
    required this.dueText,
    required this.progress,
    this.taskNumber,
    this.metaRight,
    this.isOverdue = false,
    this.onTap,
  });

  final String title;
  final String subtitle;
  final String priority;
  final String status;
  final String dueText;
  final double progress;
  final String? taskNumber;
  final String? metaRight;
  final bool isOverdue;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final prioLower = priority.toLowerCase();
    final Color prioBg;
    final Color prioFg;
    if (prioLower == 'urgent' || prioLower == 'high') {
      prioBg = AppTokens.pastelFor(context, AppTokens.pastelRose);
      prioFg = AppTokens.danger;
    } else if (prioLower == 'low') {
      prioBg = AppTokens.pastelFor(context, AppTokens.pastelMint);
      prioFg = AppTokens.success;
    } else {
      prioBg = AppTokens.pastelFor(context, AppTokens.pastelBlue);
      prioFg = AppTokens.info;
    }

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
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (taskNumber != null && taskNumber!.isNotEmpty)
                            Text(
                              taskNumber!,
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w800,
                                color: scheme.primary,
                              ),
                            ),
                          Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          if (subtitle.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: prioBg,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            priority,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: prioFg,
                            ),
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          dueText,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight:
                                isOverdue ? FontWeight.w800 : FontWeight.w600,
                            color: isOverdue
                                ? AppTokens.danger
                                : scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    BusinzStatusChip(status, compact: true),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: scheme.surfaceContainerHighest
                            .withValues(alpha: 0.7),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        metaRight ?? '${progress.round()}%',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: scheme.onSurfaceVariant,
                            ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// 6. BUSINZ PAYSLIP CARD (Featured Cobalt Gradient Card from Payroll Reference)
// =============================================================================

class BusinzPayslipCard extends StatelessWidget {
  const BusinzPayslipCard({
    super.key,
    required this.periodLabel,
    required this.subtitle,
    this.statusLabel,
    this.onDownloadTap,
    this.onTap,
  });

  final String periodLabel;
  final String subtitle;
  final String? statusLabel;
  final VoidCallback? onDownloadTap;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppTokens.radiusCardLg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppTokens.cobaltAccent, AppTokens.cobaltDeep],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(AppTokens.radiusCardLg),
            boxShadow: [
              BoxShadow(
                color: AppTokens.cobaltAccent.withValues(alpha: 0.28),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTokens.radiusCardLg),
            child: CustomPaint(
              painter: const _WaveOverlayPainter(),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: const Icon(
                        Icons.description_rounded,
                        color: AppTokens.cobaltAccent,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            periodLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 17.5,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.88),
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (statusLabel != null &&
                              statusLabel!.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 9,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                statusLabel!,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (onDownloadTap != null)
                      Material(
                        color: Colors.white,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: onDownloadTap,
                          child: const Padding(
                            padding: EdgeInsets.all(10),
                            child: Icon(
                              Icons.download_rounded,
                              color: AppTokens.cobaltAccent,
                              size: 21,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// 7. BUSINZ LEAVE BALANCE CARD & STANDARDIZED PRIMITIVES
// =============================================================================

class BusinzLeaveBalanceCard extends StatelessWidget {
  const BusinzLeaveBalanceCard({
    super.key,
    required this.title,
    required this.quotaLabel,
    required this.remainingValue,
    required this.unitLabel,
    required this.pastelColor,
    required this.accentColor,
    this.icon = Icons.event_available_rounded,
  });

  final String title;
  final String quotaLabel;
  final String remainingValue;
  final String unitLabel;
  final Color pastelColor;
  final Color accentColor;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final iconBg = AppTokens.pastelFor(context, pastelColor);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppTokens.cardShadow(context),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: iconBg,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 18, color: accentColor),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  quotaLabel,
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
                remainingValue,
                style: AppTokens.kpiStyle(
                  context,
                  size: 20,
                  color: accentColor,
                ),
              ),
              Text(
                unitLabel,
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Primary gradient pill CTA button matching the Login & action reference.
class BusinzPrimaryButton extends StatelessWidget {
  const BusinzPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.trailingIcon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final IconData? trailingIcon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null || loading;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: disabled
            ? null
            : const LinearGradient(
                colors: [AppTokens.brandPrimary, AppTokens.brandDeep],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
        color: disabled
            ? Theme.of(context).colorScheme.surfaceContainerHighest
            : null,
        borderRadius: BorderRadius.circular(AppTokens.radiusButton),
        boxShadow: disabled
            ? null
            : [
                BoxShadow(
                  color: AppTokens.brandPrimary.withValues(alpha: 0.28),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppTokens.radiusButton),
        child: InkWell(
          onTap: disabled ? null : onPressed,
          borderRadius: BorderRadius.circular(AppTokens.radiusButton),
          child: SizedBox(
            height: 52,
            child: Center(
              child: loading
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.3,
                        color: Colors.white,
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (icon != null) ...[
                          Icon(icon, color: Colors.white, size: 19),
                          const SizedBox(width: 8),
                        ],
                        Text(
                          label,
                          style: TextStyle(
                            color: disabled
                                ? Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant
                                : Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (trailingIcon != null) ...[
                          const SizedBox(width: 8),
                          Icon(trailingIcon, color: Colors.white, size: 19),
                        ],
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class BusinzSearchBar extends StatelessWidget {
  const BusinzSearchBar({
    super.key,
    required this.hintText,
    required this.onChanged,
    this.controller,
  });

  final String hintText;
  final ValueChanged<String> onChanged;
  final TextEditingController? controller;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        onChanged: onChanged,
        decoration: InputDecoration(
          hintText: hintText,
          prefixIcon: const Icon(Icons.search_rounded, size: 20),
        ),
      );
}

class BusinzFormField extends StatelessWidget {
  const BusinzFormField({
    super.key,
    required this.controller,
    required this.label,
    this.prefixIcon,
    this.suffixIcon,
    this.obscureText = false,
    this.enabled = true,
    this.keyboardType,
    this.textInputAction,
    this.validator,
    this.onFieldSubmitted,
    this.autofillHints,
  });

  final TextEditingController controller;
  final String label;
  final IconData? prefixIcon;
  final Widget? suffixIcon;
  final bool obscureText;
  final bool enabled;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onFieldSubmitted;
  final Iterable<String>? autofillHints;

  @override
  Widget build(BuildContext context) => TextFormField(
        controller: controller,
        enabled: enabled,
        obscureText: obscureText,
        keyboardType: keyboardType,
        textInputAction: textInputAction,
        autofillHints: autofillHints,
        onFieldSubmitted: onFieldSubmitted,
        validator: validator,
        decoration: InputDecoration(
          hintText: label,
          prefixIcon: prefixIcon != null ? Icon(prefixIcon, size: 20) : null,
          suffixIcon: suffixIcon,
        ),
      );
}

Future<T?> showBusinzBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
}) =>
    showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: builder,
    );

// Semantic aliases preserving backwards compatibility across every existing module
typedef BusinzStatusChip = StatusPill;
typedef BusinzEmptyState = EmptyState;
typedef BusinzErrorState = AppErrorView;
typedef BusinzLoadingSkeleton = AppSkeletonList;
