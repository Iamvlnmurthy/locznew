import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../i18n/strings.dart';
import 'app_update.dart';

/// Offers a newer build when one has been published.
///
/// Android will not let an app silently replace itself — installing an APK always requires
/// the user to confirm, and rightly so. "Auto-update" for a sideloaded app therefore means
/// *noticing* automatically and making the update one tap away, not installing behind
/// somebody's back. This checks on launch and hands the download to the system, which then
/// runs the normal install prompt.
///
/// Dismissible, and dismissal is remembered per version: a tester who is mid-task should not
/// be nagged, but a *later* build should ask again rather than inheriting the dismissal.
class UpdateBanner extends StatefulWidget {
  const UpdateBanner({this.checker, super.key});

  final AppUpdateChecker? checker;

  @override
  State<UpdateBanner> createState() => _UpdateBannerState();
}

class _UpdateBannerState extends State<UpdateBanner> {
  late final AppUpdateChecker _checker = widget.checker ?? AppUpdateChecker();

  AvailableUpdate? _update;
  int? _dismissedCode;

  @override
  void initState() {
    super.initState();
    unawaited(_check());
  }

  Future<void> _check() async {
    final update = await _checker.check();
    if (mounted && update != null) setState(() => _update = update);
  }

  @override
  Widget build(BuildContext context) {
    final update = _update;
    if (update == null || _dismissedCode == update.versionCode) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final strings = Strings.of(context);

    return Material(
      color: theme.colorScheme.primaryContainer,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final message = Text(
            strings(
              'update.available',
              {'version': update.versionName, 'size': update.sizeLabel},
            ),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onPrimaryContainer,
            ),
          );
          final action = TextButton(
            onPressed: () => unawaited(
              // Handed to the browser rather than downloaded in-process: the system
              // download manager survives the app being closed, shows progress in the
              // notification shade, and triggers the install prompt on completion.
              launchUrl(
                Uri.parse(update.url),
                mode: LaunchMode.externalApplication,
              ),
            ),
            child: Text(strings('update.action')),
          );
          final dismiss = IconButton(
            tooltip: strings('update.dismiss'),
            icon: const Icon(Icons.close),
            onPressed: () => setState(() => _dismissedCode = update.versionCode),
          );

          if (constraints.maxWidth < 430) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 4, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Icon(
                      Icons.system_update,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        message,
                        Align(alignment: Alignment.centerLeft, child: action),
                      ],
                    ),
                  ),
                  dismiss,
                ],
              ),
            );
          }

          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
            child: Row(
              children: [
                Icon(
                  Icons.system_update,
                  color: theme.colorScheme.onPrimaryContainer,
                ),
                const SizedBox(width: 12),
                Expanded(child: message),
                action,
                dismiss,
              ],
            ),
          );
        },
      ),
    );
  }
}
