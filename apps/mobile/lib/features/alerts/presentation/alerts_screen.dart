import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';

/// Alerts — "things LocZ is watching for you" (prompt §20), kept as a clear hub rather
/// than a generic notification dump. v1 organises the two capabilities that already exist
/// (notifications and saved searches); request responses and per-domain alerts slot in here
/// as they land.
class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        toolbarHeight: 60,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(strings('alerts.title'), style: theme.textTheme.titleLarge),
            Text(
              strings('alerts.subtitle'),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          _AlertEntry(
            icon: Icons.notifications_none_rounded,
            title: strings('alerts.notifications'),
            hint: strings('alerts.notificationsHint'),
            onTap: () => context.push('/notifications'),
          ),
          const SizedBox(height: 12),
          _AlertEntry(
            icon: Icons.bookmark_border_rounded,
            title: strings('alerts.savedSearches'),
            hint: strings('alerts.savedSearchesHint'),
            onTap: () => context.push('/saved-searches'),
          ),
        ],
      ),
    );
  }
}

class _AlertEntry extends StatelessWidget {
  const _AlertEntry({
    required this.icon,
    required this.title,
    required this.hint,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String hint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 21, color: theme.colorScheme.onPrimaryContainer),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      hint,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}
