/**
 * What LocZ refuses to carry, and why.
 *
 * Every entry names the law or policy it rests on. That is not decoration: the IT Rules
 * 2021 require an intermediary to tell users what they may not host and to act on unlawful
 * content, and a rejection nobody can explain is one nobody can appeal. A moderator
 * looking at a flagged listing should be able to see "Wildlife Protection Act 1972" rather
 * than guess why the word was on a list.
 *
 * **This is a developer's reading of Indian law and needs a lawyer's review before
 * launch.** It is written to be defensible and specific, not to be legal advice. The
 * hardest calls are recorded in `DECISIONS.md`.
 *
 * Severity:
 *   2 — auto-reject. Reserved for things that are unlawful to trade at all, where a
 *       plausible innocent listing does not exist.
 *   1 — hold for a human. Used wherever the same words have honest uses: a chemist may
 *       legitimately advertise medicines, a landlord may legitimately want a non-smoker.
 *
 * Terms appear in English and in the transliterations people actually type. A classifieds
 * site in India is written in Hinglish and Tenglish far more often than in either pure
 * language, and a list that only knows "cannabis" knows nothing.
 */

export interface BannedKeywordSeed {
  keyword: string;
  severity: 1 | 2;
  category: string;
  basis: string;
}

export const BANNED_KEYWORDS: BannedKeywordSeed[] = [
  // ------------------------------------------------------------------ wildlife
  // Trade in scheduled species and their parts. The 2022 amendment tightened this
  // considerably. Shed peacock feathers are lawful to possess, so the feather itself is a
  // review rather than a rejection — craft sellers are a real and legitimate constituency.
  ...asCategory('WILDLIFE', 'Wildlife Protection Act 1972 (as amended 2022)', 2, [
    'ivory',
    'elephant tusk',
    'haathi daant',
    'tiger skin',
    'leopard skin',
    'bagh ki khaal',
    'rhino horn',
    'pangolin scale',
    'shahtoosh',
    'star tortoise',
    'mongoose hair brush',
    'bear bile',
    'kasturi musk',
    'sea horse dried',
    'owl for tantrik',
  ]),
  ...asCategory('WILDLIFE', 'Wildlife Protection Act 1972 — lawful only if naturally shed', 1, [
    'peacock feather',
    'deer antler',
    'turtle shell',
  ]),
  ...asCategory('WILDLIFE', 'Forest Conservation rules — restricted timber', 1, [
    'red sanders',
    'sandalwood log',
    'rakta chandan',
  ]),

  // ------------------------------------------------------------------ narcotics
  // Bhang is deliberately absent: it is sold from licensed government shops in several
  // states, and a national ban would be wrong.
  ...asCategory('NARCOTICS', 'Narcotic Drugs and Psychotropic Substances Act 1985', 2, [
    'ganja',
    'gaanja',
    'charas',
    'hashish',
    'afeem',
    'opium',
    'brown sugar drug',
    'heroin',
    'cocaine',
    'mdma',
    'lsd blot',
    'mephedrone',
    'poppy husk',
    'doda post',
    'weed for sale',
    'stuff delivery hyderabad',
  ]),

  // ------------------------------------------------------------------ weapons
  // Air guns and airsoft are lawful within limits, so they are held rather than refused.
  ...asCategory('WEAPONS', 'Arms Act 1959 and Arms Rules 2016', 2, [
    'pistol for sale',
    'revolver for sale',
    'katta',
    'country made pistol',
    'live cartridge',
    'ammunition box',
    'ak 47',
  ]),
  ...asCategory('WEAPONS', 'Arms Act 1959 — licence-dependent', 1, [
    'air gun',
    'air rifle',
    'pellet gun',
    'airsoft',
  ]),
  ...asCategory('EXPLOSIVES', 'Explosives Act 1884; Explosive Substances Act 1908', 2, [
    'detonator',
    'gelatin stick',
    'ammonium nitrate',
    'blasting powder',
  ]),

  // ------------------------------------------------------------------ sex selection
  // Section 22 makes *advertising* prenatal sex determination an offence in itself, which
  // is exactly what a classifieds platform must not carry.
  ...asCategory(
    'SEX_SELECTION',
    'Pre-Conception and Pre-Natal Diagnostic Techniques Act 1994, s22 — advertising is itself an offence',
    2,
    [
      'sex determination',
      'gender determination test',
      'ling janch',
      'ladka ya ladki test',
      'garbh me ling',
      'baby gender test before birth',
      'sex selection kit',
    ],
  ),

  // ------------------------------------------------------------------ human body
  ...asCategory('HUMAN_BODY', 'Transplantation of Human Organs and Tissues Act 1994', 2, [
    'kidney for sale',
    'sell my kidney',
    'kidney bechna',
    'liver donor payment',
    'organ donor paid',
    'blood for money',
  ]),
  ...asCategory(
    'HUMAN_BODY',
    'Surrogacy (Regulation) Act 2021 and Assisted Reproductive Technology (Regulation) Act 2021 — commercial arrangements banned',
    2,
    ['surrogate mother paid', 'commercial surrogacy', 'egg donor payment', 'sperm donor payment'],
  ),

  // ------------------------------------------------------------------ medicines
  // A licensed chemist is a legitimate advertiser, so these are held rather than refused —
  // except the abortion pill, whose over-the-counter sale is separately unlawful.
  ...asCategory('PRESCRIPTION_DRUGS', 'Drugs and Cosmetics Act 1940 — Schedules H, H1 and X', 1, [
    'prescription medicine',
    'alprazolam',
    'tramadol',
    'codeine syrup',
    'cough syrup bottle',
    'steroid injection',
    'antibiotic strip',
  ]),
  ...asCategory(
    'ABORTION_PILL',
    'Medical Termination of Pregnancy Act 1971 with Drugs and Cosmetics Act — retail sale restricted to registered facilities',
    2,
    ['mtp kit', 'abortion pill', 'mifepristone', 'misoprostol', 'garbhpat goli'],
  ),

  // ------------------------------------------------------------------ tobacco and vapes
  // The 2019 Act is an outright ban on sale *and advertisement*, which many marketplaces
  // still miss.
  ...asCategory('E_CIGARETTE', 'Prohibition of Electronic Cigarettes Act 2019 — total ban', 2, [
    'e cigarette',
    'ecigarette',
    'vape pen',
    'vape pod',
    'e hookah',
    'juul',
    'nicotine salt',
  ]),
  ...asCategory('TOBACCO', 'COTPA 2003 and state gutka bans', 1, [
    'gutka',
    'pan masala tobacco',
    'khaini',
    'hookah flavour',
  ]),

  // ------------------------------------------------------------------ money schemes
  ...asCategory(
    'MONEY_CIRCULATION',
    'Prize Chits and Money Circulation Schemes (Banning) Act 1978; Banning of Unregulated Deposit Schemes Act 2019',
    2,
    [
      'double your money',
      'money circulation scheme',
      'binary income',
      'matrix plan joining',
      'chit fund scheme',
      'ponzi',
      'guaranteed returns daily',
      'paisa double',
    ],
  ),
  ...asCategory('MLM', 'Consumer Protection (Direct Selling) Rules 2021', 1, [
    'network marketing join',
    'downline',
    'mlm plan',
    'joining fee income',
  ]),

  // ------------------------------------------------------------------ gambling
  ...asCategory('GAMBLING', 'Public Gambling Act 1867 and state gaming legislation', 2, [
    'betting id',
    'cricket betting',
    'satta',
    'matka number',
    'casino id',
    'teen patti cash id',
    'lottery winner',
  ]),

  // ------------------------------------------------------------------ counterfeits
  ...asCategory('COUNTERFEIT', 'Trade Marks Act 1999; Copyright Act 1957', 2, [
    'first copy',
    'master copy watch',
    '7a quality',
    'replica branded',
    'duplicate branded',
    'cracked software',
    'pirated movie',
    'iptv subscription',
    'netflix account sale',
  ]),

  // ------------------------------------------------------------------ forged documents
  ...asCategory(
    'FORGED_DOCUMENTS',
    'Bharatiya Nyaya Sanhita 2023, ss336-340 (forgery); Aadhaar Act 2016, s38',
    2,
    [
      'fake certificate',
      'duplicate marksheet',
      'fake experience letter',
      'aadhaar card sale',
      'pan card sale',
      'voter id sale',
      'driving licence without test',
      'fake rent agreement',
      'duplicate rubber stamp',
      'fake gst bill',
    ],
  ),

  // ------------------------------------------------------------------ sexual services
  // "Massage" alone is not on the list: spas are a legitimate trade and the word is used
  // honestly far more often than not.
  ...asCategory('SEXUAL_SERVICES', 'Immoral Traffic (Prevention) Act 1956', 2, [
    'escort service',
    'call girl',
    'body massage full service',
    'happy ending massage',
    'friendship club paid',
    'night companion paid',
  ]),

  // ------------------------------------------------------------------ stolen goods and data
  ...asCategory(
    'STOLEN_OR_HACKED',
    'Information Technology Act 2000, ss43, 66, 66B; BNS 2023 receiving stolen property',
    2,
    [
      'imei change',
      'imei unlock stolen',
      'stolen phone',
      'hacked account sale',
      'customer database sale',
      'leads database buy',
      'otp bypass',
      'aadhaar data sale',
      'whatsapp hack service',
    ],
  ),
  ...asCategory(
    'SURVEILLANCE',
    'IT Act 2000 s66E (privacy); stalkerware policy — lawful devices, unlawful uses',
    1,
    ['spy camera', 'hidden camera pen', 'phone tracker without knowledge', 'call recording spy'],
  ),

  // ------------------------------------------------------------------ hazardous
  ...asCategory(
    'HAZARDOUS',
    'Poisons Act 1919; Laxmi v Union of India (2013) restrictions on acid sale',
    2,
    ['concentrated acid sale', 'tezaab', 'sulphuric acid bottle', 'mercury liquid sale'],
  ),

  // ------------------------------------------------------------------ antiquities
  ...asCategory('ANTIQUITIES', 'Antiquities and Art Treasures Act 1972', 1, [
    'antique idol',
    'temple idol old',
    'ancient coin collection',
  ]),

  // ------------------------------------------------------------------ child labour
  ...asCategory(
    'CHILD_LABOUR',
    'Child Labour (Prohibition and Regulation) Amendment Act 2016 — under 14 prohibited',
    2,
    ['child helper needed', 'boy 12 years work', 'small boy for shop work', 'bonded labour'],
  ),

  // ------------------------------------------------------------------ dowry
  ...asCategory('DOWRY', 'Dowry Prohibition Act 1961', 2, [
    'dowry expected',
    'dahej',
    'dowry demand',
  ]),

  // ------------------------------------------------------------------ discrimination
  // Held for a human, never auto-rejected. Article 15 binds the State rather than a
  // private landlord, so this is platform policy rather than statute — and the same words
  // sometimes appear in a listing objecting to the practice.
  ...asCategory('DISCRIMINATION', 'Platform policy — housing and employment discrimination', 1, [
    'no muslims',
    'hindus only',
    'muslims not allowed',
    'no christians',
    'upper caste only',
    'brahmins only',
    'no sc st',
    'no north indians',
    'only vegetarians',
    'pure veg tenants only',
    'no bachelors',
    'fair complexion only',
    'good looking girls only',
    'unmarried girls only',
    'no married women',
  ]),

  // ------------------------------------------------------------------ recruitment fraud
  ...asCategory('RECRUITMENT_FRAUD', 'Platform policy — charging a candidate to be hired', 1, [
    'registration fee for job',
    'security deposit for job',
    'pay to get job',
    'job guarantee after payment',
    'placement charges advance',
  ]),

  // ------------------------------------------------------------------ predatory lending
  ...asCategory(
    'PREDATORY_LENDING',
    'RBI digital lending guidelines 2022; state money-lending Acts',
    1,
    [
      'instant loan',
      'loan without documents',
      'aadhaar loan instant',
      'cash in 5 minutes loan',
      'no cibil loan',
    ],
  ),

  // ------------------------------------------------------------------ fake engagement
  ...asCategory(
    'FAKE_REVIEWS',
    'Consumer Protection Act 2019; IS 19000:2022 on online consumer reviews',
    1,
    ['buy followers', 'google review sale', 'paid 5 star review', 'fake rating service'],
  ),

  // ------------------------------------------------------------------ generic scams
  ...asCategory('SCAM_PATTERN', 'Platform policy — advance-fee fraud patterns', 1, [
    'advance payment',
    'registration fee',
    'work from home earn daily',
    'part time job investment',
    'courier charges to receive',
  ]),
];

/** Keeps the list above readable: the category and its basis are stated once. */
function asCategory(
  category: string,
  basis: string,
  severity: 1 | 2,
  keywords: string[],
): BannedKeywordSeed[] {
  return keywords.map((keyword) => ({ keyword, severity, category, basis }));
}
