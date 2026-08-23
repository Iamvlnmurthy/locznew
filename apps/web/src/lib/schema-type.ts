/**
 * The schema.org type that best describes a business, from its category.
 *
 * Every page declared `LocalBusiness`, which is true and vague. schema.org has
 * specific subtypes for most of what a directory contains, and a more precise
 * type is what lets a search engine understand that a page is about a dentist
 * rather than about a shop of some kind.
 *
 * Three rules this follows:
 *
 * 1. **Only real schema.org types.** Inventing `DentalClinic` because it reads
 *    well would produce invalid markup; the actual type is `Dentist`.
 * 2. **Match on the specific category first, the parent second.** The directory
 *    has 1,375 subcategories under 69 parents, so the parent is the safety net
 *    rather than the primary signal.
 * 3. **Fall back to `LocalBusiness`, never to a guess.** An imprecise-but-true
 *    type is worth more than a precise-but-wrong one, and a wrong type on a
 *    million pages is a worse outcome than a vague one.
 */

/** Matched against the lower-cased category name, first hit wins, order matters. */
const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Health. Dentist and Physician are types in their own right; a hospital is not
  // a MedicalClinic and vice versa, so they are matched separately.
  [/\bdent(al|ist)/, 'Dentist'],
  [/\b(hospital|nursing home)/, 'Hospital'],
  [/\b(pharmac|medical shop|chemist|drug ?store)/, 'Pharmacy'],
  [/\b(veterinar|pet clinic)/, 'VeterinaryCare'],
  [/\b(optician|optometr|eye care|eye clinic)/, 'Optician'],
  [
    /\b(clinic|doctor|physician|diagnostic|patholog|medical centre|medical center)/,
    'MedicalClinic',
  ],
  [/\b(physiotherap|rehabilitation)/, 'Physiotherapy'],

  // Food and drink.
  [/\b(cafe|coffee|tea (shop|stall))/, 'CafeOrCoffeeShop'],
  [/\b(bakery|bakeries|patisserie|cake)/, 'Bakery'],
  [/\b(bar|pub|brewery|wine shop|liquor)/, 'BarOrPub'],
  [/\b(ice ?cream|dessert|sweet)/, 'IceCreamShop'],
  [/\b(restaurant|dhaba|mess|eatery|food court|tiffin)/, 'Restaurant'],

  // Stays.
  [/\b(hotel|resort|lodge|guest ?house|home ?stay|hostel|inn)\b/, 'Hotel'],

  // Education.
  [/\b(school|vidyalaya|gurukul)/, 'School'],
  [/\b(college|university|institute|polytechnic)/, 'CollegeOrUniversity'],
  [/\b(coaching|tuition|training|classes|academy|tutor)/, 'EducationalOrganization'],
  [/\b(librar)/, 'Library'],

  // Money.
  [/\b(bank|atm|credit union)/, 'BankOrCreditUnion'],
  [/\b(insurance)/, 'InsuranceAgency'],
  [/\b(account|chartered accountant|tax|audit)/, 'AccountingService'],

  // Motoring.
  [/\b(petrol|fuel|gas station|filling station)/, 'GasStation'],
  [/\b(car (wash|cleaning))/, 'AutoWash'],
  [/\b(car dealer|automobile dealer|showroom|bike dealer)/, 'AutoDealer'],
  [/\b(garage|auto (repair|service)|mechanic|denting|painting)/, 'AutoRepair'],
  [/\b(auto ?parts|spare ?parts|tyre|battery)/, 'AutoPartsStore'],

  // Body and health-adjacent services.
  [/\b(salon|barber|parlour|parlor|spa|beauty|grooming)/, 'BeautySalon'],
  [/\b(gym|fitness|yoga|crossfit)/, 'HealthClub'],

  // Trades and home services.
  [/\b(plumb)/, 'Plumber'],
  [/\b(electric(ian|al service))/, 'Electrician'],
  [/\b(locksmith)/, 'Locksmith'],
  [/\b(mover|packer|relocation)/, 'MovingCompany'],
  [/\b(laundry|dry clean|ironing)/, 'DryCleaningOrLaundry'],
  [/\b(contractor|construction|builder|civil work)/, 'GeneralContractor'],
  [/\b(house ?paint|painting service)/, 'HousePainter'],
  [/\b(roof)/, 'RoofingContractor'],

  // Shops. Ordered so a specific shop wins over the generic Store at the end.
  [/\b(grocer|kirana|supermarket|provision|general store)/, 'GroceryStore'],
  [/\b(cloth|apparel|garment|boutique|saree|fashion|footwear|shoe)/, 'ClothingStore'],
  [/\b(jewel|goldsmith)/, 'JewelryStore'],
  [/\b(mobile|electronic|computer|laptop|appliance)/, 'ElectronicsStore'],
  [/\b(furniture|home ?decor|interior)/, 'FurnitureStore'],
  [/\b(book|stationer)/, 'BookStore'],
  [/\b(hardware|paint store|building material|sanitary)/, 'HardwareStore'],
  [/\b(florist|flower)/, 'Florist'],
  [/\b(pet (shop|store)|aquarium)/, 'PetStore'],
  [/\b(toy|gift)/, 'Store'],

  // Places that are not businesses in the ordinary sense.
  [/\b(temple|mosque|church|masjid|gurudwara|worship)/, 'PlaceOfWorship'],
  [/\b(park|garden|playground)/, 'Park'],
  [/\b(museum)/, 'Museum'],
  [/\b(cinema|theatre|theater|multiplex)/, 'MovieTheater'],
  [/\b(police)/, 'PoliceStation'],
  [/\b(post office)/, 'PostOffice'],
  [/\b(government|municipal|panchayat|revenue office)/, 'GovernmentOffice'],
  [/\b(travel agen|tour operator)/, 'TravelAgency'],
  [/\b(real ?estate|property|broker)/, 'RealEstateAgent'],
  [/\b(law|advocate|legal|solicitor)/, 'Attorney'],
];

/**
 * @param category the specific category name
 * @param parent   its parent, tried second
 */
export function schemaTypeFor(category?: string | null, parent?: string | null): string {
  for (const name of [category, parent]) {
    const value = (name ?? '').toLowerCase();
    if (!value) continue;
    for (const [pattern, type] of RULES) {
      if (pattern.test(value)) return type;
    }
  }
  return 'LocalBusiness';
}
