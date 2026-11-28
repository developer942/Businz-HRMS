import 'package:flutter/material.dart';

/// Centralized BUSINZ PREMIUM NEO-BENTO 2026 Design Tokens.
/// Derived directly from the approved BUSINZ HRMS mobile UI reference
/// and original BUSINZ brand mark (#008B9B / #006778).
class AppTokens {
  const AppTokens._();

  // Official Font Families (bundled OFL local assets with system fallback)
  static const String fontBody = 'PlusJakartaSans';
  static const String fontKpi = 'Manrope';

  // Brand Palette (Neo-Bento 2026)
  static const Color brandPrimary = Color(0xFF008B9B);
  static const Color brandDeep = Color(0xFF006778);
  static const Color brandSecondary = Color(0xFF0AA3B4);
  static const Color brandOcean = Color(0xFF1A8FE3);
  static const Color brandEmerald = Color(0xFF10B981);
  static const Color brand = brandPrimary;
  static const Color brandHover = brandSecondary;
  static const Color brandTint = Color(0xFFE6F7F9);
  static const Color brandSoft = Color(0xFFCFF3F7);
  static const Color cobaltAccent = Color(0xFF4F63F5);
  static const Color cobaltDeep = Color(0xFF3A4CE0);
  static const Color solarAccent = Color(0xFFF39C12);

  // Neutral Light Surfaces
  static const Color bgLight = Color(0xFFFAFBFF);
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color surfaceSubtleLight = Color(0xFFF2F5FA);
  static const Color borderLight = Color(0xFFE7EDF6);
  static const Color textPrimaryLight = Color(0xFF1D2746); // Deep Navy Text
  static const Color textSecondaryLight = Color(0xFF64748B);
  static const Color textMutedLight = textSecondaryLight;

  // Neutral Dark Surfaces
  static const Color bgDark = Color(0xFF0B1117);
  static const Color surfaceDark = Color(0xFF121B24);
  static const Color surfaceSubtleDark = Color(0xFF1A2633);
  static const Color borderDark = Color(0xFF253445);
  static const Color textPrimaryDark = Color(0xFFF1F5F9);
  static const Color textSecondaryDark = Color(0xFF94A3B8);

  // Soft Pastel Bento Card Fills (Light & Dark)
  static const Color pastelMint = Color(0xFFE5F8F0);
  static const Color pastelMintDark = Color(0xFF112A24);
  static const Color pastelBlue = Color(0xFFE8F5FF);
  static const Color pastelBlueDark = Color(0xFF112638);
  static const Color pastelLavender = Color(0xFFF2EEFF);
  static const Color pastelLavenderDark = Color(0xFF201A36);
  static const Color pastelAmber = Color(0xFFFFF1DA);
  static const Color pastelAmberDark = Color(0xFF322411);
  static const Color pastelRose = Color(0xFFFFEBF0);
  static const Color pastelRoseDark = Color(0xFF341821);

  // Semantic Status Colors
  static const Color success = Color(0xFF16A34A);
  static const Color successBg = Color(0xFFDCFCE7);
  static const Color warning = Color(0xFFD97706);
  static const Color warningBg = Color(0xFFFEF3C7);
  static const Color danger = Color(0xFFE11D48);
  static const Color dangerBg = Color(0xFFFFE4E6);
  static const Color info = Color(0xFF0284C7);
  static const Color infoBg = Color(0xFFE0F2FE);
  static const Color violet = Color(0xFF6D28D9);
  static const Color violetBg = Color(0xFFEDE9FE);

  // Spacing Scale: 4, 8, 12, 16, 20, 24, 32
  static const double spaceXs = 4;
  static const double spaceSm = 8;
  static const double spaceMd = 12;
  static const double spaceLg = 16;
  static const double spaceXl = 20;
  static const double space2xl = 24;
  static const double space3xl = 32;

  // Geometry / Corner Radii (Card: 16-22, Small Controls: 12-16, Pill: 999)
  static const double radiusSm = 10;
  static const double radiusInput = 14;
  static const double radiusButton = 14;
  static const double radiusCard = 18;
  static const double radiusCardLg = 22;
  static const double radiusDialog = 22;
  static const double radiusSheet = 26;
  static const double radiusPill = 999;

  // Responsive Breakpoints
  static const double tabletBreakpoint = 700;
  static const double desktopBreakpoint = 1024;

  // Rounded Bottom Navigation Metrics (ensures zero content overlap)
  static const double floatingNavClearance = 94;

  // Soft Ambient Neo-Bento Shadows
  static List<BoxShadow> cardShadow(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (isDark) return const [];
    return const [
      BoxShadow(
        color: Color(0x0A1D2746),
        blurRadius: 18,
        offset: Offset(0, 6),
      ),
      BoxShadow(
        color: Color(0x051D2746),
        blurRadius: 4,
        offset: Offset(0, 1),
      ),
    ];
  }

  static List<BoxShadow> floatingNavShadow(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return [
      BoxShadow(
        color: isDark ? const Color(0x66000000) : const Color(0x181D2746),
        blurRadius: 28,
        offset: const Offset(0, 10),
      ),
      BoxShadow(
        color: isDark ? const Color(0x33000000) : const Color(0x0A008B9B),
        blurRadius: 8,
        offset: const Offset(0, 2),
      ),
    ];
  }

  /// Tabular KPI typography using Manrope (26-34sp bold).
  static TextStyle kpiStyle(
    BuildContext context, {
    double size = 26,
    Color? color,
  }) =>
      TextStyle(
        fontFamily: fontKpi,
        fontSize: size,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.6,
        height: 1.12,
        color: color ?? Theme.of(context).colorScheme.onSurface,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  static Color pastelFor(BuildContext context, Color lightPastel) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (!isDark) return lightPastel;
    if (lightPastel == pastelMint) return pastelMintDark;
    if (lightPastel == pastelBlue) return pastelBlueDark;
    if (lightPastel == pastelLavender) return pastelLavenderDark;
    if (lightPastel == pastelAmber) return pastelAmberDark;
    if (lightPastel == pastelRose) return pastelRoseDark;
    return surfaceSubtleDark;
  }
}
