import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/auth_controller.dart';

class RequiredPasswordChangeScreen extends ConsumerStatefulWidget {
  const RequiredPasswordChangeScreen({super.key});

  @override
  ConsumerState<RequiredPasswordChangeScreen> createState() =>
      _RequiredPasswordChangeScreenState();
}

class _RequiredPasswordChangeScreenState
    extends ConsumerState<RequiredPasswordChangeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _saving = false;
  String? _error;

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .changePassword(_current.text, _next.text);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Secure your account'),
          actions: [
            TextButton(
              onPressed: _saving
                  ? null
                  : () => ref.read(authControllerProvider.notifier).logout(),
              child: const Text('Sign out'),
            ),
          ],
        ),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(Icons.security_rounded,
                          size: 52,
                          color: Theme.of(context).colorScheme.primary),
                      const SizedBox(height: 20),
                      Text('Password change required',
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      const Text(
                        'Your organization requires a new password before HRMS access can continue.',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 28),
                      TextFormField(
                        controller: _current,
                        obscureText: true,
                        enabled: !_saving,
                        decoration: const InputDecoration(
                            labelText: 'Current password'),
                        validator: (value) => value == null || value.isEmpty
                            ? 'Enter the current password.'
                            : null,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _next,
                        obscureText: true,
                        enabled: !_saving,
                        decoration:
                            const InputDecoration(labelText: 'New password'),
                        validator: (value) => value == null || value.length < 8
                            ? 'Use at least 8 characters.'
                            : null,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _confirm,
                        obscureText: true,
                        enabled: !_saving,
                        decoration: const InputDecoration(
                            labelText: 'Confirm new password'),
                        validator: (value) => value != _next.text
                            ? 'Passwords do not match.'
                            : null,
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(_error!,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error)),
                      ],
                      const SizedBox(height: 22),
                      FilledButton(
                        onPressed: _saving ? null : _save,
                        child: Text(_saving ? 'Updating…' : 'Update password'),
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
