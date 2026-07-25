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
      _results = ref
          .read(listingRepositoryProvider)
          .search(
            query: _query,
            cityId: city?.id,
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

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: false,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: strings('search.placeholder'),
            border: InputBorder.none,
          ),
          onChanged: _onQueryChanged,
          onSubmitted: (value) {
            _debounce?.cancel();
            setState(() => _query = value.trim());
            _run();
          },
        ),
      ),

      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: LoczSpacing.x3),
              children: [
                for (final km in Env.radiusPresetsKm)
                  Padding(
                    padding: const EdgeInsets.only(right: LoczSpacing.x2),
                    child: FilterChip(
                      label: Text('$km ${strings('common.km')}'),
                      selected: _radiusKm == km,
                      onSelected: (selected) {
                        setState(() => _radiusKm = selected ? km : null);
                        _run();
                      },
                    ),
                  ),
                const SizedBox(width: LoczSpacing.x2),
                PopupMenuButton<String>(
                  initialValue: _sort,
                  onSelected: (value) {
                    setState(() => _sort = value);
                    _run();
                  },
                  itemBuilder: (context) => const [
                    PopupMenuItem(value: 'relevance', child: Text('Best match')),
                    PopupMenuItem(value: 'newest', child: Text('Newest')),
                    PopupMenuItem(value: 'price_asc', child: Text('Price: low to high')),
                    PopupMenuItem(value: 'price_desc', child: Text('Price: high to low')),
                    PopupMenuItem(value: 'distance', child: Text('Nearest')),
                  ],
                  child: const Chip(avatar: Icon(Icons.sort, size: 16), label: Text('Sort')),
                ),
              ],
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
                          Text('${snapshot.error}', textAlign: TextAlign.center),
                          const SizedBox(height: LoczSpacing.x4),
                          OutlinedButton(onPressed: _run, child: Text(strings('common.retry'))),
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
                  padding: const EdgeInsets.all(LoczSpacing.x4),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 200,
                    mainAxisSpacing: LoczSpacing.x3,
                    crossAxisSpacing: LoczSpacing.x3,
                    childAspectRatio: 0.68,
                  ),
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
