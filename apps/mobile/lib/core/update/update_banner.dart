import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../i18n/strings.dart';
import 'app_update.dart';

/// Offers a newer build when one has been published, and installs it **within the app**.
///
/// Android will not let an app silently replace itself — installing an APK always requires
/// the user to confirm at the system prompt, and rightly so. But the download itself happens
/// in-process here (with visible progress) and is handed straight to the package installer via
/// [OpenFilex], rather than bouncing the user out to a browser. The app must hold
/// REQUEST_INSTALL_PACKAGES and the user must allow installs from this source once.
///
/// Dismissible, and dismissal is remembered per version: a tester mid-task should not be
/// nagged, but a *later* build asks again rather than inheriting the dismissal.
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
  bool _downloading = false;
  double _progress = 0;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_check());
  }

  Future<void> _check() async {
    final update = await _checker.check();
    if (mounted && update != null) setState(() => _update = update);
  }

  Future<void> _downloadAndInstall(AvailableUpdate update) async {
    setState(() {
      _downloading = true;
      _failed = false;
      _progress = 0;
    });
    try {
      final dir = await getTemporaryDirectory();
      final file = '${dir.path}/locz-${update.versionCode}.apk';
      // Remove a partial file from an interrupted attempt so the installer never sees it.
      final existing = File(file);
      if (existing.existsSync()) await existing.delete();

      await Dio().download(
        update.url,
        file,
        onReceiveProgress: (received, total) {
          if (total > 0 && mounted) setState(() => _progress = received / total);
        },
      );

      // Verify the download against the checksum in the manifest before handing it to the
      // system installer. A tampered manifest or a man-in-the-middle on the download would
      // fail here rather than installing a foreign APK. Mismatch => delete and surface failure.
      final digest = await sha256.bind(File(file).openRead()).first;
      if (digest.toString() != update.sha256) {
        await File(file).delete();
        if (mounted) setState(() => _failed = true);
        return;
      }

      final result = await OpenFilex.open(file, type: 'application/vnd.android.package-archive');
      // The system installer now owns the flow; a non-'done' result means it could not be
      // launched (e.g. install-from-source not yet allowed), so let the user retry.
      if (result.type != ResultType.done && mounted) {
        setState(() => _failed = true);
      }
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
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
            _downloading
                ? strings('update.downloading', {'percent': '${(_progress * 100).round()}'})
                : _failed
                    ? strings('update.failed')
                    : strings(
                        'update.available',
                        {'version': update.versionName, 'size': update.sizeLabel},
                      ),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onPrimaryContainer,
            ),
          );
          final action = _downloading
              ? SizedBox(
                  width: 96,
                  child: LinearProgressIndicator(
                    value: _progress > 0 ? _progress : null,
                  ),
                )
              : TextButton(
                  onPressed: () => unawaited(_downloadAndInstall(update)),
                  child: Text(strings(_failed ? 'update.retry' : 'update.action')),
                );
          final dismiss = IconButton(
            tooltip: strings('update.dismiss'),
            icon: const Icon(Icons.close),
            onPressed:
                _downloading ? null : () => setState(() => _dismissedCode = update.versionCode),
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
