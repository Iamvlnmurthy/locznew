import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import 'device_lock_tile.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/domain/models.dart';
import '../../listings/presentation/listing_navigation.dart';
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
        appBar: AppBar(
          toolbarHeight: 56,
          scrolledUnderElevation: 0,
          title: Text(strings('nav.account')),
        ),
        body: ListView(
          padding: const EdgeInsets.all(LoczSpacing.x4),
          children: [
            _SignedOutAccountHero(
              title: strings('nav.signIn'),
              hint: strings('account.signInHint'),
              onPressed: () => context.push('/signin?next=/account'),
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
          title: Text(strings('nav.account')),
          actions: [
            IconButton(
              icon: const Icon(Icons.notifications_none),
              tooltip: strings('account.notifications'),
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
                } else if (value == 'saved-searches' && context.mounted) {
                  await context.push('/saved-searches');
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
                  value: 'saved-searches',
                  child: Text(strings('savedSearches.title')),
                ),
                PopupMenuItem(
                  value: 'signout',
                  child: Text(strings('nav.signOut')),
                ),
              ],
            ),
          ],
        ),
        body: Column(
          children: [
            _AccountHeader(
              displayName: auth.user!.displayName,
              phone: auth.user!.phone,
              hint: strings('account.signInHint'),
              postLabel: strings('feed.postFree'),
              onPost: () => context.push('/post'),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                LoczSpacing.x4,
                0,
                LoczSpacing.x4,
                LoczSpacing.x2,
              ),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: TabBar(
                  dividerColor: Colors.transparent,
                  indicatorSize: TabBarIndicatorSize.tab,
                  indicator: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: [
                      BoxShadow(
                        color: Theme.of(context).colorScheme.shadow.withValues(alpha: 0.06),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  tabs: [
                    Tab(text: strings('account.myAds')),
                    Tab(text: strings('account.savedAds')),
                  ],
                ),
              ),
            ),
            Expanded(
              child: TabBarView(
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
          ],
        ),
      ),
    );
  }
}

class _SignedOutAccountHero extends StatelessWidget {
  const _SignedOutAccountHero({
    required this.title,
    required this.hint,
    required this.onPressed,
  });

  final String title;
  final String hint;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: isDark
                ? const [Color(0xFF08251F), Color(0xFF104D40)]
                : const [Color(0xFF073C32), Color(0xFF0B6854)],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              right: -44,
              top: -54,
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: .09),
                  ),
                ),
              ),
            ),
            Positioned(
              right: 16,
              top: 8,
              child: Container(
                width: 82,
                height: 82,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: .04),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: .12),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: .14),
                      ),
                    ),
                    child: const Icon(
                      Icons.person_outline_rounded,
                      color: Color(0xFF9BE8D5),
                      size: 23,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    title,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -.45,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    hint,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: Colors.white.withValues(alpha: .74),
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: onPressed,
                      icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                      iconAlignment: IconAlignment.end,
                      label: Text(title),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(46),
                        backgroundColor: const Color(0xFFF2FAF7),
                        foregroundColor: const Color(0xFF073C32),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountHeader extends StatelessWidget {
  const _AccountHeader({
    required this.displayName,
    required this.phone,
    required this.hint,
    required this.postLabel,
    required this.onPost,
  });

  final String displayName;

  /// Null until a Google sign-up confirms a number.
  final String? phone;
  final String hint;
  final String postLabel;
  final VoidCallback onPost;

  String? get _maskedPhone {
    final value = phone;
    if (value == null) return null;
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 4) return value;
    return '••••••${digits.substring(digits.length - 4)}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final initial = displayName.trim().isEmpty ? 'L' : displayName.trim()[0].toUpperCase();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              theme.colorScheme.primaryContainer,
              theme.colorScheme.surface,
            ],
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) => Row(
            children: [
              Container(
                width: 52,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  borderRadius: BorderRadius.circular(17),
                ),
                child: Text(
                  initial,
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: theme.colorScheme.onPrimary,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(displayName, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 2),
                    // Nothing at all rather than an empty line: an account created by
                    // Google sign-up has no number, and the prompt to add one belongs on
                    // the verify screen this account list already links to.
                    if (_maskedPhone != null) ...[
                      Text(_maskedPhone!, style: theme.textTheme.labelSmall),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      hint,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelSmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (constraints.maxWidth < 300)
                IconButton.filled(
                  onPressed: onPost,
                  tooltip: postLabel,
                  icon: const Icon(Icons.add_rounded, size: 19),
                )
              else
                FilledButton.icon(
                  onPressed: onPost,
                  icon: const Icon(Icons.add_rounded, size: 17),
                  label: Text(postLabel),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
            ],
          ),
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
                heroTag: 'account-${items[index].id}',
                onTap: () => context.push(
                  '/ad/${items[index].slug}',
                  extra: ListingNavigationPreview(
                    listing: items[index],
                    heroTag: 'account-${items[index].id}',
                  ),
                ),
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

    final (statusBackground, statusForeground) = switch (listing.status) {
      'PUBLISHED' => (
          theme.colorScheme.primaryContainer,
          theme.colorScheme.onPrimaryContainer,
        ),
      'PENDING_REVIEW' => (
          theme.colorScheme.tertiaryContainer,
          theme.colorScheme.onTertiaryContainer,
        ),
      'REJECTED' || 'REMOVED' => (
          theme.colorScheme.errorContainer,
          theme.colorScheme.onErrorContainer,
        ),
      _ => (
          theme.colorScheme.surfaceContainerHighest,
          theme.colorScheme.onSurfaceVariant,
        ),
    };

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.shadow.withValues(alpha: .05),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Column(
          children: [
            InkWell(
              onTap: () => context.push('/ad/${listing.slug}'),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: SizedBox(
                        width: 82,
                        height: 82,
                        child: listing.thumbUrl == null
                            ? ColoredBox(
                                color: theme.colorScheme.surfaceContainerHigh,
                                child: Icon(
                                  Icons.photo_outlined,
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              )
                            : CachedNetworkImage(
                                imageUrl: listing.thumbUrl!,
                                fit: BoxFit.cover,
                                errorWidget: (context, _, __) => ColoredBox(
                                  color: theme.colorScheme.surfaceContainerHigh,
                                  child: const Icon(Icons.broken_image_outlined),
                                ),
                              ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: statusBackground,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              strings('account.status.${listing.status}'),
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: statusForeground,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(height: 7),
                          Text(
                            listing.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              height: 1.3,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Row(
                            children: [
                              Icon(
                                Icons.visibility_outlined,
                                size: 14,
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                strings(
                                  'listing.views',
                                  {'count': listing.viewCount},
                                ),
                                style: theme.textTheme.labelSmall,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ],
                ),
              ),
            ),
            Divider(height: 1, color: theme.colorScheme.outlineVariant),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 8, 6),
              child: Row(
                children: [
                  if (listing.status != 'REMOVED')
                    FilledButton.tonalIcon(
                      onPressed: () => context.push('/post/${listing.id}/edit'),
                      icon: Icon(
                        listing.status == 'DRAFT' ? Icons.play_arrow_rounded : Icons.edit_outlined,
                        size: 16,
                      ),
                      label: Text(
                        strings(
                          listing.status == 'DRAFT'
                              ? 'account.actionResumeDraft'
                              : 'account.actionEdit',
                        ),
                      ),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 38),
                        padding: const EdgeInsets.symmetric(horizontal: 13),
                      ),
                    ),
                  const Spacer(),
                  PopupMenuButton<String>(
                    tooltip: strings('account.moreActions'),
                    onSelected: (command) => _runCommand(context, ref, command, strings, theme),
                    itemBuilder: (context) => [
                      for (final entry in commands.entries)
                        PopupMenuItem(
                          value: entry.key,
                          child: Row(
                            children: [
                              Icon(
                                _commandIcon(entry.key),
                                size: 18,
                                color: entry.key == 'delete' ? theme.colorScheme.error : null,
                              ),
                              const SizedBox(width: 10),
                              Text(
                                entry.value,
                                style: entry.key == 'delete'
                                    ? TextStyle(color: theme.colorScheme.error)
                                    : null,
                              ),
                            ],
                          ),
                        ),
                    ],
                    icon: const Icon(Icons.more_horiz_rounded),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _commandIcon(String command) => switch (command) {
        'pause' => Icons.pause_circle_outline_rounded,
        'resume' || 'republish' => Icons.play_circle_outline_rounded,
        'sold' => Icons.check_circle_outline_rounded,
        'delete' => Icons.delete_outline_rounded,
        _ => Icons.more_horiz_rounded,
      };

  Future<void> _runCommand(
    BuildContext context,
    WidgetRef ref,
    String command,
    Strings strings,
    ThemeData theme,
  ) async {
    if (command == 'delete') {
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
      await ref.read(listingRepositoryProvider).listingCommand(listing.id, command);
      ref.invalidate(myListingsProvider);
    } on ApiException catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
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
