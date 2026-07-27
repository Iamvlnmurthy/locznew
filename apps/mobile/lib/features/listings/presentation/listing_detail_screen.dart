import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../domain/models.dart';
import 'widgets/listing_card.dart';

class ListingDetailScreen extends ConsumerStatefulWidget {
  const ListingDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<ListingDetailScreen> createState() => _ListingDetailScreenState();
}

class _ListingDetailScreenState extends ConsumerState<ListingDetailScreen> {
  bool? _savedOverride;
  bool _phoneRevealed = false;
  int _galleryIndex = 0;

  Future<void> _toggleSave(ListingDetail listing) async {
    final auth = ref.read(authProvider);
    if (!auth.isSignedIn) {
      await context.push('/signin?next=/ad/${widget.slug}');
      return;
    }

    final next = !(_savedOverride ?? listing.summary.isSaved ?? false);
    // Optimistic: saving is trivially reversible, so waiting on the round trip costs
    // more than the rare correction.
    setState(() => _savedOverride = next);

    try {
      await ref.read(listingRepositoryProvider).toggleSave(listing.summary.id, save: next);
      ref.invalidate(savedListingsProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _savedOverride = !next);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _sendEnquiry(ListingDetail listing) async {
    final strings = Strings.of(context);

    if (!ref.read(authProvider).isSignedIn) {
      await context.push('/signin?next=/ad/${widget.slug}');
      return;
    }

    final controller = TextEditingController(text: 'Is this still available?');
    final message = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (context) => Padding(
        // Keeps the field above the keyboard.
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          left: LoczSpacing.x4,
          right: LoczSpacing.x4,
          top: LoczSpacing.x4,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 3,
              decoration: InputDecoration(hintText: strings('chats.messageHint')),
            ),
            const SizedBox(height: LoczSpacing.x3),
            FilledButton(
              onPressed: () => Navigator.pop(context, controller.text.trim()),
              child: Text(strings('chats.send')),
            ),
            const SizedBox(height: LoczSpacing.x4),
          ],
        ),
      ),
    );

    if (message == null || message.isEmpty || !mounted) return;

    try {
      final conversationId =
          await ref.read(chatRepositoryProvider).startEnquiry(listing.summary.id, message);
      if (!mounted) return;
      ref.invalidate(conversationsProvider);
      await context.push('/chats/$conversationId');
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final detail = ref.watch(listingDetailProvider(widget.slug));

    return Scaffold(
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(LoczSpacing.x8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(error.toString(), textAlign: TextAlign.center),
                const SizedBox(height: LoczSpacing.x4),
                OutlinedButton(
                  onPressed: () => ref.invalidate(listingDetailProvider(widget.slug)),
                  child: Text(strings('common.retry')),
                ),
              ],
            ),
          ),
        ),
        data: (listing) => _buildDetail(context, listing, strings),
      ),
    );
  }

  Widget _buildDetail(
    BuildContext context,
    ListingDetail listing,
    Strings strings,
  ) {
    final theme = Theme.of(context);
    final summary = listing.summary;
    final isSaved = _savedOverride ?? summary.isSaved ?? false;
    final auth = ref.watch(authProvider);
    final isOwner = auth.user?.id == listing.owner.id;
    final images = listing.media.where((media) => media.fullUrl != null).toList();

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: (MediaQuery.sizeOf(context).width * 0.82).clamp(280, 390),
          pinned: true,
          actions: [
            IconButton(
              icon: Icon(
                isSaved ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              ),
              color: isSaved ? LoczColors.danger : null,
              tooltip: isSaved ? strings('listing.saved') : strings('listing.save'),
              onPressed: () => _toggleSave(listing),
            ),
            IconButton(
              icon: const Icon(Icons.ios_share_rounded),
              tooltip: strings('listing.share'),
              // Shares the canonical web URL so the recipient can open it without the app.
              onPressed: () => Share.share('${Env.siteUrl}/ad/${summary.slug}'),
            ),
          ],
          flexibleSpace: FlexibleSpaceBar(
            background: images.isEmpty
                ? ColoredBox(
                    color: theme.colorScheme.surfaceContainerHighest,
                    child: const Icon(Icons.photo_outlined, size: 48),
                  )
                : Stack(
                    fit: StackFit.expand,
                    children: [
                      PageView.builder(
                        itemCount: images.length,
                        onPageChanged: (index) => setState(() => _galleryIndex = index),
                        itemBuilder: (context, index) => CachedNetworkImage(
                          imageUrl: images[index].fullUrl!,
                          fit: BoxFit.cover,
                          placeholder: (context, _) => ColoredBox(
                            color: theme.colorScheme.surfaceContainerHighest,
                          ),
                          // Never expose a transport exception as visible or spoken product
                          // copy. Media can fail independently of the listing itself.
                          errorWidget: (context, _, __) => ColoredBox(
                            color: theme.colorScheme.surfaceContainerHighest,
                            child: Icon(
                              Icons.image_not_supported_outlined,
                              size: 36,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ),
                      if (images.length > 1)
                        Positioned(
                          right: 12,
                          bottom: 12,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: LoczColors.neutral900.withValues(alpha: 0.76),
                              borderRadius: BorderRadius.circular(LoczRadius.full),
                            ),
                            child: Text(
                              '${_galleryIndex + 1} / ${images.length}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(LoczSpacing.x4),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              if (summary.price != null)
                Text(
                  summary.isFree ? strings('listing.free') : formatPrice(summary.price!),
                  style: theme.textTheme.displaySmall?.copyWith(
                    color: summary.isFree ? LoczColors.success : null,
                  ),
                ),
              if (summary.isNegotiable && !summary.isFree)
                Text(
                  strings('listing.negotiable'),
                  style: theme.textTheme.bodyMedium,
                ),
              const SizedBox(height: LoczSpacing.x2),
              Text(summary.title, style: theme.textTheme.titleLarge),
              const SizedBox(height: LoczSpacing.x2),
              Row(
                children: [
                  Icon(
                    Icons.location_on_outlined,
                    size: 15,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      '${summary.localityName ?? ''}${summary.localityName != null ? ', ' : ''}'
                      '${summary.cityName}',
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                  const Icon(Icons.visibility_outlined, size: 14),
                  const SizedBox(width: 4),
                  Text(
                    strings('listing.views', {'count': summary.viewCount}),
                    style: theme.textTheme.labelSmall,
                  ),
                ],
              ),
              if (summary.isSold) ...[
                const SizedBox(height: LoczSpacing.x4),
                Container(
                  padding: const EdgeInsets.all(LoczSpacing.x3),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(LoczRadius.md),
                  ),
                  child: Text(
                    strings('listing.sold'),
                    style: TextStyle(color: theme.colorScheme.onErrorContainer),
                  ),
                ),
              ],
              const SizedBox(height: LoczSpacing.x5),
              const Divider(),
              const SizedBox(height: LoczSpacing.x5),
              Text(
                strings('listing.description'),
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: LoczSpacing.x2),
              Text(listing.description, style: theme.textTheme.bodyLarge),
              if (listing.attributes.isNotEmpty) ...[
                const SizedBox(height: LoczSpacing.x6),
                Wrap(
                  spacing: LoczSpacing.x2,
                  runSpacing: LoczSpacing.x2,
                  children: listing.attributes.entries
                      .map(
                        (entry) => Chip(
                          label: Text(
                            '${entry.key.replaceAll('_', ' ')}: ${entry.value}',
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
              const SizedBox(height: LoczSpacing.x5),
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  leading: CircleAvatar(
                    backgroundColor: theme.colorScheme.primaryContainer,
                    child: Icon(
                      Icons.person_outline,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  title: Text(listing.owner.displayName),
                  subtitle: Text(
                    strings('listing.seller'),
                    style: theme.textTheme.labelSmall,
                  ),
                ),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () {
                    final reportPath = '/report?listing=${summary.id}';
                    context.push(
                      auth.isSignedIn
                          ? reportPath
                          : Uri(
                              path: '/signin',
                              queryParameters: {'next': reportPath},
                            ).toString(),
                    );
                  },
                  icon: const Icon(Icons.flag_outlined, size: 18),
                  label: Text(strings('listing.report')),
                ),
              ),
              const SizedBox(height: 100),
            ]),
          ),
        ),
      ],
    ).withBottomBar(
      isOwner
          ? null
          : _ContactBar(
              isSaved: isSaved,
              phone: listing.owner.phone,
              phoneRevealed: _phoneRevealed,
              onSave: () => _toggleSave(listing),
              onMessage: () => _sendEnquiry(listing),
              onRevealPhone: () => setState(() => _phoneRevealed = true),
              onCall: () => launchUrl(Uri.parse('tel:${listing.owner.phone}')),
              strings: strings,
            ),
    );
  }
}

/// Pins the contact bar to the bottom of the scroll view.
extension on Widget {
  Widget withBottomBar(Widget? bar) {
    if (bar == null) return this;
    return Stack(
      children: [
        this,
        Positioned(left: 0, right: 0, bottom: 0, child: bar),
      ],
    );
  }
}

class _ContactBar extends StatelessWidget {
  const _ContactBar({
    required this.isSaved,
    required this.phone,
    required this.phoneRevealed,
    required this.onSave,
    required this.onMessage,
    required this.onRevealPhone,
    required this.onCall,
    required this.strings,
  });

  final bool isSaved;
  final String? phone;
  final bool phoneRevealed;
  final VoidCallback onSave;
  final VoidCallback onMessage;
  final VoidCallback onRevealPhone;
  final VoidCallback onCall;
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: theme.colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(LoczSpacing.x3),
          child: Row(
            children: [
              IconButton.outlined(
                onPressed: onSave,
                icon: Icon(isSaved ? Icons.favorite : Icons.favorite_border),
                tooltip: isSaved ? strings('listing.saved') : strings('listing.save'),
                color: isSaved ? LoczColors.danger : null,
              ),
              const SizedBox(width: LoczSpacing.x2),

              // The number is only ever shown when the API supplied it — that is, when
              // the seller opted in. Revealing on tap keeps it out of a casual scrape.
              if (phone != null) ...[
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: phoneRevealed ? onCall : onRevealPhone,
                    icon: const Icon(Icons.phone_outlined),
                    label: Text(
                      phoneRevealed ? phone! : strings('listing.showPhone'),
                    ),
                  ),
                ),
                const SizedBox(width: LoczSpacing.x2),
              ],

              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  onPressed: onMessage,
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: Text(strings('listing.contactSeller')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
