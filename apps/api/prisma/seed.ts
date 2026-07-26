/**
 * LocZ seed — idempotent. Safe to re-run: every write is an upsert keyed on a
 * natural unique column (slug, name, phone), so repeated runs converge rather than duplicate.
 *
 *   npm run db:seed -w @locz/api
 */
/**
 * Loads the repository-root .env before anything reads process.env.
 *
 * npm runs a workspace script with the workspace as the working directory, so plain
 * `dotenv/config` looks in apps/api and finds nothing — and the failure surfaces as
 * "SASL: client password must be a string", which says nothing about a missing file.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

import {
  AttributeDataType,
  ContactPreference,
  EmploymentType,
  ItemCondition,
  Language,
  ListingType,
  ListingStatus,
  MediaStatus,
  ModerationStatus,
  NotificationChannel,
  NotificationType,
  Prisma,
  PrismaClient,
  RoleName,
  SalaryPeriod,
  UserStatus,
  WorkplaceType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { BANNED_KEYWORDS } from './banned-keywords';
import { v7 as uuid } from 'uuid';
import * as argon2 from 'argon2';

// Prisma 7 connects through a driver adapter rather than a bundled engine, so the seed
// supplies one exactly as the application does.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// Roles and their permission sets. Permissions are checked as plain strings by
// the RBAC guard; `*` is only ever granted to the super administrator.
// ---------------------------------------------------------------------------
const ROLES: Array<{ name: RoleName; description: string; permissions: string[] }> = [
  {
    name: RoleName.GUEST,
    description: 'Anonymous visitor — read-only public access',
    permissions: ['listing:read', 'business:read', 'category:read'],
  },
  {
    name: RoleName.REGISTERED_USER,
    description: 'Signed-in user — may post, because posting is free and universal',
    // Posting is the core promise of the platform, so every signed-in user can do it.
    // The specialised roles below are classification (granted on first use) and gate
    // genuinely privileged things — running a business, managing staff, moderating.
    //
    // These permissions were previously only on INDIVIDUAL_SELLER, which the create
    // handler grants *after* the guard has already run: a brand-new account could never
    // post its first listing.
    permissions: [
      'listing:read',
      'listing:save',
      'listing:report',
      'listing:create',
      'listing:update:own',
      'listing:delete:own',
      // A user's first free business profile grants BUSINESS_OWNER after creation,
      // so the base signed-in role must be allowed through the create guard.
      'business:create',
      'media:upload',
      'conversation:create',
      'conversation:read',
      'profile:update',
      'location:manage',
    ],
  },
  {
    name: RoleName.INDIVIDUAL_SELLER,
    description: 'Posts classifieds and marketplace items',
    permissions: ['listing:create', 'listing:update:own', 'listing:delete:own', 'media:upload'],
  },
  {
    name: RoleName.BUSINESS_OWNER,
    description: 'Owns one or more business profiles',
    permissions: [
      'business:create',
      'business:update:own',
      'staff:manage',
      'offer:create',
      'listing:create',
      'media:upload',
    ],
  },
  {
    name: RoleName.EMPLOYER,
    description: 'Posts job vacancies',
    permissions: [
      'job:create',
      'job:update:own',
      'job:close:own',
      'listing:create',
      'media:upload',
    ],
  },
  {
    name: RoleName.SERVICE_PROVIDER,
    description: 'Offers local services',
    permissions: ['service:create', 'service:update:own', 'listing:create', 'media:upload'],
  },
  {
    name: RoleName.MODERATOR,
    description: 'Reviews the moderation queue',
    permissions: [
      'listing:moderate',
      'report:resolve',
      'user:suspend',
      'moderation:note',
      'audit:read',
    ],
  },
  {
    name: RoleName.ADMINISTRATOR,
    description: 'Platform operations',
    permissions: [
      'listing:moderate',
      'report:resolve',
      'user:suspend',
      'user:manage',
      'business:verify',
      'category:manage',
      'location:manage',
      'banner:manage',
      'settings:read',
      'search:reindex',
      // Running a maintenance job early is an operations task, not a privileged one: the
      // jobs are idempotent and already run on a schedule.
      'job:run',
      'audit:read',
      'metrics:read',
    ],
  },
  { name: RoleName.SUPER_ADMINISTRATOR, description: 'Unrestricted', permissions: ['*'] },
];

// ---------------------------------------------------------------------------
// Geography — Telangana and Andhra Pradesh, the initial launch region.
// ---------------------------------------------------------------------------
const GEOGRAPHY = {
  country: { name: 'India', iso2: 'IN', phoneCode: '+91' },
  states: [
    {
      name: 'Telangana',
      slug: 'telangana',
      code: 'TG',
      districts: [
        {
          name: 'Hyderabad',
          slug: 'hyderabad',
          cities: [
            {
              name: 'Hyderabad',
              slug: 'hyderabad',
              nameTe: 'హైదరాబాద్',
              nameHi: 'हैदराबाद',
              lat: 17.385,
              lng: 78.4867,
              launched: true,
              population: 10500000,
              localities: [
                { name: 'Madhapur', slug: 'madhapur', pin: '500081', lat: 17.4483, lng: 78.3915 },
                {
                  name: 'Gachibowli',
                  slug: 'gachibowli',
                  pin: '500032',
                  lat: 17.4401,
                  lng: 78.3489,
                },
                {
                  name: 'Kukatpally',
                  slug: 'kukatpally',
                  pin: '500072',
                  lat: 17.4849,
                  lng: 78.4138,
                },
                { name: 'Ameerpet', slug: 'ameerpet', pin: '500016', lat: 17.4374, lng: 78.4487 },
                {
                  name: 'Secunderabad',
                  slug: 'secunderabad',
                  pin: '500003',
                  lat: 17.4399,
                  lng: 78.4983,
                },
                {
                  name: 'Dilsukhnagar',
                  slug: 'dilsukhnagar',
                  pin: '500060',
                  lat: 17.3687,
                  lng: 78.5247,
                },
                {
                  name: 'Banjara Hills',
                  slug: 'banjara-hills',
                  pin: '500034',
                  lat: 17.4126,
                  lng: 78.4392,
                },
                { name: 'LB Nagar', slug: 'lb-nagar', pin: '500074', lat: 17.3457, lng: 78.5522 },
              ],
            },
          ],
        },
        {
          name: 'Warangal',
          slug: 'warangal',
          cities: [
            {
              name: 'Warangal',
              slug: 'warangal',
              nameTe: 'వరంగల్',
              nameHi: 'वारंगल',
              lat: 17.9689,
              lng: 79.5941,
              launched: true,
              population: 830000,
              localities: [],
            },
          ],
        },
        {
          name: 'Karimnagar',
          slug: 'karimnagar',
          cities: [
            {
              name: 'Karimnagar',
              slug: 'karimnagar',
              nameTe: 'కరీంనగర్',
              nameHi: 'करीमनगर',
              lat: 18.4386,
              lng: 79.1288,
              launched: false,
              population: 300000,
              localities: [],
            },
          ],
        },
        {
          name: 'Nizamabad',
          slug: 'nizamabad',
          cities: [
            {
              name: 'Nizamabad',
              slug: 'nizamabad',
              nameTe: 'నిజామాబాద్',
              nameHi: 'निज़ामाबाद',
              lat: 18.6725,
              lng: 78.094,
              launched: false,
              population: 310000,
              localities: [],
            },
          ],
        },
      ],
    },
    {
      name: 'Andhra Pradesh',
      slug: 'andhra-pradesh',
      code: 'AP',
      districts: [
        {
          name: 'Visakhapatnam',
          slug: 'visakhapatnam',
          cities: [
            {
              name: 'Visakhapatnam',
              slug: 'visakhapatnam',
              nameTe: 'విశాఖపట్నం',
              nameHi: 'विशाखापत्तनम',
              lat: 17.6868,
              lng: 83.2185,
              launched: true,
              population: 2035000,
              localities: [],
            },
          ],
        },
        {
          name: 'Krishna',
          slug: 'krishna',
          cities: [
            {
              name: 'Vijayawada',
              slug: 'vijayawada',
              nameTe: 'విజయవాడ',
              nameHi: 'विजयवाड़ा',
              lat: 16.5062,
              lng: 80.648,
              launched: true,
              population: 1500000,
              localities: [],
            },
          ],
        },
        {
          name: 'Guntur',
          slug: 'guntur',
          cities: [
            {
              name: 'Guntur',
              slug: 'guntur',
              nameTe: 'గుంటూరు',
              nameHi: 'गुंटूर',
              lat: 16.3067,
              lng: 80.4365,
              launched: false,
              population: 743000,
              localities: [],
            },
          ],
        },
        {
          name: 'Tirupati',
          slug: 'tirupati',
          cities: [
            {
              name: 'Tirupati',
              slug: 'tirupati',
              nameTe: 'తిరుపతి',
              nameHi: 'तिरुपति',
              lat: 13.6288,
              lng: 79.4192,
              launched: false,
              population: 460000,
              localities: [],
            },
          ],
        },
      ],
    },
  ],
};

type AttrSeed = {
  key: string;
  label: string;
  labelTe?: string;
  labelHi?: string;
  dataType: AttributeDataType;
  options?: Array<{ value: string; label: string }>;
  unit?: string;
  isRequired?: boolean;
  isFilterable?: boolean;
  isSearchable?: boolean;
};

type CategorySeed = {
  name: string;
  nameTe: string;
  nameHi: string;
  slug: string;
  iconKey: string;
  listingTypes: ListingType[];
  attributes?: AttrSeed[];
  children?: CategorySeed[];
};

// ---------------------------------------------------------------------------
// Category tree. Attributes here are *definitions* — the posting form in web and
// mobile renders whatever the admin has configured, nothing is hardcoded client-side.
//
// They cover only what the schema does NOT already model. Brand, model, condition,
// purchase year and warranty are first-class columns on MarketplaceDetail; duplicating
// them here made a poster supply the same fact twice, and marking them required made a
// valid listing impossible to submit.
// ---------------------------------------------------------------------------
const CATEGORIES: CategorySeed[] = [
  {
    name: 'Electronics',
    nameTe: 'ఎలక్ట్రానిక్స్',
    nameHi: 'इलेक्ट्रॉनिक्स',
    slug: 'electronics',
    iconKey: 'device',
    listingTypes: [ListingType.CLASSIFIED, ListingType.PRODUCT, ListingType.BUYER_REQUIREMENT],
    attributes: [],
    children: [
      {
        name: 'Mobile Phones',
        nameTe: 'మొబైల్ ఫోన్లు',
        nameHi: 'मोबाइल फ़ोन',
        slug: 'mobile-phones',
        iconKey: 'phone',
        listingTypes: [ListingType.CLASSIFIED, ListingType.PRODUCT, ListingType.BUYER_REQUIREMENT],
        attributes: [
          {
            key: 'storage_gb',
            label: 'Storage',
            dataType: AttributeDataType.SELECT,
            options: [
              { value: '32', label: '32 GB' },
              { value: '64', label: '64 GB' },
              { value: '128', label: '128 GB' },
              { value: '256', label: '256 GB' },
              { value: '512', label: '512 GB' },
            ],
            isFilterable: true,
          },
          {
            key: 'ram_gb',
            label: 'RAM',
            dataType: AttributeDataType.NUMBER,
            unit: 'GB',
            isFilterable: true,
          },
        ],
      },
      {
        name: 'Laptops & Computers',
        nameTe: 'ల్యాప్‌టాప్‌లు',
        nameHi: 'लैपटॉप',
        slug: 'laptops-computers',
        iconKey: 'laptop',
        listingTypes: [ListingType.CLASSIFIED, ListingType.PRODUCT, ListingType.BUYER_REQUIREMENT],
        attributes: [
          {
            key: 'processor',
            label: 'Processor',
            dataType: AttributeDataType.TEXT,
            isSearchable: true,
          },
          {
            key: 'ram_gb',
            label: 'RAM',
            dataType: AttributeDataType.NUMBER,
            unit: 'GB',
            isFilterable: true,
          },
        ],
      },
      {
        name: 'TV & Appliances',
        nameTe: 'టీవీ & ఉపకరణాలు',
        nameHi: 'टीवी और उपकरण',
        slug: 'tv-appliances',
        iconKey: 'tv',
        listingTypes: [ListingType.CLASSIFIED, ListingType.PRODUCT],
      },
    ],
  },
  {
    name: 'Vehicles',
    nameTe: 'వాహనాలు',
    nameHi: 'वाहन',
    slug: 'vehicles',
    iconKey: 'car',
    listingTypes: [ListingType.CLASSIFIED, ListingType.PRODUCT, ListingType.BUYER_REQUIREMENT],
    attributes: [
      {
        key: 'km_driven',
        label: 'Kilometres driven',
        dataType: AttributeDataType.NUMBER,
        unit: 'km',
        isFilterable: true,
      },
      {
        key: 'fuel_type',
        label: 'Fuel type',
        dataType: AttributeDataType.SELECT,
        options: [
          { value: 'PETROL', label: 'Petrol' },
          { value: 'DIESEL', label: 'Diesel' },
          { value: 'CNG', label: 'CNG' },
          { value: 'ELECTRIC', label: 'Electric' },
        ],
        isFilterable: true,
      },
    ],
    children: [
      {
        name: 'Cars',
        nameTe: 'కార్లు',
        nameHi: 'कारें',
        slug: 'cars',
        iconKey: 'car',
        listingTypes: [ListingType.CLASSIFIED, ListingType.PRODUCT],
      },
      {
        name: 'Motorcycles & Scooters',
        nameTe: 'బైక్‌లు',
        nameHi: 'मोटरसाइकिल',
        slug: 'motorcycles-scooters',
        iconKey: 'bike',
        listingTypes: [ListingType.CLASSIFIED, ListingType.PRODUCT],
      },
    ],
  },
  {
    name: 'Furniture & Home',
    nameTe: 'ఫర్నిచర్',
    nameHi: 'फर्नीचर',
    slug: 'furniture-home',
    iconKey: 'sofa',
    listingTypes: [ListingType.CLASSIFIED, ListingType.PRODUCT, ListingType.BUYER_REQUIREMENT],
    attributes: [
      { key: 'material', label: 'Material', dataType: AttributeDataType.TEXT, isFilterable: true },
    ],
  },
  {
    name: 'Jobs',
    nameTe: 'ఉద్యోగాలు',
    nameHi: 'नौकरियाँ',
    slug: 'jobs',
    iconKey: 'briefcase',
    listingTypes: [ListingType.JOB],
    attributes: [
      {
        key: 'shift',
        label: 'Shift',
        dataType: AttributeDataType.SELECT,
        options: [
          { value: 'DAY', label: 'Day' },
          { value: 'NIGHT', label: 'Night' },
          { value: 'ROTATIONAL', label: 'Rotational' },
        ],
        isFilterable: true,
      },
      {
        key: 'gender_preference',
        label: 'Open to',
        dataType: AttributeDataType.SELECT,
        options: [
          { value: 'ANY', label: 'Anyone' },
          { value: 'FEMALE', label: 'Women' },
          { value: 'MALE', label: 'Men' },
        ],
        isFilterable: true,
      },
    ],
    children: [
      {
        name: 'IT & Software',
        nameTe: 'ఐటీ',
        nameHi: 'आईटी',
        slug: 'jobs-it-software',
        iconKey: 'code',
        listingTypes: [ListingType.JOB],
      },
      {
        name: 'Sales & Marketing',
        nameTe: 'సేల్స్',
        nameHi: 'बिक्री',
        slug: 'jobs-sales-marketing',
        iconKey: 'chart',
        listingTypes: [ListingType.JOB],
      },
      {
        name: 'Delivery & Driver',
        nameTe: 'డెలివరీ',
        nameHi: 'डिलीवरी',
        slug: 'jobs-delivery-driver',
        iconKey: 'truck',
        listingTypes: [ListingType.JOB],
      },
      {
        name: 'Retail & Hospitality',
        nameTe: 'రిటైల్',
        nameHi: 'खुदरा',
        slug: 'jobs-retail-hospitality',
        iconKey: 'store',
        listingTypes: [ListingType.JOB],
      },
    ],
  },
  {
    name: 'Services',
    nameTe: 'సేవలు',
    nameHi: 'सेवाएँ',
    slug: 'services',
    iconKey: 'tools',
    listingTypes: [ListingType.SERVICE, ListingType.BUYER_REQUIREMENT],
    attributes: [
      {
        key: 'experience_years',
        label: 'Experience',
        dataType: AttributeDataType.NUMBER,
        unit: 'years',
        isFilterable: true,
      },
      {
        key: 'service_type',
        label: 'Service type',
        dataType: AttributeDataType.TEXT,
        isFilterable: true,
        isSearchable: true,
      },
    ],
    children: [
      {
        name: 'Home Repair',
        nameTe: 'ఇంటి మరమ్మతు',
        nameHi: 'घर की मरम्मत',
        slug: 'services-home-repair',
        iconKey: 'wrench',
        listingTypes: [ListingType.SERVICE],
      },
      {
        name: 'Tuition & Classes',
        nameTe: 'ట్యూషన్',
        nameHi: 'ट्यूशन',
        slug: 'services-tuition',
        iconKey: 'book',
        listingTypes: [ListingType.SERVICE],
      },
      {
        name: 'Health & Beauty',
        nameTe: 'ఆరోగ్యం',
        nameHi: 'स्वास्थ्य',
        slug: 'services-health-beauty',
        iconKey: 'heart',
        listingTypes: [ListingType.SERVICE],
      },
    ],
  },
  {
    name: 'Real Estate & Rentals',
    nameTe: 'రియల్ ఎస్టేట్',
    nameHi: 'रियल एस्टेट',
    slug: 'real-estate-rentals',
    iconKey: 'home',
    listingTypes: [ListingType.RENTAL, ListingType.CLASSIFIED, ListingType.BUYER_REQUIREMENT],
    attributes: [
      {
        key: 'property_type',
        label: 'Property type',
        dataType: AttributeDataType.SELECT,
        options: [
          { value: 'ROOM', label: 'Room' },
          { value: 'FLAT', label: 'Flat' },
          { value: 'HOUSE', label: 'House' },
          { value: 'PG', label: 'PG / Hostel' },
          { value: 'SHOP', label: 'Shop' },
          { value: 'OFFICE', label: 'Office' },
        ],
        isRequired: true,
        isFilterable: true,
      },
      {
        key: 'bedrooms',
        label: 'Bedrooms',
        dataType: AttributeDataType.NUMBER,
        isFilterable: true,
      },
      {
        key: 'furnishing',
        label: 'Furnishing',
        dataType: AttributeDataType.SELECT,
        options: [
          { value: 'UNFURNISHED', label: 'Unfurnished' },
          { value: 'SEMI', label: 'Semi-furnished' },
          { value: 'FULL', label: 'Fully furnished' },
        ],
        isFilterable: true,
      },
    ],
  },
  {
    name: 'Local Offers',
    nameTe: 'స్థానిక ఆఫర్లు',
    nameHi: 'स्थानीय ऑफ़र',
    slug: 'local-offers',
    iconKey: 'tag',
    listingTypes: [ListingType.OFFER],
    children: [
      {
        name: 'Restaurants & Food',
        nameTe: 'రెస్టారెంట్లు',
        nameHi: 'रेस्टोरेंट',
        slug: 'offers-restaurants-food',
        iconKey: 'utensils',
        listingTypes: [ListingType.OFFER],
      },
      {
        name: 'Hotels & Stays',
        nameTe: 'హోటళ్లు',
        nameHi: 'होटल',
        slug: 'offers-hotels-stays',
        iconKey: 'bed',
        listingTypes: [ListingType.OFFER],
      },
      {
        name: 'Salons & Spa',
        nameTe: 'సెలూన్లు',
        nameHi: 'सैलून',
        slug: 'offers-salons-spa',
        iconKey: 'scissors',
        listingTypes: [ListingType.OFFER],
      },
      {
        name: 'Shopping',
        nameTe: 'షాపింగ్',
        nameHi: 'खरीदारी',
        slug: 'offers-shopping',
        iconKey: 'bag',
        listingTypes: [ListingType.OFFER],
      },
    ],
  },
  {
    name: 'Businesses',
    nameTe: 'వ్యాపారాలు',
    nameHi: 'व्यवसाय',
    slug: 'businesses',
    iconKey: 'store',
    listingTypes: [ListingType.BUSINESS_LISTING],
    children: [
      {
        name: 'Restaurants',
        nameTe: 'రెస్టారెంట్లు',
        nameHi: 'रेस्टोरेंट',
        slug: 'business-restaurants',
        iconKey: 'utensils',
        listingTypes: [ListingType.BUSINESS_LISTING],
      },
      {
        name: 'Clinics & Hospitals',
        nameTe: 'క్లినిక్‌లు',
        nameHi: 'क्लिनिक',
        slug: 'business-clinics',
        iconKey: 'stethoscope',
        listingTypes: [ListingType.BUSINESS_LISTING],
      },
      {
        name: 'Shops & Retail',
        nameTe: 'దుకాణాలు',
        nameHi: 'दुकानें',
        slug: 'business-shops',
        iconKey: 'bag',
        listingTypes: [ListingType.BUSINESS_LISTING],
      },
    ],
  },
  {
    name: 'Events',
    nameTe: 'ఈవెంట్లు',
    nameHi: 'कार्यक्रम',
    slug: 'events',
    iconKey: 'calendar',
    listingTypes: [ListingType.EVENT],
  },
];

// Free posting attracts these first. Severity 2 auto-rejects; severity 1 sends to review.

const EXPIRY_RULES: Array<{ listingType: ListingType; days: number }> = [
  { listingType: ListingType.CLASSIFIED, days: 30 },
  { listingType: ListingType.PRODUCT, days: 30 },
  { listingType: ListingType.BUYER_REQUIREMENT, days: 15 },
  { listingType: ListingType.JOB, days: 30 },
  { listingType: ListingType.SERVICE, days: 60 },
  { listingType: ListingType.RENTAL, days: 45 },
  { listingType: ListingType.OFFER, days: 0 }, // governed by the offer's own end date
  { listingType: ListingType.EVENT, days: 0 }, // governed by the event's end date
  { listingType: ListingType.BUSINESS_LISTING, days: 0 },
];

const SYSTEM_SETTINGS: Array<{
  key: string;
  value: unknown;
  description: string;
  isPublic: boolean;
}> = [
  {
    key: 'posting.limits.perRolePerDay',
    value: {
      REGISTERED_USER: 3,
      INDIVIDUAL_SELLER: 10,
      BUSINESS_OWNER: 30,
      EMPLOYER: 20,
      SERVICE_PROVIDER: 15,
    },
    description: 'Maximum new listings per user per day, by highest-privilege role held',
    isPublic: false,
  },
  {
    key: 'moderation.autoApproveScoreThreshold',
    value: 20,
    description: 'Rule score below which a listing is published without human review',
    isPublic: false,
  },
  {
    key: 'moderation.autoRejectScoreThreshold',
    value: 80,
    description: 'Rule score at or above which a listing is rejected outright',
    isPublic: false,
  },
  {
    key: 'moderation.requireReviewForFirstNListings',
    value: 2,
    description: 'First N listings from a new account always go to human review',
    isPublic: false,
  },
  {
    key: 'search.radiusPresetsKm',
    value: [1, 3, 5, 10, 25, 50],
    description: 'Radius options offered in the nearby filter',
    isPublic: true,
  },
  {
    key: 'media.maxImagesPerListing',
    value: 12,
    description: 'Upload cap per listing',
    isPublic: true,
  },
  {
    key: 'contact.hidePhoneByDefault',
    value: true,
    description: 'Phone numbers are hidden unless the owner opts in',
    isPublic: true,
  },
  {
    key: 'launch.defaultCitySlug',
    value: 'hyderabad',
    description: 'City used when a visitor has no location preference',
    isPublic: true,
  },
];

// Development accounts. Password login is enabled for these so the admin console can be
// reached without an SMS gateway; the mock OTP provider covers the phone path.
const TEST_ACCOUNTS: Array<{
  phone: string;
  email: string;
  name: string;
  roles: RoleName[];
  language: Language;
}> = [
  {
    phone: '+919000000001',
    email: 'super@locz.test',
    name: 'LocZ Super Admin',
    roles: [RoleName.SUPER_ADMINISTRATOR, RoleName.ADMINISTRATOR, RoleName.REGISTERED_USER],
    language: Language.EN,
  },
  {
    phone: '+919000000002',
    email: 'admin@locz.test',
    name: 'LocZ Admin',
    roles: [RoleName.ADMINISTRATOR, RoleName.REGISTERED_USER],
    language: Language.EN,
  },
  {
    phone: '+919000000003',
    email: 'moderator@locz.test',
    name: 'Ravi Moderator',
    roles: [RoleName.MODERATOR, RoleName.REGISTERED_USER],
    language: Language.TE,
  },
  {
    phone: '+919000000004',
    email: 'seller@locz.test',
    name: 'Anitha Seller',
    roles: [RoleName.INDIVIDUAL_SELLER, RoleName.REGISTERED_USER],
    language: Language.TE,
  },
  {
    phone: '+919000000005',
    email: 'buyer@locz.test',
    name: 'Kiran Buyer',
    roles: [RoleName.REGISTERED_USER],
    language: Language.HI,
  },
  {
    phone: '+919000000006',
    email: 'business@locz.test',
    name: 'Sai Business Owner',
    roles: [RoleName.BUSINESS_OWNER, RoleName.EMPLOYER, RoleName.REGISTERED_USER],
    language: Language.EN,
  },
  {
    phone: '+919000000007',
    email: 'provider@locz.test',
    name: 'Mahesh Services',
    roles: [RoleName.SERVICE_PROVIDER, RoleName.REGISTERED_USER],
    language: Language.TE,
  },
];

const DEV_PASSWORD = 'LocZ@dev1234';

type DemoListingSeed = {
  slug: string;
  type: ListingType;
  title: string;
  description: string;
  categorySlug: string;
  localitySlug: string;
  image: string;
  ownerPhone: string;
  priceLabel?: number;
  featured?: boolean;
  details:
    | { kind: 'marketplace'; data: Record<string, unknown> }
    | { kind: 'rental'; data: Record<string, unknown> }
    | { kind: 'offer'; data: Record<string, unknown> }
    | { kind: 'service'; data: Record<string, unknown> }
    | { kind: 'job'; data: Record<string, unknown> };
};

/**
 * A compact, believable launch catalogue. The image URLs deliberately point at the web
 * app's checked-in development assets; production never runs this seed and real uploads
 * continue to use R2/MinIO keys.
 */
function demoListings(now = new Date()): DemoListingSeed[] {
  const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

  return [
    {
      slug: 'iphone-13-128gb-blue-madhapur',
      type: ListingType.PRODUCT,
      title: 'iPhone 13, 128 GB — excellent condition',
      description:
        'Personal phone, carefully used for two years. Battery health is 87%. No repairs or screen replacement. Includes the original cable and box. You are welcome to check everything before buying. Pickup near Madhapur metro.',
      categorySlug: 'mobile-phones',
      localitySlug: 'madhapur',
      image: 'iphone-13-blue.webp',
      ownerPhone: '+919000000004',
      featured: true,
      details: {
        kind: 'marketplace',
        data: {
          price: 32900,
          isNegotiable: true,
          condition: ItemCondition.GOOD,
          isNewItem: false,
          brand: 'Apple',
          model: 'iPhone 13',
          purchaseYear: 2023,
          hasWarranty: false,
          deliveryAvailable: false,
          pickupAvailable: true,
          quantity: 1,
        },
      },
    },
    {
      slug: 'red-scooter-low-km-kukatpally',
      type: ListingType.PRODUCT,
      title: '2019 family scooter, single owner',
      description:
        'Single-owner petrol scooter used mainly for short office trips. Regularly serviced, tyres changed last year and insurance is valid. A few normal parking marks are visible. RC transfer is mandatory.',
      categorySlug: 'motorcycles-scooters',
      localitySlug: 'kukatpally',
      image: 'red-scooter.webp',
      ownerPhone: '+919000000004',
      details: {
        kind: 'marketplace',
        data: {
          price: 48500,
          isNegotiable: true,
          condition: ItemCondition.GOOD,
          isNewItem: false,
          brand: 'Honda',
          model: 'Activa 5G',
          purchaseYear: 2019,
          hasWarranty: false,
          deliveryAvailable: false,
          pickupAvailable: true,
          quantity: 1,
        },
      },
    },
    {
      slug: 'solid-wood-study-table-banjara-hills',
      type: ListingType.PRODUCT,
      title: 'Solid wood study table with drawers',
      description:
        'Strong handmade study table with two smooth drawers. Selling because we are moving. There are light signs of use on the top but no wobble or damage. Buyer should arrange pickup from the ground floor.',
      categorySlug: 'furniture-home',
      localitySlug: 'banjara-hills',
      image: 'wood-study-desk.webp',
      ownerPhone: '+919000000004',
      details: {
        kind: 'marketplace',
        data: {
          price: 4500,
          isNegotiable: true,
          condition: ItemCondition.GOOD,
          isNewItem: false,
          brand: null,
          model: null,
          purchaseYear: 2021,
          hasWarranty: false,
          deliveryAvailable: false,
          pickupAvailable: true,
          quantity: 1,
        },
      },
    },
    {
      slug: 'thinkpad-business-laptop-gachibowli',
      type: ListingType.PRODUCT,
      title: 'Business laptop, 16 GB RAM with charger',
      description:
        'Reliable office laptop with Intel i5 processor, 16 GB RAM and 512 GB SSD. Keyboard, ports, camera and Wi-Fi all work correctly. Fresh Windows installation. Battery lasts around three hours.',
      categorySlug: 'laptops-computers',
      localitySlug: 'gachibowli',
      image: 'business-laptop.webp',
      ownerPhone: '+919000000004',
      details: {
        kind: 'marketplace',
        data: {
          price: 26500,
          isNegotiable: false,
          condition: ItemCondition.GOOD,
          isNewItem: false,
          brand: 'Lenovo',
          model: 'ThinkPad',
          purchaseYear: 2022,
          hasWarranty: false,
          deliveryAvailable: true,
          pickupAvailable: true,
          quantity: 1,
        },
      },
    },
    {
      slug: 'semi-furnished-2bhk-gachibowli-rent',
      type: ListingType.RENTAL,
      title: 'Bright semi-furnished 2BHK near Financial District',
      description:
        'Well-ventilated east-facing flat in a quiet gated community. Five minutes from the main road, with grocery stores and public transport nearby. Family-owned property; no brokerage. Maintenance is ₹3,200 per month.',
      categorySlug: 'real-estate-rentals',
      localitySlug: 'gachibowli',
      image: 'gachibowli-flat.webp',
      ownerPhone: '+919000000004',
      featured: true,
      details: {
        kind: 'rental',
        data: {
          propertyType: 'FLAT',
          rentAmount: 28500,
          depositAmount: 57000,
          rentPeriod: 'MONTHLY',
          bedrooms: 2,
          bathrooms: 2,
          areaSqft: 1180,
          furnishing: 'SEMI',
          availableFrom: inDays(7),
          preferredTenant: 'FAMILY_OR_WORKING_PROFESSIONALS',
          amenities: ['Lift', 'Power backup', 'Security', 'Covered parking'],
        },
      },
    },
    {
      slug: 'weekend-family-biryani-offer-madhapur',
      type: ListingType.OFFER,
      title: 'Weekend family biryani combo — 25% off',
      description:
        'A family pack of chicken biryani with mirchi ka salan, raita and four pieces. Dine-in and takeaway available this weekend. Fresh batches are prepared through the day.',
      categorySlug: 'offers-restaurants-food',
      localitySlug: 'madhapur',
      image: 'biryani-offer.webp',
      ownerPhone: '+919000000006',
      featured: true,
      details: {
        kind: 'offer',
        data: {
          originalPrice: 999,
          offerPrice: 749,
          discountPercentage: 25,
          couponCode: 'LOCZ25',
          startsAt: now,
          endsAt: inDays(21),
          redemptionInstructions: 'Show the LocZ offer at the counter before billing.',
          termsAndConditions: 'Valid on one family combo per bill. Not valid with other offers.',
          limitedQuantity: 100,
          redeemedCount: 12,
          isOnline: false,
          isInStore: true,
        },
      },
    },
    {
      slug: 'verified-electrician-home-service-hyderabad',
      type: ListingType.SERVICE,
      title: 'Experienced electrician — same-day home visits',
      description:
        'Electrical repairs, fan and light fitting, switchboard replacement, inverter wiring and fault checking. Twelve years of local experience. I bring the basic tools and explain the cost before starting.',
      categorySlug: 'services-home-repair',
      localitySlug: 'ameerpet',
      image: 'electrician-service.webp',
      ownerPhone: '+919000000007',
      featured: true,
      details: {
        kind: 'service',
        data: {
          serviceType: 'Residential electrical repair',
          priceFrom: 350,
          priceTo: 1500,
          pricingUnit: 'per visit',
          experienceYears: 12,
          availability: 'Monday–Saturday, 8 AM–8 PM',
          servesAtHome: true,
          servesOnline: false,
        },
      },
    },
    {
      slug: 'barista-cafe-job-madhapur',
      type: ListingType.JOB,
      title: 'Barista / cafe team member',
      description:
        'Neighbourhood cafe looking for a friendly full-time team member. You will prepare beverages, help at the counter and keep the work area tidy. Training is provided; hospitality experience is useful but not compulsory.',
      categorySlug: 'jobs-retail-hospitality',
      localitySlug: 'madhapur',
      image: 'madhapur-cafe.webp',
      ownerPhone: '+919000000006',
      details: {
        kind: 'job',
        data: {
          companyName: 'The Daily Grind Cafe',
          employmentType: EmploymentType.FULL_TIME,
          workplaceType: WorkplaceType.ON_SITE,
          salaryMin: 16000,
          salaryMax: 22000,
          salaryPeriod: SalaryPeriod.MONTHLY,
          isSalaryVisible: true,
          experienceMinYears: 0,
          experienceMaxYears: 2,
          educationRequirement: 'Intermediate or equivalent',
          skills: ['Customer service', 'Basic English', 'Food hygiene'],
          openings: 2,
          applicationDeadline: inDays(25),
          applyMethod: 'IN_APP',
        },
      },
    },
  ];
}

async function seedRoles() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, permissions: role.permissions },
      create: {
        id: uuid(),
        name: role.name,
        description: role.description,
        permissions: role.permissions,
      },
    });
  }
  console.log(`  roles: ${ROLES.length}`);
}

async function seedGeography() {
  const country = await prisma.country.upsert({
    where: { iso2: GEOGRAPHY.country.iso2 },
    update: { name: GEOGRAPHY.country.name, phoneCode: GEOGRAPHY.country.phoneCode },
    create: { id: uuid(), ...GEOGRAPHY.country },
  });

  let cityCount = 0;
  let localityCount = 0;

  for (const stateSeed of GEOGRAPHY.states) {
    const state = await prisma.state.upsert({
      where: { countryId_slug: { countryId: country.id, slug: stateSeed.slug } },
      update: { name: stateSeed.name, code: stateSeed.code },
      create: {
        id: uuid(),
        countryId: country.id,
        name: stateSeed.name,
        slug: stateSeed.slug,
        code: stateSeed.code,
      },
    });

    for (const districtSeed of stateSeed.districts) {
      const district = await prisma.district.upsert({
        where: { stateId_slug: { stateId: state.id, slug: districtSeed.slug } },
        update: { name: districtSeed.name },
        create: { id: uuid(), stateId: state.id, name: districtSeed.name, slug: districtSeed.slug },
      });

      for (const citySeed of districtSeed.cities) {
        const city = await prisma.city.upsert({
          where: { slug: citySeed.slug },
          update: {
            name: citySeed.name,
            nameTe: citySeed.nameTe,
            nameHi: citySeed.nameHi,
            latitude: citySeed.lat,
            longitude: citySeed.lng,
            isLaunched: citySeed.launched,
            population: citySeed.population,
            stateId: state.id,
            districtId: district.id,
          },
          create: {
            id: uuid(),
            stateId: state.id,
            districtId: district.id,
            name: citySeed.name,
            slug: citySeed.slug,
            nameTe: citySeed.nameTe,
            nameHi: citySeed.nameHi,
            latitude: citySeed.lat,
            longitude: citySeed.lng,
            isLaunched: citySeed.launched,
            population: citySeed.population,
          },
        });
        cityCount += 1;

        for (const localitySeed of citySeed.localities ?? []) {
          await prisma.locality.upsert({
            where: { cityId_slug: { cityId: city.id, slug: localitySeed.slug } },
            update: {
              name: localitySeed.name,
              postalCode: localitySeed.pin,
              latitude: localitySeed.lat,
              longitude: localitySeed.lng,
            },
            create: {
              id: uuid(),
              cityId: city.id,
              name: localitySeed.name,
              slug: localitySeed.slug,
              postalCode: localitySeed.pin,
              latitude: localitySeed.lat,
              longitude: localitySeed.lng,
            },
          });
          localityCount += 1;
        }
      }
    }
  }
  console.log(
    `  geography: ${GEOGRAPHY.states.length} states, ${cityCount} cities, ${localityCount} localities`,
  );
}

async function seedCategoryTree(
  nodes: CategorySeed[],
  parentId: string | null,
  depth = 0,
): Promise<number> {
  let count = 0;
  let sortOrder = 0;

  for (const node of nodes) {
    const category = await prisma.category.upsert({
      where: { slug: node.slug },
      update: {
        name: node.name,
        nameTe: node.nameTe,
        nameHi: node.nameHi,
        iconKey: node.iconKey,
        listingTypes: node.listingTypes,
        parentId,
        sortOrder,
        isActive: true,
      },
      create: {
        id: uuid(),
        parentId,
        name: node.name,
        nameTe: node.nameTe,
        nameHi: node.nameHi,
        slug: node.slug,
        iconKey: node.iconKey,
        listingTypes: node.listingTypes,
        sortOrder,
        seoTitle: `${node.name} in your city | LocZ`,
        seoDescription: `Browse free ${node.name.toLowerCase()} listings near you on LocZ.`,
      },
    });
    count += 1;
    sortOrder += 10;

    let attrOrder = 0;
    for (const attr of node.attributes ?? []) {
      await prisma.categoryAttribute.upsert({
        where: { categoryId_key: { categoryId: category.id, key: attr.key } },
        update: {
          label: attr.label,
          labelTe: attr.labelTe,
          labelHi: attr.labelHi,
          dataType: attr.dataType,
          options: attr.options ?? undefined,
          unit: attr.unit,
          isRequired: attr.isRequired ?? false,
          isFilterable: attr.isFilterable ?? false,
          isSearchable: attr.isSearchable ?? false,
          sortOrder: attrOrder,
        },
        create: {
          id: uuid(),
          categoryId: category.id,
          key: attr.key,
          label: attr.label,
          labelTe: attr.labelTe,
          labelHi: attr.labelHi,
          dataType: attr.dataType,
          options: attr.options ?? undefined,
          unit: attr.unit,
          isRequired: attr.isRequired ?? false,
          isFilterable: attr.isFilterable ?? false,
          isSearchable: attr.isSearchable ?? false,
          sortOrder: attrOrder,
        },
      });
      attrOrder += 10;
    }

    if (node.children?.length) {
      count += await seedCategoryTree(node.children, category.id, depth + 1);
    }
  }
  return count;
}

async function seedModerationRules() {
  for (const entry of BANNED_KEYWORDS) {
    await prisma.bannedKeyword.upsert({
      where: { keyword: entry.keyword },
      update: {
        severity: entry.severity,
        category: entry.category,
        basis: entry.basis,
        isActive: true,
      },
      create: {
        id: uuid(),
        keyword: entry.keyword,
        severity: entry.severity,
        category: entry.category,
        basis: entry.basis,
      },
    });
  }

  const categories = new Set(BANNED_KEYWORDS.map((entry) => entry.category));
  const rejecting = BANNED_KEYWORDS.filter((entry) => entry.severity === 2).length;
  console.log(
    `  banned keywords: ${BANNED_KEYWORDS.length} across ${categories.size} categories ` +
      `(${rejecting} auto-reject, ${BANNED_KEYWORDS.length - rejecting} held for review)`,
  );
}

async function seedExpiryRules() {
  for (const rule of EXPIRY_RULES) {
    await prisma.expiryRule.upsert({
      where: { listingType: rule.listingType },
      update: { days: rule.days },
      create: { id: uuid(), listingType: rule.listingType, days: rule.days },
    });
  }
  console.log(`  expiry rules: ${EXPIRY_RULES.length}`);
}

async function seedSystemSettings() {
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value as never,
        description: setting.description,
        isPublic: setting.isPublic,
      },
      create: {
        key: setting.key,
        value: setting.value as never,
        description: setting.description,
        isPublic: setting.isPublic,
      },
    });
  }
  console.log(`  system settings: ${SYSTEM_SETTINGS.length}`);
}

async function seedTestAccounts() {
  if (process.env.NODE_ENV === 'production') {
    console.log('  test accounts: skipped (NODE_ENV=production)');
    return;
  }

  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
  const roles = await prisma.role.findMany();
  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
  const hyderabad = await prisma.city.findUnique({ where: { slug: 'hyderabad' } });
  const madhapur = hyderabad
    ? await prisma.locality.findUnique({
        where: { cityId_slug: { cityId: hyderabad.id, slug: 'madhapur' } },
      })
    : null;

  for (const account of TEST_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { phoneE164: account.phone },
      update: {
        displayName: account.name,
        email: account.email,
        passwordHash,
        preferredLanguage: account.language,
      },
      create: {
        id: uuid(),
        phoneE164: account.phone,
        phoneVerifiedAt: new Date(),
        email: account.email,
        emailVerifiedAt: new Date(),
        passwordHash,
        displayName: account.name,
        preferredLanguage: account.language,
        status: UserStatus.ACTIVE,
      },
    });

    for (const roleName of account.roles) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) continue;
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      });
    }

    // Everyone gets in-app notifications; push is opt-in per type at first launch.
    for (const type of Object.values(NotificationType)) {
      await prisma.notificationPreference.upsert({
        where: {
          userId_type_channel: { userId: user.id, type, channel: NotificationChannel.IN_APP },
        },
        update: {},
        create: {
          id: uuid(),
          userId: user.id,
          type,
          channel: NotificationChannel.IN_APP,
          enabled: true,
        },
      });
    }

    if (hyderabad) {
      const existingDefault = await prisma.savedLocation.findFirst({
        where: { userId: user.id, isDefault: true },
      });
      if (!existingDefault) {
        await prisma.savedLocation.create({
          data: {
            id: uuid(),
            userId: user.id,
            label: 'Home',
            cityId: hyderabad.id,
            localityId: madhapur?.id ?? null,
            latitude: madhapur?.latitude ?? hyderabad.latitude,
            longitude: madhapur?.longitude ?? hyderabad.longitude,
            radiusKm: 10,
            isDefault: true,
          },
        });
      }
    }
  }
  console.log(`  test accounts: ${TEST_ACCOUNTS.length} (password: ${DEV_PASSWORD})`);
}

async function seedDemoListings() {
  if (process.env.NODE_ENV === 'production') {
    console.log('  demo listings: skipped (NODE_ENV=production)');
    return;
  }

  const city = await prisma.city.findUnique({ where: { slug: 'hyderabad' } });
  if (!city) throw new Error('Hyderabad must be seeded before demo listings');

  const [localities, categories, owners] = await Promise.all([
    prisma.locality.findMany({ where: { cityId: city.id } }),
    prisma.category.findMany(),
    prisma.user.findMany({
      where: { phoneE164: { in: TEST_ACCOUNTS.map((account) => account.phone) } },
    }),
  ]);

  const localityBySlug = new Map(localities.map((locality) => [locality.slug, locality]));
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const ownerByPhone = new Map(owners.map((owner) => [owner.phoneE164, owner]));
  const now = new Date();
  const expiry = new Date(now.getTime() + 30 * 86_400_000);

  let index = 0;
  for (const seed of demoListings(now)) {
    const locality = localityBySlug.get(seed.localitySlug);
    const category = categoryBySlug.get(seed.categorySlug);
    const owner = ownerByPhone.get(seed.ownerPhone);
    if (!locality || !category || !owner) {
      throw new Error(`Missing relation for demo listing ${seed.slug}`);
    }

    const publishedAt = new Date(now.getTime() - (index * 7 + 2) * 3_600_000);
    const common = {
      type: seed.type,
      ownerId: owner.id,
      title: seed.title,
      description: seed.description,
      categoryId: category.id,
      cityId: city.id,
      districtId: city.districtId,
      stateId: city.stateId,
      localityId: locality.id,
      postalCode: locality.postalCode,
      latitude: locality.latitude,
      longitude: locality.longitude,
      status: ListingStatus.PUBLISHED,
      moderationStatus: ModerationStatus.APPROVED,
      contactPreference: ContactPreference.IN_APP_ONLY,
      visibility: 'PUBLIC' as const,
      publishedAt,
      expiresAt:
        seed.type === ListingType.OFFER
          ? ((seed.details.data.endsAt as Date | undefined) ?? expiry)
          : expiry,
      viewCount: 31 + index * 19,
      saveCount: 2 + index * 3,
      enquiryCount: 1 + index,
      isFeatured: seed.featured ?? false,
      isSponsored: false,
      isVerified: seed.type === ListingType.SERVICE || seed.type === ListingType.OFFER,
      deletedAt: null,
    };

    const listing = await prisma.listing.upsert({
      where: { slug: seed.slug },
      update: common,
      create: { id: uuid(), slug: seed.slug, ...common },
    });

    switch (seed.details.kind) {
      case 'marketplace': {
        const data = seed.details.data as Prisma.MarketplaceDetailUncheckedCreateInput;
        await prisma.marketplaceDetail.upsert({
          where: { listingId: listing.id },
          update: data,
          create: { ...data, listingId: listing.id },
        });
        break;
      }
      case 'rental': {
        const data = seed.details.data as Prisma.RentalDetailUncheckedCreateInput;
        await prisma.rentalDetail.upsert({
          where: { listingId: listing.id },
          update: data,
          create: { ...data, listingId: listing.id },
        });
        break;
      }
      case 'offer': {
        const data = seed.details.data as Prisma.OfferDetailUncheckedCreateInput;
        await prisma.offerDetail.upsert({
          where: { listingId: listing.id },
          update: data,
          create: { ...data, listingId: listing.id },
        });
        break;
      }
      case 'service': {
        const data = seed.details.data as Prisma.ServiceDetailUncheckedCreateInput;
        await prisma.serviceDetail.upsert({
          where: { listingId: listing.id },
          update: data,
          create: { ...data, listingId: listing.id },
        });
        break;
      }
      case 'job': {
        const data = seed.details.data as Prisma.JobDetailUncheckedCreateInput;
        await prisma.jobDetail.upsert({
          where: { listingId: listing.id },
          update: data,
          create: { ...data, listingId: listing.id },
        });
        break;
      }
    }

    const publicUrl = `http://localhost:3000/seed/listings/${seed.image}`;
    await prisma.listingMedia.deleteMany({ where: { listingId: listing.id } });
    await prisma.listingMedia.create({
      data: {
        id: uuid(),
        listingId: listing.id,
        status: MediaStatus.READY,
        storageKey: publicUrl,
        thumbKey: publicUrl,
        cardKey: publicUrl,
        fullKey: publicUrl,
        mimeType: 'image/webp',
        width: 1200,
        height: 900,
        sortOrder: 0,
        isPrimary: true,
      },
    });
    index += 1;
  }

  console.log(`  demo listings: ${index}`);
}

async function main() {
  console.log('Seeding LocZ…');
  await seedRoles();
  await seedGeography();
  const categoryCount = await seedCategoryTree(CATEGORIES, null);
  console.log(`  categories: ${categoryCount}`);
  await seedModerationRules();
  await seedExpiryRules();
  await seedSystemSettings();
  await seedTestAccounts();
  await seedDemoListings();
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
