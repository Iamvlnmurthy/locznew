import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import 'device_lock_tile.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/domain/models.dart';
import '../../listings/presentation/widgets/listing_card.dart';

/// Account: own ads, saved ads, language and sign-out.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final auth = ref.watch(authProvider);

    if (!auth.isSignedIn) {
      return Scaffold(
        appBar: AppBar(title: Text(strings('nav.account'))),
        body: ListView(
          padding: const EdgeInsets.all(LoczSpacing.x4),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(LoczSpacing.x4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: Icon(
                        Icons.person_outline_rounded,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    const SizedBox(width: LoczSpacing.x3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            strings('nav.signIn'),
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 3),
                          Text(
                            strings('account.signInHint'),
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: LoczSpacing.x3),
                          FilledButton.icon(
                            onPressed: () => context.push('/signin?next=/account'),
                            icon: const Icon(Icons.login_rounded, size: 17),
                            label: Text(strings('nav.signIn')),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: LoczSpacing.x3),
            Card(
              child: Column(
                children: [
                  const DeviceLockTile(),
                  const Divider(),
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.brightness_6_outlined),
                    title: Text(strings('account.appearance')),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => _showAppearance(context),
                  ),
                  const Divider(),
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.translate_rounded),
                    title: Text(strings('account.language')),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      builder: (_) => const SafeArea(
                        child: _LanguageSelector(),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(auth.user!.displayName),
          bottom: TabBar(
            tabs: [
              Tab(text: strings('account.myAds')),
              Tab(text: strings('account.savedAds')),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.notifications_none),
              onPressed: () => context.push('/notifications'),
            ),
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'signout') {
                  await ref.read(authProvider.notifier).signOut();
                } else if (value == 'language' && context.mounted) {
                  await showModalBottomSheet<void>(
                    context: context,
                    builder: (_) => const Padding(
                      padding: EdgeInsets.all(LoczSpacing.x4),
                      child: _LanguageSelector(),
                    ),
                  );
                } else if (value == 'appearance' && context.mounted) {
                  await _showAppearance(context);
                }
              },
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: 'language',
                  child: Text(strings('account.language')),
                ),
                PopupMenuItem(
                  value: 'appearance',
                  child: Text(strings('account.appearance')),
                ),
                PopupMenuItem(
                  value: 'signout',
                  child: Text(strings('nav.signOut')),
                ),
              ],
            ),
          ],
        ),
        body: TabBarView(
          children: [
            _ListingsTab(
              provider: myListingsProvider,
              emptyMessage: strings('account.noAds'),
              showActions: true,
            ),
            _ListingsTab(
              provider: savedListingsProvider,
              emptyMessage: strings('feed.empty'),
              showActions: false,
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _showAppearance(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (_) => const SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          LoczSpacing.x4,
          0,
          LoczSpacing.x4,
          LoczSpacing.x4,
        ),
        child: _AppearanceSelector(),
      ),
    ),
  );
}

class _AppearanceSelector extends ConsumerWidget {
  const _AppearanceSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final current = ref.watch(themeModeProvider);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          strings('account.appearance'),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: LoczSpacing.x3),
        RadioGroup<ThemeMode>(
          groupValue: current,
          onChanged: (mode) {
            if (mode != null) ref.read(themeModeProvider.notifier).select(mode);
          },
          child: Column(
            children: [
              RadioListTile(
                value: ThemeMode.system,
                secondary: const Icon(Icons.settings_suggest_outlined),
                title: Text(strings('account.themeSystem')),
              ),
              RadioListTile(
                value: ThemeMode.light,
                secondary: const Icon(Icons.light_mode_outlined),
                title: Text(strings('account.themeLight')),
              ),
              RadioListTile(
                value: ThemeMode.dark,
                secondary: const Icon(Icons.dark_mode_outlined),
                title: Text(strings('account.themeDark')),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ListingsTab extends ConsumerWidget {
  const _ListingsTab({
    required this.provider,
    required this.emptyMessage,
    required this.showActions,
  });

  final AutoDisposeFutureProvider<List<ListingSummary>> provider;
  final String emptyMessage;
  final bool showActions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listings = ref.watch(provider);
    final textScale = MediaQuery.textScalerOf(context).scale(1);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(provider),
      child: listings.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ListView(
          children: [
            Padding(
              padding: const EdgeInsets.all(32),
              child: Text(error.toString()),
            ),
          ],
        ),
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              children: [
                const SizedBox(height: 120),
                Center(child: Text(emptyMessage)),
                const SizedBox(height: LoczSpacing.x4),
                Center(
                  child: FilledButton(
                    onPressed: () => context.push('/post'),
                    child: Text(Strings.of(context)('nav.post')),
                  ),
                ),
              ],
            );
          }

          if (!showActions) {
            return GridView.builder(
              padding: const EdgeInsets.all(LoczSpacing.x4),
              gridDelegate: listingCardGridDelegate(textScale),
              itemCount: items.length,
              itemBuilder: (context, index) => ListingCard(
                listing: items[index],
                onTap: () => context.push('/ad/${items[index].slug}'),
              ),
            );
          }

          // Own ads use rows: status and lifecycle actions matter more here than photos.
          return ListView.separated(
            padding: const EdgeInsets.all(LoczSpacing.x4),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: LoczSpacing.x3),
            itemBuilder: (context, index) => _OwnListingRow(listing: items[index]),
          );
        },
      ),
    );
  }
}

class _OwnListingRow extends ConsumerWidget {
  const _OwnListingRow({required this.listing});

  final ListingSummary listing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final strings = Strings.of(context);

    // Only the transitions the API will accept for the current status are offered.
    final commands = <String, String>{
      if (listing.status == 'PUBLISHED') 'pause': strings('account.actionPause'),
      if (listing.status == 'PAUSED') 'resume': strings('account.actionResume'),
      if (listing.status == 'PUBLISHED' || listing.status == 'PAUSED')
        'sold': strings('account.actionSold'),
      if (listing.status == 'EXPIRED' || listing.status == 'SOLD')
        'republish': strings('account.actionRepublish'),
      'delete': strings('account.actionDelete'),
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(LoczSpacing.x3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            InkWell(
              onTap: () => context.push('/ad/${listing.slug}'),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          listing.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${listing.status.toLowerCase().replaceAll('_', ' ')} · '
                          '${listing.viewCount} views',
                          style: theme.textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (commands.isNotEmpty) ...[
              const SizedBox(height: LoczSpacing.x2),
              Wrap(
                spacing: LoczSpacing.x2,
                runSpacing: LoczSpacing.x2,
                children: [
                  if (listing.status != 'REMOVED')
                    OutlinedButton.icon(
                      onPressed: () => context.push('/post/${listing.id}/edit'),
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      label: Text(
                        strings(
                          listing.status == 'DRAFT'
                              ? 'account.actionResumeDraft'
                              : 'account.actionEdit',
                        ),
                      ),
                    ),
                  for (final entry in commands.entries)
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 36),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        foregroundColor: entry.key == 'delete' ? theme.colorScheme.error : null,
                        side: entry.key == 'delete'
                            ? BorderSide(color: theme.colorScheme.error)
                            : null,
                      ),
                      onPressed: () async {
                        if (entry.key == 'delete') {
                          final confirmed = await showDialog<bool>(
                            context: context,
                            builder: (context) => AlertDialog(
                              title: Text(strings('account.deleteTitle')),
                              content: Text(strings('account.deleteConfirm')),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(context, false),
                                  child: Text(strings('common.cancel')),
                                ),
                                FilledButton(
                                  style: FilledButton.styleFrom(
                                    backgroundColor: theme.colorScheme.error,
                                    foregroundColor: theme.colorScheme.onError,
                                  ),
                                  onPressed: () => Navigator.pop(context, true),
                                  child: Text(strings('account.actionDelete')),
                                ),
                              ],
                            ),
                          );
                          if (confirmed != true || !context.mounted) return;
                        }

                        try {
                          await ref
                              .read(listingRepositoryProvider)
                              .listingCommand(listing.id, entry.key);
                          ref.invalidate(myListingsProvider);
                        } on ApiException catch (error) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(
                              context,
                            ).showSnackBar(
                              SnackBar(content: Text(error.message)),
                            );
                          }
                        }
                      },
                      child: Text(entry.value),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LanguageSelector extends ConsumerWidget {
  const _LanguageSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(localeProvider);

    return RadioGroup<AppLocaleOption>(
      groupValue: current,
      onChanged: (value) {
        if (value != null) ref.read(localeProvider.notifier).select(value);
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final option in AppLocaleOption.values)
            RadioListTile<AppLocaleOption>(
              value: option,
              title: Text(
                switch (option) {
                  AppLocaleOption.en => 'English',
                  AppLocaleOption.te => 'తెలుగు',
                  AppLocaleOption.hi => 'हिन्दी',
                },
              ),
            ),
        ],
      ),
    );
  }
}
