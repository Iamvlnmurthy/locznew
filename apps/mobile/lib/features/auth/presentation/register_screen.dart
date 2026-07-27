import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, this.redirectTo});

  final String? redirectTo;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  bool _busy = false;
  bool _showPassword = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  String? _validName(String? value) {
    if ((value ?? '').trim().length < 2) {
      return Strings.of(context)('register.invalidName');
    }
    return null;
  }

  String? _validPhone(String? value) {
    final national = (value ?? '').replaceAll(RegExp(r'\D'), '');
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(national)) {
      return Strings.of(context)('auth.invalidPhone');
    }
    return null;
  }

  String? _validPassword(String? value) {
    if ((value ?? '').length < 8) {
      return Strings.of(context)('register.shortPassword');
    }
    return null;
  }

  String? _validConfirmation(String? value) {
    if (value != _passwordController.text) {
      return Strings.of(context)('register.passwordMismatch');
    }
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
      final user = await ref.read(authRepositoryProvider).register(
            displayName: _nameController.text,
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
        _error =
            error.statusCode == 409 ? Strings.of(context)('register.phoneTaken') : error.message;
      });
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
                  const SizedBox(height: LoczSpacing.x6),
                  Text(
                    strings('register.title'),
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: LoczSpacing.x2),
                  Text(
                    strings('register.subtitle'),
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
                        key: const Key('register-error'),
                        style: TextStyle(color: theme.colorScheme.onErrorContainer),
                      ),
                    ),
                  AutofillGroup(
                    child: Column(
                      children: [
                        TextFormField(
                          key: const Key('register-name'),
                          controller: _nameController,
                          enabled: !_busy,
                          textCapitalization: TextCapitalization.words,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.name],
                          decoration: InputDecoration(
                            labelText: strings('register.name'),
                            helperText: strings('register.nameHint'),
                          ),
                          validator: _validName,
                        ),
                        const SizedBox(height: LoczSpacing.x4),
                        TextFormField(
                          key: const Key('register-phone'),
                          controller: _phoneController,
                          enabled: !_busy,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.telephoneNumberNational],
                          maxLength: 10,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: InputDecoration(
                            labelText: strings('auth.phone'),
                            prefixText: '+91 ',
                            helperText: strings('register.phoneHint'),
                            counterText: '',
                          ),
                          validator: _validPhone,
                        ),
                        const SizedBox(height: LoczSpacing.x4),
                        TextFormField(
                          key: const Key('register-password'),
                          controller: _passwordController,
                          enabled: !_busy,
                          obscureText: !_showPassword,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.newPassword],
                          decoration: InputDecoration(
                            labelText: strings('register.password'),
                            helperText: strings('register.passwordHint'),
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
                        ),
                        const SizedBox(height: LoczSpacing.x4),
                        TextFormField(
                          key: const Key('register-confirm'),
                          controller: _confirmController,
                          enabled: !_busy,
                          obscureText: !_showPassword,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.newPassword],
                          decoration: InputDecoration(
                            labelText: strings('register.confirmPassword'),
                          ),
                          validator: _validConfirmation,
                          onFieldSubmitted: (_) => _busy ? null : _submit(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: LoczSpacing.x5),
                  FilledButton(
                    key: const Key('register-submit'),
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(strings('register.submit')),
                  ),
                  const SizedBox(height: LoczSpacing.x3),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(
                        child: Text(
                          strings('register.haveAccount'),
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => context.go(
                                  Uri(
                                    path: '/signin',
                                    queryParameters: {
                                      if (widget.redirectTo != null) 'next': widget.redirectTo,
                                    },
                                  ).toString(),
                                ),
                        child: Text(strings('nav.signIn')),
                      ),
                    ],
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.verified_user_outlined,
                        size: 15,
                        color: theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          strings('register.privacy'),
                          style: theme.textTheme.labelSmall,
                          textAlign: TextAlign.center,
                        ),
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
