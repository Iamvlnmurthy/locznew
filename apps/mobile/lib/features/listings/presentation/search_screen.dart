import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
  static const _recentKey = 'locz.recent-searches.v1';
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  Timer? _debounce;
  List<String> _recentSearches = const [];

  String _query = '';
  int? _radiusKm;
  String _sort = 'relevance';
  Future<List<ListingSummary>>? _results;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_handleFocusChanged);
    unawaited(_loadRecentSearches());
    _run();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _focusNode
      ..removeListener(_handleFocusChanged)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  void _handleFocusChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _loadRecentSearches() async {
    final preferences = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _recentSearches = (preferences.getStringList(_recentKey) ?? const []).take(8).toList();
    });
  }

  Future<void> _rememberSearch(String value) async {
    final query = value.trim();
    if (query.isEmpty) return;
    final next = [
      query,
      ..._recentSearches.where(
        (item) => item.toLowerCase() != query.toLowerCase(),
      ),
    ].take(8).toList();
    final preferences = await SharedPreferences.getInstance();
    await preferences.setStringList(_recentKey, next);
    if (mounted) setState(() => _recentSearches = next);
  }

  Future<void> _clearRecentSearches() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_recentKey);
    if (mounted) setState(() => _recentSearches = const []);
  }

  void _useRecentSearch(String query) {
    _controller.text = query;
    _controller.selection = TextSelection.collapsed(offset: query.length);
    _focusNode.unfocus();
    setState(() => _query = query);
    unawaited(_rememberSearch(query));
    _run();
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
          focusNode: _focusNode,
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
            final query = value.trim();
            setState(() => _query = query);
            unawaited(_rememberSearch(query));
            _focusNode.unfocus();
            _run();
          },
        ),
      ),
      body: Column(
        children: [
          if (_focusNode.hasFocus && _controller.text.trim().isEmpty && _recentSearches.isNotEmpty)
            Material(
              color: Theme.of(context).colorScheme.surface,
              elevation: 3,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  LoczSpacing.x4,
                  LoczSpacing.x2,
                  LoczSpacing.x4,
                  LoczSpacing.x3,
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            strings('search.recentSearches'),
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                        ),
                        TextButton(
                          onPressed: _clearRecentSearches,
                          child: Text(strings('search.clearRecent')),
                        ),
                      ],
                    ),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 250),
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: _recentSearches.length,
                        itemBuilder: (context, index) {
                          final query = _recentSearches[index];
                          return ListTile(
                            dense: true,
                            minLeadingWidth: 20,
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(
                              Icons.history_rounded,
                              size: 19,
                            ),
                            title: Text(query, maxLines: 1),
                            onTap: () => _useRecentSearch(query),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
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
