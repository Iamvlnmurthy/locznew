import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/config/env.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/domain/models.dart';

class _PendingImage {
  _PendingImage(this.file);

  final File file;
  double progress = 0;
  bool failed = false;
}

/// Posting flow.
///
/// Details first, photos after: the API scopes upload URLs to a listing id, so the
/// listing must exist before any image can be uploaded. That ordering also means a
/// dropped connection mid-upload loses photos, never the ad itself.
class PostAdScreen extends ConsumerStatefulWidget {
  const PostAdScreen({super.key, this.listingId});

  final String? listingId;

  @override
  ConsumerState<PostAdScreen> createState() => _PostAdScreenState();
}

class _PostAdScreenState extends ConsumerState<PostAdScreen> {
  static const _progressKey = 'locz.post-progress.v1';

  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  final _budgetMinController = TextEditingController();
  final _budgetMaxController = TextEditingController();
  final _quantityController = TextEditingController(text: '1');

  String _listingType = 'PRODUCT';
  String? _categoryId;
  String? _categorySlug;
  String? _cityId;
  String _condition = 'GOOD';
  bool _isFree = false;
  bool _isNegotiable = false;
  String _contactPreference = 'IN_APP_ONLY';
  List<CategoryAttribute> _categoryAttributes = const [];
  Map<String, dynamic> _attributeValues = {};
  bool _attributesResolved = false;
  bool _attributesAttempted = false;
  bool _loadingAttributes = false;

  final List<_PendingImage> _images = [];
  bool _submitting = false;
  String? _error;
  String? _createdListingId;
  String? _createdSlug;
  bool _publishedImmediately = false;
  bool _savedAsDraft = false;
  bool _loadingListing = false;
  String? _originalStatus;
  Timer? _progressTimer;
  bool _restoringProgress = false;

  @override
  void initState() {
    super.initState();
    if (widget.listingId == null) {
      _cityId = ref.read(selectedCityProvider)?.id;
      _titleController.addListener(_onFormChanged);
      _descriptionController.addListener(_onFormChanged);
      _priceController.addListener(_onFormChanged);
      _budgetMinController.addListener(_onFormChanged);
      _budgetMaxController.addListener(_onFormChanged);
      _quantityController.addListener(_onFormChanged);
      unawaited(_offerProgressRestore());
    } else {
      _loadingListing = true;
      unawaited(_loadListing());
    }
  }

  Future<void> _loadListing() async {
    try {
      final repository = ref.read(listingRepositoryProvider);
      final results = await Future.wait([
        repository.detail(widget.listingId!),
        repository.cities(launchedOnly: true),
        repository.categories(),
      ]);
      final listing = results[0] as ListingDetail;
      final cities = results[1] as List<City>;
      final categories = results[2] as List<Category>;
      final category = _findCategory(categories, listing.categoryId);
      final categoryDetail =
          category == null ? null : await repository.categoryDetail(category.slug);
      if (!mounted) return;
      final marketplace = listing.marketplace;
      setState(() {
        _titleController.text = listing.summary.title;
        _listingType = listing.summary.type;
        _descriptionController.text = listing.description;
        _priceController.text = marketplace['price']?.toString() ?? '';
        _budgetMinController.text = listing.buyerRequirement['budgetMin']?.toString() ?? '';
        _budgetMaxController.text = listing.buyerRequirement['budgetMax']?.toString() ?? '';
        _quantityController.text = listing.buyerRequirement['quantity']?.toString() ?? '1';
        _categoryId = listing.categoryId;
        _categorySlug = category?.slug;
        _cityId = listing.cityId ??
            cities.where((city) => city.name == listing.summary.cityName).firstOrNull?.id;
        _condition = marketplace['condition'] as String? ?? 'GOOD';
        _isFree = marketplace['isFree'] as bool? ?? listing.summary.isFree;
        _isNegotiable = marketplace['isNegotiable'] as bool? ?? listing.summary.isNegotiable;
        _contactPreference = listing.contactPreference;
        _originalStatus = listing.summary.status;
        _createdSlug = listing.summary.slug;
        _attributeValues = Map<String, dynamic>.from(listing.attributes);
        _categoryAttributes = categoryDetail?.attributes ?? const [];
        _attributesResolved = categoryDetail != null;
        _attributesAttempted = true;
        _loadingListing = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loadingListing = false;
      });
    }
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    _titleController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    _budgetMinController.dispose();
    _budgetMaxController.dispose();
    _quantityController.dispose();
    super.dispose();
  }

  void _scheduleProgressSave() {
    if (widget.listingId != null || _restoringProgress) return;
    _progressTimer?.cancel();
    _progressTimer = Timer(const Duration(milliseconds: 350), () {
      unawaited(_saveProgress());
    });
  }

  void _onFormChanged() {
    if (mounted) setState(() {});
    _scheduleProgressSave();
  }

  double get _completion {
    final checks = <bool>[
      _titleController.text.trim().length >= 5,
      _categoryId != null,
      _descriptionController.text.trim().length >= 10,
      _listingType == 'BUYER_REQUIREMENT' || _isFree || _priceController.text.trim().isNotEmpty,
      _cityId != null,
      _listingType == 'BUYER_REQUIREMENT' || _images.isNotEmpty || widget.listingId != null,
    ];
    return checks.where((value) => value).length / checks.length;
  }

  void _selectListingType(String type) {
    if (_listingType == type) return;
    setState(() {
      _listingType = type;
      _categoryId = null;
      _categorySlug = null;
      _categoryAttributes = const [];
      _attributeValues = {};
      _attributesResolved = false;
      _attributesAttempted = false;
    });
    _scheduleProgressSave();
  }

  Future<void> _saveProgress() async {
    final hasProgress = _titleController.text.trim().isNotEmpty ||
        _descriptionController.text.trim().isNotEmpty ||
        _priceController.text.trim().isNotEmpty ||
        _categoryId != null;
    final preferences = await SharedPreferences.getInstance();
    if (!hasProgress) {
      await preferences.remove(_progressKey);
      return;
    }
    await preferences.setString(
      _progressKey,
      jsonEncode({
        'title': _titleController.text,
        'listingType': _listingType,
        'description': _descriptionController.text,
        'price': _priceController.text,
        'budgetMin': _budgetMinController.text,
        'budgetMax': _budgetMaxController.text,
        'quantity': _quantityController.text,
        'categoryId': _categoryId,
        'cityId': _cityId,
        'condition': _condition,
        'isFree': _isFree,
        'isNegotiable': _isNegotiable,
        'contactPreference': _contactPreference,
        'attributes': _attributeValues,
      }),
    );
  }

  Future<void> _clearProgress() async {
    _progressTimer?.cancel();
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_progressKey);
  }

  Future<void> _offerProgressRestore() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_progressKey);
    if (raw == null || !mounted) return;

    Map<String, dynamic> saved;
    try {
      saved = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      await preferences.remove(_progressKey);
      return;
    }

    await Future<void>.delayed(Duration.zero);
    if (!mounted) return;
    final strings = Strings.of(context);
    final restore = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(strings('post.restoreTitle')),
        content: Text(strings('post.restoreBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(strings('post.discardProgress')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(strings('post.restoreProgress')),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (restore != true) {
      await preferences.remove(_progressKey);
      return;
    }

    _restoringProgress = true;
    setState(() {
      _titleController.text = saved['title'] as String? ?? '';
      _listingType = saved['listingType'] as String? ?? 'PRODUCT';
      _descriptionController.text = saved['description'] as String? ?? '';
      _priceController.text = saved['price'] as String? ?? '';
      _budgetMinController.text = saved['budgetMin'] as String? ?? '';
      _budgetMaxController.text = saved['budgetMax'] as String? ?? '';
      _quantityController.text = saved['quantity'] as String? ?? '1';
      _categoryId = saved['categoryId'] as String?;
      _cityId = saved['cityId'] as String? ?? _cityId;
      _condition = saved['condition'] as String? ?? 'GOOD';
      _isFree = saved['isFree'] as bool? ?? false;
      _isNegotiable = saved['isNegotiable'] as bool? ?? false;
      _contactPreference = saved['contactPreference'] as String? ?? 'IN_APP_ONLY';
      _attributeValues = Map<String, dynamic>.from(
        saved['attributes'] as Map<String, dynamic>? ?? const {},
      );
    });
    _restoringProgress = false;
  }

  Future<void> _pickImages() async {
    if (_images.length >= Env.maxImagesPerListing) return;

    final picker = ImagePicker();
    final picked = await picker.pickMultiImage(
      // Resizing on the device saves the user's data allowance; the API re-derives its
      // own renditions regardless.
      maxWidth: 2000,
      imageQuality: 85,
    );

    if (picked.isEmpty) return;

    setState(() {
      for (final file in picked.take(Env.maxImagesPerListing - _images.length)) {
        _images.add(_PendingImage(File(file.path)));
      }
    });
  }

  Future<void> _loadCategoryAttributes(Category category) async {
    setState(() {
      _loadingAttributes = true;
      _attributesResolved = false;
      _attributesAttempted = true;
      _categoryAttributes = const [];
      _attributeValues = {};
      _categorySlug = category.slug;
    });
    try {
      final detail = await ref.read(listingRepositoryProvider).categoryDetail(category.slug);
      if (!mounted || _categoryId != category.id) return;
      setState(() {
        _categoryAttributes = detail.attributes;
        _attributesResolved = true;
        _loadingAttributes = false;
      });
    } on ApiException catch (error) {
      if (!mounted || _categoryId != category.id) return;
      setState(() {
        _error = error.message;
        _loadingAttributes = false;
      });
    }
  }

  List<Map<String, dynamic>>? _attributePayload() {
    if (!_attributesResolved) return null;
    final result = <Map<String, dynamic>>[];
    for (final attribute in _categoryAttributes) {
      final raw = _attributeValues[attribute.key];
      if (raw == null || raw == '' || (raw is List && raw.isEmpty)) continue;
      dynamic value = raw;
      if (attribute.dataType == 'NUMBER') value = num.tryParse(raw.toString());
      if (value != null) result.add({'key': attribute.key, 'value': value});
    }
    return result;
  }

  Future<void> _submit({bool saveAsDraft = false}) async {
    if (!_formKey.currentState!.validate()) return;
    if (_categoryId == null || _cityId == null) {
      setState(() => _error = Strings.of(context)('common.error'));
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final repository = ref.read(listingRepositoryProvider);

      final created = widget.listingId == null
          ? await repository.createListing(
              type: _listingType,
              title: _titleController.text.trim(),
              description: _descriptionController.text.trim(),
              categoryId: _categoryId!,
              cityId: _cityId!,
              condition: _condition,
              price: _isFree ? 0 : num.tryParse(_priceController.text.trim()),
              isFree: _isFree,
              isNegotiable: _isNegotiable,
              contactPreference: _contactPreference,
              saveAsDraft: saveAsDraft,
              attributes: _attributePayload(),
              budgetMin: num.tryParse(_budgetMinController.text.trim()),
              budgetMax: num.tryParse(_budgetMaxController.text.trim()),
              quantity: int.tryParse(_quantityController.text.trim()),
              preferredCondition: _condition,
            )
          : await repository.updateListing(
              listingId: widget.listingId!,
              type: _listingType,
              title: _titleController.text.trim(),
              description: _descriptionController.text.trim(),
              categoryId: _categoryId!,
              cityId: _cityId!,
              condition: _condition,
              price: _isFree ? 0 : num.tryParse(_priceController.text.trim()),
              isFree: _isFree,
              isNegotiable: _isNegotiable,
              contactPreference: _contactPreference,
              attributes: _attributePayload(),
              budgetMin: num.tryParse(_budgetMinController.text.trim()),
              budgetMax: num.tryParse(_budgetMaxController.text.trim()),
              quantity: int.tryParse(_quantityController.text.trim()),
              preferredCondition: _condition,
            );

      if (widget.listingId != null && _originalStatus == 'DRAFT' && !saveAsDraft) {
        await repository.listingCommand(widget.listingId!, 'submit');
      }

      final listingId = created['id'] as String;
      _createdListingId = listingId;
      _createdSlug = created['slug'] as String;
      _publishedImmediately = created['status'] == 'PUBLISHED';
      _savedAsDraft = saveAsDraft;

      // Sequential uploads: several large photos in parallel on a mobile connection
      // make all of them slow and the progress bars meaningless.
      for (final image in !saveAsDraft ? _images : <_PendingImage>[]) {
        try {
          await repository.uploadImage(
            listingId,
            image.file,
            onProgress: (progress) {
              if (mounted) setState(() => image.progress = progress);
            },
          );
        } catch (_) {
          if (mounted) setState(() => image.failed = true);
        }
      }

      if (!mounted) return;
      if (widget.listingId == null) await _clearProgress();
      if (!mounted) return;
      ref.invalidate(myListingsProvider);
      ref.invalidate(feedProvider);
      // Ask only after publishing, when moderation and enquiry updates have context.
      unawaited(ref.read(pushPermissionProvider.notifier).request());
      setState(() => _submitting = false);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _submitting = false;
        });
      }
    }
  }

  Future<void> _showPreview() {
    final strings = Strings.of(context);
    final theme = Theme.of(context);
    final price = _isFree ? strings('listing.free') : _priceController.text.trim();

    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            LoczSpacing.x4,
            0,
            LoczSpacing.x4,
            LoczSpacing.x5,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                strings('post.previewTitle'),
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: LoczSpacing.x3),
              Container(
                height: 150,
                width: double.infinity,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(LoczRadius.lg),
                ),
                child: const Icon(Icons.photo_outlined, size: 38),
              ),
              const SizedBox(height: LoczSpacing.x3),
              if (price.isNotEmpty)
                Text(
                  _isFree ? price : '₹$price',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: theme.colorScheme.primary,
                  ),
                ),
              Text(
                _titleController.text.trim().isEmpty
                    ? strings('post.previewUntitled')
                    : _titleController.text.trim(),
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: LoczSpacing.x2),
              Text(
                _descriptionController.text.trim().isEmpty
                    ? strings('post.previewNoDescription')
                    : _descriptionController.text.trim(),
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: LoczSpacing.x4),
              Row(
                children: [
                  Icon(
                    Icons.shield_outlined,
                    size: 16,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      strings('post.contactPrivacy'),
                      style: theme.textTheme.labelSmall,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _attributeLabel(CategoryAttribute attribute, Strings strings) {
    final base = switch (strings.locale) {
      AppLocaleOption.te => attribute.labelTe ?? attribute.label,
      AppLocaleOption.hi => attribute.labelHi ?? attribute.label,
      AppLocaleOption.en => attribute.label,
    };
    return attribute.unit == null ? base : '$base (${attribute.unit})';
  }

  String _optionLabel(CategoryAttributeOption option, Strings strings) => switch (strings.locale) {
        AppLocaleOption.te => option.labelTe ?? option.label,
        AppLocaleOption.hi => option.labelHi ?? option.label,
        AppLocaleOption.en => option.label,
      };

  Widget _buildAttributeField(CategoryAttribute attribute, Strings strings) {
    final label = _attributeLabel(attribute, strings);
    final current = _attributeValues[attribute.key];
    String? requiredValidator(dynamic value) {
      final missing = value == null || value == '' || (value is List && value.isEmpty);
      return attribute.isRequired && missing ? strings('post.attributeRequired') : null;
    }

    if (attribute.dataType == 'SELECT') {
      return DropdownButtonFormField<String>(
        key: ValueKey('attribute-${attribute.key}-$current'),
        initialValue: current?.toString(),
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: attribute.options
            .map(
              (option) => DropdownMenuItem(
                value: option.value,
                child: Text(
                  _optionLabel(option, strings),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            )
            .toList(),
        onChanged: (value) {
          setState(() => _attributeValues[attribute.key] = value);
          _scheduleProgressSave();
        },
        validator: requiredValidator,
      );
    }

    if (attribute.dataType == 'BOOLEAN') {
      return DropdownButtonFormField<bool>(
        key: ValueKey('attribute-${attribute.key}-$current'),
        initialValue: current is bool ? current : null,
        decoration: InputDecoration(labelText: label),
        items: [
          DropdownMenuItem(
            value: true,
            child: Text(strings('post.attributeYes')),
          ),
          DropdownMenuItem(
            value: false,
            child: Text(strings('post.attributeNo')),
          ),
        ],
        onChanged: (value) {
          setState(() => _attributeValues[attribute.key] = value);
          _scheduleProgressSave();
        },
        validator: requiredValidator,
      );
    }

    if (attribute.dataType == 'MULTI_SELECT') {
      final selected = (current as List<dynamic>? ?? const []).map((value) => '$value').toSet();
      return FormField<List<String>>(
        initialValue: selected.toList(),
        validator: requiredValidator,
        builder: (field) => InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            errorText: field.errorText,
            alignLabelWithHint: true,
          ),
          child: Wrap(
            spacing: 7,
            runSpacing: 7,
            children: attribute.options.map((option) {
              final active = selected.contains(option.value);
              return FilterChip(
                label: Text(_optionLabel(option, strings)),
                selected: active,
                onSelected: (enabled) {
                  setState(() {
                    if (enabled) {
                      selected.add(option.value);
                    } else {
                      selected.remove(option.value);
                    }
                    _attributeValues[attribute.key] = selected.toList();
                  });
                  field.didChange(selected.toList());
                  _scheduleProgressSave();
                },
              );
            }).toList(),
          ),
        ),
      );
    }

    if (attribute.dataType == 'DATE') {
      return FormField<String>(
        initialValue: current?.toString(),
        validator: requiredValidator,
        builder: (field) => InkWell(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              firstDate: DateTime(1900),
              lastDate: DateTime(2100),
              initialDate: DateTime.tryParse(field.value ?? '') ?? DateTime.now(),
            );
            if (picked == null) return;
            final value = picked.toIso8601String().substring(0, 10);
            setState(() => _attributeValues[attribute.key] = value);
            field.didChange(value);
            _scheduleProgressSave();
          },
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: label,
              errorText: field.errorText,
              suffixIcon: const Icon(Icons.calendar_today_outlined),
            ),
            child: Text(field.value ?? strings('post.attributeSelectDate')),
          ),
        ),
      );
    }

    if (attribute.key == 'model' && _categorySlug != null) {
      return _ModelSuggestionField(
        initialValue: current?.toString() ?? '',
        label: label,
        load: (query) => ref.read(listingRepositoryProvider).modelSuggestions(
              _categorySlug!,
              brand: _attributeValues['brand']?.toString(),
              query: query,
            ),
        onChanged: (value) {
          _attributeValues[attribute.key] = value;
          _scheduleProgressSave();
        },
        validator: (value) =>
            attribute.isRequired && value.trim().isEmpty ? strings('post.attributeRequired') : null,
      );
    }

    return TextFormField(
      key: ValueKey('attribute-${attribute.key}'),
      initialValue: current?.toString() ?? '',
      keyboardType: attribute.dataType == 'NUMBER'
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      decoration: InputDecoration(
        labelText: label,
        helperText: attribute.key == 'capacity' ? strings('post.attributeCapacityHint') : null,
      ),
      onChanged: (value) {
        _attributeValues[attribute.key] = value;
        _scheduleProgressSave();
      },
      validator: (value) {
        final missing = value == null || value.trim().isEmpty;
        if (attribute.isRequired && missing) {
          return strings('post.attributeRequired');
        }
        if (!missing && attribute.dataType == 'NUMBER') {
          final number = num.tryParse(value);
          if (number == null) return strings('post.attributeNumber');
          if (attribute.minValue != null && number < attribute.minValue!) {
            return strings(
              'post.attributeMinimum',
              {'value': attribute.minValue!},
            );
          }
          if (attribute.maxValue != null && number > attribute.maxValue!) {
            return strings(
              'post.attributeMaximum',
              {'value': attribute.maxValue!},
            );
          }
        }
        return null;
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final auth = ref.watch(authProvider);

    if (!auth.isSignedIn) {
      final theme = Theme.of(context);
      return Scaffold(
        appBar: AppBar(title: Text(strings('post.title'))),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(LoczSpacing.x5),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(LoczSpacing.x5),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 70,
                        height: 70,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: Icon(
                          Icons.add_photo_alternate_outlined,
                          size: 34,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      const SizedBox(height: LoczSpacing.x5),
                      Text(
                        strings('post.loginRequired'),
                        style: theme.textTheme.titleLarge,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: LoczSpacing.x2),
                      Text(
                        strings('post.loginRequiredHint'),
                        style: theme.textTheme.bodyMedium,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: LoczSpacing.x5),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: () => context.push('/signin?next=/post'),
                          icon: const Icon(Icons.login_rounded),
                          label: Text(strings('nav.signIn')),
                        ),
                      ),
                      const SizedBox(height: LoczSpacing.x2),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => context.push('/register?next=/post'),
                          child: Text(strings('register.createAccount')),
                        ),
                      ),
                      const SizedBox(height: LoczSpacing.x4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.verified_outlined,
                            size: 16,
                            color: theme.colorScheme.primary,
                          ),
                          const SizedBox(width: 7),
                          Flexible(
                            child: Text(
                              strings('post.alwaysFree'),
                              style: theme.textTheme.labelMedium,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (_createdListingId != null && !_submitting) {
      return _SuccessScreen(
        published: _publishedImmediately,
        editing: widget.listingId != null,
        draft: _savedAsDraft,
        slug: _createdSlug!,
        strings: strings,
      );
    }

    if (_loadingListing) {
      return Scaffold(
        appBar: AppBar(title: Text(strings('post.editTitle'))),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final categories = ref.watch(categoriesProvider);
    final cities = ref.watch(citiesProvider);
    final theme = Theme.of(context);
    final canSaveDraft = widget.listingId == null || _originalStatus == 'DRAFT';
    final actionsEnabled = !_submitting && _originalStatus != 'REMOVED';

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        toolbarHeight: 58,
        scrolledUnderElevation: 0,
        title: Text(
          widget.listingId == null ? strings('post.title') : strings('post.editTitle'),
        ),
        bottom: widget.listingId == null
            ? PreferredSize(
                preferredSize: const Size.fromHeight(4),
                child: LinearProgressIndicator(
                  value: _completion,
                  minHeight: 4,
                  backgroundColor: theme.colorScheme.surfaceContainerHigh,
                ),
              )
            : null,
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(
              top: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            boxShadow: [
              BoxShadow(
                color: theme.colorScheme.shadow.withValues(alpha: .08),
                blurRadius: 20,
                offset: const Offset(0, -5),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 9, 12, 10),
            child: Row(
              children: [
                IconButton.outlined(
                  onPressed: _submitting ? null : _showPreview,
                  tooltip: strings('post.preview'),
                  icon: const Icon(Icons.visibility_outlined, size: 20),
                ),
                if (canSaveDraft) ...[
                  const SizedBox(width: 7),
                  IconButton.outlined(
                    onPressed: actionsEnabled ? () => _submit(saveAsDraft: true) : null,
                    tooltip: strings('post.saveDraft'),
                    icon: const Icon(Icons.bookmark_add_outlined, size: 20),
                  ),
                ],
                const SizedBox(width: 9),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: actionsEnabled ? () => _submit() : null,
                    icon: _submitting
                        ? const SizedBox.square(
                            dimension: 17,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.arrow_forward_rounded, size: 18),
                    iconAlignment: IconAlignment.end,
                    label: Text(
                      _submitting
                          ? strings(
                              widget.listingId == null ? 'post.publishing' : 'post.savingChanges',
                            )
                          : strings(
                              widget.listingId == null ? 'post.publish' : 'post.saveChanges',
                            ),
                    ),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(46),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ListView(
              padding: const EdgeInsets.all(LoczSpacing.x4),
              children: [
                if (widget.listingId == null) ...[
                  _PostJourneyHeader(
                    subtitle: strings('post.subtitle'),
                    question: strings('post.intentQuestion'),
                    progress: strings(
                      'post.progressTitle',
                      {'percent': (_completion * 100).round()},
                    ),
                    progressHint: strings('post.progressHint'),
                    completion: _completion,
                    children: [
                      _PostIntentChoice(
                        selected: _listingType == 'PRODUCT',
                        icon: Icons.sell_outlined,
                        title: strings('post.intentSell'),
                        hint: strings('post.intentSellHint'),
                        onTap: () => _selectListingType('PRODUCT'),
                      ),
                      _PostIntentChoice(
                        selected: _listingType == 'BUYER_REQUIREMENT',
                        icon: Icons.search_rounded,
                        title: strings('post.intentBuy'),
                        hint: strings('post.intentBuyHint'),
                        onTap: () => _selectListingType('BUYER_REQUIREMENT'),
                      ),
                    ],
                  ),
                ] else
                  Text(
                    strings('post.editSubtitle'),
                    style: theme.textTheme.bodyMedium,
                  ),
                if (_originalStatus == 'PUBLISHED') ...[
                  const SizedBox(height: LoczSpacing.x3),
                  Container(
                    padding: const EdgeInsets.all(LoczSpacing.x3),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.tertiaryContainer,
                      borderRadius: BorderRadius.circular(LoczRadius.md),
                    ),
                    child: Text(
                      strings('post.moderationWarning'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onTertiaryContainer,
                      ),
                    ),
                  ),
                ],
                if (_originalStatus == 'REMOVED') ...[
                  const SizedBox(height: LoczSpacing.x3),
                  Container(
                    padding: const EdgeInsets.all(LoczSpacing.x3),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(LoczRadius.md),
                    ),
                    child: Text(
                      strings('post.removedCannotEdit'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onErrorContainer,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: LoczSpacing.x5),
                _SectionHeading(
                  index: '01',
                  label: strings('post.detailsSection'),
                ),
                const SizedBox(height: LoczSpacing.x3),
                if (_error != null)
                  Container(
                    padding: const EdgeInsets.all(LoczSpacing.x3),
                    margin: const EdgeInsets.only(bottom: LoczSpacing.x4),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(LoczRadius.md),
                    ),
                    child: Text(
                      _error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onErrorContainer,
                      ),
                    ),
                  ),
                TextFormField(
                  controller: _titleController,
                  maxLength: 160,
                  decoration: InputDecoration(labelText: strings('post.fieldTitle')),
                  validator: (value) =>
                      (value == null || value.trim().length < 5) ? strings('common.error') : null,
                ),
                categories.when(
                  loading: () => const LinearProgressIndicator(),
                  error: (error, _) => Text(error.toString()),
                  data: (list) {
                    // Only leaf categories are offered — posting into "Electronics" instead
                    // of "Mobile Phones" is the most common miscategorisation.
                    final options = <MapEntry<String, String>>[];
                    for (final category in list) {
                      if (category.children.isEmpty) {
                        options.add(MapEntry(category.id, category.name));
                      } else {
                        for (final child in category.children) {
                          options.add(
                            MapEntry(
                              child.id,
                              '${category.name} › ${child.name}',
                            ),
                          );
                        }
                      }
                    }
                    final selectedCategory =
                        _categoryId == null ? null : _findCategory(list, _categoryId!);
                    if (selectedCategory != null &&
                        !_attributesResolved &&
                        !_attributesAttempted &&
                        !_loadingAttributes) {
                      WidgetsBinding.instance.addPostFrameCallback(
                        (_) => _loadCategoryAttributes(selectedCategory),
                      );
                    }

                    return DropdownButtonFormField<String>(
                      key: ValueKey('category-$_categoryId'),
                      initialValue: _categoryId,
                      decoration: InputDecoration(
                        labelText: strings('post.fieldCategory'),
                      ),
                      isExpanded: true,
                      items: options
                          .map(
                            (option) => DropdownMenuItem(
                              value: option.key,
                              child: Text(
                                option.value,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        setState(() {
                          _categoryId = value;
                          _categorySlug = null;
                        });
                        final category = value == null ? null : _findCategory(list, value);
                        if (category != null) {
                          unawaited(_loadCategoryAttributes(category));
                        }
                        _scheduleProgressSave();
                      },
                      validator: (value) => value == null ? strings('common.error') : null,
                    );
                  },
                ),
                if (_loadingAttributes) ...[
                  const SizedBox(height: LoczSpacing.x3),
                  const LinearProgressIndicator(),
                ],
                if (_categoryAttributes.isNotEmpty) ...[
                  const SizedBox(height: LoczSpacing.x4),
                  Text(
                    strings('post.attributeSection'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    strings('post.attributeHint'),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: LoczSpacing.x3),
                  for (final attribute in _categoryAttributes) ...[
                    _buildAttributeField(attribute, strings),
                    const SizedBox(height: LoczSpacing.x3),
                  ],
                ],
                const SizedBox(height: LoczSpacing.x4),
                TextFormField(
                  controller: _descriptionController,
                  maxLines: 5,
                  maxLength: 5000,
                  decoration: InputDecoration(
                    labelText: strings('post.fieldDescription'),
                  ),
                  validator: (value) =>
                      (value == null || value.trim().length < 10) ? strings('common.error') : null,
                ),
                const SizedBox(height: LoczSpacing.x5),
                _SectionHeading(
                  index: '02',
                  label: strings(
                    _listingType == 'BUYER_REQUIREMENT'
                        ? 'post.budgetSection'
                        : 'post.priceSection',
                  ),
                ),
                const SizedBox(height: LoczSpacing.x3),
                if (_listingType == 'BUYER_REQUIREMENT') ...[
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _budgetMinController,
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                          ],
                          decoration: InputDecoration(
                            labelText: strings('post.budgetMin'),
                            prefixText: '₹ ',
                          ),
                        ),
                      ),
                      const SizedBox(width: LoczSpacing.x3),
                      Expanded(
                        child: TextFormField(
                          controller: _budgetMaxController,
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                          ],
                          decoration: InputDecoration(
                            labelText: strings('post.budgetMax'),
                            prefixText: '₹ ',
                          ),
                          validator: (value) {
                            final min = num.tryParse(_budgetMinController.text);
                            final max = num.tryParse(value ?? '');
                            return min != null && max != null && min > max
                                ? strings('post.budgetOrder')
                                : null;
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: LoczSpacing.x3),
                  TextFormField(
                    controller: _quantityController,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(labelText: strings('post.quantity')),
                    validator: (value) =>
                        (int.tryParse(value ?? '') ?? 0) < 1 ? strings('common.error') : null,
                  ),
                ] else ...[
                  TextFormField(
                    controller: _priceController,
                    enabled: !_isFree,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: strings('post.fieldPrice'),
                      prefixText: '₹ ',
                    ),
                  ),
                  SwitchListTile.adaptive(
                    value: _isFree,
                    onChanged: (value) {
                      setState(() => _isFree = value);
                      _scheduleProgressSave();
                    },
                    title: Text(strings('listing.free')),
                    contentPadding: EdgeInsets.zero,
                  ),
                  SwitchListTile.adaptive(
                    value: _isNegotiable,
                    onChanged: (value) {
                      setState(() => _isNegotiable = value);
                      _scheduleProgressSave();
                    },
                    title: Text(strings('listing.negotiable')),
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
                DropdownButtonFormField<String>(
                  key: ValueKey('condition-$_condition'),
                  initialValue: _condition,
                  decoration: InputDecoration(
                    labelText: strings('post.fieldCondition'),
                  ),
                  items: [
                    DropdownMenuItem(
                      value: 'NEW',
                      child: Text(strings('post.conditionNew')),
                    ),
                    DropdownMenuItem(
                      value: 'LIKE_NEW',
                      child: Text(strings('post.conditionLikeNew')),
                    ),
                    DropdownMenuItem(
                      value: 'GOOD',
                      child: Text(strings('post.conditionGood')),
                    ),
                    DropdownMenuItem(
                      value: 'FAIR',
                      child: Text(strings('post.conditionFair')),
                    ),
                    DropdownMenuItem(
                      value: 'FOR_PARTS',
                      child: Text(strings('post.conditionParts')),
                    ),
                  ],
                  onChanged: (value) {
                    setState(() => _condition = value ?? 'GOOD');
                    _scheduleProgressSave();
                  },
                ),
                const SizedBox(height: LoczSpacing.x5),
                _SectionHeading(
                  index: '03',
                  label: strings('post.locationSection'),
                ),
                const SizedBox(height: LoczSpacing.x3),
                cities.when(
                  loading: () => const LinearProgressIndicator(),
                  error: (error, _) => Text(error.toString()),
                  data: (list) => DropdownButtonFormField<String>(
                    key: ValueKey('city-$_cityId'),
                    initialValue: _cityId,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: strings('post.fieldCity')),
                    items: list
                        .map(
                          (city) => DropdownMenuItem(
                            value: city.id,
                            child: Text(city.name),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      setState(() => _cityId = value);
                      _scheduleProgressSave();
                    },
                    validator: (value) => value == null ? strings('common.error') : null,
                  ),
                ),
                const SizedBox(height: LoczSpacing.x4),
                DropdownButtonFormField<String>(
                  key: ValueKey('contact-$_contactPreference'),
                  initialValue: _contactPreference,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: strings('post.contactPreference'),
                  ),
                  items: [
                    DropdownMenuItem(
                      value: 'IN_APP_ONLY',
                      child: Text(strings('post.contactMessages')),
                    ),
                    DropdownMenuItem(
                      value: 'PHONE_AND_IN_APP',
                      child: Text(strings('post.contactPhoneAndMessages')),
                    ),
                    DropdownMenuItem(
                      value: 'PHONE',
                      child: Text(strings('post.contactPhone')),
                    ),
                  ],
                  onChanged: (value) {
                    setState(
                      () => _contactPreference = value ?? 'IN_APP_ONLY',
                    );
                    _scheduleProgressSave();
                  },
                ),
                if (_listingType != 'BUYER_REQUIREMENT') ...[
                  const SizedBox(height: LoczSpacing.x6),
                  _SectionHeading(
                    index: '04',
                    label: strings('post.photos'),
                  ),
                  Text(
                    strings('post.photosHint'),
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.verified_user_outlined,
                        size: 14,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          strings('post.photoSafety'),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: LoczSpacing.x3),
                  SizedBox(
                    height: 96,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        for (final image in _images)
                          Padding(
                            padding: const EdgeInsets.only(right: LoczSpacing.x2),
                            child: Stack(
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(LoczRadius.md),
                                  child: Image.file(
                                    image.file,
                                    width: 96,
                                    height: 96,
                                    fit: BoxFit.cover,
                                  ),
                                ),
                                if (_submitting && image.progress < 1 && !image.failed)
                                  Positioned.fill(
                                    child: ColoredBox(
                                      color: Colors.black45,
                                      child: Center(
                                        child: CircularProgressIndicator(
                                          value: image.progress,
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                  ),
                                if (image.failed)
                                  const Positioned.fill(
                                    child: ColoredBox(
                                      color: Colors.black45,
                                      child: Icon(
                                        Icons.error_outline,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                if (!_submitting)
                                  Positioned(
                                    top: 0,
                                    right: 0,
                                    child: GestureDetector(
                                      onTap: () => setState(() => _images.remove(image)),
                                      child: const CircleAvatar(
                                        radius: 12,
                                        backgroundColor: Colors.black54,
                                        child: Icon(
                                          Icons.close,
                                          size: 14,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        if (_images.length < Env.maxImagesPerListing)
                          InkWell(
                            onTap: _submitting ? null : _pickImages,
                            child: Container(
                              width: 96,
                              height: 96,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(LoczRadius.md),
                                border: Border.all(
                                  color: Theme.of(context).colorScheme.outline,
                                ),
                              ),
                              child: const Icon(Icons.add_a_photo_outlined),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: LoczSpacing.x5),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Category? _findCategory(List<Category> categories, String id) {
  for (final category in categories) {
    if (category.id == id) return category;
    final child = _findCategory(category.children, id);
    if (child != null) return child;
  }
  return null;
}

class _ModelSuggestionField extends StatefulWidget {
  const _ModelSuggestionField({
    required this.initialValue,
    required this.label,
    required this.load,
    required this.onChanged,
    required this.validator,
  });

  final String initialValue;
  final String label;
  final Future<List<String>> Function(String query) load;
  final ValueChanged<String> onChanged;
  final String? Function(String value) validator;

  @override
  State<_ModelSuggestionField> createState() => _ModelSuggestionFieldState();
}

class _ModelSuggestionFieldState extends State<_ModelSuggestionField> {
  late final TextEditingController _controller = TextEditingController(text: widget.initialValue);
  Timer? _debounce;
  List<String> _suggestions = const [];
  bool _loading = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _changed(String value) {
    widget.onChanged(value);
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 260), () async {
      if (mounted) setState(() => _loading = true);
      try {
        final results = await widget.load(value.trim());
        if (mounted && _controller.text == value) {
          setState(() => _suggestions = results);
        }
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextFormField(
            controller: _controller,
            decoration: InputDecoration(
              labelText: widget.label,
              suffixIcon: _loading
                  ? const Padding(
                      padding: EdgeInsets.all(14),
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.auto_awesome_outlined),
            ),
            onChanged: _changed,
            validator: (value) => widget.validator(value ?? ''),
          ),
          if (_suggestions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 7),
              child: Wrap(
                spacing: 7,
                runSpacing: 7,
                children: _suggestions
                    .take(8)
                    .map(
                      (model) => ActionChip(
                        label: Text(model),
                        onPressed: () {
                          _controller
                            ..text = model
                            ..selection = TextSelection.collapsed(offset: model.length);
                          widget.onChanged(model);
                          setState(() => _suggestions = const []);
                        },
                      ),
                    )
                    .toList(),
              ),
            ),
        ],
      );
}

class _PostJourneyHeader extends StatelessWidget {
  const _PostJourneyHeader({
    required this.subtitle,
    required this.question,
    required this.progress,
    required this.progressHint,
    required this.completion,
    required this.children,
  });

  final String subtitle;
  final String question;
  final String progress;
  final String progressHint;
  final double completion;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF073C32), Color(0xFF0C6753)],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              right: -70,
              top: -82,
              child: Container(
                width: 210,
                height: 210,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: .08),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(17),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          subtitle,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Colors.white.withValues(alpha: .76),
                                height: 1.45,
                              ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: .1),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: .1),
                          ),
                        ),
                        child: Text(
                          progress,
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                color: const Color(0xFFFFD183),
                                fontWeight: FontWeight.w800,
                              ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 13),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: completion,
                      minHeight: 5,
                      backgroundColor: Colors.white.withValues(alpha: .12),
                      color: const Color(0xFFFFC867),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    progressHint,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Colors.white.withValues(alpha: .6),
                        ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    question,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -.25,
                        ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var index = 0; index < children.length; index++) ...[
                        if (index > 0) const SizedBox(width: 9),
                        Expanded(child: children[index]),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PostIntentChoice extends StatelessWidget {
  const _PostIntentChoice({
    required this.selected,
    required this.icon,
    required this.title,
    required this.hint,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String hint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final titleColor = selected ? const Color(0xFF073C32) : Colors.white;
    final hintColor = selected ? const Color(0xFF52645E) : Colors.white.withValues(alpha: .62);

    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(17),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            constraints: const BoxConstraints(minHeight: 142),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: selected ? const Color(0xFFF2FAF7) : Colors.white.withValues(alpha: .075),
              borderRadius: BorderRadius.circular(17),
              border: Border.all(
                color: selected ? const Color(0xFF9ADBCB) : Colors.white.withValues(alpha: .12),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: selected ? const Color(0xFFDDF2EC) : Colors.white.withValues(alpha: .09),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(icon, size: 19, color: titleColor),
                ),
                const SizedBox(height: 12),
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: titleColor,
                        fontWeight: FontWeight.w800,
                        height: 1.2,
                      ),
                ),
                const SizedBox(height: 5),
                Text(
                  hint,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: hintColor,
                        height: 1.3,
                      ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.index, required this.label});

  final String index;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final icon = switch (index) {
      '01' => Icons.description_outlined,
      '02' => Icons.payments_outlined,
      '03' => Icons.location_on_outlined,
      '04' => Icons.add_photo_alternate_outlined,
      _ => Icons.check_circle_outline_rounded,
    };

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            theme.colorScheme.primaryContainer,
            theme.colorScheme.surface,
          ],
        ),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(11),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                icon,
                size: 19,
                color: theme.colorScheme.onPrimary,
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    index,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w800,
                      letterSpacing: .8,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    label,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -.2,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

class _SuccessScreen extends StatelessWidget {
  const _SuccessScreen({
    required this.published,
    required this.editing,
    required this.draft,
    required this.slug,
    required this.strings,
  });

  final bool published;
  final bool editing;
  final bool draft;
  final String slug;
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(LoczSpacing.x8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                published ? Icons.check_circle_outline : Icons.hourglass_top_outlined,
                size: 56,
                color: published ? LoczColors.success : LoczColors.warning,
              ),
              const SizedBox(height: LoczSpacing.x4),
              Text(
                // The API decides whether it published or queued, so the message reports
                // what actually happened rather than promising "published".
                editing
                    ? strings('post.updateSuccess')
                    : draft
                        ? strings('post.draftSaved')
                        : published
                            ? strings('post.successPublished')
                            : strings('post.successPending'),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: LoczSpacing.x6),
              if (published)
                FilledButton(
                  onPressed: () => context.go('/ad/$slug'),
                  child: Text(strings('nav.home')),
                ),
              TextButton(
                onPressed: () => context.go('/account'),
                child: Text(strings('account.myAds')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
