import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/i18n/strings.dart';
import 'package:locz/core/theme/app_theme.dart';
import 'package:locz/features/listings/domain/models.dart';
import 'package:locz/features/listings/presentation/widgets/listing_card.dart';

void main() {
  testWidgets(
    'featured listing stays usable at narrow width with large Telugu text',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 700));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var tapped = false;
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('te'),
          supportedLocales: const [
            Locale('en'),
            Locale('te'),
            Locale('hi'),
          ],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.te),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.4)),
            child: child!,
          ),
          home: Scaffold(
            body: Center(
              child: ListingCard(
                width: 152,
                listing: _longTeluguListing(),
                onTap: () => tapped = true,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('★ ప్రత్యేకం'), findsOneWidget);
      expect(find.text('₹1,20,000'), findsOneWidget);
      expect(tester.takeException(), isNull);

      final node = tester.getSemantics(find.byType(ListingCard));
      expect(node.flagsCollection.isButton, isTrue);
      expect(node.label, contains('ప్రత్యేకం'));
      expect(node.label, contains('₹1,20,000'));
      expect(node.label, contains('జూబ్లీ హిల్స్'));

      await tester.tap(find.byType(ListingCard));
      expect(tapped, isTrue);
      semantics.dispose();
    },
  );

  testWidgets(
    'listing card fits the home rail constraint at maximum text scale',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 700));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('te'),
          supportedLocales: const [
            Locale('en'),
            Locale('te'),
            Locale('hi'),
          ],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.te),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.4)),
            child: child!,
          ),
          home: Scaffold(
            body: Align(
              alignment: Alignment.topLeft,
              child: SizedBox(
                width: 168,
                height: listingCardRailHeight(1.4),
                child: ListingCard(
                  width: 168,
                  listing: _longTeluguListing(),
                  onTap: () {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('★ ప్రత్యేకం'), findsOneWidget);
      expect(find.text('₹1,20,000'), findsOneWidget);
    },
  );

  testWidgets(
    'large text receives a taller single-column phone grid',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 700));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(
            body: MediaQuery(
              data: const MediaQueryData(
                size: Size(320, 700),
                textScaler: TextScaler.linear(1.4),
              ),
              child: GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: listingCardGridDelegate(1.4),
                itemCount: 2,
                itemBuilder: (context, index) => ListingCard(
                  listing: _longTeluguListing(),
                  onTap: () {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      final firstCard = tester.getSize(find.byType(ListingCard).first);
      expect(firstCard.width, greaterThan(250));
      expect(firstCard.height, greaterThan(380));
    },
  );
}

ListingSummary _longTeluguListing() => ListingSummary(
      id: 'listing-1',
      slug: 'flagship-listing',
      type: 'PRODUCT',
      title: 'చాలా మంచి స్థితిలో ఉన్న ఫోన్, బాక్స్ మరియు ఛార్జర్‌తో',
      status: 'PUBLISHED',
      price: 120000,
      isNegotiable: true,
      cityName: 'హైదరాబాద్',
      localityName: 'జూబ్లీ హిల్స్ సమీప ప్రాంతం',
      thumbUrl: null,
      isFeatured: true,
      viewCount: 42,
      publishedAt: DateTime(2026, 7, 26),
      distanceMeters: 1250,
    );
