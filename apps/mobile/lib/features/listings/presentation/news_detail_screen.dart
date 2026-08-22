import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../domain/models.dart';

/// One LocZ-regenerated news event.
///
/// The body is LocZ's OWN rewrite of the story in the viewer's language — we never bounce the
/// reader out to the source publisher. Original outlets are credited at the foot of the article
/// for attribution only.
class NewsDetailScreen extends ConsumerStatefulWidget {
  const NewsDetailScreen({required this.slug, super.key});

  final String slug;

  @override
  ConsumerState<NewsDetailScreen> createState() => _NewsDetailScreenState();
}

class _NewsDetailScreenState extends ConsumerState<NewsDetailScreen> {
  Future<NewsEvent?>? _event;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final lang = ref.read(localeProvider).name;
    setState(() {
      _event = ref.read(listingRepositoryProvider).newsEvent(widget.slug, lang: lang);
    });
  }

  String? _formatDate(String? iso) {
    if (iso == null) return null;
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return null;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final hh = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final mm = dt.minute.toString().padLeft(2, '0');
    final ap = dt.hour < 12 ? 'AM' : 'PM';
    return '${dt.day} ${months[dt.month - 1]} ${dt.year}, $hh:$mm $ap';
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(title: Text(strings('news.title', {'city': ''}).trim())),
      body: FutureBuilder<NewsEvent?>(
        future: _event,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final event = snapshot.data;
          if (event == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(LoczSpacing.x8),
                child: Text(
                  strings('news.loadFailed'),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium,
                ),
              ),
            );
          }

          final date = _formatDate(event.publishedAt);
          final paragraphs = (event.summary ?? '')
              .split(RegExp(r'\n{2,}'))
              .map((p) => p.trim())
              .where((p) => p.isNotEmpty)
              .toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  for (final c in event.categories.take(3))
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        c,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onPrimaryContainer,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  if (date != null)
                    Text(
                      date,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                event.title,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 16),
              for (final para in paragraphs) ...[
                Text(
                  para,
                  style: theme.textTheme.bodyLarge?.copyWith(height: 1.6),
                ),
                const SizedBox(height: 14),
              ],
              const SizedBox(height: 6),
              Text(
                'LocZ News',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (event.sources.isNotEmpty) ...[
                const SizedBox(height: 20),
                Divider(color: theme.colorScheme.outlineVariant),
                const SizedBox(height: 8),
                Text(
                  strings('news.sourcesLabel'),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 6),
                for (final s in event.sources)
                  if ((s.publisher ?? s.url) != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: InkWell(
                        onTap: s.url == null
                            ? null
                            : () => launchUrl(
                                  Uri.parse(s.url!),
                                  mode: LaunchMode.externalApplication,
                                ),
                        child: Text(
                          s.publisher ?? s.url!,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            decoration: s.url == null ? null : TextDecoration.underline,
                          ),
                        ),
                      ),
                    ),
              ],
            ],
          );
        },
      ),
    );
  }
}
