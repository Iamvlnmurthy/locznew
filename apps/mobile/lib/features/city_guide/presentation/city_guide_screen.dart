import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/motion/locz_motion.dart';
import '../../../core/providers.dart';
import '../data/city_guide_repository.dart';

class CityGuideScreen extends ConsumerWidget {
  const CityGuideScreen({required this.slug, super.key});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final guide = ref.watch(cityGuideProvider(slug));
    return Scaffold(
      body: guide.when(
        loading: () => const _GuideLoading(),
        error: (_, __) => _GuideError(
          onRetry: () => ref.invalidate(cityGuideProvider(slug)),
        ),
        data: (data) => _GuideBody(data: data),
      ),
    );
  }
}

class _GuideBody extends StatelessWidget {
  const _GuideBody({required this.data});

  final CityGuideData data;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final hero = data.imageOfKind('HERO');
    final attractions = data.imagesOfKind('ATTRACTION');
    final map = data.imageOfKind('MAP');
    final content = data.content;
    final famous = _highlights(content?.famousFor ?? content?.knownFor);

    return CustomScrollView(
      physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
      slivers: [
        SliverAppBar(
          pinned: true,
          stretch: true,
          expandedHeight: 390,
          foregroundColor: Colors.white,
          backgroundColor: const Color(0xFF103C33),
          leading: Padding(
            padding: const EdgeInsets.all(8),
            child: _GlassButton(
              semanticLabel: strings('common.back'),
              icon: Icons.arrow_back_rounded,
              onTap: () => context.pop(),
            ),
          ),
          flexibleSpace: FlexibleSpaceBar(
            collapseMode: CollapseMode.parallax,
            stretchModes: const [StretchMode.zoomBackground],
            titlePadding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            title: Text(
              data.city.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 25,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.7,
              ),
            ),
            background: _GuideHero(data: data, image: hero),
          ),
        ),
        SliverToBoxAdapter(
          child: Transform.translate(
            offset: const Offset(0, -14),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: _FactsPanel(data: data),
            ),
          ),
        ),
        if (content != null)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 44, 18, 0),
            sliver: SliverList.list(
              children: [
                _SectionLabel(strings('cityGuide.aboutKicker')),
                const SizedBox(height: 8),
                Text(
                  strings('cityGuide.aboutTitle', {'city': data.city.name}),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontSize: 30,
                        letterSpacing: -0.8,
                      ),
                ),
                const SizedBox(height: 16),
                Text(
                  content.description ?? content.shortIntro ?? '',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.7),
                ),
                if (content.character?.isNotEmpty == true) ...[
                  const SizedBox(height: 13),
                  Text(
                    _normalizeCopy(content.character!),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.65),
                  ),
                ],
                if (famous.isNotEmpty) ...[
                  const SizedBox(height: 28),
                  _FamousPanel(city: data.city.name, highlights: famous),
                ],
              ],
            ),
          ),
        if (attractions.isNotEmpty) ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 48, 18, 16),
            sliver: SliverToBoxAdapter(
              child: _SectionHeading(
                kicker: strings('cityGuide.landmarksKicker'),
                title: strings(
                  'cityGuide.landmarksTitle',
                  {'city': data.city.name},
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(child: _AttractionRail(images: attractions)),
        ],
        if (map != null)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 48, 18, 0),
            sliver: SliverToBoxAdapter(child: _MapPanel(data: data, image: map)),
          ),
        if (data.sections.isNotEmpty)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 52, 18, 0),
            sliver: SliverList.list(
              children: [
                _SectionHeading(
                  kicker: strings('cityGuide.guideKicker'),
                  title: strings('cityGuide.guideTitle', {'city': data.city.name}),
                ),
                const SizedBox(height: 22),
                ...data.sections.indexed.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 11),
                    child: LoczEntrance(
                      delay: Duration(milliseconds: entry.$1.clamp(0, 5) * 35),
                      offset: const Offset(0, 8),
                      child: _GuideSectionCard(index: entry.$1, section: entry.$2),
                    ),
                  ),
                ),
              ],
            ),
          ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(18, 50, 18, 112),
          sliver: SliverToBoxAdapter(child: _DirectoryCallout(data: data)),
        ),
      ],
    );
  }
}

class _GuideHero extends StatelessWidget {
  const _GuideHero({required this.data, required this.image});

  final CityGuideData data;
  final CityGuideImage? image;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        if (image != null)
          CachedNetworkImage(
            imageUrl: image!.url,
            fit: BoxFit.cover,
            placeholder: (_, __) => const ColoredBox(color: Color(0xFF174D41)),
            errorWidget: (_, __, ___) => const _HeroFallback(),
          )
        else
          const _HeroFallback(),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x33102F29), Color(0x66102F29), Color(0xF20A2923)],
              stops: [0, .47, 1],
            ),
          ),
        ),
        Positioned(
          left: 20,
          right: 20,
          bottom: 72,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                strings('cityGuide.kicker').toUpperCase(),
                style: const TextStyle(
                  color: Color(0xFFFF8A76),
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                data.content?.shortIntro ?? data.city.stateName,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Color(0xDFFFFFFF),
                  fontSize: 15,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _HeroFallback extends StatelessWidget {
  const _HeroFallback();

  @override
  Widget build(BuildContext context) => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0D3029), Color(0xFF2A7563), Color(0xFF183B33)],
          ),
        ),
      );
}

class _GlassButton extends StatelessWidget {
  const _GlassButton({
    required this.semanticLabel,
    required this.icon,
    required this.onTap,
  });
  final String semanticLabel;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        label: semanticLabel,
        button: true,
        child: Material(
          color: const Color(0x66122620),
          shape: const CircleBorder(side: BorderSide(color: Color(0x44FFFFFF))),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(width: 42, height: 42, child: Icon(icon, size: 21)),
          ),
        ),
      );
}

class _FactsPanel extends StatelessWidget {
  const _FactsPanel({required this.data});
  final CityGuideData data;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final population =
        data.population == null ? '—' : NumberFormat.decimalPattern(locale).format(data.population);
    final facts = [
      (Icons.groups_2_outlined, strings('cityGuide.population'), population),
      (Icons.auto_awesome_outlined, strings('cityGuide.cityTier'), 'Tier ${data.tier}'),
      (
        Icons.location_on_outlined,
        strings('cityGuide.region'),
        data.city.districtName ?? data.city.stateName
      ),
      (Icons.wb_sunny_outlined, strings('cityGuide.climate'), data.content?.climate ?? '—'),
    ];
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(23),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: .1),
            blurRadius: 30,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(23),
        child: GridView.builder(
          padding: EdgeInsets.zero,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            childAspectRatio: 2.25,
            crossAxisCount: 2,
          ),
          itemCount: facts.length,
          itemBuilder: (context, index) {
            final fact = facts[index];
            return Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                border: Border.all(
                  color: scheme.outlineVariant.withValues(alpha: .7),
                  width: .5,
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Icon(fact.$1, size: 18, color: scheme.primary),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          fact.$2.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 8.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: .7,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          fact.$3,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: Color(0xFFF36B56),
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.25,
        ),
      );
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.kicker, required this.title});
  final String kicker;
  final String title;
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionLabel(kicker),
          const SizedBox(height: 8),
          Text(
            title,
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontSize: 29, letterSpacing: -.7),
          ),
        ],
      );
}

class _FamousPanel extends StatelessWidget {
  const _FamousPanel({required this.city, required this.highlights});
  final String city;
  final List<String> highlights;
  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: scheme.secondaryContainer.withValues(alpha: .58),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: scheme.secondary.withValues(alpha: .22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: scheme.secondaryContainer,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              Icons.auto_awesome_rounded,
              color: scheme.onSecondaryContainer,
            ),
          ),
          const SizedBox(height: 17),
          _SectionLabel(strings('cityGuide.famousKicker')),
          const SizedBox(height: 7),
          Text(
            strings('cityGuide.famousTitle', {'city': city}),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 14),
          ...highlights.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_rounded, color: scheme.primary, size: 17),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      item,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
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

class _AttractionRail extends StatelessWidget {
  const _AttractionRail({required this.images});
  final List<CityGuideImage> images;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 246,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          scrollDirection: Axis.horizontal,
          itemCount: images.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (context, index) => _AttractionCard(image: images[index]),
        ),
      );
}

class _AttractionCard extends StatelessWidget {
  const _AttractionCard({required this.image});
  final CityGuideImage image;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 254,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(21),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: CachedNetworkImage(
              imageUrl: image.url,
              width: double.infinity,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => ColoredBox(
                color: scheme.surfaceContainerHigh,
                child: const Center(
                  child: Icon(Icons.image_not_supported_outlined),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 11, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  image.title ?? '',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  _credit(image),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(fontSize: 8.5),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MapPanel extends StatelessWidget {
  const _MapPanel({required this.data, required this.image});
  final CityGuideData data;
  final CityGuideImage image;
  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFF103F36),
        borderRadius: BorderRadius.circular(23),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 16 / 10,
            child: CachedNetworkImage(imageUrl: image.url, fit: BoxFit.cover),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SectionLabel(strings('cityGuide.locationKicker')),
                const SizedBox(height: 8),
                Text(
                  strings('cityGuide.locationTitle', {'city': data.city.name}),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 25,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -.5,
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => _openMap(data.city),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Color(0x55FFFFFF)),
                  ),
                  icon: const Icon(Icons.open_in_new_rounded, size: 17),
                  label: Text(strings('cityGuide.openMap')),
                ),
                const SizedBox(height: 9),
                Text(
                  _credit(image),
                  maxLines: 2,
                  style: const TextStyle(
                    color: Color(0x88FFFFFF),
                    fontSize: 9,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  strings('cityGuide.mapCaveat'),
                  style: const TextStyle(
                    color: Color(0x77FFFFFF),
                    fontSize: 9,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GuideSectionCard extends StatelessWidget {
  const _GuideSectionCard({required this.index, required this.section});
  final int index;
  final CityGuideSection section;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(19),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
        childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
        shape: const Border(),
        collapsedShape: const Border(),
        leading: Text(
          '${index + 1}'.padLeft(2, '0'),
          style: TextStyle(
            color: scheme.secondary,
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: .8,
          ),
        ),
        title: Text(section.title, style: Theme.of(context).textTheme.titleMedium),
        children: [
          Text(
            section.content,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.65),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: section.sourceUrl == null
                  ? null
                  : () => launchUrl(
                        Uri.parse(section.sourceUrl!),
                        mode: LaunchMode.externalApplication,
                      ),
              icon: const Icon(Icons.open_in_new_rounded, size: 15),
              label: Text(
                [section.source, section.license].whereType<String>().join(' · '),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DirectoryCallout extends ConsumerWidget {
  const _DirectoryCallout({required this.data});
  final CityGuideData data;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    return Container(
      padding: const EdgeInsets.all(23),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0C5D4E), Color(0xFF267760)],
        ),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.storefront_rounded,
            color: Color(0xFFFFD899),
            size: 30,
          ),
          const SizedBox(height: 18),
          Text(
            strings('cityGuide.directoryTitle', {'city': data.city.name}),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -.5,
            ),
          ),
          const SizedBox(height: 9),
          Text(
            strings('cityGuide.directoryIntro'),
            style: const TextStyle(color: Color(0xCFFFFFFF), height: 1.5),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () async {
                final city = data.city;
                await ref.read(selectedCityProvider.notifier).selectGuideCity(
                      id: city.id,
                      name: city.name,
                      slug: city.slug,
                      tier: data.tier,
                      latitude: city.latitude,
                      longitude: city.longitude,
                    );
                if (context.mounted) context.go('/discover/businesses');
              },
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF0D6556),
              ),
              icon: const Icon(Icons.near_me_rounded, size: 18),
              label: Text(strings('cityGuide.exploreLocal')),
            ),
          ),
        ],
      ),
    );
  }
}

class _GuideLoading extends StatelessWidget {
  const _GuideLoading();
  @override
  Widget build(BuildContext context) => const CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: 360,
            backgroundColor: Color(0xFF174D41),
          ),
          SliverPadding(
            padding: EdgeInsets.all(18),
            sliver: SliverToBoxAdapter(child: LinearProgressIndicator()),
          ),
        ],
      );
}

class _GuideError extends StatelessWidget {
  const _GuideError({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.location_city_outlined,
                size: 52,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 18),
              Text(
                strings('cityGuide.loadFailed'),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: Text(strings('common.retry')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

List<String> _highlights(String? value) => value == null
    ? const []
    : value
        .split(RegExp(r'[,;|•]'))
        .map(_normalizeCopy)
        .where((item) => item.length > 1)
        .take(6)
        .toList(growable: false);
String _normalizeCopy(String value) => value
    .trim()
    .replaceAll(
      RegExp(r'\bknown for it\b', caseSensitive: false),
      'known for IT',
    )
    .replaceAll(RegExp(r'\bmix of it\b', caseSensitive: false), 'mix of IT');
String _credit(CityGuideImage image) => [
      image.attribution,
      image.source,
      image.license,
    ].whereType<String>().where((part) => part.isNotEmpty).join(' · ');
Future<void> _openMap(CityGuideCity city) => launchUrl(
      Uri.parse(
        'https://www.openstreetmap.org/?mlat=${city.latitude}&mlon=${city.longitude}#map=11/${city.latitude}/${city.longitude}',
      ),
      mode: LaunchMode.externalApplication,
    );
