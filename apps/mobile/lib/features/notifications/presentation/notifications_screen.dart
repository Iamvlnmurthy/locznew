import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/providers.dart';

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
    final notifications = ref.watch(notificationsProvider);
    final api = ref.watch(apiClientProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(strings('account.notifications')),
        actions: [
          TextButton(
            onPressed: () async {
              await api.post<void>('/notifications/read-all');
              ref.invalidate(notificationsProvider);
            },
            child: Text(strings('notifications.markAllRead')),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(notificationsProvider),
        child: notifications.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            children: [
              Padding(padding: const EdgeInsets.all(32), child: Text('$error')),
            ],
          ),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 120),
                  Icon(
                    Icons.notifications_none_rounded,
                    size: 44,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(height: 12),
                  Center(child: Text(strings('notifications.empty'))),
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
                      : Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.45),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
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
                      await api.post<void>('/notifications/${notification.id}/read');
                      ref.invalidate(notificationsProvider);
                      if (notification.route != null && context.mounted) {
                        await context.push(notification.route!);
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
