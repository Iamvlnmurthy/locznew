// Audit which banner every in-use category resolves to, using the same logic as
// premium-banner-catalog.ts. Reading the mapping off the live pages one at a
// time would take hours; this answers for all 1,400 in a second.
//   node audit-banners.mjs var/categories.txt
import { readFileSync } from 'node:fs';

const src = readFileSync('apps/web/src/lib/premium-banner-catalog.ts', 'utf8');

// The catalogue keys, as written in the file.
const keys = [...src.matchAll(/^\s*'([^']+)':\s*banner\(/gm)].map((m) => m[1]);
if (!keys.length) throw new Error('no catalogue keys parsed');

const UNHELPFUL = new Set(
  src.match(/const UNHELPFUL = new Set\(\[([\s\S]*?)\]\)/)[1]
    .split('\n')
    .map((l) => (l.match(/'([^']+)'/) || [])[1])
    .filter(Boolean),
);

const GENERIC_HEADS = new Set(
  (src.match(/const GENERIC_HEADS = new Set\(\[([\s\S]*?)\]\)/) || ['', ''])[1]
    .split(String.fromCharCode(10))
    .map((l) => (l.match(/'([^']+)'/) || [])[1])
    .filter(Boolean),
);

const sig = (name) =>
  name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !UNHELPFUL.has(w));

function resolve(category) {
  const lower = category.toLowerCase();
  if (keys.includes(lower)) return { banner: lower, how: 'exact' };
  const words = sig(category);
  if (!words.length) return { banner: null, how: 'no-words' };
  let best = null;
  for (const key of keys) {
    const keyWords = sig(key);
    const shared = keyWords.filter((w) => words.includes(w));
    const score = shared.length;
    const head = words[words.length - 1];
    const headMatches =
      score > 0 &&
      head === keyWords[keyWords.length - 1] &&
      shared.includes(head) &&
      !GENERIC_HEADS.has(head);
    if ((score >= 2 || headMatches) && (!best || score > best.score))
      best = { key, score, how: score >= 2 ? `${score} words` : 'head noun', shared };
  }
  return best ? { banner: best.key, how: best.how, shared: best.shared } : { banner: null, how: 'none' };
}

const rows = readFileSync(process.argv[2] || 'var/categories.txt', 'utf8')
  .split('\n').filter(Boolean)
  .map((l) => { const [name, n] = l.split('|'); return { name, n: Number(n) }; })
  .filter((r) => r.name && Number.isFinite(r.n));

let exact = 0, fuzzy = 0, none = 0, exactBiz = 0, fuzzyBiz = 0, noneBiz = 0;
const fuzzies = [];
for (const r of rows) {
  const got = resolve(r.name);
  if (got.how === 'exact') { exact++; exactBiz += r.n; }
  else if (got.banner) { fuzzy++; fuzzyBiz += r.n; fuzzies.push({ ...r, ...got }); }
  else { none++; noneBiz += r.n; }
}
const pc = (x) => ((x / rows.reduce((a, b) => a + b.n, 0)) * 100).toFixed(1) + '%';
console.log(`categories: ${rows.length}`);
console.log(`  exact key   ${String(exact).padStart(5)}   ${pc(exactBiz)} of businesses`);
console.log(`  borrowed    ${String(fuzzy).padStart(5)}   ${pc(fuzzyBiz)}`);
console.log(`  no banner   ${String(none).padStart(5)}   ${pc(noneBiz)}`);
console.log('\nborrowed, biggest first — these are the ones that can be wrong:\n');
for (const f of fuzzies.sort((a, b) => b.n - a.n).slice(0, Number(process.argv[3] || 60)))
  console.log(`${String(f.n).padStart(7)}  ${f.name}\n            -> ${f.banner}   (${f.how}: ${(f.shared || []).join(', ')})`);
