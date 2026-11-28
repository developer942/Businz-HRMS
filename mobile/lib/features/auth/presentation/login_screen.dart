import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/adaptive_components.dart';
import '../../../core/widgets/businz_design_system.dart';
import '../application/auth_controller.dart';

enum _LoginMode { password, emailOtp }

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.initialError});
  final String? initialError;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _otpEmail = TextEditingController();
  final _otp = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _obscure = true;
  _LoginMode _mode = _LoginMode.password;
  bool _emailOtpEnabled = true;
  bool _otpRequested = false;
  bool _otpWorking = false;
  int _otpExpiresIn = 0;
  int _resendCooldown = 0;
  Timer? _otpTimer;
  String? _otpMessage;
  String? _error;

  @override
  void initState() {
    super.initState();
    _error = widget.initialError;
    _loadOtpConfig();
  }

  Future<void> _loadOtpConfig() async {
    try {
      final config = await ref.read(authRepositoryProvider).otpConfig();
      if (mounted) {
        setState(() => _emailOtpEnabled = config['emailOtpEnabled'] != false);
      }
    } catch (_) {
      // Email OTP capability lookup failure must not disable password login.
    }
  }

  Future<void> _submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _error = null);
    final ok = await ref.read(authControllerProvider.notifier).login(
          _identifier.text,
          _password.text,
        );
    if (!ok && mounted) {
      final value = ref.read(authControllerProvider);
      setState(() => _error = _cleanError(value.error ?? 'Unable to sign in.'));
    }
  }

  Future<void> _forgotPassword() async {
    await showBusinzBottomSheet<void>(
      context: context,
      builder: (_) => const _PasswordResetSheet(),
    );
  }

  void _changeMode(_LoginMode mode) {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _mode = mode;
      _error = null;
    });
  }

  Future<void> _requestEmailOtp() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final email = _otpEmail.text.trim().toLowerCase();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      setState(() => _error = 'Enter your registered work email.');
      return;
    }
    if (_otpWorking || _resendCooldown > 0) return;
    setState(() {
      _otpWorking = true;
      _error = null;
    });
    try {
      final result =
          await ref.read(authRepositoryProvider).requestEmailOtp(email);
      if (!mounted) return;
      setState(() {
        _otpRequested = true;
        _otp.clear();
        _otpExpiresIn = result.expiresInSeconds;
        _resendCooldown = result.resendCooldownSeconds;
        _otpMessage =
            'If this employee account is eligible, a sign-in code was sent.';
      });
      _startOtpTimer();
    } catch (error) {
      if (mounted) setState(() => _error = _cleanError(error));
    } finally {
      if (mounted) setState(() => _otpWorking = false);
    }
  }

  void _startOtpTimer() {
    _otpTimer?.cancel();
    _otpTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() {
        if (_otpExpiresIn > 0) _otpExpiresIn--;
        if (_resendCooldown > 0) _resendCooldown--;
      });
      if (_otpExpiresIn <= 0 && _resendCooldown <= 0) timer.cancel();
    });
  }

  Future<void> _verifyEmailOtp() async {
    FocusManager.instance.primaryFocus?.unfocus();
    if (_otpExpiresIn <= 0) {
      setState(() => _error = 'The code expired. Request a new code.');
      return;
    }
    if (!RegExp(r'^\d{6}$').hasMatch(_otp.text.trim())) {
      setState(() => _error = 'Enter the complete 6-digit code.');
      return;
    }
    setState(() => _error = null);
    final ok = await ref.read(authControllerProvider.notifier).verifyEmailOtp(
          _otpEmail.text,
          _otp.text,
        );
    if (!ok && mounted) {
      setState(() => _error = _cleanError(
          ref.read(authControllerProvider).error ?? 'Unable to sign in.'));
    }
  }

  static String _cleanError(Object error) => error
      .toString()
      .replaceFirst('ApiException: ', '')
      .replaceFirst('Exception: ', '');

  static String _formatDuration(int seconds) {
    final safe = seconds.clamp(0, 3599);
    return '${(safe ~/ 60).toString().padLeft(2, '0')}:'
        '${(safe % 60).toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _otpEmail.dispose();
    _otp.dispose();
    _passwordFocus.dispose();
    _otpTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loading = ref.watch(authControllerProvider).isLoading;
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Stack(
        children: [
          // Soft Neo-Bento Ambient Teal Wave Backdrop (Reference Screen 1)
          Positioned.fill(
            child: IgnorePointer(
              child: CustomPaint(
                painter: _LoginWaveBackdropPainter(isDark: isDark),
              ),
            ),
          ),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: EdgeInsets.symmetric(
                  horizontal: constraints.maxWidth >= 700 ? 80 : 24,
                  vertical: 20,
                ),
                child: ConstrainedBox(
                  constraints:
                      BoxConstraints(minHeight: constraints.maxHeight - 40),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            // Centered Original BUSINZ Brand Mark (Untouched Asset)
                            const Center(
                              child: BusinzBrandMark(
                                size: 74,
                                padding: 9,
                                radius: 22,
                              ),
                            ),
                            const SizedBox(height: 14),
                            Text(
                              'BUSINZ',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: scheme.onSurface,
                                fontSize: 27,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.4,
                                height: 1.05,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'H  R  M  S',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: scheme.onSurfaceVariant,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 4.0,
                              ),
                            ),
                            const SizedBox(height: 30),

                            // Reference Greeting Header
                            Text(
                              'Welcome Back 👋',
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineSmall
                                  ?.copyWith(
                                    fontSize: 24,
                                    fontWeight: FontWeight.w800,
                                  ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Sign in to your account',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyMedium
                                  ?.copyWith(color: scheme.onSurfaceVariant),
                            ),
                            const SizedBox(height: 20),

                            // Password / Email OTP Toggle
                            AdaptiveSegmentedControl<_LoginMode>(
                              values: const [
                                _LoginMode.password,
                                _LoginMode.emailOtp,
                              ],
                              selected: _mode,
                              labelBuilder: (m) => m == _LoginMode.password
                                  ? 'Password'
                                  : 'Email OTP',
                              onChanged: (m) {
                                if (!loading && !_otpWorking) {
                                  _changeMode(m);
                                }
                              },
                            ),
                            const SizedBox(height: 18),

                            if (_mode == _LoginMode.password) ...[
                              _ShadowFieldBox(
                                child: TextFormField(
                                  controller: _identifier,
                                  enabled: !loading,
                                  textInputAction: TextInputAction.next,
                                  keyboardType: TextInputType.emailAddress,
                                  autofillHints: const [AutofillHints.username],
                                  onFieldSubmitted: (_) =>
                                      _passwordFocus.requestFocus(),
                                  decoration: const InputDecoration(
                                    hintText: 'Email or Employee ID',
                                    prefixIcon:
                                        Icon(Icons.person_outline_rounded),
                                  ),
                                  validator: (value) =>
                                      value == null || value.trim().isEmpty
                                          ? 'Enter your employee ID or email.'
                                          : null,
                                ),
                              ),
                              const SizedBox(height: 14),
                              _ShadowFieldBox(
                                child: TextFormField(
                                  controller: _password,
                                  focusNode: _passwordFocus,
                                  enabled: !loading,
                                  obscureText: _obscure,
                                  textInputAction: TextInputAction.done,
                                  autofillHints: const [AutofillHints.password],
                                  onFieldSubmitted: (_) => _submit(),
                                  decoration: InputDecoration(
                                    hintText: 'Password',
                                    prefixIcon:
                                        const Icon(Icons.lock_outline_rounded),
                                    suffixIcon: IconButton(
                                      tooltip: _obscure
                                          ? 'Show password'
                                          : 'Hide password',
                                      onPressed: () =>
                                          setState(() => _obscure = !_obscure),
                                      icon: Icon(_obscure
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined),
                                    ),
                                  ),
                                  validator: (value) =>
                                      value == null || value.isEmpty
                                          ? 'Enter your password.'
                                          : null,
                                ),
                              ),
                            ] else if (!_emailOtpEnabled)
                              Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: scheme.surface,
                                  borderRadius: BorderRadius.circular(14),
                                  border:
                                      Border.all(color: scheme.outlineVariant),
                                ),
                                child: const Text(
                                  'Email OTP sign-in is disabled by your administrator. Use password sign-in.',
                                ),
                              )
                            else ...[
                              _ShadowFieldBox(
                                child: TextField(
                                  controller: _otpEmail,
                                  enabled: !loading &&
                                      !_otpWorking &&
                                      !_otpRequested,
                                  keyboardType: TextInputType.emailAddress,
                                  textInputAction: _otpRequested
                                      ? TextInputAction.next
                                      : TextInputAction.done,
                                  autofillHints: const [AutofillHints.email],
                                  onSubmitted: (_) => _otpRequested
                                      ? FocusScope.of(context).nextFocus()
                                      : _requestEmailOtp(),
                                  decoration: const InputDecoration(
                                    hintText: 'Registered work email',
                                    prefixIcon:
                                        Icon(Icons.alternate_email_rounded),
                                  ),
                                ),
                              ),
                              if (_otpRequested) ...[
                                const SizedBox(height: 14),
                                _ShadowFieldBox(
                                  child: TextField(
                                    controller: _otp,
                                    enabled: !loading &&
                                        !_otpWorking &&
                                        _otpExpiresIn > 0,
                                    keyboardType: TextInputType.number,
                                    textInputAction: TextInputAction.done,
                                    autofillHints: const [
                                      AutofillHints.oneTimeCode
                                    ],
                                    maxLength: 6,
                                    onSubmitted: (_) => _verifyEmailOtp(),
                                    decoration: InputDecoration(
                                      hintText: '6-digit sign-in code',
                                      counterText: '',
                                      prefixIcon:
                                          const Icon(Icons.pin_outlined),
                                      suffixText:
                                          _formatDuration(_otpExpiresIn),
                                    ),
                                  ),
                                ),
                                if (_otpMessage != null) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    _otpMessage!,
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: TextButton(
                                    onPressed: loading ||
                                            _otpWorking ||
                                            _resendCooldown > 0
                                        ? null
                                        : _requestEmailOtp,
                                    child: Text(_resendCooldown > 0
                                        ? 'Resend in ${_resendCooldown}s'
                                        : 'Resend code'),
                                  ),
                                ),
                              ],
                            ],

                            if (_error != null) ...[
                              const SizedBox(height: 14),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: scheme.errorContainer,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Text(
                                  _error!,
                                  style: TextStyle(
                                    color: scheme.onErrorContainer,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],

                            const SizedBox(height: 22),

                            // Reference Full-Width Teal Gradient Sign In CTA
                            BusinzPrimaryButton(
                              label: _mode == _LoginMode.password
                                  ? 'Sign In'
                                  : _otpWorking
                                      ? 'Please wait…'
                                      : _otpRequested
                                          ? 'Verify & Sign In'
                                          : 'Send Sign-In Code',
                              loading: loading,
                              trailingIcon: Icons.arrow_forward_rounded,
                              onPressed: loading || _otpWorking
                                  ? null
                                  : _mode == _LoginMode.password
                                      ? _submit
                                      : !_emailOtpEnabled
                                          ? null
                                          : _otpRequested
                                              ? _verifyEmailOtp
                                              : _requestEmailOtp,
                            ),

                            if (_mode == _LoginMode.password) ...[
                              const SizedBox(height: 12),
                              Center(
                                child: TextButton(
                                  onPressed: loading ? null : _forgotPassword,
                                  child: const Text('Forgot Password?'),
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
            ),
          ),
        ],
      ),
    );
  }
}

class _ShadowFieldBox extends StatelessWidget {
  const _ShadowFieldBox({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppTokens.radiusInput),
          boxShadow: AppTokens.cardShadow(context),
        ),
        child: child,
      );
}

class _LoginWaveBackdropPainter extends CustomPainter {
  const _LoginWaveBackdropPainter({required this.isDark});
  final bool isDark;

  @override
  void paint(Canvas canvas, Size size) {
    final topPaint = Paint()
      ..shader = LinearGradient(
        colors: isDark
            ? [
                AppTokens.brandPrimary.withValues(alpha: 0.20),
                AppTokens.brandOcean.withValues(alpha: 0.04),
              ]
            : [
                const Color(0xFFCCF2F5),
                const Color(0x00FAFBFF),
              ],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height * 0.34));

    final topPath = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width, size.height * 0.16)
      ..quadraticBezierTo(
        size.width * 0.64,
        size.height * 0.24,
        size.width * 0.28,
        size.height * 0.14,
      )
      ..quadraticBezierTo(
        size.width * 0.10,
        size.height * 0.09,
        0,
        size.height * 0.18,
      )
      ..close();
    canvas.drawPath(topPath, topPaint);

    final bottomPaint = Paint()
      ..shader = LinearGradient(
        colors: isDark
            ? [
                AppTokens.brandEmerald.withValues(alpha: 0.14),
                AppTokens.brandPrimary.withValues(alpha: 0.22),
              ]
            : [
                const Color(0xFFBDF0EC),
                const Color(0xFFCDE9FF),
              ],
        begin: Alignment.bottomLeft,
        end: Alignment.topRight,
      ).createShader(
        Rect.fromLTWH(0, size.height * 0.78, size.width, size.height * 0.22),
      );

    final bottomPath = Path()
      ..moveTo(0, size.height * 0.88)
      ..quadraticBezierTo(
        size.width * 0.30,
        size.height * 0.81,
        size.width * 0.62,
        size.height * 0.90,
      )
      ..quadraticBezierTo(
        size.width * 0.85,
        size.height * 0.96,
        size.width,
        size.height * 0.85,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(bottomPath, bottomPaint);
  }

  @override
  bool shouldRepaint(covariant _LoginWaveBackdropPainter oldDelegate) =>
      oldDelegate.isDark != isDark;
}

class _PasswordResetSheet extends ConsumerStatefulWidget {
  const _PasswordResetSheet();

  @override
  ConsumerState<_PasswordResetSheet> createState() =>
      _PasswordResetSheetState();
}

class _PasswordResetSheetState extends ConsumerState<_PasswordResetSheet> {
  final _identifier = TextEditingController();
  final _otp = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  int _step = 0;
  bool _working = false;
  String? _resetToken;
  String? _message;
  String? _error;

  Future<void> _continue() async {
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final repository = ref.read(authRepositoryProvider);
      if (_step == 0) {
        if (_identifier.text.trim().isEmpty) {
          throw Exception('Enter your employee ID or registered email.');
        }
        await repository.requestPasswordReset(_identifier.text);
        setState(() {
          _step = 1;
          _message =
              'If an active account matches, a verification code was sent to its registered email.';
        });
      } else if (_step == 1) {
        if (!RegExp(r'^\d{6}$').hasMatch(_otp.text.trim())) {
          throw Exception('Enter the 6-digit verification code.');
        }
        _resetToken = await repository.verifyResetOtp(
          _identifier.text,
          _otp.text,
        );
        setState(() {
          _step = 2;
          _message = null;
        });
      } else {
        if (_password.text.length < 8) {
          throw Exception('Use a password with at least 8 characters.');
        }
        if (_password.text != _confirm.text) {
          throw Exception('The passwords do not match.');
        }
        await repository.resetPassword(_resetToken!, _password.text);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content:
                    Text('Password reset confirmed. You can now sign in.')),
          );
          Navigator.pop(context);
        }
      }
    } catch (error) {
      if (mounted) {
        setState(
            () => _error = error.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  void dispose() {
    _identifier.dispose();
    _otp.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          10,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _step == 0
                    ? 'Reset Password'
                    : _step == 1
                        ? 'Verify Your Code'
                        : 'Choose a New Password',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              if (_message != null)
                Text(_message!, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              if (_step == 0)
                TextField(
                  controller: _identifier,
                  enabled: !_working,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                      labelText: 'Employee ID or registered email'),
                )
              else if (_step == 1)
                TextField(
                  controller: _otp,
                  enabled: !_working,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(labelText: '6-digit code'),
                )
              else ...[
                TextField(
                  controller: _password,
                  enabled: !_working,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'New password'),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _confirm,
                  enabled: !_working,
                  obscureText: true,
                  decoration:
                      const InputDecoration(labelText: 'Confirm password'),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 18),
              BusinzPrimaryButton(
                label: _working
                    ? 'Please wait…'
                    : _step == 2
                        ? 'Reset Password'
                        : 'Continue',
                loading: _working,
                onPressed: _working ? null : _continue,
              ),
            ],
          ),
        ),
      );
}
