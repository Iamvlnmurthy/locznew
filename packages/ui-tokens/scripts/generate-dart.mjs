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
`;

const outputPath = resolve(here, '../../../apps/mobile/lib/core/theme/tokens.g.dart');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, dart, 'utf8');

console.log(`Wrote ${colors.length} colour tokens to ${outputPath}`);
