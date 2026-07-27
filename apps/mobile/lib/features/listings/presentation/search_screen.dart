import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/env.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../domain/models.dart';
import 'widgets/listing_card.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;

  String _query = '';
  int? _radiusKm;
  String _sort = 'relevance';
  Future<List<ListingSummary>>? _results;

  @override
  void initState() {
    super.initState();
    _run();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    // Debounced: firing a request per keystroke would hammer the API and, on a slow
    // connection, deliver results out of order.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      setState(() => _query = value.trim());
      _run();
    });
  }

  void _run() {
    final city = ref.read(selectedCityProvider);
    setState(() {
      _results = ref.read(listingRepositoryProvider).search(
            query: _query,
            cityId: (city?.id.isEmpty ?? true) ? null : city!.id,
            pincode: city?.pincode,
            latitude: city?.latitude,
            longitude: city?.longitude,
            radiusKm: _radiusKm,
            sort: _sort,
          );
    });
  }

  String _sortLabel(Strings strings, [String? value]) {
    return switch (value ?? _sort) {
      'newest' => strings('search.sortNewest'),
      'price_asc' => strings('search.sortPriceLow'),
      'price_desc' => strings('search.sortPriceHigh'),
      'distance' => strings('search.sortNearest'),
      _ => strings('search.sortBest'),
    };
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final city = ref.watch(selectedCityProvider);
    final hasCoordinates = city?.latitude != null && city?.longitude != null;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: LoczSpacing.x4,
        title: TextField(
          controller: _controller,
          autofocus: false,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: strings('search.placeholder'),
            prefixIcon: const Icon(Icons.search_rounded, size: 20),
            suffixIcon: _controller.text.isEmpty
                ? null
                : IconButton(
                    onPressed: () {
                      _controller.clear();
                      setState(() => _query = '');
                      _run();
                    },
                    icon: const Icon(Icons.close_rounded, size: 18),
                  ),
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            fillColor: Theme.of(context).colorScheme.surface,
          ),
          onChanged: (value) {
            setState(() {});
            _onQueryChanged(value);
          },
          onSubmitted: (value) {
            _debounce?.cancel();
            setState(() => _query = value.trim());
            _run();
          },
        ),
      ),
      body: Column(
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(
                bottom: BorderSide(
                  color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.4),
                ),
              ),
            ),
            child: SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: LoczSpacing.x3,
                  vertical: 6,
                ),
                children: [
                  if (!hasCoordinates)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ActionChip(
                        avatar: const Icon(Icons.location_on_outlined, size: 16),
                        label: Text(strings('search.chooseArea')),
                        onPressed: () async {
                          await context.push('/location');
                          if (mounted) _run();
                        },
                      ),
                    )
                  else
                    for (final km in Env.radiusPresetsKm)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: FilterChip(
                          label: Text('$km ${strings('common.km')}'),
                          selected: _radiusKm == km,
                          onSelected: (selected) {
                            setState(() => _radiusKm = selected ? km : null);
                            _run();
                          },
                        ),
                      ),
                  const SizedBox(width: 2),
                  PopupMenuButton<String>(
                    initialValue: _sort,
                    tooltip: strings('search.sort'),
                    onSelected: (value) {
                      setState(() => _sort = value);
                      _run();
                    },
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'relevance',
                        child: Text(_sortLabel(strings, 'relevance')),
                      ),
                      PopupMenuItem(
                        value: 'newest',
                        child: Text(_sortLabel(strings, 'newest')),
                      ),
                      PopupMenuItem(
                        value: 'price_asc',
                        child: Text(_sortLabel(strings, 'price_asc')),
                      ),
                      PopupMenuItem(
                        value: 'price_desc',
                        child: Text(_sortLabel(strings, 'price_desc')),
                      ),
                      PopupMenuItem(
                        value: 'distance',
                        enabled: hasCoordinates,
                        child: Text(_sortLabel(strings, 'distance')),
                      ),
                    ],
                    child: Chip(
                      avatar: const Icon(Icons.sort_rounded, size: 16),
                      label: Text(_sortLabel(strings)),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<ListingSummary>>(
              future: _results,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(LoczSpacing.x8),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.search_off_rounded,
                            size: 40,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(height: LoczSpacing.x3),
                          Text(
                            '${snapshot.error}',
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: LoczSpacing.x4),
                          OutlinedButton(
                            onPressed: _run,
                            child: Text(strings('common.retry')),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                final items = snapshot.data ?? const <ListingSummary>[];
                if (items.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(LoczSpacing.x8),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            strings('search.noResults'),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: LoczSpacing.x2),
                          Text(
                            strings('search.noResultsHint'),
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        LoczSpacing.x4,
                        LoczSpacing.x3,
                        LoczSpacing.x4,
                        0,
                      ),
                      child: Text(
                        strings(
                          items.length == 1 ? 'search.resultCountOne' : 'search.resultCountMany',
                          {'count': items.length},
                        ),
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                    ),
                    Expanded(
                      child: GridView.builder(
                        padding: const EdgeInsets.all(LoczSpacing.x3),
                        gridDelegate: listingCardGridDelegate(textScale),
                        itemCount: items.length,
                        itemBuilder: (context, index) => ListingCard(
                          listing: items[index],
                          onTap: () => context.push('/ad/${items[index].slug}'),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
