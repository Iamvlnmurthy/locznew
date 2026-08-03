// GENERATED FILE — do not edit by hand.
// Source: packages/ui-tokens/src/index.ts
// Regenerate: npm run build:dart -w @locz/ui-tokens

import 'package:flutter/material.dart';

/// LocZ colour tokens, generated from the shared TypeScript source so mobile,
/// web and admin cannot drift apart.
class LoczColors {
  static const Color primary50 = Color(0xFFE8F3EF);
  static const Color primary100 = Color(0xFFCCE4DC);
  static const Color primary200 = Color(0xFFA8D2C5);
  static const Color primary300 = Color(0xFF73B5A2);
  static const Color primary400 = Color(0xFF3E8C77);
  static const Color primary500 = Color(0xFF125B4C);
  static const Color primary600 = Color(0xFF0C483C);
  static const Color primary700 = Color(0xFF0A3B32);
  static const Color primary800 = Color(0xFF173F35);
  static const Color primary900 = Color(0xFF102D26);
  static const Color accent50 = Color(0xFFFFF3DC);
  static const Color accent100 = Color(0xFFFEE6B6);
  static const Color accent200 = Color(0xFFFBD488);
  static const Color accent300 = Color(0xFFF6BE60);
  static const Color accent400 = Color(0xFFF1A63A);
  static const Color accent500 = Color(0xFFDC8616);
  static const Color accent600 = Color(0xFFAD670A);
  static const Color neutral0 = Color(0xFFFFFFFF);
  static const Color neutral50 = Color(0xFFF7F4ED);
  static const Color neutral100 = Color(0xFFF0EDE6);
  static const Color neutral200 = Color(0xFFE7E1D6);
  static const Color neutral300 = Color(0xFFD2CABD);
  static const Color neutral400 = Color(0xFF9AA59F);
  static const Color neutral500 = Color(0xFF718078);
  static const Color neutral600 = Color(0xFF4C5B54);
  static const Color neutral700 = Color(0xFF33433C);
  static const Color neutral800 = Color(0xFF24312C);
  static const Color neutral900 = Color(0xFF18241F);
  static const Color success = Color(0xFF12855C);
  static const Color successSurface = Color(0xFFE6F6EF);
  static const Color warning = Color(0xFFB26A00);
  static const Color warningSurface = Color(0xFFFFF4E0);
  static const Color danger = Color(0xFFC0392B);
  static const Color dangerSurface = Color(0xFFFDECEA);
  static const Color info = Color(0xFF1668B3);
  static const Color infoSurface = Color(0xFFE8F2FB);
}

/// 4px spacing grid.
class LoczSpacing {
  static const double x1 = 4;
  static const double x2 = 8;
  static const double x3 = 12;
  static const double x4 = 16;
  static const double x5 = 20;
  static const double x6 = 24;
  static const double x8 = 32;
  static const double x10 = 40;
  static const double x12 = 48;
}

class LoczRadius {
  static const double sm = 6;
  static const double md = 10;
  static const double lg = 14;
  static const double xl = 20;
  static const double full = 9999;
}

/// Line heights are generous because Telugu and Devanagari glyphs are taller than
/// Latin at the same point size.
class LoczTypography {
  static const String fontFamily = 'Inter';
  static const double leadingTight = 1.3;
  static const double leadingNormal = 1.6;

  static const double xs = 12;
  static const double sm = 14;
  static const double base = 16;
  static const double lg = 18;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 30;
}

/// One business-card colourway, in both themes.
@immutable
class LoczBusinessPalette {
  const LoczBusinessPalette({
    required this.name,
    required this.lightBackground,
    required this.lightForeground,
    required this.lightAccent,
    required this.darkBackground,
    required this.darkForeground,
    required this.darkAccent,
  });

  final String name;
  final Color lightBackground;
  final Color lightForeground;
  final Color lightAccent;
  final Color darkBackground;
  final Color darkForeground;
  final Color darkAccent;

  Color background(Brightness brightness) =>
      brightness == Brightness.dark ? darkBackground : lightBackground;
  Color foreground(Brightness brightness) =>
      brightness == Brightness.dark ? darkForeground : lightForeground;
  Color accent(Brightness brightness) => brightness == Brightness.dark ? darkAccent : lightAccent;
}

/// A glyph as SVG path data rather than an image file.
@immutable
class LoczBusinessGlyph {
  const LoczBusinessGlyph({required this.viewBox, required this.paths});

  final String viewBox;
  final List<String> paths;

  /// The width and height from the viewBox, for scaling into whatever box it is drawn in.
  Size get size {
    final parts = viewBox.split(' ');
    if (parts.length != 4) return const Size(24, 24);
    return Size(double.tryParse(parts[2]) ?? 24, double.tryParse(parts[3]) ?? 24);
  }
}

/// Faces for the business directory, without storing an image for any of them.
///
/// Colour comes from hashing the business id and the glyph from its category, so the same
/// shop looks the same on every surface and nothing has to be drawn, uploaded or served for
/// three and a half million records.
class LoczBusinessGraphics {
  const LoczBusinessGraphics._();

  static const List<LoczBusinessPalette> palette = <LoczBusinessPalette>[
    LoczBusinessPalette(
      name: 'mango',
      lightBackground: Color(0xFFFFF1D6),
      lightForeground: Color(0xFF653B05),
      lightAccent: Color(0xFFD77A0B),
      darkBackground: Color(0xFF39280F),
      darkForeground: Color(0xFFFFE2A6),
      darkAccent: Color(0xFFF3A53A),
    ),
    LoczBusinessPalette(
      name: 'leaf',
      lightBackground: Color(0xFFE1F1E6),
      lightForeground: Color(0xFF174A31),
      lightAccent: Color(0xFF3C8A5B),
      darkBackground: Color(0xFF173126),
      darkForeground: Color(0xFFBDE8CB),
      darkAccent: Color(0xFF5FC181),
    ),
    LoczBusinessPalette(
      name: 'lagoon',
      lightBackground: Color(0xFFDDF2F0),
      lightForeground: Color(0xFF124D49),
      lightAccent: Color(0xFF248C83),
      darkBackground: Color(0xFF143331),
      darkForeground: Color(0xFFB9ECE7),
      darkAccent: Color(0xFF54C3B8),
    ),
    LoczBusinessPalette(
      name: 'clay',
      lightBackground: Color(0xFFF8E3DB),
      lightForeground: Color(0xFF683326),
      lightAccent: Color(0xFFC4664E),
      darkBackground: Color(0xFF3B241F),
      darkForeground: Color(0xFFF7C9BC),
      darkAccent: Color(0xFFE7856D),
    ),
    LoczBusinessPalette(
      name: 'indigo',
      lightBackground: Color(0xFFE6E8F8),
      lightForeground: Color(0xFF343B72),
      lightAccent: Color(0xFF6873C4),
      darkBackground: Color(0xFF252943),
      darkForeground: Color(0xFFD5D9FF),
      darkAccent: Color(0xFF909AF0),
    ),
    LoczBusinessPalette(
      name: 'plum',
      lightBackground: Color(0xFFF0E3EF),
      lightForeground: Color(0xFF60355B),
      lightAccent: Color(0xFFA25C98),
      darkBackground: Color(0xFF382438),
      darkForeground: Color(0xFFF0C9EC),
      darkAccent: Color(0xFFCF82C4),
    ),
    LoczBusinessPalette(
      name: 'sky',
      lightBackground: Color(0xFFDFEEF8),
      lightForeground: Color(0xFF24516B),
      lightAccent: Color(0xFF4A8DB4),
      darkBackground: Color(0xFF1B303D),
      darkForeground: Color(0xFFC5E7F8),
      darkAccent: Color(0xFF68B4DD),
    ),
    LoczBusinessPalette(
      name: 'rose',
      lightBackground: Color(0xFFF9E2E5),
      lightForeground: Color(0xFF6B3039),
      lightAccent: Color(0xFFC45D6D),
      darkBackground: Color(0xFF3B2228),
      darkForeground: Color(0xFFF9C7CE),
      darkAccent: Color(0xFFEA7D8D),
    ),
    LoczBusinessPalette(
      name: 'olive',
      lightBackground: Color(0xFFECEDD8),
      lightForeground: Color(0xFF4B4F20),
      lightAccent: Color(0xFF83893D),
      darkBackground: Color(0xFF2D2F1B),
      darkForeground: Color(0xFFE3E6AD),
      darkAccent: Color(0xFFB2B95B),
    ),
    LoczBusinessPalette(
      name: 'slate',
      lightBackground: Color(0xFFE6ECEA),
      lightForeground: Color(0xFF334A43),
      lightAccent: Color(0xFF647E75),
      darkBackground: Color(0xFF242F2C),
      darkForeground: Color(0xFFD1E0DA),
      darkAccent: Color(0xFF88A89E),
    ),
  ];

  static const Map<String, LoczBusinessGlyph> glyphs = <String, LoczBusinessGlyph>{
    'food': LoczBusinessGlyph(
      viewBox: '0 0 24 24',
      paths: <String>[
        'M6 3v7a3 3 0 0 0 3 3V3M6 7h3M7.5 13v8M16 3v18M16 3c3 2 3 7 0 10',
      ],
    ),
    'retail': LoczBusinessGlyph(
      viewBox: '0 0 24 24',
      paths: <String>[
        'M4 10v10h16V10M3 10l2-6h14l2 6M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 20v-5h6v5',
      ],
    ),
    'services': LoczBusinessGlyph(
      viewBox: '0 0 24 24',
      paths: <String>[
        'm14 6 4-3 3 3-3 4-2-2-7 7 2 2-4 4-4-4 4-4 2 2 7-7-2-2Z',
      ],
    ),
    'health': LoczBusinessGlyph(
      viewBox: '0 0 24 24',
      paths: <String>[
        'M12 21S4 16.5 4 10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11ZM12 8v7M8.5 11.5h7',
      ],
    ),
    'education': LoczBusinessGlyph(
      viewBox: '0 0 24 24',
      paths: <String>[
        'm3 9 9-5 9 5-9 5-9-5ZM7 12v4c3 2 7 2 10 0v-4M21 9v7',
      ],
    ),
    'vehicles': LoczBusinessGlyph(
      viewBox: '0 0 24 24',
      paths: <String>[
        'M4 15V9l2-4h12l2 4v6M3 12h18M7 16v2M17 16v2M7 12h.01M17 12h.01M6 15h12',
      ],
    ),
    'home': LoczBusinessGlyph(
      viewBox: '0 0 24 24',
      paths: <String>[
        'm3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7',
      ],
    ),
    'other': LoczBusinessGlyph(
      viewBox: '0 0 24 24',
      paths: <String>[
        'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM17 14v6M14 17h6',
      ],
    ),
  };

  /// Same id, same colour, everywhere and forever.
  ///
  /// Hashed from the id rather than the category: a street of pharmacies should not be ten
  /// identical cards, and the id is the only thing about a directory record that never
  /// changes.
  static LoczBusinessPalette paletteFor(String businessId) {
    var hash = 0;
    for (final unit in businessId.codeUnits) {
      hash = (hash * 31 + unit) & 0x7fffffff;
    }
    return palette[hash % palette.length];
  }

  /// Matched on the category's words rather than its id, so a reseeded taxonomy does not
  /// silently repaint every shop in the directory.
  static LoczBusinessGlyph glyphFor(String? categoryName) {
    final name = (categoryName ?? '').toLowerCase();
    bool has(List<String> words) => words.any(name.contains);

    if (has(const [
      'restaurant',
      'food',
      'bakery',
      'sweet',
      'tiffin',
      'hotel',
      'cafe',
      'dairy',
      'meat',
      'fish',
      'tea',
      'juice',
    ])) {
      return glyphs['food']!;
    }
    if (has(const ['clinic', 'hospital', 'medical', 'pharmacy', 'health', 'doctor', 'lab'])) {
      return glyphs['health']!;
    }
    if (has(const ['school', 'college', 'coaching', 'tuition', 'education', 'library', 'book'])) {
      return glyphs['education']!;
    }
    if (has(const ['auto', 'vehicle', 'car', 'bike', 'motor', 'tyre', 'petrol', 'garage'])) {
      return glyphs['vehicles']!;
    }
    if (has(
        const ['repair', 'service', 'salon', 'spa', 'tailor', 'laundry', 'plumb', 'electric'])) {
      return glyphs['services']!;
    }
    if (has(
        const ['home', 'furniture', 'hardware', 'paint', 'interior', 'construction', 'estate'])) {
      return glyphs['home']!;
    }
    if (has(const ['store', 'shop', 'kirana', 'grocery', 'mart', 'retail', 'provision'])) {
      return glyphs['retail']!;
    }
    return glyphs['other']!;
  }
}
