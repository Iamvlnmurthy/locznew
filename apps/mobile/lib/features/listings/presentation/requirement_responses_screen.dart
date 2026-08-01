import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../domain/models.dart';

class RequirementResponsesScreen extends ConsumerStatefulWidget {
  const RequirementResponsesScreen({
    super.key,
    required this.listingId,
    required this.title,
    required this.isOwner,
  });

  final String listingId;
  final String title;
  final bool isOwner;

  @override
  ConsumerState<RequirementResponsesScreen> createState() =>
      _RequirementResponsesScreenState();
}

class _RequirementResponsesScreenState
    extends ConsumerState<RequirementResponsesScreen> {
  late Future<List<RequirementResponse>> _responses;
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _responses = ref
        .read(listingRepositoryProvider)
        .requirementResponses(widget.listingId);
  }

  Future<void> _respond() async {
    final draft = await showModalBottomSheet<_ResponseDraft>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _ResponseComposer(),
    );
    if (draft == null || !mounted) return;
    try {
      await ref.read(listingRepositoryProvider).respondToRequirement(
            listingId: widget.listingId,
            kind: draft.kind,
            offeredPrice: draft.price,
            message: draft.message,
          );
      setState(_reload);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(Strings.of(context)('requirements.responseSaved'))),
        );
      }
    } on ApiException catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _openChat(RequirementResponse response) async {
    if (response.conversationId != null) {
      await context.push('/chats/${response.conversationId}');
      return;
    }
    final strings = Strings.of(context);
    final controller = TextEditingController();
    final message = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(strings('requirements.startChat')),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          decoration:
              InputDecoration(hintText: strings('requirements.chatHint')),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(strings('common.cancel'))),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: Text(strings('requirements.openChat')),
          ),
        ],
      ),
    );
    if (message == null || message.isEmpty || !mounted) return;
    try {
      final id = await ref
          .read(listingRepositoryProvider)
          .openRequirementChat(response.id, message);
      if (mounted) await context.push('/chats/$id');
    } on ApiException catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _markFulfilled() async {
    setState(() => _closing = true);
    try {
      await ref
          .read(listingRepositoryProvider)
          .markRequirementFulfilled(widget.listingId, fulfilled: true);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _closing = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
          title: Text(widget.isOwner
              ? strings('requirements.answers')
              : strings('requirements.yourAnswer'))),
      floatingActionButton: widget.isOwner
          ? null
          : FloatingActionButton.extended(
              onPressed: _respond,
              icon: const Icon(Icons.handshake_outlined),
              label: Text(strings('requirements.respond')),
            ),
      body: RefreshIndicator(
        onRefresh: () async {
          setState(_reload);
          await _responses;
        },
        child: FutureBuilder<List<RequirementResponse>>(
          future: _responses,
          builder: (context, snapshot) {
            final responses = snapshot.data;
            if (responses == null &&
                snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(children: [
                Padding(
                  padding: const EdgeInsets.all(LoczSpacing.x6),
                  child: Text(snapshot.error.toString(),
                      textAlign: TextAlign.center),
                ),
              ]);
            }
            return ListView(
              padding: const EdgeInsets.all(LoczSpacing.x4),
              children: [
                Container(
                  padding: const EdgeInsets.all(LoczSpacing.x4),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(LoczRadius.lg),
                  ),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.title, style: theme.textTheme.titleMedium),
                        const SizedBox(height: 4),
                        Text(
                          widget.isOwner
                              ? strings('requirements.answersHint')
                              : strings('requirements.respondHint'),
                          style: theme.textTheme.bodySmall,
                        ),
                      ]),
                ),
                const SizedBox(height: LoczSpacing.x4),
                if ((responses ?? const []).isEmpty)
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(vertical: LoczSpacing.x8),
                    child: Column(children: [
                      Icon(Icons.mark_chat_unread_outlined,
                          size: 42, color: theme.colorScheme.primary),
                      const SizedBox(height: LoczSpacing.x3),
                      Text(strings('requirements.empty'),
                          style: theme.textTheme.titleMedium),
                      const SizedBox(height: 5),
                      Text(strings('requirements.emptyHint'),
                          textAlign: TextAlign.center),
                    ]),
                  )
                else
                  for (final response in responses!)
                    _ResponseCard(
                      response: response,
                      isOwner: widget.isOwner,
                      onChat: () => _openChat(response),
                    ),
                if (widget.isOwner) ...[
                  const SizedBox(height: LoczSpacing.x5),
                  OutlinedButton.icon(
                    onPressed: _closing ? null : _markFulfilled,
                    icon: const Icon(Icons.task_alt_rounded),
                    label: Text(_closing
                        ? strings('requirements.closing')
                        : strings('requirements.markFulfilled')),
                  ),
                ],
                const SizedBox(height: 90),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ResponseCard extends ConsumerWidget {
  const _ResponseCard(
      {required this.response, required this.isOwner, required this.onChat});
  final RequirementResponse response;
  final bool isOwner;
  final VoidCallback onChat;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: LoczSpacing.x3),
      child: Padding(
        padding: const EdgeInsets.all(LoczSpacing.x4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          FutureBuilder<SellerProfile>(
            future: ref
                .read(listingRepositoryProvider)
                .sellerProfile(response.responderId),
            builder: (context, snapshot) => Row(children: [
              const CircleAvatar(child: Icon(Icons.storefront_outlined)),
              const SizedBox(width: LoczSpacing.x3),
              Expanded(
                child: Text(
                  snapshot.data?.displayName ?? strings('listing.seller'),
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              Chip(label: Text(strings('requirements.kind.${response.kind}'))),
            ]),
          ),
          if (response.offeredPrice != null) ...[
            const SizedBox(height: LoczSpacing.x3),
            Text('₹${response.offeredPrice}',
                style: Theme.of(context).textTheme.titleLarge),
          ],
          if (response.message != null && response.message!.isNotEmpty) ...[
            const SizedBox(height: LoczSpacing.x2),
            Text(response.message!),
          ],
          if (isOwner) ...[
            const SizedBox(height: LoczSpacing.x3),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                onPressed: onChat,
                icon: const Icon(Icons.chat_bubble_outline_rounded),
                label: Text(response.conversationId == null
                    ? strings('requirements.openChat')
                    : strings('requirements.continueChat')),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}

class _ResponseDraft {
  const _ResponseDraft(this.kind, this.price, this.message);
  final String kind;
  final num? price;
  final String? message;
}

class _ResponseComposer extends StatefulWidget {
  const _ResponseComposer();
  @override
  State<_ResponseComposer> createState() => _ResponseComposerState();
}

class _ResponseComposerState extends State<_ResponseComposer> {
  String _kind = 'AVAILABLE';
  final _price = TextEditingController();
  final _message = TextEditingController();

  @override
  void dispose() {
    _price.dispose();
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          LoczSpacing.x4,
          0,
          LoczSpacing.x4,
          MediaQuery.viewInsetsOf(context).bottom + LoczSpacing.x4,
        ),
        child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(strings('requirements.respond'),
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: LoczSpacing.x3),
              DropdownButtonFormField<String>(
                initialValue: _kind,
                decoration: InputDecoration(
                    labelText: strings('requirements.availability')),
                items: const [
                  'AVAILABLE',
                  'AVAILABLE_AT_DIFFERENT_PRICE',
                  'SIMILAR_AVAILABLE',
                  'CAN_ARRANGE',
                  'MADE_TO_ORDER',
                  'AVAILABLE_LATER',
                  'NOT_AVAILABLE',
                ]
                    .map((kind) => DropdownMenuItem(
                        value: kind,
                        child: Text(strings('requirements.kind.$kind'))))
                    .toList(),
                onChanged: (value) => setState(() => _kind = value ?? _kind),
              ),
              const SizedBox(height: LoczSpacing.x3),
              TextField(
                controller: _price,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                    labelText: strings('requirements.offeredPrice'),
                    prefixText: '₹ '),
              ),
              const SizedBox(height: LoczSpacing.x3),
              TextField(
                controller: _message,
                maxLength: 500,
                maxLines: 3,
                decoration:
                    InputDecoration(labelText: strings('requirements.note')),
              ),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.pop(
                    context,
                    _ResponseDraft(_kind, num.tryParse(_price.text.trim()),
                        _message.text.trim()),
                  ),
                  child: Text(strings('requirements.sendResponse')),
                ),
              ),
            ]),
      ),
    );
  }
}
