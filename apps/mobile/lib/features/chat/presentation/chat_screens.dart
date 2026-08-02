import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/domain/models.dart';

/// Conversation list.
class ChatsScreen extends ConsumerWidget {
  const ChatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final auth = ref.watch(authProvider);

    if (!auth.isSignedIn) {
      return Scaffold(
        backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
        appBar: AppBar(title: Text(strings('chats.title'))),
        body: _ChatStateCard(
          icon: Icons.forum_outlined,
          title: strings('chats.signedOutTitle'),
          body: strings('chats.signedOutBody'),
          action: FilledButton.icon(
            onPressed: () => context.push('/signin?next=/chats'),
            icon: const Icon(Icons.login_rounded, size: 18),
            label: Text(strings('nav.signIn')),
          ),
        ),
      );
    }

    final conversations = ref.watch(conversationsProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
      appBar: AppBar(title: Text(strings('chats.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(conversationsProvider),
        child: conversations.when(
          loading: () => const _ChatListLoading(),
          error: (error, _) => ListView(
            children: [
              SizedBox(
                height: MediaQuery.sizeOf(context).height * 0.68,
                child: _ChatStateCard(
                  icon: Icons.cloud_off_outlined,
                  title: strings('common.error'),
                  body: strings('chats.emptyBody'),
                  action: OutlinedButton.icon(
                    onPressed: () => ref.invalidate(conversationsProvider),
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
                    child: _ChatStateCard(
                      icon: Icons.mark_chat_unread_outlined,
                      title: strings('chats.empty'),
                      body: strings('chats.emptyBody'),
                    ),
                  ),
                ],
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(LoczSpacing.x3),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final conversation = items[index];
                return _ConversationCard(
                  conversation: conversation,
                  onTap: () => context.push('/chats/${conversation.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

final _messagesProvider = FutureProvider.autoDispose.family<List<ChatMessage>, String>((
  ref,
  conversationId,
) {
  return ref.watch(chatRepositoryProvider).messages(conversationId);
});

/// One conversation.
///
/// Phase 1 has no socket: messages load on open and after each send. A thread that moves
/// at human speed does not justify a persistent connection per user at launch, and push
/// notifications already cover the "you have a reply" case.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversationId});

  final String conversationId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  bool _sending = false;
  bool _hasDraft = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_handleDraftChanged);
  }

  void _handleDraftChanged() {
    final next = _controller.text.trim().isNotEmpty;
    if (next != _hasDraft && mounted) setState(() => _hasDraft = next);
  }

  @override
  void dispose() {
    _controller.removeListener(_handleDraftChanged);
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty || _sending) return;

    setState(() => _sending = true);
    _controller.clear();

    try {
      await ref.read(chatRepositoryProvider).send(widget.conversationId, body);
      ref.invalidate(_messagesProvider(widget.conversationId));
      ref.invalidate(conversationsProvider);
      // The value is now obvious: permission means seeing the other person's reply.
      unawaited(ref.read(pushPermissionProvider.notifier).request());
    } on ApiException catch (error) {
      if (!mounted) return;
      // Put the text back so a failed send does not lose what was typed.
      _controller.text = body;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final messages = ref.watch(_messagesProvider(widget.conversationId));
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(title: Text(strings('chats.title'))),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: LoczSpacing.x4,
              vertical: LoczSpacing.x2,
            ),
            color: theme.colorScheme.primaryContainer.withValues(alpha: 0.55),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.lock_outline_rounded,
                  size: 14,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: LoczSpacing.x2),
                Flexible(
                  child: Text(
                    strings('chats.privateHint'),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: messages.when(
              loading: () => const _MessageListLoading(),
              error: (error, _) => _ChatStateCard(
                icon: Icons.cloud_off_outlined,
                title: strings('common.error'),
                body: strings('chats.threadEmptyBody'),
                action: OutlinedButton.icon(
                  onPressed: () => ref.invalidate(
                    _messagesProvider(widget.conversationId),
                  ),
                  icon: const Icon(Icons.refresh_rounded),
                  label: Text(strings('common.retry')),
                ),
              ),
              data: (list) {
                if (list.isEmpty) {
                  return _ChatStateCard(
                    icon: Icons.waving_hand_outlined,
                    title: strings('chats.threadEmptyTitle'),
                    body: strings('chats.threadEmptyBody'),
                  );
                }
                return ListView.builder(
                  controller: _scrollController,
                  // Newest at the bottom, which is what a chat is expected to do.
                  reverse: true,
                  padding: const EdgeInsets.all(LoczSpacing.x4),
                  itemCount: list.length,
                  itemBuilder: (context, index) {
                    final message = list[list.length - 1 - index];
                    return Align(
                      alignment: message.isMine ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: LoczSpacing.x2),
                        padding: const EdgeInsets.symmetric(
                          horizontal: LoczSpacing.x3,
                          vertical: LoczSpacing.x2,
                        ),
                        constraints: BoxConstraints(
                          maxWidth: (MediaQuery.sizeOf(context).width * 0.78).clamp(220, 520),
                        ),
                        decoration: BoxDecoration(
                          color: message.isMine
                              ? theme.colorScheme.primary
                              : theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(16),
                            topRight: const Radius.circular(16),
                            bottomLeft: Radius.circular(message.isMine ? 16 : 4),
                            bottomRight: Radius.circular(message.isMine ? 4 : 16),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              message.body,
                              style: TextStyle(
                                color: message.isMine ? theme.colorScheme.onPrimary : null,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              DateFormat.Hm().format(message.createdAt),
                              style: theme.textTheme.labelSmall?.copyWith(
                                fontSize: 9,
                                color: message.isMine
                                    ? theme.colorScheme.onPrimary.withValues(alpha: 0.7)
                                    : theme.colorScheme.onSurfaceVariant,
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
          ),
          SafeArea(
            top: false,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                border: Border(
                  top: BorderSide(
                    color: theme.colorScheme.outline.withValues(alpha: 0.45),
                  ),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(LoczSpacing.x3),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        decoration: InputDecoration(
                          hintText: strings('chats.messageHint'),
                        ),
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(),
                        maxLines: 4,
                        minLines: 1,
                      ),
                    ),
                    const SizedBox(width: LoczSpacing.x2),
                    IconButton.filled(
                      onPressed: _sending || !_hasDraft ? null : _send,
                      icon: _sending
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send_rounded),
                      tooltip: strings('chats.send'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConversationCard extends StatelessWidget {
  const _ConversationCard({required this.conversation, required this.onTap});

  final ConversationSummary conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unread = conversation.unreadCount > 0;

    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(LoczSpacing.x3),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(LoczRadius.md),
                child: SizedBox.square(
                  dimension: 58,
                  child: conversation.listingThumbUrl != null
                      ? CachedNetworkImage(
                          imageUrl: conversation.listingThumbUrl!,
                          fit: BoxFit.cover,
                          errorWidget: (_, __, ___) => _ConversationFallback(
                            theme: theme,
                          ),
                        )
                      : _ConversationFallback(theme: theme),
                ),
              ),
              const SizedBox(width: LoczSpacing.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.otherPartyName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: unread ? FontWeight.w800 : FontWeight.w600,
                            ),
                          ),
                        ),
                        if (conversation.lastMessageAt != null)
                          Text(
                            DateFormat.Hm().format(
                              conversation.lastMessageAt!,
                            ),
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: unread
                                  ? theme.colorScheme.primary
                                  : theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                      ],
                    ),
                    if (conversation.listingTitle?.isNotEmpty ?? false) ...[
                      const SizedBox(height: 2),
                      Text(
                        conversation.listingTitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    ],
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.lastMessagePreview ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                              fontWeight: unread ? FontWeight.w700 : FontWeight.w400,
                            ),
                          ),
                        ),
                        if (unread) ...[
                          const SizedBox(width: LoczSpacing.x2),
                          Badge(label: Text('${conversation.unreadCount}')),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: LoczSpacing.x1),
              Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConversationFallback extends StatelessWidget {
  const _ConversationFallback({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: theme.colorScheme.primaryContainer,
        child: Icon(
          Icons.forum_outlined,
          color: theme.colorScheme.primary,
        ),
      );
}

class _ChatStateCard extends StatelessWidget {
  const _ChatStateCard({
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

class _ChatListLoading extends StatelessWidget {
  const _ChatListLoading();

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.all(LoczSpacing.x3),
        itemCount: 5,
        separatorBuilder: (_, __) => const SizedBox(height: LoczSpacing.x2),
        itemBuilder: (context, index) => const _ChatLoadingTile(),
      );
}

class _ChatLoadingTile extends StatelessWidget {
  const _ChatLoadingTile();

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.surfaceContainerHighest;
    return Container(
      height: 84,
      padding: const EdgeInsets.all(LoczSpacing.x3),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(LoczRadius.lg),
      ),
      child: Row(
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(LoczRadius.md),
            ),
          ),
          const SizedBox(width: LoczSpacing.x3),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FractionallySizedBox(
                  widthFactor: 0.5,
                  child: Container(height: 12, color: color),
                ),
                const SizedBox(height: LoczSpacing.x2),
                FractionallySizedBox(
                  widthFactor: 0.78,
                  child: Container(height: 10, color: color),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageListLoading extends StatelessWidget {
  const _MessageListLoading();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(LoczSpacing.x4),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: List.generate(
          4,
          (index) => Align(
            alignment: index.isEven ? Alignment.centerLeft : Alignment.centerRight,
            child: Container(
              width: index.isEven ? 210 : 160,
              height: index.isEven ? 54 : 44,
              margin: const EdgeInsets.only(bottom: LoczSpacing.x2),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(LoczRadius.lg),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
