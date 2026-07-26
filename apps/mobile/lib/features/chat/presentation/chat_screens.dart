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
        appBar: AppBar(title: Text(strings('chats.title'))),
        body: Center(
          child: FilledButton(
            onPressed: () => context.push('/signin?next=/chats'),
            child: Text(strings('nav.signIn')),
          ),
        ),
      );
    }

    final conversations = ref.watch(conversationsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings('chats.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(conversationsProvider),
        child: conversations.when(
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
                  Center(child: Text(strings('chats.empty'))),
                ],
              );
            }

            return ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final conversation = items[index];
                return ListTile(
                  leading: conversation.listingThumbUrl != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(LoczRadius.sm),
                          child: CachedNetworkImage(
                            imageUrl: conversation.listingThumbUrl!,
                            width: 48,
                            height: 48,
                            fit: BoxFit.cover,
                          ),
                        )
                      : const CircleAvatar(
                          child: Icon(Icons.chat_bubble_outline),
                        ),
                  title: Text(conversation.otherPartyName),
                  subtitle: Text(
                    conversation.listingTitle ?? conversation.lastMessagePreview ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: conversation.unreadCount > 0
                      ? Badge(label: Text('${conversation.unreadCount}'))
                      : Text(
                          conversation.lastMessageAt == null
                              ? ''
                              : DateFormat.Hm().format(conversation.lastMessageAt!),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
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

  @override
  void dispose() {
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
      appBar: AppBar(title: Text(strings('chats.title'))),
      body: Column(
        children: [
          Expanded(
            child: messages.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text(error.toString())),
              data: (list) => ListView.builder(
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
                        maxWidth: MediaQuery.of(context).size.width * 0.75,
                      ),
                      decoration: BoxDecoration(
                        color: message.isMine
                            ? theme.colorScheme.primary
                            : theme.colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(LoczRadius.lg),
                      ),
                      child: Text(
                        message.body,
                        style: TextStyle(
                          color: message.isMine ? theme.colorScheme.onPrimary : null,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          SafeArea(
            top: false,
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
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                    tooltip: strings('chats.send'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
