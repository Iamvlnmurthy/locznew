import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';

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
      setState(() => _error = 'Enter a valid 10-digit mobile number.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    await FirebaseAuth.instance.verifyPhoneNumber(
      phoneNumber: '+91$national',
      // Android often reads the SMS itself and finishes without the user typing anything.
      // Handling it means those people never see the code screen at all.
      verificationCompleted: (credential) async {
        await _submit(credential);
      },
      verificationFailed: (error) {
        setState(() {
          _busy = false;
          _error = _messageFor(error.code);
        });
      },
      codeSent: (verificationId, _) {
        setState(() {
          _busy = false;
          _verificationId = verificationId;
        });
      },
      // Auto-retrieval gave up; the code screen is already showing, so nothing to do.
      codeAutoRetrievalTimeout: (verificationId) {
        _verificationId = verificationId;
      },
    );
  }

  Future<void> _confirm() async {
    final id = _verificationId;
    if (id == null || !RegExp(r'^\d{6}$').hasMatch(_code.text)) {
      setState(() => _error = 'Enter the six-digit code.');
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
      setState(() => _error = _messageFor(error.code));
    } catch (error) {
      // The API's own message is worth showing: it says whether the number is already on
      // another account, which is the one failure the person has to act on.
      setState(
        () => _error = error.toString().contains('another')
            ? 'That number is already on another LocZ account.'
            : 'We could not confirm that number. Try again.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _messageFor(String code) => switch (code) {
        'invalid-phone-number' => 'Enter a valid 10-digit mobile number.',
        'invalid-verification-code' => 'That code is not right. Check it and try again.',
        'too-many-requests' => 'Too many attempts. Wait a few minutes and try again.',
        // Anything else is a Firebase code that means nothing to a shopkeeper.
        _ => 'We could not confirm that number. Try again.',
      };

  @override
  Widget build(BuildContext context) {
    if (_confirmed != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Mobile number')),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.check_circle_outline, size: 48),
              const SizedBox(height: 16),
              Text('$_confirmed is confirmed.', textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      );
    }

    final awaitingCode = _verificationId != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Confirm your mobile number')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Confirming your number lets you claim a business and tells buyers they can '
              'reach you.',
            ),
            const SizedBox(height: 24),
            if (_error != null) ...[
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              const SizedBox(height: 16),
            ],
            if (!awaitingCode)
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                decoration: const InputDecoration(
                  labelText: 'Mobile number',
                  prefixText: '+91 ',
                  helperText: '10-digit Indian mobile number',
                ),
              )
            else
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Six-digit code',
                  helperText: 'Sent by SMS. It expires in a few minutes.',
                ),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : (awaitingCode ? _confirm : _send),
              child: _busy
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(awaitingCode ? 'Confirm' : 'Send code'),
            ),
            if (awaitingCode)
              TextButton(
                onPressed: _busy ? null : () => setState(() => _verificationId = null),
                child: const Text('Use a different number'),
              ),
          ],
        ),
      ),
    );
  }
}
