import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../domain/models.dart';

class SellerProfileScreen extends ConsumerWidget {
  const SellerProfileScreen({super.key, required this.userId});
  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(strings('sellerProfile.title'))),
      body: FutureBuilder<SellerProfile>(
        future: ref.read(listingRepositoryProvider).sellerProfile(userId),
        builder: (context, snapshot) {
          if (!snapshot.hasData && !snapshot.hasError) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
                child: Padding(
              padding: const EdgeInsets.all(LoczSpacing.x6),
              child:
                  Text(snapshot.error.toString(), textAlign: TextAlign.center),
            ),);
          }
          final profile = snapshot.data!;
          final theme = Theme.of(context);
          return ListView(
            padding: const EdgeInsets.all(LoczSpacing.x4),
            children: [
              Container(
                padding: const EdgeInsets.all(LoczSpacing.x5),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [
                    theme.colorScheme.primaryContainer,
                    theme.colorScheme.secondaryContainer,
                  ],),
                  borderRadius: BorderRadius.circular(LoczRadius.xl),
                ),
                child: Column(children: [
                  CircleAvatar(
                    radius: 38,
                    backgroundColor: theme.colorScheme.primary,
                    child: Text(
                      profile.displayName.characters.first.toUpperCase(),
                      style: theme.textTheme.headlineMedium
                          ?.copyWith(color: theme.colorScheme.onPrimary),
                    ),
                  ),
                  const SizedBox(height: LoczSpacing.x3),
                  Text(profile.displayName,
                      style: theme.textTheme.headlineSmall,),
                  const SizedBox(height: 4),
                  Text(strings('listing.memberSince',
                      {'year': profile.memberSince.year},),),
                  if (profile.bio != null && profile.bio!.isNotEmpty) ...[
                    const SizedBox(height: LoczSpacing.x3),
                    Text(profile.bio!, textAlign: TextAlign.center),
                  ],
                ],),
              ),
              const SizedBox(height: LoczSpacing.x4),
              Row(children: [
                Expanded(
                    child: _Stat(
                        value: '${profile.publishedListings}',
                        label: strings('sellerProfile.liveAds'),),),
                const SizedBox(width: LoczSpacing.x3),
                Expanded(
                    child: _Stat(
                        value: '${profile.soldListings}',
                        label: strings('sellerProfile.sold'),),),
              ],),
              if (profile.responseRate != null ||
                  profile.medianResponseMinutes != null) ...[
                const SizedBox(height: LoczSpacing.x4),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(LoczSpacing.x4),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(strings('sellerProfile.reliability'),
                              style: theme.textTheme.titleMedium,),
                          const SizedBox(height: LoczSpacing.x3),
                          if (profile.responseRate != null)
                            _TrustRow(
                                Icons.reply_all_rounded,
                                strings('sellerProfile.responseRate',
                                    {'rate': profile.responseRate!.round()},),),
                          if (profile.medianResponseMinutes != null)
                            _TrustRow(
                                Icons.schedule_rounded,
                                strings('sellerProfile.responseTime', {
                                  'minutes':
                                      profile.medianResponseMinutes!.round(),
                                }),),
                        ],),
                  ),
                ),
              ],
              const SizedBox(height: LoczSpacing.x3),
              Row(children: [
                Icon(Icons.privacy_tip_outlined,
                    size: 16, color: theme.colorScheme.primary,),
                const SizedBox(width: 7),
                Expanded(
                    child: Text(strings('sellerProfile.privacy'),
                        style: theme.textTheme.bodySmall,),),
              ],),
            ],
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value;
  final String label;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(LoczSpacing.x4),
          child: Column(children: [
            Text(value, style: Theme.of(context).textTheme.headlineMedium),
            Text(label, style: Theme.of(context).textTheme.labelMedium),
          ],),
        ),
      );
}

class _TrustRow extends StatelessWidget {
  const _TrustRow(this.icon, this.label);
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: LoczSpacing.x2),
        child: Row(children: [
          Icon(icon, size: 19),
          const SizedBox(width: 9),
          Expanded(child: Text(label)),
        ],),
      );
}
