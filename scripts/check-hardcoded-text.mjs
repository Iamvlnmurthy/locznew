#!/usr/bin/env node
/**
 * User-visible English that never reaches the translation catalogue.
 *
 *   npm run check:hardcoded
 *
 * `check:i18n` proves every key is translated. It cannot prove that every visible string is
 * a key — and a sentence typed straight into a component bypasses the catalogue entirely,
 * so it stays English in every language while the coverage report reads 100%.
 *
 * That is exactly how the post wizard ended up with translated headings above English
 * instructions: the headings were keys, the instructions were literals.
 *
 * What it looks at:
 *
 *   - text between JSX tags
 *   - `placeholder`, `title`, `aria-label`, `alt` — read aloud or shown on hover, and
 *     easily forgotten because they are attributes rather than content
 *
 * What it deliberately ignores: class names, routes, ids, single words that are the same in
 * every language ("LocZ", "OK"), and anything already inside `{t(...)}`. The aim is a list
 * short enough that someone will act on it, not a list that is complete and ignored.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['apps/web/src/app', 'apps/web/src/components'];

/** Attributes a screen reader or tooltip will surface. */
const SPOKEN_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];

/**
 * Words that are identical across English, Telugu and Hindi in ordinary use, or that are
 * not language at all. Keeping this list short matters: every entry is a small hole.
 */
const NOT_LANGUAGE =
  /^(locz|ok|id|url|api|sms|otp|gps|pdf|png|jpg|jpeg|webp|css|html|json|whatsapp|email|https?|www|₹|—|·|⌄|×|\d[\d\s,.:%+-]*)$/i;

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.tsx$/.test(entry)) files.push(path);
  }
  return files;
}

/** Two or more words with a lower-case letter — the shape of a sentence, not an identifier. */
function looksLikeProse(value) {
  const text = value.trim();
  if (text.length < 4 || NOT_LANGUAGE.test(text)) return false;
  if (!/[a-z]/.test(text)) return false;
  // Fragments of an expression that happened to sit between two angle brackets — a
  // property access, a ternary, a comparison. Prose does not contain these.
  if (/[?&|=<>{}]|\w+\.\w+|=>/.test(text)) return false;
  // A single capitalised word is usually a label worth translating; a single lower-case
  // word is usually a class name or a key fragment.
  return /\s/.test(text) || /^[A-Z][a-z]{3,}$/.test(text);
}

const findings = [];

for (const target of targets) {
  for (const file of walk(join(root, target))) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');

    lines.forEach((line, index) => {
      // Anything already going through the translator is fine by definition.
      if (/\bt\(|labels\.|strings\(/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

      for (const attribute of SPOKEN_ATTRIBUTES) {
        const match = new RegExp(`${attribute}="([^"{}]+)"`).exec(line);
        if (match && looksLikeProse(match[1])) {
          findings.push({ file, line: index + 1, kind: attribute, text: match[1] });
        }
      }

      // Text sitting between tags: >Some words here<
      const between = /">([^<>{}\n]{4,})</.exec(line) ?? />([^<>{}\n]{4,})</.exec(line);
      if (between && looksLikeProse(between[1])) {
        findings.push({ file, line: index + 1, kind: 'text', text: between[1].trim() });
      }
    });
  }
}

const byFile = new Map();
for (const finding of findings) {
  const key = relative(root, finding.file).replace(/\\/g, '/');
  byFile.set(key, [...(byFile.get(key) ?? []), finding]);
}

console.log(`Hardcoded user-visible text — ${findings.length} in ${byFile.size} file(s)\n`);

for (const [file, entries] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${file}  (${entries.length})`);
  for (const entry of entries.slice(0, 6)) {
    console.log(`  ${String(entry.line).padStart(4)}  ${entry.kind.padEnd(10)} ${entry.text.slice(0, 72)}`);
  }
  if (entries.length > 6) console.log(`        … and ${entries.length - 6} more`);
  console.log('');
}

if (findings.length > 0) {
  console.log(
    'Each of these stays English in every language while the coverage report reads 100%.',
  );
  process.exitCode = 1;
}
