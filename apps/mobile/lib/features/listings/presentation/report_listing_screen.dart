import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';

class ReportListingScreen extends ConsumerStatefulWidget {
  const ReportListingScreen({super.key, required this.listingId});

  final String listingId;

  @override
  ConsumerState<ReportListingScreen> createState() => _ReportListingScreenState();
}

class _ReportListingScreenState extends ConsumerState<ReportListingScreen> {
  final _detailsController = TextEditingController();
  String? _reason;
  String? _error;
  bool _busy = false;
  bool _sent = false;

  static const _reasons = <(String, String)>[
    ('SPAM', 'report.reason.spam'),
    ('FRAUD_OR_SCAM', 'report.reason.fraud'),
    ('PROHIBITED_ITEM', 'report.reason.prohibited'),
    ('MISLEADING_PRICE', 'report.reason.price'),
    ('WRONG_CATEGORY', 'report.reason.category'),
    ('DUPLICATE', 'report.reason.duplicate'),
    ('ALREADY_SOLD', 'report.reason.sold'),
    ('OFFENSIVE_CONTENT', 'report.reason.offensive'),
    ('HARASSMENT', 'report.reason.harassment'),
    ('OTHER', 'report.reason.other'),
  ];

  @override
  void dispose() {
    _detailsController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final strings = Strings.of(context);
    if (_reason == null) {
      setState(() => _error = strings('report.chooseReason'));
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(listingRepositoryProvider).reportListing(
            listingId: widget.listingId,
            reason: _reason!,
            details: _detailsController.text,
          );
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final auth = ref.watch(authProvider);
    final theme = Theme.of(context);

    if (!auth.isRestoring && !auth.isSignedIn) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final next = Uri(path: '/report', queryParameters: {'listing': widget.listingId});
        context.go(Uri(path: '/signin', queryParameters: {'next': next.toString()}).toString());
      });
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(title: Text(strings('listing.report'))),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: _sent
                ? Padding(
                    padding: const EdgeInsets.all(LoczSpacing.x5),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.verified_outlined,
                          size: 58,
                          color: theme.colorScheme.primary,
                        ),
                        const SizedBox(height: LoczSpacing.x4),
                        Text(
                          strings('report.success'),
                          style: theme.textTheme.titleMedium,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: LoczSpacing.x5),
                        FilledButton(
                          onPressed: () => context.pop(),
                          child: Text(strings('report.done')),
                        ),
                      ],
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(
                      LoczSpacing.x4,
                      LoczSpacing.x3,
                      LoczSpacing.x4,
                      LoczSpacing.x6,
                    ),
                    children: [
                      Text(strings('report.reason'), style: theme.textTheme.titleMedium),
                      const SizedBox(height: LoczSpacing.x3),
                      Card(
                        clipBehavior: Clip.antiAlias,
                        child: IgnorePointer(
                          ignoring: _busy,
                          child: RadioGroup<String>(
                            groupValue: _reason,
                            onChanged: (value) => setState(() {
                              _reason = value;
                              _error = null;
                            }),
                            child: Column(
                              children: [
                                for (var index = 0; index < _reasons.length; index++) ...[
                                  RadioListTile<String>(
                                    value: _reasons[index].$1,
                                    title: Text(strings(_reasons[index].$2)),
                                    dense: true,
                                  ),
                                  if (index != _reasons.length - 1) const Divider(height: 1),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: LoczSpacing.x4),
                      TextField(
                        controller: _detailsController,
                        enabled: !_busy,
                        minLines: 3,
                        maxLines: 5,
                        maxLength: 1000,
                        decoration: InputDecoration(
                          labelText: strings('report.details'),
                          alignLabelWithHint: true,
                        ),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: LoczSpacing.x2),
                        Text(
                          _error!,
                          key: const Key('report-error'),
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                      ],
                      const SizedBox(height: LoczSpacing.x4),
                      FilledButton.icon(
                        key: const Key('report-submit'),
                        onPressed: _busy ? null : _submit,
                        icon: _busy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.flag_outlined),
                        label: Text(
                          strings(_busy ? 'report.sending' : 'report.submit'),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
