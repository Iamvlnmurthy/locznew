import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/config/env.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';

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
  const PostAdScreen({super.key});

  @override
  ConsumerState<PostAdScreen> createState() => _PostAdScreenState();
}

class _PostAdScreenState extends ConsumerState<PostAdScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();

  String? _categoryId;
  String? _cityId;
  String _condition = 'GOOD';
  bool _isFree = false;
  bool _isNegotiable = false;
  String _contactPreference = 'IN_APP_ONLY';

  final List<_PendingImage> _images = [];
  bool _submitting = false;
  String? _error;
  String? _createdListingId;
  String? _createdSlug;
  bool _publishedImmediately = false;

  @override
  void initState() {
    super.initState();
    _cityId = ref.read(selectedCityProvider)?.id;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    super.dispose();
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

  Future<void> _submit() async {
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

      final created = await repository.createListing(
        title: _titleController.text.trim(),
        description: _descriptionController.text.trim(),
        categoryId: _categoryId!,
        cityId: _cityId!,
        condition: _condition,
        price: _isFree ? 0 : num.tryParse(_priceController.text.trim()),
        isFree: _isFree,
        isNegotiable: _isNegotiable,
        contactPreference: _contactPreference,
      );

      final listingId = created['id'] as String;
      _createdListingId = listingId;
      _createdSlug = created['slug'] as String;
      _publishedImmediately = created['status'] == 'PUBLISHED';

      // Sequential uploads: several large photos in parallel on a mobile connection
      // make all of them slow and the progress bars meaningless.
      for (final image in _images) {
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

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final auth = ref.watch(authProvider);

    if (!auth.isSignedIn) {
      return Scaffold(
        appBar: AppBar(title: Text(strings('post.title'))),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(LoczSpacing.x8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  strings('post.loginRequired'),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: LoczSpacing.x4),
                FilledButton(
                  onPressed: () => context.push('/signin?next=/post'),
                  child: Text(strings('nav.signIn')),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (_createdListingId != null && !_submitting) {
      return _SuccessScreen(
        published: _publishedImmediately,
        slug: _createdSlug!,
        strings: strings,
      );
    }

    final categories = ref.watch(categoriesProvider);
    final cities = ref.watch(citiesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings('post.title'))),
      body: Form(
        key: _formKey,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ListView(
              padding: const EdgeInsets.all(LoczSpacing.x4),
              children: [
                Text(
                  strings('post.subtitle'),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
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

                    return DropdownButtonFormField<String>(
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
                      onChanged: (value) => setState(() => _categoryId = value),
                      validator: (value) => value == null ? strings('common.error') : null,
                    );
                  },
                ),
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
                  label: strings('post.priceSection'),
                ),
                const SizedBox(height: LoczSpacing.x3),
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
                  onChanged: (value) => setState(() => _isFree = value),
                  title: Text(strings('listing.free')),
                  contentPadding: EdgeInsets.zero,
                ),
                SwitchListTile.adaptive(
                  value: _isNegotiable,
                  onChanged: (value) => setState(() => _isNegotiable = value),
                  title: Text(strings('listing.negotiable')),
                  contentPadding: EdgeInsets.zero,
                ),
                DropdownButtonFormField<String>(
                  initialValue: _condition,
                  decoration: const InputDecoration(labelText: 'Condition'),
                  items: const [
                    DropdownMenuItem(value: 'NEW', child: Text('New')),
                    DropdownMenuItem(
                      value: 'LIKE_NEW',
                      child: Text('Like new'),
                    ),
                    DropdownMenuItem(value: 'GOOD', child: Text('Good')),
                    DropdownMenuItem(value: 'FAIR', child: Text('Fair')),
                    DropdownMenuItem(
                      value: 'FOR_PARTS',
                      child: Text('For parts'),
                    ),
                  ],
                  onChanged: (value) => setState(() => _condition = value ?? 'GOOD'),
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
                    onChanged: (value) => setState(() => _cityId = value),
                    validator: (value) => value == null ? strings('common.error') : null,
                  ),
                ),
                const SizedBox(height: LoczSpacing.x4),
                DropdownButtonFormField<String>(
                  initialValue: _contactPreference,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Contact preference'),
                  items: const [
                    DropdownMenuItem(
                      value: 'IN_APP_ONLY',
                      child: Text('Messages on LocZ only'),
                    ),
                    DropdownMenuItem(
                      value: 'PHONE_AND_IN_APP',
                      child: Text('Phone and messages'),
                    ),
                    DropdownMenuItem(
                      value: 'PHONE',
                      child: Text('Show my phone number'),
                    ),
                  ],
                  onChanged: (value) => setState(
                    () => _contactPreference = value ?? 'IN_APP_ONLY',
                  ),
                ),
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
                const SizedBox(height: LoczSpacing.x8),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(
                    _submitting ? strings('post.publishing') : strings('post.publish'),
                  ),
                ),
                const SizedBox(height: LoczSpacing.x8),
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

    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Text(
            index,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Text(label, style: theme.textTheme.titleMedium),
      ],
    );
  }
}

class _SuccessScreen extends StatelessWidget {
  const _SuccessScreen({
    required this.published,
    required this.slug,
    required this.strings,
  });

  final bool published;
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
                published ? strings('post.successPublished') : strings('post.successPending'),
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
