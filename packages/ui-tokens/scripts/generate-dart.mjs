/**
 * Generates the Flutter token file from the TypeScript source, so mobile cannot drift
 * from web and admin. Run after changing tokens:
 *
 *   npm run build:dart -w @locz/ui-tokens
 *
 * The output is committed — Flutter builds must not depend on Node being installed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../src/index.ts'), 'utf8');

/** Pulls `key: '#rrggbb'` pairs out of a named const block. */
function extractHexBlock(name) {
  const match = new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\} as const;`).exec(source);
  if (!match) throw new Error(`Could not find the "${name}" token block`);

  const entries = [];
  for (const line of match[1].split('\n')) {
    const pair = /^\s*(\w+):\s*'(#[0-9a-fA-F]{6})',/.exec(line);
    if (pair) entries.push([pair[1], pair[2]]);
  }
  return entries;
}

const colors = extractHexBlock('color');

const toDartName = (key) => key.replace(/(\d)/, (digit) => digit);
const toArgb = (hex) => `0xFF${hex.slice(1).toUpperCase()}`;


/**
 * Pulls the business-card palettes and glyphs across to Dart.
 *
 * These exist so an imported directory record has a face without anybody drawing one: the
 * colour comes from hashing the business id and the glyph from its category, so the same
 * shop looks the same everywhere and no image file is stored for 3.4 million businesses.
 *
 * Parsed out of the TypeScript rather than duplicated, for the same reason the colours are:
 * two hand-maintained copies drift, and the drift stays invisible until somebody notices
 * the app and the website disagree about what a shop looks like.
 */
function extractBusinessGraphics() {
  const block = /export const businessCardGraphics = \{([\s\S]*?)\n\} as const;/.exec(source);
  if (!block) throw new Error('Could not find the businessCardGraphics block');

  const palette = [];
  const paletteRe =
    /name: '(\w+)',\s*light: \{ background: '(#[0-9a-fA-F]{6})', foreground: '(#[0-9a-fA-F]{6})', accent: '(#[0-9a-fA-F]{6})' \},\s*dark: \{ background: '(#[0-9a-fA-F]{6})', foreground: '(#[0-9a-fA-F]{6})', accent: '(#[0-9a-fA-F]{6})' \}/g;
  let entry;
  while ((entry = paletteRe.exec(block[1])) !== null) {
    palette.push({
      name: entry[1],
      light: { background: entry[2], foreground: entry[3], accent: entry[4] },
      dark: { background: entry[5], foreground: entry[6], accent: entry[7] },
    });
  }
  if (palette.length === 0) throw new Error('No business card palettes parsed');

  const glyphsBlock = /glyphs: \{([\s\S]*)\n  \},/.exec(block[1]);
  if (!glyphsBlock) throw new Error('Could not find the glyphs block');

  const glyphs = [];
  const glyphRe = /(\w+): \{\s*viewBox: '([^']+)',\s*paths: \[([\s\S]*?)\],\s*\}/g;
  while ((entry = glyphRe.exec(glyphsBlock[1])) !== null) {
    const paths = [...entry[3].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    glyphs.push({ name: entry[1], viewBox: entry[2], paths });
  }
  if (glyphs.length === 0) throw new Error('No business card glyphs parsed');

  return { palette, glyphs };
}

const businessGraphics = extractBusinessGraphics();

const dartPalette = businessGraphics.palette
  .map(
    (p) =>
      "  LoczBusinessPalette(\n    name: '" +
      p.name +
      "',\n    lightBackground: Color(" +
      toArgb(p.light.background) +
      '),\n    lightForeground: Color(' +
      toArgb(p.light.foreground) +
      '),\n    lightAccent: Color(' +
      toArgb(p.light.accent) +
      '),\n    darkBackground: Color(' +
      toArgb(p.dark.background) +
      '),\n    darkForeground: Color(' +
      toArgb(p.dark.foreground) +
      '),\n    darkAccent: Color(' +
      toArgb(p.dark.accent) +
      '),\n  ),',
  )
  .join('\n');

const dartGlyphs = businessGraphics.glyphs
  .map(
    (g) =>
      "  '" +
      g.name +
      "': LoczBusinessGlyph(\n    viewBox: '" +
      g.viewBox +
      "',\n    paths: <String>[\n" +
      g.paths.map((path) => "      '" + path + "',").join('\n') +
      '\n    ],\n  ),',
  )
  .join('\n');

const dart = `// GENERATED FILE — do not edit by hand.
// Source: packages/ui-tokens/src/index.ts
// Regenerate: npm run build:dart -w @locz/ui-tokens

import 'package:flutter/material.dart';

/// LocZ colour tokens, generated from the shared TypeScript source so mobile,
/// web and admin cannot drift apart.
class LoczColors {
${colors.map(([key, hex]) => `  static const Color ${toDartName(key)} = Color(${toArgb(hex)});`).join('\n')}
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
${dartPalette}
  ];

  static const Map<String, LoczBusinessGlyph> glyphs = <String, LoczBusinessGlyph>{
${dartGlyphs}
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
    if (has(const ['repair', 'service', 'salon', 'spa', 'tailor', 'laundry', 'plumb', 'electric'])) {
      return glyphs['services']!;
    }
    if (has(const ['home', 'furniture', 'hardware', 'paint', 'interior', 'construction', 'estate'])) {
      return glyphs['home']!;
    }
    if (has(const ['store', 'shop', 'kirana', 'grocery', 'mart', 'retail', 'provision'])) {
      return glyphs['retail']!;
    }
    return glyphs['other']!;
  }
}
`;

const outputPath = resolve(here, '../../../apps/mobile/lib/core/theme/tokens.g.dart');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, dart, 'utf8');

console.log(
  `Wrote ${colors.length} colour tokens, ${businessGraphics.palette.length} business ` +
    `palettes and ${businessGraphics.glyphs.length} glyphs to ${outputPath}`,
);
