import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../core/config/env.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key, this.redirectTo});

  final String? redirectTo;

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  late final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: const ['email'],
    serverClientId: Env.googleClientId,
  );

  bool _busy = false;
  bool _showPassword = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String? _validPhone(String? value) {
    final national = (value ?? '').replaceAll(RegExp(r'\D'), '');
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(national)) {
      return Strings.of(context)('auth.invalidPhone');
    }
    return null;
  }

  String? _validPassword(String? value) {
    if ((value ?? '').isEmpty) return Strings.of(context)('auth.missingPassword');
    return null;
  }

  Future<void> _submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final user = await ref.read(authRepositoryProvider).signInWithPassword(
            nationalNumber: _phoneController.text,
            password: _passwordController.text,
          );
      if (!mounted) return;

      ref.read(authProvider.notifier).setUser(user);
      final destination = widget.redirectTo;
      context.go(
        destination != null && destination.startsWith('/') && !destination.startsWith('//')
            ? destination
            : '/',
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.statusCode == 400 || error.statusCode == 401
            ? Strings.of(context)('auth.badCredentials')
            : error.message;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitGoogle() async {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final account = await _googleSignIn.signIn();
      if (account == null) return;

      final idToken = (await account.authentication).idToken;
      if (idToken == null || idToken.isEmpty) {
        if (mounted) setState(() => _error = Strings.of(context)('auth.googleFailed'));
        return;
      }

      final user = await ref.read(authRepositoryProvider).signInWithGoogle(idToken: idToken);
      if (!mounted) return;

      ref.read(authProvider.notifier).setUser(user);
      final destination = widget.redirectTo;
      context.go(
        destination != null && destination.startsWith('/') && !destination.startsWith('//')
            ? destination
            : '/',
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      final strings = Strings.of(context);
      setState(() {
        if (error.statusCode == 503) {
          _error = strings('auth.googleUnavailable');
        } else if (error.statusCode == 401 &&
            (error.message.toLowerCase().contains('mobile number first') ||
                error.message.toLowerCase().contains('no locz account'))) {
          _error = strings('auth.googleAccountRequired');
        } else {
          _error = strings('auth.googleFailed');
        }
      });
    } on PlatformException catch (error) {
      if (mounted && error.code != 'sign_in_canceled') {
        setState(() => _error = Strings.of(context)('auth.googleFailed'));
      }
    } catch (_) {
      if (mounted) setState(() => _error = Strings.of(context)('auth.googleFailed'));
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
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  LoczSpacing.x5,
                  LoczSpacing.x2,
                  LoczSpacing.x5,
                  LoczSpacing.x6,
                ),
                children: [
                  Row(
                    children: [
                      Image.asset(
                        'assets/brand/locz-mark.png',
                        width: 38,
                        height: 38,
                        semanticLabel: strings('register.brandLabel'),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'LocZ',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.4,
                            ),
                          ),
                          Text(
                            strings('register.freeAccount'),
                            style: theme.textTheme.labelSmall,
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: LoczSpacing.x8),
                  Text(
                    strings('auth.signInTitle'),
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: LoczSpacing.x2),
                  Text(
                    strings('auth.signInSubtitle'),
                    style: theme.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: LoczSpacing.x6),
                  if (_error != null)
                    Container(
                      padding: const EdgeInsets.all(LoczSpacing.x3),
                      margin: const EdgeInsets.only(bottom: LoczSpacing.x4),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(LoczRadius.md),
                      ),
                      child: Text(
                        _error!,
                        key: const Key('signin-error'),
                        style: TextStyle(color: theme.colorScheme.onErrorContainer),
                      ),
                    ),
                  AutofillGroup(
                    child: Column(
                      children: [
                        TextFormField(
                          key: const Key('signin-phone'),
                          controller: _phoneController,
                          enabled: !_busy,
                          autofocus: true,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.telephoneNumberNational],
                          maxLength: 10,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: InputDecoration(
                            labelText: strings('auth.phone'),
                            prefixText: '+91 ',
                            counterText: '',
                          ),
                          validator: _validPhone,
                        ),
                        const SizedBox(height: LoczSpacing.x4),
                        TextFormField(
                          key: const Key('signin-password'),
                          controller: _passwordController,
                          enabled: !_busy,
                          obscureText: !_showPassword,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.password],
                          decoration: InputDecoration(
                            labelText: strings('auth.password'),
                            suffixIcon: IconButton(
                              tooltip: strings(
                                _showPassword ? 'register.hidePassword' : 'register.showPassword',
                              ),
                              onPressed: _busy
                                  ? null
                                  : () => setState(() => _showPassword = !_showPassword),
                              icon: Icon(
                                _showPassword
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                              ),
                            ),
                          ),
                          validator: _validPassword,
                          onFieldSubmitted: (_) => _busy ? null : _submit(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: LoczSpacing.x5),
                  FilledButton(
                    key: const Key('signin-submit'),
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(strings('auth.signIn')),
                  ),
                  if (Env.isGoogleSignInConfigured) ...[
                    const SizedBox(height: LoczSpacing.x5),
                    Row(
                      children: [
                        const Expanded(child: Divider()),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: LoczSpacing.x3),
                          child: Text(
                            strings('auth.googleDivider'),
                            style: theme.textTheme.labelSmall,
                          ),
                        ),
                        const Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: LoczSpacing.x3),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        key: const Key('signin-google'),
                        onPressed: _busy ? null : _submitGoogle,
                        icon: const ExcludeSemantics(
                          child: Text(
                            'G',
                            style: TextStyle(
                              color: Color(0xFF4285F4),
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        label: Text(strings('auth.googleButton')),
                      ),
                    ),
                  ],
                  const SizedBox(height: LoczSpacing.x3),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(
                        child: Text(
                          strings('register.newHere'),
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => context.push(
                                  Uri(
                                    path: '/register',
                                    queryParameters: {
                                      if (widget.redirectTo != null) 'next': widget.redirectTo,
                                    },
                                  ).toString(),
                                ),
                        child: Text(strings('register.createAccount')),
                      ),
                    ],
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.lock_outline_rounded,
                        size: 15,
                        color: theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        strings('auth.privacy'),
                        style: theme.textTheme.labelSmall,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
