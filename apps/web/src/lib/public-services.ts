import type { Translator } from '@/i18n';

export const PUBLIC_SERVICE_SLUGS = [
  'banks-atms',
  'post-offices',
  'government-hospitals',
  'police-stations',
  'universities',
  'railway-stations',
  'government-offices',
  'bus-stations',
  'courts',
  'fire-stations',
] as const;

export type PublicServiceSlug = (typeof PUBLIC_SERVICE_SLUGS)[number];

const PUBLIC_SERVICE_SET = new Set<string>(PUBLIC_SERVICE_SLUGS);

export const PUBLIC_SERVICE_ICONS: Record<PublicServiceSlug, string> = {
  'banks-atms': 'bank',
  'post-offices': 'postOffice',
  'government-hospitals': 'hospital',
  'police-stations': 'police',
  universities: 'university',
  'railway-stations': 'train',
  'government-offices': 'government',
  'bus-stations': 'bus',
  courts: 'court',
  'fire-stations': 'fire',
};

export const PUBLIC_SERVICE_SCHEMA_TYPES: Record<PublicServiceSlug, string> = {
  'banks-atms': 'BankOrCreditUnion',
  'post-offices': 'PostOffice',
  'government-hospitals': 'Hospital',
  'police-stations': 'PoliceStation',
  universities: 'CollegeOrUniversity',
  'railway-stations': 'TrainStation',
  'government-offices': 'GovernmentOffice',
  'bus-stations': 'BusStation',
  courts: 'Courthouse',
  'fire-stations': 'FireStation',
};

export function isPublicServiceSlug(slug: string): slug is PublicServiceSlug {
  return PUBLIC_SERVICE_SET.has(slug);
}

export function publicServiceLabel(t: Translator, slug: PublicServiceSlug): string {
  return t(`publicServices.categories.${slug}`);
}
