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
  ConsumerState<SavedSearchesScreen> createState() =>
      _SavedSearchesScreenState();
}

class _SavedSearchesScreenState extends ConsumerState<SavedSearchesScreen> {
  late Future<List<SavedSearch>> _items;
  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() =>
      _items = ref.read(listingRepositoryProvider).savedSearches();

  Future<void> _toggle(SavedSearch search, bool active) async {
    try {
      await ref
          .read(listingRepositoryProvider)
          .setSavedSearchActive(search.id, active: active);
      setState(_reload);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
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
              child: Text(strings('common.cancel')),),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(strings('savedSearches.delete')),),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(listingRepositoryProvider).deleteSavedSearch(search.id);
    if (mounted) setState(_reload);
  }

  void _open(SavedSearch search) {
    final filters = search.filters;
    context.push(Uri(path: '/search', queryParameters: {
      if (search.query != null) 'q': search.query!,
      if (filters['type'] != null) 'type': '${filters['type']}',
      if (filters['categoryId'] != null) 'category': '${filters['categoryId']}',
    },).toString(),);
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(strings('savedSearches.title'))),
      body: FutureBuilder<List<SavedSearch>>(
        future: _items,
        builder: (context, snapshot) {
          if (!snapshot.hasData && !snapshot.hasError) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }
          final items = snapshot.data!;
          if (items.isEmpty) {
            return Center(
                child: Padding(
              padding: const EdgeInsets.all(LoczSpacing.x6),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.notifications_active_outlined, size: 48),
                const SizedBox(height: LoczSpacing.x3),
                Text(strings('savedSearches.empty'),
                    style: Theme.of(context).textTheme.titleLarge,),
                const SizedBox(height: 5),
                Text(strings('savedSearches.emptyHint'),
                    textAlign: TextAlign.center,),
              ],),
            ),);
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
                    child: Icon(item.isActive
                        ? Icons.notifications_active
                        : Icons.notifications_off_outlined,),),
                title: Text(item.label),
                subtitle: Text(item.isActive
                    ? strings('savedSearches.alertsOn')
                    : strings('savedSearches.alertsPaused'),),
                trailing: PopupMenuButton<String>(
                  onSelected: (value) => value == 'delete'
                      ? _delete(item)
                      : _toggle(item, !item.isActive),
                  itemBuilder: (_) => [
                    PopupMenuItem(
                        value: 'toggle',
                        child: Text(item.isActive
                            ? strings('savedSearches.pause')
                            : strings('savedSearches.resume'),),),
                    PopupMenuItem(
                        value: 'delete',
                        child: Text(strings('savedSearches.delete')),),
                  ],
                ),
              ),);
            },
          );
        },
      ),
    );
  }
}
