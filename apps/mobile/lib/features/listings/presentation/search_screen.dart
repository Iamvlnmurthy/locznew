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

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final textScale = MediaQuery.textScalerOf(context).scale(1);

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
                    onSelected: (value) {
                      setState(() => _sort = value);
                      _run();
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(
                        value: 'relevance',
                        child: Text('Best match'),
                      ),
                      PopupMenuItem(value: 'newest', child: Text('Newest')),
                      PopupMenuItem(
                        value: 'price_asc',
                        child: Text('Price: low to high'),
                      ),
                      PopupMenuItem(
                        value: 'price_desc',
                        child: Text('Price: high to low'),
                      ),
                      PopupMenuItem(value: 'distance', child: Text('Nearest')),
                    ],
                    child: Chip(
                      avatar: const Icon(Icons.sort_rounded, size: 16),
                      label: Text(
                        switch (_sort) {
                          'newest' => 'Newest',
                          'price_asc' => 'Lowest price',
                          'price_desc' => 'Highest price',
                          'distance' => 'Nearest',
                          _ => 'Best match',
                        },
                      ),
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

                return GridView.builder(
                  padding: const EdgeInsets.all(LoczSpacing.x3),
                  gridDelegate: listingCardGridDelegate(textScale),
                  itemCount: items.length,
                  itemBuilder: (context, index) => ListingCard(
                    listing: items[index],
                    onTap: () => context.push('/ad/${items[index].slug}'),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
