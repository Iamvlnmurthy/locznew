import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../data/auth_repository.dart';

/// Mobile OTP sign-in. Two steps in one screen so "wrong number" is a state change
/// rather than a navigation pop.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key, this.redirectTo});

  final String? redirectTo;

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();

  bool _codeSent = false;
  bool _busy = false;
  String? _error;
  String? _debugCode;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    final strings = Strings.of(context);
    final national = _phoneController.text.replaceAll(RegExp(r'\D'), '');

    // Indian mobile numbers are ten digits starting 6–9. Checking here saves a wasted
    // SMS and gives an instant answer.
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(national)) {
      setState(() => _error = strings('auth.invalidPhone'));
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final result = await ref.read(authRepositoryProvider).requestOtp(national);
      if (!mounted) return;
      setState(() {
        _codeSent = true;
        _debugCode = result.debugCode;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final user = await ref
          .read(authRepositoryProvider)
          .verifyOtp(
            _phoneController.text.replaceAll(RegExp(r'\D'), ''),
            _codeController.text.trim(),
          );

      if (!mounted) return;
      ref.read(authProvider.notifier).setUser(user);

      // Return the user to whatever they were trying to do — posting, saving, messaging.
      final destination = widget.redirectTo;
      if (destination != null && destination.startsWith('/')) {
        context.go(destination);
      } else {
        context.go('/');
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(LoczSpacing.x6),
          children: [
            Text(
              _codeSent ? strings('auth.codeTitle') : strings('auth.signInTitle'),
              style: theme.textTheme.headlineSmall,
            ),
            const SizedBox(height: LoczSpacing.x2),
            Text(
              _codeSent
                  ? strings('auth.codeSentTo', {'phone': '+91 ${_phoneController.text}'})
                  : strings('auth.signInSubtitle'),
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: LoczSpacing.x6),

            if (_error != null)
              Container(
                padding: const EdgeInsets.all(LoczSpacing.x3),
                margin: const EdgeInsets.only(bottom: LoczSpacing.x4),
                decoration: BoxDecoration(
                  color: LoczColors.dangerSurface,
                  borderRadius: BorderRadius.circular(LoczRadius.md),
                ),
                child: Text(_error!, style: const TextStyle(color: LoczColors.danger)),
              ),

            // The mock provider returns the code in development so the flow is
            // completable without an SMS gateway. Production never sends this field.
            if (_codeSent && _debugCode != null)
              Container(
                padding: const EdgeInsets.all(LoczSpacing.x3),
                margin: const EdgeInsets.only(bottom: LoczSpacing.x4),
                decoration: BoxDecoration(
                  color: LoczColors.infoSurface,
                  borderRadius: BorderRadius.circular(LoczRadius.md),
                ),
                child: Text(strings('auth.devCode', {'code': _debugCode!})),
              ),

            if (!_codeSent) ...[
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                autofocus: true,
                maxLength: 10,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(
                  labelText: strings('auth.phone'),
                  prefixText: '+91 ',
                  counterText: '',
                ),
              ),
              const SizedBox(height: LoczSpacing.x4),
              FilledButton(
                onPressed: _busy ? null : _requestCode,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(strings('auth.sendCode')),
              ),
            ] else ...[
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                autofocus: true,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, letterSpacing: 8),
                // Lets Android and iOS auto-fill the code straight from the SMS.
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(labelText: strings('auth.code'), counterText: ''),
                onSubmitted: (_) => _verify(),
              ),
              const SizedBox(height: LoczSpacing.x4),
              FilledButton(
                onPressed: _busy ? null : _verify,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(strings('auth.verify')),
              ),
              const SizedBox(height: LoczSpacing.x2),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                        _codeSent = false;
                        _codeController.clear();
                        _debugCode = null;
                        _error = null;
                      }),
                child: Text(strings('common.cancel')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
