import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';

/// Confirming a mobile number on Android.
///
/// The same verification the web does, but the device attests itself through Play Integrity
/// rather than reCAPTCHA, so nothing is shown and — on most handsets — nothing is typed
/// either. Android can read the incoming SMS and complete the whole thing silently, which is
/// what [PhoneAuthProvider.verificationCompleted] is for.
///
/// What arrives back is a signed assertion from Google. It is sent to the API untouched,
/// because nothing on a device the user controls may decide that a number is verified.
class VerifyPhoneScreen extends ConsumerStatefulWidget {
  const VerifyPhoneScreen({super.key});

  @override
  ConsumerState<VerifyPhoneScreen> createState() => _VerifyPhoneScreenState();
}

class _VerifyPhoneScreenState extends ConsumerState<VerifyPhoneScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();

  String? _verificationId;
  String? _error;
  String? _confirmed;
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final national = _phone.text.replaceAll(RegExp(r'\D'), '');
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(national)) {
      setState(() => _error = Strings.of(context)('verifyPhone.invalidPhone'));
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: '+91$national',
        // Android often reads the SMS itself and finishes without the user typing anything.
        // Handling it means those people never see the code screen at all.
        verificationCompleted: (credential) async {
          await _submit(credential);
        },
        verificationFailed: (error) {
          if (!mounted) return;
          setState(() {
            _busy = false;
            _error = _messageFor(error.code);
          });
        },
        codeSent: (verificationId, _) {
          if (!mounted) return;
          setState(() {
            _busy = false;
            _verificationId = verificationId;
          });
        },
        // Auto-retrieval gave up; the code screen is already showing, so nothing to do.
        codeAutoRetrievalTimeout: (verificationId) {
          if (mounted) _verificationId = verificationId;
        },
      );
    } on FirebaseAuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _messageFor(error.code);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = Strings.of(context)('verifyPhone.failed');
      });
    }
  }

  Future<void> _confirm() async {
    final id = _verificationId;
    if (id == null || !RegExp(r'^\d{6}$').hasMatch(_code.text)) {
      setState(() => _error = Strings.of(context)('verifyPhone.invalidCode'));
      return;
    }

    await _submit(
      PhoneAuthProvider.credential(verificationId: id, smsCode: _code.text),
    );
  }

  Future<void> _submit(PhoneAuthCredential credential) async {
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final result = await FirebaseAuth.instance.signInWithCredential(credential);
      final token = await result.user?.getIdToken();
      if (token == null) throw FirebaseAuthException(code: 'no-token');

      final phone = await ref.read(authRepositoryProvider).confirmPhone(token);

      // The Firebase account exists only to produce that assertion. Leaving it signed in on
      // the device would be a second identity nobody asked for and nothing else reads.
      await FirebaseAuth.instance.signOut();

      if (mounted) setState(() => _confirmed = phone);
    } on FirebaseAuthException catch (error) {
      if (mounted) setState(() => _error = _messageFor(error.code));
    } catch (error) {
      // The API's own message is worth showing: it says whether the number is already on
      // another account, which is the one failure the person has to act on.
      if (mounted) {
        final strings = Strings.of(context);
        setState(
          () => _error = error.toString().contains('another')
              ? strings('verifyPhone.inUse')
              : strings('verifyPhone.failed'),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _messageFor(String code) {
    final strings = Strings.of(context);
    return switch (code) {
      'invalid-phone-number' => strings('verifyPhone.invalidPhone'),
      'invalid-verification-code' => strings('verifyPhone.wrongCode'),
      'too-many-requests' => strings('verifyPhone.tooMany'),
      // Anything else is a Firebase code that means nothing to a shopkeeper.
      _ => strings('verifyPhone.failed'),
    };
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);

    if (_confirmed != null) {
      return Scaffold(
        backgroundColor: theme.colorScheme.surfaceContainerLowest,
        appBar: AppBar(title: Text(strings('account.confirmPhone'))),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(LoczSpacing.x5),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 420),
              padding: const EdgeInsets.all(LoczSpacing.x6),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainer,
                borderRadius: BorderRadius.circular(LoczRadius.xl),
                border: Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(LoczRadius.xl),
                    ),
                    child: Icon(
                      Icons.verified_rounded,
                      size: 34,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  const SizedBox(height: LoczSpacing.x4),
                  Text(
                    strings(
                      'verifyPhone.confirmed',
                      {'phone': _confirmed!},
                    ),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge,
                  ),
                  const SizedBox(height: LoczSpacing.x2),
                  Text(
                    strings('verifyPhone.trust'),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: LoczSpacing.x5),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => Navigator.of(context).pop(true),
                      child: Text(strings('report.done')),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final awaitingCode = _verificationId != null;

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(title: Text(strings('verifyPhone.title'))),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                LoczSpacing.x5,
                LoczSpacing.x3,
                LoczSpacing.x5,
                LoczSpacing.x6,
              ),
              children: [
                Container(
                  padding: const EdgeInsets.all(LoczSpacing.x5),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        theme.colorScheme.primaryContainer,
                        theme.colorScheme.surfaceContainer,
                      ],
                    ),
                    borderRadius: BorderRadius.circular(LoczRadius.xl),
                    border: Border.all(
                      color: theme.colorScheme.outlineVariant,
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(LoczRadius.lg),
                        ),
                        child: Icon(
                          Icons.phone_android_rounded,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      const SizedBox(width: LoczSpacing.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              strings('verifyPhone.title'),
                              style: theme.textTheme.titleLarge,
                            ),
                            const SizedBox(height: LoczSpacing.x2),
                            Text(
                              strings('verifyPhone.intro'),
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: LoczSpacing.x5),
                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(LoczSpacing.x3),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(LoczRadius.md),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.error_outline_rounded,
                          size: 19,
                          color: theme.colorScheme.onErrorContainer,
                        ),
                        const SizedBox(width: LoczSpacing.x2),
                        Expanded(
                          child: Text(
                            _error!,
                            style: TextStyle(
                              color: theme.colorScheme.onErrorContainer,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: LoczSpacing.x4),
                ],
                if (!awaitingCode)
                  TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    maxLength: 10,
                    autofillHints: const [
                      AutofillHints.telephoneNumberNational,
                    ],
                    decoration: InputDecoration(
                      labelText: strings('auth.phone'),
                      prefixText: '+91 ',
                      helperText: strings('register.phoneHint'),
                    ),
                  )
                else
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    autofocus: true,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    decoration: InputDecoration(
                      labelText: strings('verifyPhone.codeLabel'),
                      helperText: strings('verifyPhone.codeHint'),
                    ),
                  ),
                const SizedBox(height: LoczSpacing.x3),
                FilledButton.icon(
                  onPressed: _busy ? null : (awaitingCode ? _confirm : _send),
                  icon: _busy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          awaitingCode ? Icons.verified_user_outlined : Icons.sms_outlined,
                        ),
                  label: Text(
                    awaitingCode ? strings('auth.verify') : strings('auth.sendCode'),
                  ),
                ),
                if (awaitingCode)
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => setState(() {
                              _verificationId = null;
                              _code.clear();
                              _error = null;
                            }),
                    child: Text(strings('verifyPhone.differentNumber')),
                  ),
                const SizedBox(height: LoczSpacing.x4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.shield_outlined,
                      size: 17,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: LoczSpacing.x2),
                    Expanded(
                      child: Text(
                        strings('verifyPhone.trust'),
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
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
