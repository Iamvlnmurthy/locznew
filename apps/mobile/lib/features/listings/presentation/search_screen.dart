import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/config/env.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../data/listing_repository.dart';
import '../domain/models.dart';
import 'listing_navigation.dart';
import 'widgets/listing_card.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({
    super.key,
    this.initialQuery,
    this.initialType,
    this.initialCategoryId,
    this.initialCategoryLabel,
    this.initialAttributes = const [],
  });

  final String? initialQuery;
  final String? initialType;
  final String? initialCategoryId;
  final String? initialCategoryLabel;
  final List<String> initialAttributes;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  static const _recentKey = 'locz.recent-searches.v1';
  late final TextEditingController _controller;
  final _focusNode = FocusNode();
  Timer? _debounce;
  List<String> _recentSearches = const [];

  String _query = '';
  String? _type;
  int? _radiusKm;
  String _sort = 'relevance';
  String? _categoryId;
  String? _categoryLabel;
  List<String> _attributes = const [];
  Future<SearchResults>? _results;

  @override
  void initState() {
    super.initState();
    final initialQuery = widget.initialQuery?.trim() ?? '';
    _controller = TextEditingController(text: initialQuery);
    _query = initialQuery;
    _type = widget.initialType;
    _categoryId = widget.initialCategoryId;
    _categoryLabel = widget.initialCategoryLabel;
    _attributes = [...widget.initialAttributes];
    _focusNode.addListener(_handleFocusChanged);
    unawaited(_loadRecentSearches());
    _run();
  }

  @override
  void didUpdateWidget(covariant SearchScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialQuery == widget.initialQuery &&
        oldWidget.initialType == widget.initialType &&
        oldWidget.initialCategoryId == widget.initialCategoryId) {
      return;
    }
    final nextQuery = widget.initialQuery?.trim() ?? '';
    _controller
      ..text = nextQuery
      ..selection = TextSelection.collapsed(offset: nextQuery.length);
    _query = nextQuery;
    _type = widget.initialType;
    _categoryId = widget.initialCategoryId;
    _categoryLabel = widget.initialCategoryLabel;
    _attributes = [...widget.initialAttributes];
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
            query: _query.isEmpty ? null : _query,
            type: _type,
            cityId: (city?.id.isEmpty ?? true) ? null : city!.id,
            pincode: city?.pincode,
            latitude: city?.latitude,
            longitude: city?.longitude,
            radiusKm: _radiusKm,
            sort: _sort,
            categoryId: _categoryId,
            attributes: _attributes,
          );
    });
  }

  Future<void> _saveSearch() async {
    final auth = ref.read(authProvider);
    if (!auth.isSignedIn) {
      await context.push('/signin?next=/search');
      return;
    }
    final strings = Strings.of(context);
    final controller = TextEditingController(
      text: _query.isNotEmpty ? _query : (_categoryLabel ?? strings('savedSearches.defaultLabel')),
    );
    final label = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(strings('savedSearches.saveTitle')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(strings('savedSearches.saveHint')),
            const SizedBox(height: LoczSpacing.x3),
            TextField(
              controller: controller,
              autofocus: true,
              maxLength: 120,
              decoration: InputDecoration(labelText: strings('savedSearches.name')),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(strings('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: Text(strings('listing.save')),
          ),
        ],
      ),
    );
    if (label == null || label.length < 2 || !mounted) return;
    try {
      final city = ref.read(selectedCityProvider);
      await ref.read(listingRepositoryProvider).saveSearch(
            label: label,
            query: _query,
            type: _type,
            categoryId: _categoryId,
            cityId: city?.id,
            attributes: _attributes,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(strings('savedSearches.saved'))),
        );
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _showCategoryFilters() async {
    final result = await showModalBottomSheet<_SearchFilterResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => _SearchAttributeFilters(
        repository: ref.read(listingRepositoryProvider),
        initialCategoryId: _categoryId,
        initialAttributes: _attributes,
        strings: Strings.of(context),
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      _categoryId = result.categoryId;
      _categoryLabel = result.categoryLabel;
      _attributes = result.attributes;
    });
    _run();
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

  String _typeLabel(Strings strings) => switch (_type) {
        'JOB' => strings('feed.intentJobs'),
        'SERVICE' => strings('feed.intentServices'),
        'PRODUCT' => strings('feed.intentBuy'),
        _ => '',
      };

  IconData get _typeIcon => switch (_type) {
        'JOB' => Icons.work_outline_rounded,
        'SERVICE' => Icons.handyman_outlined,
        'PRODUCT' => Icons.shopping_bag_outlined,
        _ => Icons.explore_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final city = ref.watch(selectedCityProvider);
    final hasCoordinates = city?.latitude != null && city?.longitude != null;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        titleSpacing: LoczSpacing.x3,
        title: SizedBox(
          height: 42,
          child: TextField(
            controller: _controller,
            focusNode: _focusNode,
            autofocus: false,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: strings('search.placeholder'),
              prefixIcon: const Icon(Icons.search_rounded, size: 19),
              suffixIcon: _controller.text.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        _controller.clear();
                        setState(() => _query = '');
                        _run();
                      },
                      icon: const Icon(Icons.close_rounded, size: 17),
                    ),
              filled: true,
              fillColor: Theme.of(context).colorScheme.surface,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(22),
                borderSide: BorderSide(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(22),
                borderSide: BorderSide(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(22),
                borderSide: BorderSide(
                  color: Theme.of(context).colorScheme.primary,
                  width: 1.4,
                ),
              ),
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
        actions: [
          IconButton(
            onPressed: _saveSearch,
            tooltip: strings('savedSearches.saveTitle'),
            icon: const Icon(Icons.notifications_active_outlined),
          ),
        ],
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
                  if (_type != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        avatar: Icon(_typeIcon, size: 16),
                        label: Text(_typeLabel(strings)),
                        selected: true,
                        showCheckmark: false,
                        onSelected: (_) {
                          setState(() => _type = null);
                          _run();
                        },
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      avatar: const Icon(Icons.tune_rounded, size: 16),
                      label: Text(
                        _categoryLabel ??
                            (_attributes.isEmpty
                                ? strings('search.filters')
                                : strings('search.filtersActive')),
                      ),
                      selected: _categoryId != null || _attributes.isNotEmpty,
                      onSelected: (_) => _showCategoryFilters(),
                    ),
                  ),
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
            child: FutureBuilder<SearchResults>(
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

                final results = snapshot.data;
                final items = results?.listings ?? const <ListingSummary>[];
                final businesses = results?.businesses ?? const <BusinessSummary>[];
                if (items.isEmpty && businesses.isEmpty) {
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
                    // Shops first, kept in their own section rather than mixed in.
                    // A shop and a for-sale ad do not answer the same question, and the
                    // API scores them in separate indexes — flattening them here would
                    // invent a ranking neither side computed.
                    if (businesses.isNotEmpty)
                      _BusinessResults(
                        businesses: businesses,
                        total: results?.businessTotal ?? businesses.length,
                        strings: strings,
                      ),
                    if (items.isNotEmpty)
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
                          heroTag: 'search-${items[index].id}',
                          onTap: () => context.push(
                            '/ad/${items[index].slug}',
                            extra: ListingNavigationPreview(
                              listing: items[index],
                              heroTag: 'search-${items[index].id}',
                            ),
                          ),
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

class _SearchFilterResult {
  const _SearchFilterResult({
    required this.categoryId,
    required this.categoryLabel,
    required this.attributes,
  });

  final String? categoryId;
  final String? categoryLabel;
  final List<String> attributes;
}

class _SearchAttributeFilters extends StatefulWidget {
  const _SearchAttributeFilters({
    required this.repository,
    required this.initialCategoryId,
    required this.initialAttributes,
    required this.strings,
  });

  final ListingRepository repository;
  final String? initialCategoryId;
  final List<String> initialAttributes;
  final Strings strings;

  @override
  State<_SearchAttributeFilters> createState() => _SearchAttributeFiltersState();
}

class _SearchAttributeFiltersState extends State<_SearchAttributeFilters> {
  List<Category> _categories = const [];
  List<CategoryAttribute> _definitions = const [];
  late List<String> _attributes;
  String? _categoryId;
  String? _categoryLabel;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _categoryId = widget.initialCategoryId;
    _attributes = [...widget.initialAttributes];
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final categories = await widget.repository.categories();
      Category? selected;
      if (_categoryId != null) {
        selected = _findMobileCategory(categories, _categoryId!);
      }
      final detail =
          selected == null ? null : await widget.repository.categoryDetail(selected.slug);
      if (!mounted) return;
      setState(() {
        _categories = categories;
        _definitions =
            (detail?.attributes ?? const []).where((attribute) => attribute.isFilterable).toList();
        _categoryLabel =
            selected == null ? null : _mobileCategoryName(selected, widget.strings.locale);
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  Future<void> _selectCategory(String? id) async {
    setState(() {
      _categoryId = id;
      _categoryLabel = null;
      _attributes = [];
      _definitions = const [];
      _loading = id != null;
      _error = null;
    });
    if (id == null) return;
    final category = _findMobileCategory(_categories, id);
    if (category == null) return;
    try {
      final detail = await widget.repository.categoryDetail(category.slug);
      if (!mounted || _categoryId != id) return;
      setState(() {
        _categoryLabel = _mobileCategoryName(category, widget.strings.locale);
        _definitions = detail.attributes.where((attribute) => attribute.isFilterable).toList();
        _loading = false;
      });
    } catch (error) {
      if (!mounted || _categoryId != id) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  List<String> _values(String key) {
    final prefix = '$key:';
    return _attributes
        .where((value) => value.startsWith(prefix))
        .map((value) => value.substring(prefix.length))
        .toList();
  }

  void _replace(String key, Iterable<String> values) {
    final prefix = '$key:';
    setState(() {
      _attributes = [
        ..._attributes.where((value) => !value.startsWith(prefix)),
        ...values.where((value) => value.isNotEmpty).map((value) => '$prefix$value'),
      ];
    });
  }

  Widget _attributeControl(CategoryAttribute attribute) {
    final strings = widget.strings;
    final label = _mobileAttributeName(attribute, strings.locale);
    final values = _values(attribute.key);

    if (attribute.dataType == 'NUMBER') {
      final range = (values.firstOrNull ?? '').split('..');
      final initialMinimum = range.firstOrNull ?? '';
      final initialMaximum = range.length > 1 ? range[1] : '';
      var minimum = initialMinimum;
      var maximum = initialMaximum;
      return Column(
        key: ValueKey('filter-${attribute.key}'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            attribute.unit == null ? label : '$label (${attribute.unit})',
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 7),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: initialMinimum,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: strings('search.minimum')),
                  onChanged: (value) {
                    minimum = value.trim();
                    _replace(
                      attribute.key,
                      minimum.isEmpty && maximum.isEmpty ? const [] : ['$minimum..$maximum'],
                    );
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  initialValue: initialMaximum,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: strings('search.maximum')),
                  onChanged: (value) {
                    maximum = value.trim();
                    _replace(
                      attribute.key,
                      minimum.isEmpty && maximum.isEmpty ? const [] : ['$minimum..$maximum'],
                    );
                  },
                ),
              ),
            ],
          ),
        ],
      );
    }

    if (attribute.dataType == 'SELECT' || attribute.dataType == 'BOOLEAN') {
      final options = attribute.dataType == 'BOOLEAN'
          ? [
              CategoryAttributeOption(
                value: 'true',
                label: strings('search.yes'),
              ),
              CategoryAttributeOption(
                value: 'false',
                label: strings('search.no'),
              ),
            ]
          : attribute.options;
      return DropdownButtonFormField<String>(
        key: ValueKey('filter-${attribute.key}-${values.firstOrNull}'),
        initialValue: values.firstOrNull ?? '',
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [
          DropdownMenuItem(value: '', child: Text(strings('search.any'))),
          ...options.map(
            (option) => DropdownMenuItem(
              value: option.value,
              child: Text(
                _mobileOptionName(option, strings.locale),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
        onChanged: (value) => _replace(attribute.key, [value ?? '']),
      );
    }

    if (attribute.dataType == 'MULTI_SELECT') {
      final selected = values.toSet();
      return InputDecorator(
        decoration: InputDecoration(labelText: label, alignLabelWithHint: true),
        child: Wrap(
          spacing: 7,
          runSpacing: 7,
          children: attribute.options.map((option) {
            return FilterChip(
              label: Text(_mobileOptionName(option, strings.locale)),
              selected: selected.contains(option.value),
              onSelected: (enabled) {
                if (enabled) {
                  selected.add(option.value);
                } else {
                  selected.remove(option.value);
                }
                _replace(attribute.key, selected);
              },
            );
          }).toList(),
        ),
      );
    }

    if (attribute.dataType == 'DATE') {
      final value = values.firstOrNull;
      return InkWell(
        onTap: () async {
          final picked = await showDatePicker(
            context: context,
            firstDate: DateTime(1900),
            lastDate: DateTime(2100),
            initialDate: DateTime.tryParse(value ?? '') ?? DateTime.now(),
          );
          if (picked != null) {
            _replace(
              attribute.key,
              [picked.toIso8601String().substring(0, 10)],
            );
          }
        },
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            suffixIcon: const Icon(Icons.calendar_today_outlined),
          ),
          child: Text(value ?? strings('search.chooseDate')),
        ),
      );
    }

    return TextFormField(
      key: ValueKey('filter-${attribute.key}'),
      initialValue: values.firstOrNull ?? '',
      decoration: InputDecoration(labelText: label),
      onChanged: (value) => _replace(attribute.key, [value.trim()]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = widget.strings;
    final options = _flattenMobileCategories(_categories, strings.locale);
    return FractionallySizedBox(
      heightFactor: 0.9,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              LoczSpacing.x4,
              0,
              LoczSpacing.x4,
              LoczSpacing.x3,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    strings('search.filters'),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _categoryId = null;
                      _categoryLabel = null;
                      _attributes = [];
                      _definitions = const [];
                    });
                  },
                  child: Text(strings('search.clearFilters')),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: LoczSpacing.x4),
              children: [
                DropdownButtonFormField<String>(
                  key: ValueKey('search-category-$_categoryId'),
                  initialValue: _categoryId ?? '',
                  isExpanded: true,
                  decoration: InputDecoration(labelText: strings('search.category')),
                  items: [
                    DropdownMenuItem(
                      value: '',
                      child: Text(strings('search.allCategories')),
                    ),
                    ...options.map(
                      (option) => DropdownMenuItem(
                        value: option.$1,
                        child: Text(option.$2, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                  ],
                  onChanged: (value) => _selectCategory((value?.isEmpty ?? true) ? null : value),
                ),
                if (_loading) ...[
                  const SizedBox(height: LoczSpacing.x4),
                  const LinearProgressIndicator(),
                ],
                if (_error != null) ...[
                  const SizedBox(height: LoczSpacing.x4),
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                if (_definitions.isNotEmpty) ...[
                  const SizedBox(height: LoczSpacing.x5),
                  Text(
                    strings('search.categoryDetails'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    strings('search.categoryDetailsHint'),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: LoczSpacing.x4),
                  for (final attribute in _definitions) ...[
                    _attributeControl(attribute),
                    const SizedBox(height: LoczSpacing.x4),
                  ],
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(LoczSpacing.x4),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.pop(
                  context,
                  _SearchFilterResult(
                    categoryId: _categoryId,
                    categoryLabel: _categoryLabel,
                    attributes: _attributes,
                  ),
                ),
                child: Text(strings('search.applyFilters')),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Category? _findMobileCategory(List<Category> categories, String id) {
  for (final category in categories) {
    if (category.id == id) return category;
    final child = _findMobileCategory(category.children, id);
    if (child != null) return child;
  }
  return null;
}

String _mobileCategoryName(Category category, AppLocaleOption locale) => switch (locale) {
      AppLocaleOption.te => category.nameTe ?? category.name,
      AppLocaleOption.hi => category.nameHi ?? category.name,
      AppLocaleOption.en => category.name,
    };

String _mobileAttributeName(
  CategoryAttribute attribute,
  AppLocaleOption locale,
) =>
    switch (locale) {
      AppLocaleOption.te => attribute.labelTe ?? attribute.label,
      AppLocaleOption.hi => attribute.labelHi ?? attribute.label,
      AppLocaleOption.en => attribute.label,
    };

String _mobileOptionName(
  CategoryAttributeOption option,
  AppLocaleOption locale,
) =>
    switch (locale) {
      AppLocaleOption.te => option.labelTe ?? option.label,
      AppLocaleOption.hi => option.labelHi ?? option.label,
      AppLocaleOption.en => option.label,
    };

List<(String, String)> _flattenMobileCategories(
  List<Category> categories,
  AppLocaleOption locale, [
  List<String> parents = const [],
]) {
  final result = <(String, String)>[];
  for (final category in categories) {
    final path = [...parents, _mobileCategoryName(category, locale)];
    if (category.children.isEmpty) {
      result.add((category.id, path.join(' › ')));
    } else {
      result.addAll(_flattenMobileCategories(category.children, locale, path));
    }
  }
  return result;
}

/// Directory businesses in a search result.
///
/// A horizontal strip rather than a full list: on a phone the shops are context for the
/// listings below, not a replacement for them. Somebody who wants only shops has the
/// category filter; somebody searching "kirana" wants both, with the ads still reachable
/// without scrolling past thirty results.
///
/// Tapping opens the business on the website. The app has no business screen yet, and a
/// tap that goes nowhere is worse than one that leaves the app: the web page already
/// carries the address, phone, hours and the claim flow.
class _BusinessResults extends StatelessWidget {
  const _BusinessResults({
    required this.businesses,
    required this.total,
    required this.strings,
  });

  final List<BusinessSummary> businesses;
  final int total;
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            LoczSpacing.x4,
            LoczSpacing.x3,
            LoczSpacing.x4,
            LoczSpacing.x2,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  strings('search.businessesTitle'),
                  style: theme.textTheme.titleSmall,
                ),
              ),
              Text(
                strings('search.businessCount', {'count': total}),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 118,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: LoczSpacing.x4),
            itemCount: businesses.length,
            separatorBuilder: (_, __) => const SizedBox(width: LoczSpacing.x3),
            itemBuilder: (context, index) {
              final business = businesses[index];
              return _BusinessCard(
                business: business,
                strings: strings,
                onTap: () => context.push('/b/${business.slug}'),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _BusinessCard extends StatelessWidget {
  const _BusinessCard({
    required this.business,
    required this.strings,
    required this.onTap,
  });

  final BusinessSummary business;
  final Strings strings;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      width: 240,
      child: Card(
        clipBehavior: Clip.antiAlias,
        margin: EdgeInsets.zero,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(LoczSpacing.x3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.storefront_outlined,
                      size: 18,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: LoczSpacing.x2),
                    Expanded(
                      child: Text(
                        business.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall,
                      ),
                    ),
                  ],
                ),
                if (business.subtitle.isNotEmpty)
                  Text(
                    business.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                // Only claimed records say anything about themselves. An imported one is
                // shown as unclaimed rather than dressed up as a verified shop.
                Row(
                  children: [
                    Icon(
                      business.isClaimed ? Icons.verified_rounded : Icons.info_outline_rounded,
                      size: 14,
                      color: business.isClaimed
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        strings(
                          business.isClaimed
                              ? 'search.businessClaimed'
                              : 'search.businessUnclaimed',
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
