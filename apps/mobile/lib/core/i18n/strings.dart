import 'package:flutter/widgets.dart';

/// App strings in English, Telugu and Hindi.
///
/// Kept as maps rather than generated ARB classes so the catalogue stays in one
/// reviewable file at this stage. The rule is the same either way: no user-facing text
/// is written inline in a widget. A missing key falls back to English rather than
/// showing the key — a half-translated screen is usable, a screen of `nav.home` is not.
enum AppLocaleOption { en, te, hi }

class Strings {
  const Strings(this.locale);

  final AppLocaleOption locale;

  static Strings of(BuildContext context) =>
      Localizations.of<Strings>(context, Strings) ?? const Strings(AppLocaleOption.en);

  String call(String key, [Map<String, Object>? values]) {
    final message = _catalogue[locale]?[key] ?? _catalogue[AppLocaleOption.en]![key] ?? key;
    if (values == null) return message;

    var output = message;
    values.forEach((name, value) {
      output = output.replaceAll('{$name}', '$value');
    });
    return output;
  }

  static const Map<AppLocaleOption, Map<String, String>> _catalogue = {
    AppLocaleOption.en: {
      'brand.tagline': 'Find it here.. Deal it near..',
      'nav.home': 'Home',
      'nav.search': 'Search',
      'nav.post': 'Post',
      'nav.chats': 'Chats',
      'nav.account': 'Account',
      'nav.saved': 'Saved',
      'nav.signIn': 'Sign in',
      'nav.signOut': 'Sign out',
      'location.change': 'Change',
      'location.useCurrent': 'Use my current location',
      'location.searchCity': 'Search for a city',
      'location.pincodeLabel': 'Or enter your pincode',
      'location.pincodeGo': 'Go',
      'location.pincodeUnknown': 'That pincode does not look right. Check the six digits.',
      'location.permissionDenied': 'Location permission was declined. Pick a city instead.',
      'location.outsideLaunchArea': 'LocZ is not live in your area yet. Pick a city to browse.',
      'search.placeholder': 'Search phones, jobs, rooms…',
      'search.noResults': 'Nothing found',
      'search.noResultsHint': 'Try fewer words or a wider distance.',
      'feed.nearby': 'Near you',
      'feed.recommended': 'Recommended for you',
      'feed.latest_products': 'Latest items for sale',
      'feed.offers': 'Offers around you',
      'feed.jobs': 'Jobs near you',
      'feed.services': 'Services nearby',
      'feed.requirements': 'People looking for',
      'feed.recently_viewed': 'Recently viewed',
      'feed.seeAll': 'See all',
      'feed.empty': 'Nothing here yet. Be the first to post in your area.',
      'listing.free': 'Free',
      'listing.negotiable': 'Negotiable',
      'listing.contactSeller': 'Message seller',
      'listing.showPhone': 'Show phone number',
      'listing.phoneHidden': 'This seller prefers messages',
      'listing.save': 'Save',
      'listing.saved': 'Saved',
      'listing.share': 'Share',
      'listing.report': 'Report this ad',
      'listing.description': 'Description',
      'listing.sold': 'This item has been sold',
      'listing.views': '{count} views',
      'post.title': 'Post your free ad',
      'post.subtitle': 'It takes about a minute and costs nothing.',
      'post.fieldTitle': 'Title',
      'post.fieldDescription': 'Description',
      'post.fieldPrice': 'Price (₹)',
      'post.fieldCategory': 'Category',
      'post.fieldCity': 'City',
      'post.photos': 'Photos',
      'post.photosHint': 'Up to 12. The first becomes the cover.',
      'post.addPhoto': 'Add photo',
      'post.publish': 'Publish free ad',
      'post.publishing': 'Publishing…',
      'post.successPublished': 'Your ad is live.',
      'post.successPending':
          'Your ad has been submitted. We review first ads to keep LocZ clean — usually within a few hours.',
      'post.loginRequired': 'Sign in to post your free ad',
      'auth.signInTitle': 'Sign in to LocZ',
      'auth.signInSubtitle': "Enter your mobile number and we'll send a code.",
      'auth.phone': 'Mobile number',
      'auth.sendCode': 'Send code',
      'auth.codeTitle': 'Enter the code',
      'auth.codeSentTo': 'We sent a 6-digit code to {phone}',
      'auth.code': 'Verification code',
      'auth.verify': 'Verify and continue',
      'auth.invalidPhone': 'Enter a valid 10-digit mobile number',
      'auth.devCode': 'Development mode — your code is {code}',
      'chats.title': 'Chats',
      'chats.empty': 'No conversations yet',
      'chats.messageHint': 'Write a message…',
      'chats.send': 'Send',
      'account.myAds': 'My ads',
      'account.savedAds': 'Saved ads',
      'account.notifications': 'Notifications',
      'account.language': 'Language',
      'account.noAds': "You haven't posted anything yet",
      'common.retry': 'Try again',
      'common.error': 'Something went wrong',
      'common.offline': 'No internet connection',
      'common.cancel': 'Cancel',
      'common.loading': 'Loading…',
      'common.km': 'km',
      'common.away': '{distance} away',
    },
    AppLocaleOption.te: {
      'brand.tagline': 'ఇక్కడ వెతకండి.. దగ్గరలో డీల్ చేయండి..',
      'nav.home': 'హోమ్',
      'nav.search': 'వెతకండి',
      'nav.post': 'ప్రకటన',
      'nav.chats': 'సందేశాలు',
      'nav.account': 'ఖాతా',
      'nav.saved': 'సేవ్ చేసినవి',
      'nav.signIn': 'సైన్ ఇన్',
      'nav.signOut': 'సైన్ అవుట్',
      'location.change': 'మార్చండి',
      'location.useCurrent': 'నా ప్రస్తుత ప్రాంతం',
      'location.searchCity': 'నగరం వెతకండి',
      'location.pincodeLabel': 'లేదా మీ పిన్‌కోడ్ ఇవ్వండి',
      'location.pincodeGo': 'వెళ్లు',
      'location.pincodeUnknown': 'ఈ పిన్‌కోడ్ సరైనది కాదు. ఆరు అంకెలు సరిచూడండి.',
      'search.placeholder': 'ఫోన్లు, ఉద్యోగాలు, గదులు…',
      'search.noResults': 'ఏమీ దొరకలేదు',
      'feed.nearby': 'మీ దగ్గర',
      'feed.latest_products': 'కొత్త వస్తువులు',
      'feed.offers': 'ఆఫర్లు',
      'feed.jobs': 'ఉద్యోగాలు',
      'feed.services': 'సేవలు',
      'feed.seeAll': 'అన్నీ చూడండి',
      'listing.free': 'ఉచితం',
      'listing.negotiable': 'బేరం చేయవచ్చు',
      'listing.contactSeller': 'విక్రేతకు సందేశం',
      'listing.showPhone': 'ఫోన్ నంబర్ చూపించు',
      'listing.save': 'సేవ్',
      'listing.saved': 'సేవ్ అయింది',
      'listing.description': 'వివరణ',
      'post.title': 'మీ ఉచిత ప్రకటన',
      'post.publish': 'ఉచితంగా ప్రచురించండి',
      'post.fieldTitle': 'శీర్షిక',
      'post.fieldDescription': 'వివరణ',
      'post.fieldPrice': 'ధర (₹)',
      'post.photos': 'ఫోటోలు',
      'auth.signInTitle': 'LocZ లోకి సైన్ ఇన్',
      'auth.phone': 'మొబైల్ నంబర్',
      'auth.sendCode': 'కోడ్ పంపండి',
      'auth.code': 'ధృవీకరణ కోడ్',
      'auth.verify': 'ధృవీకరించండి',
      'chats.title': 'సందేశాలు',
      'common.retry': 'మళ్లీ ప్రయత్నించండి',
      'common.error': 'ఏదో తప్పు జరిగింది',
      'common.cancel': 'రద్దు',
      'common.km': 'కి.మీ',
    },
    AppLocaleOption.hi: {
      'brand.tagline': 'यहाँ खोजें.. पास में सौदा करें..',
      'nav.home': 'होम',
      'nav.search': 'खोजें',
      'nav.post': 'विज्ञापन',
      'nav.chats': 'संदेश',
      'nav.account': 'खाता',
      'nav.saved': 'सहेजे गए',
      'nav.signIn': 'साइन इन',
      'nav.signOut': 'साइन आउट',
      'location.change': 'बदलें',
      'location.useCurrent': 'मेरा वर्तमान स्थान',
      'location.pincodeLabel': 'या अपना पिनकोड डालें',
      'location.pincodeGo': 'चलें',
      'location.pincodeUnknown': 'यह पिनकोड सही नहीं लगता। छह अंक जाँच लें।',
      'location.searchCity': 'शहर खोजें',
      'search.placeholder': 'फ़ोन, नौकरी, कमरा…',
      'search.noResults': 'कुछ नहीं मिला',
      'feed.nearby': 'आपके पास',
      'feed.latest_products': 'नई चीज़ें',
      'feed.offers': 'ऑफ़र',
      'feed.jobs': 'नौकरियाँ',
      'feed.services': 'सेवाएँ',
      'feed.seeAll': 'सभी देखें',
      'listing.free': 'मुफ़्त',
      'listing.negotiable': 'मोल-भाव संभव',
      'listing.contactSeller': 'विक्रेता को संदेश',
      'listing.showPhone': 'फ़ोन नंबर दिखाएँ',
      'listing.save': 'सहेजें',
      'listing.saved': 'सहेजा गया',
      'listing.description': 'विवरण',
      'post.title': 'अपना मुफ़्त विज्ञापन',
      'post.publish': 'मुफ़्त प्रकाशित करें',
      'post.fieldTitle': 'शीर्षक',
      'post.fieldDescription': 'विवरण',
      'post.fieldPrice': 'कीमत (₹)',
      'post.photos': 'तस्वीरें',
      'auth.signInTitle': 'LocZ में साइन इन करें',
      'auth.phone': 'मोबाइल नंबर',
      'auth.sendCode': 'कोड भेजें',
      'auth.code': 'सत्यापन कोड',
      'auth.verify': 'सत्यापित करें',
      'chats.title': 'संदेश',
      'common.retry': 'फिर कोशिश करें',
      'common.error': 'कुछ गड़बड़ हुई',
      'common.cancel': 'रद्द करें',
      'common.km': 'किमी',
    },
  };
}

/// Delegate that publishes [Strings] through the widget tree.
class StringsDelegate extends LocalizationsDelegate<Strings> {
  const StringsDelegate(this.option);

  final AppLocaleOption option;

  @override
  bool isSupported(Locale locale) => ['en', 'te', 'hi'].contains(locale.languageCode);

  @override
  Future<Strings> load(Locale locale) async => Strings(option);

  @override
  bool shouldReload(StringsDelegate old) => old.option != option;
}
