import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_tokens.dart';

class AppTheme {
  const AppTheme._();

  static const brand = AppTokens.brandPrimary;
  static const secondary = AppTokens.brandSecondary;
  static const accent = AppTokens.cobaltAccent;
  static const ink = AppTokens.textPrimaryLight;
  static const canvas = AppTokens.bgLight;

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final bg = isLight ? AppTokens.bgLight : AppTokens.bgDark;
    final surface = isLight ? AppTokens.surfaceLight : AppTokens.surfaceDark;
    final surfaceSubtle =
        isLight ? AppTokens.surfaceSubtleLight : AppTokens.surfaceSubtleDark;
    final border = isLight ? AppTokens.borderLight : AppTokens.borderDark;
    final textPrimary =
        isLight ? AppTokens.textPrimaryLight : AppTokens.textPrimaryDark;
    final textSecondary =
        isLight ? AppTokens.textSecondaryLight : AppTokens.textSecondaryDark;

    final scheme = ColorScheme.fromSeed(
      seedColor: AppTokens.brandPrimary,
      brightness: brightness,
      surface: surface,
    ).copyWith(
      primary: isLight ? AppTokens.brandPrimary : const Color(0xFF2DD4BF),
      onPrimary: isLight ? Colors.white : const Color(0xFF042F3B),
      primaryContainer:
          isLight ? AppTokens.brandTint : const Color(0xFF0E3A44),
      onPrimaryContainer:
          isLight ? AppTokens.brandDeep : const Color(0xFFA5F3FC),
      secondary: isLight ? AppTokens.cobaltAccent : const Color(0xFF818CF8),
      tertiary: AppTokens.brandEmerald,
      surface: surface,
      surfaceContainerLowest: surface,
      surfaceContainerLow: bg,
      surfaceContainer: surfaceSubtle,
      surfaceContainerHigh:
          isLight ? const Color(0xFFEAF0F7) : const Color(0xFF1F2D3B),
      surfaceContainerHighest:
          isLight ? const Color(0xFFE2E8F0) : const Color(0xFF283848),
      onSurface: textPrimary,
      onSurfaceVariant: textSecondary,
      outline: border,
      outlineVariant: border,
      error: isLight ? AppTokens.danger : const Color(0xFFFB7185),
    );

    final baseText = (isLight
            ? Typography.material2021().black
            : Typography.material2021().white)
        .apply(
      fontFamily: AppTokens.fontBody,
      bodyColor: textPrimary,
      displayColor: textPrimary,
    );

    final textTheme = baseText.copyWith(
      headlineLarge: baseText.headlineLarge?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 28,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.7,
        height: 1.18,
      ),
      headlineMedium: baseText.headlineMedium?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 25,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.6,
        height: 1.2,
      ),
      headlineSmall: baseText.headlineSmall?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 22,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.45,
        height: 1.24,
      ),
      titleLarge: baseText.titleLarge?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
      ),
      titleMedium: baseText.titleMedium?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 16.5,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
      ),
      titleSmall: baseText.titleSmall?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 14.5,
        fontWeight: FontWeight.w700,
      ),
      bodyLarge: baseText.bodyLarge?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 15,
        height: 1.45,
      ),
      bodyMedium: baseText.bodyMedium?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 14,
        height: 1.42,
      ),
      bodySmall: baseText.bodySmall?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 12.5,
        color: textSecondary,
        height: 1.35,
      ),
      labelLarge: baseText.labelLarge?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 13.5,
        fontWeight: FontWeight.w700,
      ),
      labelMedium: baseText.labelMedium?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      labelSmall: baseText.labelSmall?.copyWith(
        fontFamily: AppTokens.fontBody,
        fontSize: 11.5,
        fontWeight: FontWeight.w600,
        color: textSecondary,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      fontFamily: AppTokens.fontBody,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      textTheme: textTheme,
      visualDensity: VisualDensity.standard,
      cupertinoOverrideTheme: CupertinoThemeData(
        brightness: brightness,
        primaryColor: scheme.primary,
        scaffoldBackgroundColor: bg,
        barBackgroundColor: surface.withValues(alpha: 0.94),
      ),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        surfaceTintColor: Colors.transparent,
        backgroundColor: bg,
        foregroundColor: textPrimary,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: isLight ? Brightness.dark : Brightness.light,
          statusBarBrightness: isLight ? Brightness.light : Brightness.dark,
          systemNavigationBarColor: bg,
          systemNavigationBarIconBrightness:
              isLight ? Brightness.dark : Brightness.light,
        ),
        titleTextStyle: TextStyle(
          fontFamily: AppTokens.fontBody,
          color: textPrimary,
          fontSize: 20,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.45,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTokens.radiusCard),
          side: BorderSide(
            color: border.withValues(alpha: isLight ? 0.9 : 0.75),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
        hintStyle: TextStyle(
          fontFamily: AppTokens.fontBody,
          color: textSecondary,
          fontSize: 14,
        ),
        labelStyle: TextStyle(
          fontFamily: AppTokens.fontBody,
          color: textSecondary,
          fontSize: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTokens.radiusInput),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTokens.radiusInput),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTokens.radiusInput),
          borderSide: BorderSide(color: scheme.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTokens.radiusInput),
          borderSide: BorderSide(color: scheme.error),
        ),
      ),
      searchBarTheme: SearchBarThemeData(
        elevation: const WidgetStatePropertyAll(0),
        backgroundColor: WidgetStatePropertyAll(surface),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        side: WidgetStatePropertyAll(BorderSide(color: border)),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTokens.radiusInput),
          ),
        ),
        constraints: const BoxConstraints(minHeight: 46, maxHeight: 48),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 14),
        ),
        textStyle: WidgetStatePropertyAll(
          TextStyle(
            fontFamily: AppTokens.fontBody,
            color: textPrimary,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
        hintStyle: WidgetStatePropertyAll(
          TextStyle(
            fontFamily: AppTokens.fontBody,
            color: textSecondary,
            fontSize: 14,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTokens.radiusButton),
          ),
          textStyle: const TextStyle(
            fontFamily: AppTokens.fontBody,
            fontSize: 14.5,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.1,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 46),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          side: BorderSide(color: border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTokens.radiusButton),
          ),
          textStyle: const TextStyle(
            fontFamily: AppTokens.fontBody,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surface,
        selectedColor: scheme.primary,
        side: BorderSide(color: border),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTokens.radiusPill),
        ),
        labelStyle: TextStyle(
          fontFamily: AppTokens.fontBody,
          color: WidgetStateColor.resolveWith((states) =>
              states.contains(WidgetState.selected)
                  ? Colors.white
                  : textPrimary),
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
        ),
        secondaryLabelStyle: const TextStyle(
          fontFamily: AppTokens.fontBody,
          color: Colors.white,
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
        ),
        iconTheme: IconThemeData(
          color: WidgetStateColor.resolveWith((states) =>
              states.contains(WidgetState.selected)
                  ? Colors.white
                  : scheme.primary),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        showCheckmark: false,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        elevation: 3,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: border,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppTokens.radiusSheet),
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTokens.radiusDialog),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: scheme.primaryContainer,
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: surface,
        indicatorColor: scheme.primaryContainer,
        selectedIconTheme: IconThemeData(color: scheme.primary),
        unselectedIconTheme: IconThemeData(color: textSecondary),
        selectedLabelTextStyle: TextStyle(
          fontFamily: AppTokens.fontBody,
          color: scheme.primary,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
        unselectedLabelTextStyle: TextStyle(
          fontFamily: AppTokens.fontBody,
          color: textSecondary,
          fontWeight: FontWeight.w500,
          fontSize: 12,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      dividerTheme: DividerThemeData(
        color: border.withValues(alpha: 0.75),
        space: 1,
        thickness: 1,
      ),
    );
  }
}
