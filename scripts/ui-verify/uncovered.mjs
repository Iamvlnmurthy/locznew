// Which in-use categories will STILL have no artwork after the eight batches
// already with Codex. Same resolver as audit-banners.mjs, minus anything the
// batches already claim.
import { readFileSync } from 'node:fs';
const src = readFileSync('apps/web/src/lib/premium-banner-catalog.ts', 'utf8');
// Keys are declared two ways in the catalogue - `'k': banner('slug')` and
// `'k': someVariable` - so take every quoted key inside the categoryBanners
// object rather than only the banner() form. Reading only one form under-counted
// the catalogue and reported categories as uncovered when they were not.
const body = src.slice(
  src.indexOf('const categoryBanners'),
  src.indexOf(String.fromCharCode(10) + '};', src.indexOf('const categoryBanners')),
);
const keys = [...body.matchAll(/^\s*(?:'([^']+)'|([A-Za-z_$][\w$]*)):/gm)].map(
  (m) => m[1] ?? m[2],
);
if (!keys.length) throw new Error('no catalogue keys parsed');
const setFrom = (name) => new Set(
  ((src.match(new RegExp('const ' + name + ' = new Set\\(\\[([\\s\\S]*?)\\]\\)')) || ['', ''])[1])
    .split(String.fromCharCode(10)).map((l) => (l.match(/'([^']+)'/) || [])[1]).filter(Boolean));
const UNHELPFUL = setFrom('UNHELPFUL');
const GENERIC_HEADS = setFrom('GENERIC_HEADS');
const sig = (n) => n.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !UNHELPFUL.has(w));
function resolves(category) {
  if (keys.includes(category.toLowerCase())) return true;
  const words = sig(category);
  if (!words.length) return false;
  for (const key of keys) {
    const kw = sig(key);
    const shared = kw.filter((w) => words.includes(w));
    const head = words[words.length - 1];
    if (shared.length >= 2) return true;
    if (shared.length && head === kw[kw.length - 1] && shared.includes(head) && !GENERIC_HEADS.has(head))
      return true;
  }
  return false;
}
const batched = new Set(
  readFileSync('docs/banner_batches.txt', 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.toLowerCase()));
const rows = readFileSync('var/categories.txt', 'utf8').split('\n').filter(Boolean)
  .map((l) => { const [name, n] = l.split('|'); return { name, n: Number(n) }; })
  .filter((r) => r.name && Number.isFinite(r.n));
const gap = rows.filter((r) => !resolves(r.name) && !batched.has(r.name.toLowerCase()));
const biz = gap.reduce((a, b) => a + b.n, 0);
console.log(`still uncovered after the 8 batches: ${gap.length} categories, ${biz.toLocaleString()} businesses`);
console.log(`of which the top 200 cover ${gap.slice(0,200).reduce((a,b)=>a+b.n,0).toLocaleString()}`);
const N = Number(process.argv[2] || 0);
if (N) for (const g of gap.slice(0, N)) console.log(`${String(g.n).padStart(7)}  ${g.name}`);
