/**
 * Assign the 7th CPC HRA tier (1 = Tier 1 / X, 2 = Tier 2 / Y, 3 = Tier 3 / Z — the SEBI
 * reference) to existing city rows by name-match. Creates NO cities; anything unmatched becomes
 * Tier 3. Re-runnable and idempotent.
 *
 *   npm run db:seed-tiers -w @locz/api
 *
 * Our `cities` table is district-level, so the X/Y city names are matched to the district that
 * carries them, with an alias map for renamed cities (Gurugram=Gurgaon, Prayagraj=Allahabad, …).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');

const X: Array<[string, string[]]> = [
  ['Delhi', ['delhi', 'newdelhi', 'centraldelhi', 'newdelhimunicipal']],
  ['Hyderabad', ['hyderabad']],
  ['Ahmedabad', ['ahmedabad', 'ahmadabad']],
  ['Bengaluru', ['bengaluru', 'bangalore', 'bengalore', 'bangaloreurban']],
  ['Mumbai', ['mumbai', 'greatermumbai', 'bombay', 'mumbaicity', 'mumbaisuburban']],
  ['Pune', ['pune', 'poona']],
  ['Chennai', ['chennai', 'madras']],
  ['Kolkata', ['kolkata', 'calcutta']],
];

const Y: Array<[string, string[]]> = [
  ['Vijayawada', ['vijayawada']],
  ['Warangal', ['warangal', 'warangalurban', 'hanamkonda']],
  ['Visakhapatnam', ['visakhapatnam', 'greatervisakhapatnam', 'vizag', 'vishakhapatnam']],
  ['Guntur', ['guntur']],
  ['Nellore', ['nellore', 'spsnellore']],
  ['Guwahati', ['guwahati', 'kamrupmetropolitan', 'kamrup']],
  ['Patna', ['patna']],
  ['Chandigarh', ['chandigarh']],
  ['Durg-Bhilai', ['durg', 'bhilai', 'durgbhilainagar']],
  ['Raipur', ['raipur']],
  ['Rajkot', ['rajkot']],
  ['Jamnagar', ['jamnagar']],
  ['Bhavnagar', ['bhavnagar']],
  ['Vadodara', ['vadodara', 'baroda']],
  ['Surat', ['surat']],
  ['Faridabad', ['faridabad']],
  ['Gurgaon', ['gurgaon', 'gurugram']],
  ['Srinagar', ['srinagar']],
  ['Jammu', ['jammu']],
  ['Jamshedpur', ['jamshedpur', 'eastsinghbhum', 'purbisinghbhum']],
  ['Dhanbad', ['dhanbad']],
  ['Ranchi', ['ranchi']],
  ['Bokaro', ['bokaro', 'bokarosteelcity']],
  ['Belgaum', ['belgaum', 'belagavi']],
  ['Hubli-Dharwad', ['hubli', 'dharwad', 'hublidharwad']],
  ['Mangalore', ['mangalore', 'mangaluru', 'dakshinakannada']],
  ['Mysore', ['mysore', 'mysuru']],
  ['Gulbarga', ['gulbarga', 'kalaburagi']],
  ['Kozhikode', ['kozhikode', 'calicut']],
  ['Kochi', ['kochi', 'ernakulam', 'cochin']],
  ['Thiruvananthapuram', ['thiruvananthapuram', 'thiruvanathapuram', 'trivandrum']],
  ['Thrissur', ['thrissur', 'trichur']],
  ['Malappuram', ['malappuram']],
  ['Kannur', ['kannur', 'cannanore']],
  ['Kollam', ['kollam', 'quilon']],
  ['Gwalior', ['gwalior']],
  ['Indore', ['indore']],
  ['Bhopal', ['bhopal']],
  ['Jabalpur', ['jabalpur']],
  ['Ujjain', ['ujjain']],
  ['Amravati', ['amravati']],
  ['Nagpur', ['nagpur']],
  ['Aurangabad', ['aurangabad', 'chhatrapatisambhajinagar', 'sambhajinagar']],
  ['Nashik', ['nashik', 'nasik']],
  ['Bhiwandi', ['bhiwandi']],
  ['Solapur', ['solapur', 'sholapur']],
  ['Kolhapur', ['kolhapur']],
  ['Vasai-Virar', ['vasaivirar', 'vasai', 'virar', 'palghar']],
  ['Malegaon', ['malegaon']],
  ['Nanded', ['nanded', 'nandedwaghala']],
  ['Sangli', ['sangli', 'sanglimirajkupwad']],
  ['Cuttack', ['cuttack']],
  ['Bhubaneswar', ['bhubaneswar', 'khordha', 'khurda']],
  ['Rourkela', ['rourkela', 'raurkela', 'sundargarh']],
  ['Puducherry', ['puducherry', 'pondicherry']],
  ['Amritsar', ['amritsar']],
  ['Jalandhar', ['jalandhar']],
  ['Ludhiana', ['ludhiana']],
  ['Bikaner', ['bikaner']],
  ['Jaipur', ['jaipur']],
  ['Jodhpur', ['jodhpur']],
  ['Kota', ['kota']],
  ['Ajmer', ['ajmer']],
  ['Salem', ['salem']],
  ['Tiruppur', ['tiruppur', 'tirupur']],
  ['Coimbatore', ['coimbatore']],
  ['Tiruchirappalli', ['tiruchirappalli', 'trichy', 'tiruchirapalli']],
  ['Madurai', ['madurai']],
  ['Erode', ['erode']],
  ['Moradabad', ['moradabad']],
  ['Meerut', ['meerut']],
  ['Ghaziabad', ['ghaziabad']],
  ['Aligarh', ['aligarh']],
  ['Agra', ['agra']],
  ['Bareilly', ['bareilly']],
  ['Lucknow', ['lucknow']],
  ['Kanpur', ['kanpur', 'kanpurnagar']],
  ['Allahabad', ['allahabad', 'prayagraj']],
  ['Gorakhpur', ['gorakhpur']],
  ['Varanasi', ['varanasi', 'banaras', 'benares']],
  ['Saharanpur', ['saharanpur']],
  ['Noida', ['noida', 'gautambuddhanagar', 'gautambudhnagar']],
  ['Firozabad', ['firozabad']],
  ['Jhansi', ['jhansi']],
  ['Dehradun', ['dehradun']],
  ['Asansol', ['asansol']],
  ['Siliguri', ['siliguri', 'darjeeling']],
  ['Durgapur', ['durgapur', 'paschimbardhaman', 'westbardhaman']],
];

function lookup(): Map<string, number> {
  const m = new Map<string, number>();
  for (const [, aliases] of Y) for (const a of aliases) m.set(norm(a), 2);
  for (const [, aliases] of X) for (const a of aliases) m.set(norm(a), 1); // X wins on overlap
  return m;
}

async function main() {
  const table = lookup();
  const cities = await prisma.city.findMany({ select: { id: true, name: true } });

  const t1: string[] = [];
  const t2: string[] = [];
  for (const c of cities) {
    const tier = table.get(norm(c.name)) ?? 3;
    if (tier === 1) t1.push(c.id);
    else if (tier === 2) t2.push(c.id);
  }

  // Everyone Tier 3, then override the matched ids. Batched IN-lists keep the statements small.
  await prisma.city.updateMany({ data: { tier: 3 } });
  if (t1.length) await prisma.city.updateMany({ where: { id: { in: t1 } }, data: { tier: 1 } });
  if (t2.length) await prisma.city.updateMany({ where: { id: { in: t2 } }, data: { tier: 2 } });

  console.log(
    `Tiers set — Tier 1: ${t1.length}, Tier 2: ${t2.length}, Tier 3: ${cities.length - t1.length - t2.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
