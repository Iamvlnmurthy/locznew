export interface CityGuideCatalogEntry {
  name: string;
  slug: string;
  state: string;
  tier: 1 | 2;
}

type CityTuple = readonly [name: string, slug: string, state: string, tier: 1 | 2];

/**
 * The product's curated Tier-1/2 city-guide catalog. This mirrors
 * scripts/city-content/locz_cities.db and deliberately lives in the web bundle because the
 * public city-search endpoint is capped at 50 and has no pagination. Keep this list in sync when
 * the source catalog changes; individual page content still comes from the API.
 */
const CITY_TUPLES: readonly CityTuple[] = [
  ['Delhi', 'delhi', 'Delhi', 1],
  ['Ahmedabad', 'ahmedabad', 'Gujarat', 1],
  ['Bengaluru', 'bengaluru', 'Karnataka', 1],
  ['Mumbai', 'mumbai', 'Maharashtra', 1],
  ['Pune', 'pune', 'Maharashtra', 1],
  ['Chennai', 'chennai', 'Tamil Nadu', 1],
  ['Hyderabad', 'hyderabad', 'Telangana', 1],
  ['Kolkata', 'kolkata', 'West Bengal', 1],
  ['Guntur', 'guntur', 'Andhra Pradesh', 2],
  ['Kakinada', 'kakinada', 'Andhra Pradesh', 2],
  ['Kurnool', 'kurnool', 'Andhra Pradesh', 2],
  ['Nellore', 'nellore', 'Andhra Pradesh', 2],
  ['Rajamahendravaram', 'rajamahendravaram', 'Andhra Pradesh', 2],
  ['Vijayawada', 'vijayawada', 'Andhra Pradesh', 2],
  ['Visakhapatnam', 'visakhapatnam', 'Andhra Pradesh', 2],
  ['Guwahati', 'guwahati', 'Assam', 2],
  ['Patna', 'patna', 'Bihar', 2],
  ['Chandigarh', 'chandigarh', 'Chandigarh', 2],
  ['Bhilai', 'bhilai', 'Chhattisgarh', 2],
  ['Bilaspur', 'bilaspur', 'Chhattisgarh', 2],
  ['Raipur', 'raipur', 'Chhattisgarh', 2],
  ['Bhavnagar', 'bhavnagar', 'Gujarat', 2],
  ['Jamnagar', 'jamnagar', 'Gujarat', 2],
  ['Rajkot', 'rajkot', 'Gujarat', 2],
  ['Surat', 'surat', 'Gujarat', 2],
  ['Vadodara', 'vadodara', 'Gujarat', 2],
  ['Faridabad', 'faridabad', 'Haryana', 2],
  ['Gurugram', 'gurugram', 'Haryana', 2],
  ['Shimla', 'shimla', 'Himachal Pradesh', 2],
  ['Jammu', 'jammu', 'Jammu and Kashmir', 2],
  ['Srinagar', 'srinagar', 'Jammu and Kashmir', 2],
  ['Bokaro Steel City', 'bokaro-steel-city', 'Jharkhand', 2],
  ['Dhanbad', 'dhanbad', 'Jharkhand', 2],
  ['Jamshedpur', 'jamshedpur', 'Jharkhand', 2],
  ['Ranchi', 'ranchi', 'Jharkhand', 2],
  ['Belagavi', 'belagavi', 'Karnataka', 2],
  ['Hubballi-Dharwad', 'hubballi-dharwad', 'Karnataka', 2],
  ['Kalaburagi', 'kalaburagi', 'Karnataka', 2],
  ['Mangaluru', 'mangaluru', 'Karnataka', 2],
  ['Mysuru', 'mysuru', 'Karnataka', 2],
  ['Kannur', 'kannur', 'Kerala', 2],
  ['Kochi', 'kochi', 'Kerala', 2],
  ['Kollam', 'kollam', 'Kerala', 2],
  ['Kozhikode', 'kozhikode', 'Kerala', 2],
  ['Thiruvananthapuram', 'thiruvananthapuram', 'Kerala', 2],
  ['Thrissur', 'thrissur', 'Kerala', 2],
  ['Bhopal', 'bhopal', 'Madhya Pradesh', 2],
  ['Gwalior', 'gwalior', 'Madhya Pradesh', 2],
  ['Indore', 'indore', 'Madhya Pradesh', 2],
  ['Jabalpur', 'jabalpur', 'Madhya Pradesh', 2],
  ['Ujjain', 'ujjain', 'Madhya Pradesh', 2],
  ['Amravati', 'amravati', 'Maharashtra', 2],
  ['Aurangabad', 'aurangabad', 'Maharashtra', 2],
  ['Kolhapur', 'kolhapur', 'Maharashtra', 2],
  ['Nagpur', 'nagpur', 'Maharashtra', 2],
  ['Nanded', 'nanded', 'Maharashtra', 2],
  ['Nashik', 'nashik', 'Maharashtra', 2],
  ['Solapur', 'solapur', 'Maharashtra', 2],
  ['Bhubaneswar', 'bhubaneswar', 'Odisha', 2],
  ['Cuttack', 'cuttack', 'Odisha', 2],
  ['Rourkela', 'rourkela', 'Odisha', 2],
  ['Puducherry', 'puducherry', 'Puducherry', 2],
  ['Amritsar', 'amritsar', 'Punjab', 2],
  ['Jalandhar', 'jalandhar', 'Punjab', 2],
  ['Ludhiana', 'ludhiana', 'Punjab', 2],
  ['Ajmer', 'ajmer', 'Rajasthan', 2],
  ['Bikaner', 'bikaner', 'Rajasthan', 2],
  ['Jaipur', 'jaipur', 'Rajasthan', 2],
  ['Jodhpur', 'jodhpur', 'Rajasthan', 2],
  ['Kota', 'kota', 'Rajasthan', 2],
  ['Coimbatore', 'coimbatore', 'Tamil Nadu', 2],
  ['Erode', 'erode', 'Tamil Nadu', 2],
  ['Madurai', 'madurai', 'Tamil Nadu', 2],
  ['Salem', 'salem', 'Tamil Nadu', 2],
  ['Thanjavur', 'thanjavur', 'Tamil Nadu', 2],
  ['Tiruchirappalli', 'tiruchirappalli', 'Tamil Nadu', 2],
  ['Tiruppur', 'tiruppur', 'Tamil Nadu', 2],
  ['Vellore', 'vellore', 'Tamil Nadu', 2],
  ['Warangal', 'warangal', 'Telangana', 2],
  ['Agra', 'agra', 'Uttar Pradesh', 2],
  ['Aligarh', 'aligarh', 'Uttar Pradesh', 2],
  ['Bareilly', 'bareilly', 'Uttar Pradesh', 2],
  ['Ghaziabad', 'ghaziabad', 'Uttar Pradesh', 2],
  ['Gorakhpur', 'gorakhpur', 'Uttar Pradesh', 2],
  ['Jhansi', 'jhansi', 'Uttar Pradesh', 2],
  ['Kanpur', 'kanpur', 'Uttar Pradesh', 2],
  ['Lucknow', 'lucknow', 'Uttar Pradesh', 2],
  ['Meerut', 'meerut', 'Uttar Pradesh', 2],
  ['Moradabad', 'moradabad', 'Uttar Pradesh', 2],
  ['Noida', 'noida', 'Uttar Pradesh', 2],
  ['Prayagraj', 'prayagraj', 'Uttar Pradesh', 2],
  ['Varanasi', 'varanasi', 'Uttar Pradesh', 2],
  ['Dehradun', 'dehradun', 'Uttarakhand', 2],
  ['Asansol', 'asansol', 'West Bengal', 2],
  ['Durgapur', 'durgapur', 'West Bengal', 2],
  ['Siliguri', 'siliguri', 'West Bengal', 2],
] as const;

export const CITY_GUIDE_CATALOG: readonly CityGuideCatalogEntry[] = CITY_TUPLES.map(
  ([name, slug, state, tier]) => ({ name, slug, state, tier }),
);

export const CITY_GUIDES_BY_STATE = Object.entries(
  CITY_GUIDE_CATALOG.reduce<Record<string, CityGuideCatalogEntry[]>>((groups, city) => {
    (groups[city.state] ??= []).push(city);
    return groups;
  }, {}),
).sort(([stateA], [stateB]) => stateA.localeCompare(stateB));
