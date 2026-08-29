'use strict';

/**
 * Curated public brands whose imported branch records are identity pages, not listings that a
 * local user may take over. Matching is deliberately anchored at the beginning of the name.
 * Broad fuzzy matching here would put legitimate independent businesses beyond their owners'
 * reach, which is much worse than leaving an occasional chain record with a monogram.
 */
const PUBLIC_BRANDS = Object.freeze([
  bank('sbi', 'State Bank of India', ['state bank of india', 'sbi'], 'sbin', [
    'life',
    'general insurance',
    'securities',
    'customer service point',
    'guest house',
  ]),
  bank('hdfc-bank', 'HDFC Bank', ['hdfc bank'], 'hdfc'),
  bank('icici-bank', 'ICICI Bank', ['icici bank'], 'icic'),
  bank('axis-bank', 'Axis Bank', ['axis bank'], 'utib', ['personal loan']),
  bank('kotak-mahindra-bank', 'Kotak Mahindra Bank', ['kotak mahindra bank'], 'kkbk'),
  bank('canara-bank', 'Canara Bank', ['canara bank'], 'cnrb', ['hsbc life insurance']),
  bank('bank-of-baroda', 'Bank of Baroda', ['bank of baroda'], 'barb'),
  bank('pnb', 'Punjab National Bank', ['punjab national bank', 'pnb bank'], 'punb'),
  bank('union-bank', 'Union Bank of India', ['union bank of india'], 'ubin'),
  bank('bank-of-india', 'Bank of India', ['bank of india'], 'bkid'),
  bank('indian-bank', 'Indian Bank', ['indian bank'], 'idib', ['e banking lounge']),
  bank('indian-overseas-bank', 'Indian Overseas Bank', ['indian overseas bank'], 'ioba'),
  bank('idbi-bank', 'IDBI Bank', ['idbi bank'], 'ibkl'),
  bank('federal-bank', 'Federal Bank', ['federal bank'], 'fdrl'),
  bank('indusind-bank', 'IndusInd Bank', ['indusind bank'], 'indb'),
  bank('yes-bank', 'YES BANK', ['yes bank'], 'yesb'),
  bank('central-bank', 'Central Bank of India', ['central bank of india'], 'cbin'),
  bank('rbl-bank', 'RBL Bank', ['rbl bank'], 'ratn'),
  bank('au-small-finance-bank', 'AU Small Finance Bank', ['au small finance bank'], 'aubl'),
  bank('bandhan-bank', 'Bandhan Bank', ['bandhan bank'], 'bdbl'),
  bank('bank-of-maharashtra', 'Bank of Maharashtra', ['bank of maharashtra'], 'mahb'),
  bank('uco-bank', 'UCO Bank', ['uco bank'], 'ucba'),
  bank('south-indian-bank', 'South Indian Bank', ['south indian bank'], 'sibl'),
  bank('jk-bank', 'Jammu & Kashmir Bank', ['j and k bank', 'jammu and kashmir bank', 'jk bank'], 'jaka'),
  bank('idfc-first-bank', 'IDFC FIRST Bank', ['idfc first bank', 'idfc bank'], 'idfb', ['mutual fund']),
  bank('csb-bank', 'CSB Bank', ['csb bank', 'catholic syrian bank'], 'csbk'),
  bank('city-union-bank', 'City Union Bank', ['city union bank'], 'ciub'),
  bank('karnataka-bank', 'Karnataka Bank', ['karnataka bank'], 'karb'),
  bank('karur-vysya-bank', 'Karur Vysya Bank', ['karur vysya bank'], 'kvbl'),
  bank('punjab-sind-bank', 'Punjab & Sind Bank', ['punjab and sind bank'], 'psib'),
  bank('tamilnad-mercantile-bank', 'Tamilnad Mercantile Bank', ['tamilnad mercantile bank'], 'tmbl'),
  bank('dcb-bank', 'DCB Bank', ['dcb bank', 'development credit bank'], 'dcbl'),
  bank('dhanlaxmi-bank', 'Dhanlaxmi Bank', ['dhanlaxmi bank'], 'dlxb'),
  bank('nainital-bank', 'Nainital Bank', ['nainital bank', 'the nainital bank'], 'ntbl'),
  bank('standard-chartered-bank', 'Standard Chartered Bank', ['standard chartered bank', 'standard chartered'], 'scbl', ['securities', 'life', 'mutual fund']),
  bank('equitas-small-finance-bank', 'Equitas Small Finance Bank', ['equitas small finance bank', 'equitas bank'], 'esmf'),
  bank('ujjivan-small-finance-bank', 'Ujjivan Small Finance Bank', ['ujjivan small finance bank', 'ujjivan bank'], 'ujvn'),
  bank('airtel-payments-bank', 'Airtel Payments Bank', ['airtel payments bank'], 'airp'),
  bank('paytm-payments-bank', 'Paytm Payments Bank', ['paytm payments bank'], 'pytm'),
  bank('fino-payments-bank', 'Fino Payments Bank', ['fino payments bank'], 'fino'),
  bank('jio-payments-bank', 'Jio Payments Bank', ['jio payments bank'], 'jiop'),
  brand('starbucks', 'Starbucks', ['starbucks'], 'svg', 'https://starbucks.in/'),
  brand(
    'mcdonalds',
    "McDonald's",
    ['mcdonalds', 'mc donalds'],
    'svg',
    'https://www.mcdonaldsindia.com/',
  ),
  brand('kfc', 'KFC', ['kfc'], 'svg', 'https://online.kfc.co.in/', ['universal ministries']),
  brand(
    'dominos',
    "Domino's Pizza",
    ['dominos', 'dominos pizza'],
    'svg',
    'https://www.dominos.co.in/',
  ),
  brand('pizza-hut', 'Pizza Hut', ['pizza hut'], 'png', 'https://www.pizzahut.co.in/'),
  brand('subway', 'Subway', ['subway'], 'svg', 'https://www.subway.in/'),
  brand('burger-king', 'Burger King', ['burger king'], 'svg', 'https://www.burgerking.in/'),
  brand(
    'reliance-digital',
    'Reliance Digital',
    ['reliance digital'],
    'png',
    'https://www.ril.com/news-media/resource-center/media-kit/reliance-retail',
  ),
  brand(
    'reliance-smart',
    'Reliance Smart Bazaar',
    ['reliance smart bazaar', 'smart bazaar', 'reliance smart'],
    'png',
    'https://www.ril.com/news-media/resource-center/media-kit/reliance-retail',
  ),
  brand(
    'jio',
    'Jio',
    ['my jio store', 'reliance jio', 'jio store', 'jio center', 'jio digital store'],
    'svg',
    'https://www.jio.com/',
  ),
  brand('croma', 'Croma', ['croma'], 'png', 'https://www.croma.com/'),
  brand('dmart', 'DMart', ['dmart'], 'png', 'https://www.dmartindia.com/', ['furniture', 'x']),
  brand(
    'apollo-pharmacy',
    'Apollo Pharmacy',
    ['apollo pharmacy'],
    'png',
    'https://www.apollopharmacy.in/',
  ),
  brand('medplus', 'MedPlus', ['medplus'], 'png', 'https://www.medplusmart.com/'),
  brand(
    'airtel',
    'Airtel',
    [
      'airtel store',
      'airtel express store',
      'airtel express',
      'airtel relationship centre',
      'airtel showroom',
    ],
    'svg',
    'https://www.airtel.in/',
  ),
  brand('indian-oil', 'IndianOil', ['indian oil'], 'svg', 'https://iocl.com/'),
  brand(
    'bharat-petroleum',
    'Bharat Petroleum',
    ['bharat petroleum'],
    'svg',
    'https://www.bharatpetroleum.in/',
  ),
  brand(
    'hindustan-petroleum',
    'Hindustan Petroleum',
    ['hindustan petroleum', 'hp petrol pump'],
    'svg',
    'https://www.hindustanpetroleum.com/',
  ),
  brand('decathlon', 'Decathlon', ['decathlon'], 'png', 'https://www.decathlon.in/'),
  brand(
    'india-post',
    'India Post',
    ['india post', 'indian post'],
    'jpg',
    'https://www.indiapost.gov.in/',
  ),
  // National chains — logos from Wikimedia Commons (PD / freely-licensed), source recorded per entry.
  brand(
    'muthoot-finance',
    'Muthoot Finance',
    ['muthoot finance'],
    'png',
    'https://commons.wikimedia.org/wiki/File:Muthoot-finance-logo.png',
  ),
  brand(
    'bajaj-finance',
    'Bajaj Finance',
    ['bajaj finance'],
    'svg',
    'https://commons.wikimedia.org/wiki/File:Bajaj_Finance_Logo.svg',
  ),
  brand(
    'bajaj-finserv',
    'Bajaj Finserv',
    ['bajaj finserv'],
    'svg',
    'https://commons.wikimedia.org/wiki/File:Bajaj_Finserv_Logo.svg',
  ),
  brand(
    'patanjali',
    'Patanjali',
    ['patanjali'],
    'png',
    'https://commons.wikimedia.org/wiki/File:Patanjali_Ayurved_Logo.png',
  ),
  brand(
    'sharekhan',
    'Sharekhan',
    ['sharekhan', 'mirae asset sharekhan'],
    'png',
    'https://commons.wikimedia.org/wiki/File:Official_Logo_of_Sharekhan_by_BNP_Paribas.png',
  ),
  brand(
    'metropolis-healthcare',
    'Metropolis Healthcare',
    ['metropolis healthcare', 'metropolis labs', 'metropolis diagnostic'],
    'png',
    'https://commons.wikimedia.org/wiki/File:Metropolis_Healthcare_Logo_White_Background.png',
  ),
  brand(
    'asian-paints',
    'Asian Paints',
    ['asian paints'],
    'svg',
    'https://commons.wikimedia.org/wiki/File:Asian_Paints_Logo.svg',
  ),
  brand(
    'vodafone-idea',
    'Vi (Vodafone Idea)',
    ['vi vodafone idea', 'vodafone idea'],
    'svg',
    'https://commons.wikimedia.org/wiki/File:Vodafone_Idea_logo.svg',
  ),
  brand(
    'bata',
    'Bata',
    ['bata'],
    'png',
    'https://commons.wikimedia.org/wiki/File:Bata_logo_-_2023.png',
  ),
]);

function bank(key, displayName, aliases, code, blockedSuffixes) {
  return Object.freeze({
    key,
    displayName,
    aliases: Object.freeze(aliases),
    blockedSuffixes: blockedSuffixes ? Object.freeze(blockedSuffixes) : undefined,
    logoAsset: `/brands/businesses/${key}.svg`,
    sourceUrl: `https://github.com/praveenpuglia/indian-banks/tree/main/assets/logos/${code}`,
  });
}

function brand(key, displayName, aliases, extension, sourceUrl, blockedSuffixes) {
  return Object.freeze({
    key,
    displayName,
    aliases: Object.freeze(aliases),
    blockedSuffixes: blockedSuffixes ? Object.freeze(blockedSuffixes) : undefined,
    logoAsset: `/brands/businesses/${key}.${extension}`,
    sourceUrl,
  });
}

function normalizeBusinessName(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPublicBrand(name) {
  const normalized = normalizeBusinessName(name);
  if (!normalized) return null;

  for (const candidate of PUBLIC_BRANDS) {
    for (const alias of candidate.aliases) {
      if (normalized !== alias && !normalized.startsWith(`${alias} `)) continue;
      const suffix = normalized.slice(alias.length).trim();
      if (
        candidate.blockedSuffixes?.some(
          (blocked) => suffix === blocked || suffix.startsWith(`${blocked} `),
        )
      ) {
        continue;
      }
      return candidate;
    }
  }
  return null;
}

function publicBrandLogo(name, brandKey) {
  const candidate = brandKey
    ? (PUBLIC_BRANDS.find((brandEntry) => brandEntry.key === brandKey) ?? null)
    : findPublicBrand(name);
  return candidate?.logoAsset ?? null;
}

module.exports = { PUBLIC_BRANDS, findPublicBrand, normalizeBusinessName, publicBrandLogo };
