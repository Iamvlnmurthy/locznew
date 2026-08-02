import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.isRead,
    this.route,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool isRead;
  final String? route;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>? ?? const {};
    return AppNotification(
      id: json['id'] as String,
      type: json['type'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      isRead: json['readAt'] != null,
      route: data['route'] as String?,
    );
  }
}

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final json = await api.get<Map<String, dynamic>>('/notifications', query: {'limit': 50});
  return (json['items'] as List<dynamic>)
      .map((entry) => AppNotification.fromJson(entry as Map<String, dynamic>))
      .toList();
});

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final auth = ref.watch(authProvider);
    final notifications = auth.isSignedIn ? ref.watch(notificationsProvider) : null;
    final api = auth.isSignedIn ? ref.watch(apiClientProvider) : null;

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: Text(strings('account.notifications')),
        actions: auth.isSignedIn
            ? [
                TextButton(
                  onPressed: () async {
                    try {
                      await api!.post<void>('/notifications/read-all');
                      ref.invalidate(notificationsProvider);
                    } on ApiException catch (error) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(error.message)),
                      );
                    }
                  },
                  child: Text(strings('notifications.markAllRead')),
                ),
              ]
            : null,
      ),
      body: auth.isRestoring
          ? const Center(child: CircularProgressIndicator())
          : !auth.isSignedIn
              ? _SignedOutNotifications(strings: strings)
              : RefreshIndicator(
                  onRefresh: () async => ref.invalidate(notificationsProvider),
                  child: notifications!.when(
                    loading: () => const _NotificationLoading(),
                    error: (error, _) => ListView(
                      children: [
                        SizedBox(
                          height: MediaQuery.sizeOf(context).height * 0.68,
                          child: _NotificationState(
                            icon: Icons.cloud_off_outlined,
                            title: strings('common.error'),
                            body: strings('notifications.errorHint'),
                            action: OutlinedButton.icon(
                              onPressed: () => ref.invalidate(notificationsProvider),
                              icon: const Icon(Icons.refresh_rounded),
                              label: Text(strings('common.retry')),
                            ),
                          ),
                        ),
                      ],
                    ),
                    data: (items) {
                      if (items.isEmpty) {
                        return ListView(
                          children: [
                            SizedBox(
                              height: MediaQuery.sizeOf(context).height * 0.68,
                              child: _NotificationState(
                                icon: Icons.notifications_none_rounded,
                                title: strings('notifications.empty'),
                                body: strings('notifications.emptyHint'),
                              ),
                            ),
                          ],
                        );
                      }

                      return ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final notification = items[index];
                          return Card(
                            color: notification.isRead
                                ? null
                                : Theme.of(context)
                                    .colorScheme
                                    .primaryContainer
                                    .withValues(alpha: 0.45),
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 5,
                              ),
                              // Unread rows carry a tint rather than a dot: it survives a glance on
                              // a phone screen in daylight, which a 6px dot does not.
                              leading: CircleAvatar(
                                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                                child: Icon(
                                  _iconFor(notification.type),
                                  size: 19,
                                  color: Theme.of(context).colorScheme.primary,
                                ),
                              ),
                              title: Text(notification.title),
                              subtitle: Text(
                                notification.body,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              trailing: Text(
                                DateFormat.MMMd().format(notification.createdAt),
                                style: Theme.of(context).textTheme.labelSmall,
                              ),
                              onTap: () async {
                                try {
                                  await api!.post<void>(
                                    '/notifications/${notification.id}/read',
                                  );
                                  ref.invalidate(notificationsProvider);
                                } on ApiException catch (error) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text(error.message)),
                                    );
                                  }
                                }
                                final route = notification.route;
                                if (route != null && route.startsWith('/') && context.mounted) {
                                  await context.push(route);
                                }
                              },
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),
    );
  }

  IconData _iconFor(String type) => switch (type) {
        'LISTING_APPROVED' => Icons.check_circle_outline,
        'LISTING_REJECTED' => Icons.block_outlined,
        'LISTING_EXPIRING' || 'LISTING_EXPIRED' => Icons.schedule_outlined,
        'NEW_ENQUIRY' || 'NEW_MESSAGE' => Icons.chat_bubble_outline,
        'SAVED_SEARCH_MATCH' => Icons.search,
        'NEARBY_OFFER' => Icons.local_offer_outlined,
        _ => Icons.notifications_none,
      };
}

class _SignedOutNotifications extends StatelessWidget {
  const _SignedOutNotifications({required this.strings});

  final Strings strings;

  @override
  Widget build(BuildContext context) {
    return _NotificationState(
      icon: Icons.notifications_active_outlined,
      title: strings('notifications.signInTitle'),
      body: strings('notifications.signInHint'),
      action: FilledButton.icon(
        onPressed: () => context.push('/signin?next=/notifications'),
        icon: const Icon(Icons.login_rounded),
        label: Text(strings('nav.signIn')),
      ),
    );
  }
}

class _NotificationState extends StatelessWidget {
  const _NotificationState({
    required this.icon,
    required this.title,
    required this.body,
    this.action,
  });

  final IconData icon;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(LoczSpacing.x5),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 430),
          padding: const EdgeInsets.all(LoczSpacing.x6),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                theme.colorScheme.primaryContainer.withValues(alpha: 0.72),
                theme.colorScheme.surfaceContainer,
              ],
            ),
            borderRadius: BorderRadius.circular(LoczRadius.xl),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(LoczRadius.lg),
                ),
                child: Icon(icon, color: theme.colorScheme.primary, size: 28),
              ),
              const SizedBox(height: LoczSpacing.x4),
              Text(
                title,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: LoczSpacing.x2),
              Text(
                body,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              if (action != null) ...[
                const SizedBox(height: LoczSpacing.x5),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationLoading extends StatelessWidget {
  const _NotificationLoading();

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.all(LoczSpacing.x3),
        itemCount: 5,
        separatorBuilder: (_, __) => const SizedBox(height: LoczSpacing.x2),
        itemBuilder: (context, index) => const _NotificationLoadingTile(),
      );
}

class _NotificationLoadingTile extends StatelessWidget {
  const _NotificationLoadingTile();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fill = theme.colorScheme.surfaceContainerHighest;
    return Container(
      height: 90,
      padding: const EdgeInsets.all(LoczSpacing.x3),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(LoczRadius.lg),
      ),
      child: Row(
        children: [
          CircleAvatar(backgroundColor: fill),
          const SizedBox(width: LoczSpacing.x3),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FractionallySizedBox(
                  widthFactor: 0.55,
                  child: Container(height: 12, color: fill),
                ),
                const SizedBox(height: LoczSpacing.x2),
                FractionallySizedBox(
                  widthFactor: 0.86,
                  child: Container(height: 10, color: fill),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
