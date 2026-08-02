import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../domain/models.dart';

class SavedSearchesScreen extends ConsumerStatefulWidget {
  const SavedSearchesScreen({super.key});
  @override
  ConsumerState<SavedSearchesScreen> createState() => _SavedSearchesScreenState();
}

class _SavedSearchesScreenState extends ConsumerState<SavedSearchesScreen> {
  late Future<List<SavedSearch>> _items;
  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() => _items = ref.read(listingRepositoryProvider).savedSearches();

  Future<void> _toggle(SavedSearch search, bool active) async {
    try {
      await ref.read(listingRepositoryProvider).setSavedSearchActive(search.id, active: active);
      setState(_reload);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _delete(SavedSearch search) async {
    final strings = Strings.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(strings('savedSearches.deleteTitle')),
        content: Text(strings('savedSearches.deleteHint')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(strings('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(strings('savedSearches.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(listingRepositoryProvider).deleteSavedSearch(search.id);
      if (mounted) setState(_reload);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  void _open(SavedSearch search) {
    final filters = search.filters;
    final rawAttributes = filters['attr'] ?? filters['attributes'];
    final attributes = rawAttributes is List
        ? rawAttributes.map((value) => '$value').toList()
        : rawAttributes is String && rawAttributes.isNotEmpty
            ? [rawAttributes]
            : const <String>[];
    context.push(
      Uri(
        path: '/search',
        queryParameters: <String, dynamic>{
          if (search.query != null) 'q': search.query!,
          if (filters['type'] != null) 'type': '${filters['type']}',
          if (filters['categoryId'] != null) 'category': '${filters['categoryId']}',
          if (attributes.isNotEmpty) 'attr': attributes,
        },
      ).toString(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
      appBar: AppBar(title: Text(strings('savedSearches.title'))),
      body: FutureBuilder<List<SavedSearch>>(
        future: _items,
        builder: (context, snapshot) {
          if (!snapshot.hasData && !snapshot.hasError) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _SavedSearchState(
              icon: Icons.cloud_off_outlined,
              title: strings('common.error'),
              body: strings('notifications.errorHint'),
              action: OutlinedButton.icon(
                onPressed: () => setState(_reload),
                icon: const Icon(Icons.refresh_rounded),
                label: Text(strings('common.retry')),
              ),
            );
          }
          final items = snapshot.data!;
          if (items.isEmpty) {
            return _SavedSearchState(
              icon: Icons.notifications_active_outlined,
              title: strings('savedSearches.empty'),
              body: strings('savedSearches.emptyHint'),
              action: FilledButton.icon(
                onPressed: () => context.go('/search'),
                icon: const Icon(Icons.search_rounded),
                label: Text(strings('nav.search')),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(LoczSpacing.x4),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: LoczSpacing.x2),
            itemBuilder: (context, index) {
              final item = items[index];
              return Card(
                child: ListTile(
                  onTap: () => _open(item),
                  leading: CircleAvatar(
                    child: Icon(
                      item.isActive ? Icons.notifications_active : Icons.notifications_off_outlined,
                    ),
                  ),
                  title: Text(item.label),
                  subtitle: Text(
                    item.isActive
                        ? strings('savedSearches.alertsOn')
                        : strings('savedSearches.alertsPaused'),
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (value) =>
                        value == 'delete' ? _delete(item) : _toggle(item, !item.isActive),
                    itemBuilder: (_) => [
                      PopupMenuItem(
                        value: 'toggle',
                        child: Text(
                          item.isActive
                              ? strings('savedSearches.pause')
                              : strings('savedSearches.resume'),
                        ),
                      ),
                      PopupMenuItem(
                        value: 'delete',
                        child: Text(
                          strings('savedSearches.delete'),
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _SavedSearchState extends StatelessWidget {
  const _SavedSearchState({
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
              Icon(icon, size: 42, color: theme.colorScheme.primary),
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
