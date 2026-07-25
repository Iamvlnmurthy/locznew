-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('GUEST', 'REGISTERED_USER', 'INDIVIDUAL_SELLER', 'BUSINESS_OWNER', 'EMPLOYER', 'SERVICE_PROVIDER', 'MODERATOR', 'ADMINISTRATOR', 'SUPER_ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'SUSPENDED', 'DELETION_REQUESTED');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('CLASSIFIED', 'PRODUCT', 'BUYER_REQUIREMENT', 'OFFER', 'JOB', 'SERVICE', 'RENTAL', 'EVENT', 'BUSINESS_LISTING');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'PAUSED', 'SOLD', 'FILLED', 'EXPIRED', 'ARCHIVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ModerationDecision" AS ENUM ('AUTO_APPROVE', 'REVIEW', 'AUTO_REJECT');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ContactPreference" AS ENUM ('IN_APP_ONLY', 'PHONE', 'WHATSAPP', 'EMAIL', 'PHONE_AND_IN_APP');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'FOR_PARTS');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE', 'TEMPORARY', 'DAILY_WAGE');

-- CreateEnum
CREATE TYPE "WorkplaceType" AS ENUM ('ON_SITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('HOURLY', 'DAILY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'MULTI_SELECT');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('LISTING', 'BUSINESS', 'USER', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'FRAUD_OR_SCAM', 'PROHIBITED_ITEM', 'DUPLICATE', 'WRONG_CATEGORY', 'OFFENSIVE_CONTENT', 'MISLEADING_PRICE', 'ALREADY_SOLD', 'HARASSMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LISTING_APPROVED', 'LISTING_REJECTED', 'LISTING_EXPIRING', 'LISTING_EXPIRED', 'NEW_ENQUIRY', 'NEW_MESSAGE', 'SAVED_SEARCH_MATCH', 'NEARBY_OFFER', 'JOB_ENQUIRY', 'BUSINESS_VERIFICATION_UPDATE', 'REPORT_RESOLUTION', 'SECURITY_ALERT');

-- CreateEnum
CREATE TYPE "ConversationContext" AS ENUM ('LISTING_ENQUIRY', 'BUSINESS_ENQUIRY', 'JOB_ENQUIRY');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'TE', 'HI');

-- CreateEnum
CREATE TYPE "PlacementType" AS ENUM ('FEATURED', 'SPONSORED', 'BOOST', 'BANNER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phoneE164" VARCHAR(20) NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "email" CITEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" VARCHAR(255),
    "displayName" VARCHAR(120) NOT NULL,
    "avatarMediaId" UUID,
    "bio" VARCHAR(500),
    "preferredLanguage" "Language" NOT NULL DEFAULT 'EN',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastActiveAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "deviceKey" VARCHAR(128) NOT NULL,
    "name" VARCHAR(120),
    "osVersion" VARCHAR(60),
    "appVersion" VARCHAR(30),
    "pushToken" VARCHAR(512),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIp" VARCHAR(64),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "refreshTokenHash" VARCHAR(64) NOT NULL,
    "familyId" UUID NOT NULL,
    "previousSessionId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" VARCHAR(120),
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_attempts" (
    "id" UUID NOT NULL,
    "phoneE164" VARCHAR(20) NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" VARCHAR(64),
    "deviceKey" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_lockouts" (
    "id" UUID NOT NULL,
    "identifier" VARCHAR(80) NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_lockouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_suspensions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "issuedBy" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "iso2" VARCHAR(2) NOT NULL,
    "phoneCode" VARCHAR(6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "states" (
    "id" UUID NOT NULL,
    "countryId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "code" VARCHAR(10),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "stateId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "stateId" UUID NOT NULL,
    "districtId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "nameTe" VARCHAR(160),
    "nameHi" VARCHAR(160),
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "geo" geography(Point, 4326),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLaunched" BOOLEAN NOT NULL DEFAULT false,
    "population" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" UUID NOT NULL,
    "cityId" UUID NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "postalCode" VARCHAR(12),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geo" geography(Point, 4326),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "line1" VARCHAR(200),
    "line2" VARCHAR(200),
    "landmark" VARCHAR(160),
    "cityId" UUID NOT NULL,
    "localityId" UUID,
    "postalCode" VARCHAR(12),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geo" geography(Point, 4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_locations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "cityId" UUID NOT NULL,
    "localityId" UUID,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geo" geography(Point, 4326),
    "radiusKm" INTEGER NOT NULL DEFAULT 10,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" TEXT,
    "logoMediaId" UUID,
    "coverMediaId" UUID,
    "addressId" UUID,
    "cityId" UUID NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geo" geography(Point, 4326),
    "primaryPhone" VARCHAR(20),
    "secondaryPhone" VARCHAR(20),
    "whatsappNumber" VARCHAR(20),
    "email" VARCHAR(180),
    "website" VARCHAR(255),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_staff" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(40) NOT NULL,
    "permissions" TEXT[],
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" VARCHAR(5) NOT NULL,
    "closesAt" VARCHAR(5) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_holidays" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_areas" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "cityId" UUID,
    "localityId" UUID,
    "radiusKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "name" VARCHAR(140) NOT NULL,
    "nameTe" VARCHAR(160),
    "nameHi" VARCHAR(160),
    "slug" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "iconKey" VARCHAR(80),
    "listingTypes" "ListingType"[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" VARCHAR(180),
    "seoDescription" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_attributes" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "labelTe" VARCHAR(140),
    "labelHi" VARCHAR(140),
    "dataType" "AttributeDataType" NOT NULL,
    "options" JSONB,
    "unit" VARCHAR(20),
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isSearchable" BOOLEAN NOT NULL DEFAULT false,
    "minValue" DECIMAL(14,2),
    "maxValue" DECIMAL(14,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_attribute_values" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "valueText" VARCHAR(300),
    "valueNumber" DECIMAL(16,4),
    "valueBool" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "type" "ListingType" NOT NULL,
    "ownerId" UUID NOT NULL,
    "businessId" UUID,
    "title" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "subcategoryId" UUID,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderationScore" INTEGER,
    "rejectionReason" VARCHAR(500),
    "cityId" UUID NOT NULL,
    "districtId" UUID,
    "stateId" UUID,
    "localityId" UUID,
    "postalCode" VARCHAR(12),
    "addressLine" VARCHAR(240),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geo" geography(Point, 4326),
    "serviceRadiusKm" INTEGER,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "contactPreference" "ContactPreference" NOT NULL DEFAULT 'IN_APP_ONLY',
    "contactPhone" VARCHAR(20),
    "showPhonePublicly" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "enquiryCount" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMP(3),
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "duplicateHash" VARCHAR(64),
    "searchIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_media" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "storageKey" VARCHAR(300) NOT NULL,
    "thumbKey" VARCHAR(300),
    "cardKey" VARCHAR(300),
    "fullKey" VARCHAR(300),
    "avifKey" VARCHAR(300),
    "mimeType" VARCHAR(60) NOT NULL,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "blurhash" VARCHAR(60),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_details" (
    "listingId" UUID NOT NULL,
    "price" DECIMAL(12,2),
    "isNegotiable" BOOLEAN NOT NULL DEFAULT false,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "isNewItem" BOOLEAN NOT NULL DEFAULT false,
    "brand" VARCHAR(120),
    "model" VARCHAR(120),
    "purchaseYear" INTEGER,
    "hasWarranty" BOOLEAN NOT NULL DEFAULT false,
    "warrantyDetails" VARCHAR(240),
    "deliveryAvailable" BOOLEAN NOT NULL DEFAULT false,
    "pickupAvailable" BOOLEAN NOT NULL DEFAULT true,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "marketplace_details_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "buyer_requirement_details" (
    "listingId" UUID NOT NULL,
    "budgetMin" DECIMAL(12,2),
    "budgetMax" DECIMAL(12,2),
    "requiredBy" TIMESTAMP(3),
    "quantity" INTEGER,
    "preferredCondition" "ItemCondition",

    CONSTRAINT "buyer_requirement_details_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "offer_details" (
    "listingId" UUID NOT NULL,
    "originalPrice" DECIMAL(12,2),
    "offerPrice" DECIMAL(12,2),
    "discountPercentage" INTEGER,
    "couponCode" VARCHAR(40),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "redemptionInstructions" TEXT,
    "termsAndConditions" TEXT,
    "limitedQuantity" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isInStore" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "offer_details_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "job_details" (
    "listingId" UUID NOT NULL,
    "companyName" VARCHAR(180) NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "workplaceType" "WorkplaceType" NOT NULL,
    "salaryMin" DECIMAL(12,2),
    "salaryMax" DECIMAL(12,2),
    "salaryPeriod" "SalaryPeriod" NOT NULL DEFAULT 'MONTHLY',
    "isSalaryVisible" BOOLEAN NOT NULL DEFAULT true,
    "experienceMinYears" INTEGER,
    "experienceMaxYears" INTEGER,
    "educationRequirement" VARCHAR(180),
    "skills" TEXT[],
    "openings" INTEGER NOT NULL DEFAULT 1,
    "applicationDeadline" TIMESTAMP(3),
    "applyMethod" VARCHAR(30) NOT NULL,
    "externalApplyUrl" VARCHAR(400),
    "walkInDetails" TEXT,
    "filledAt" TIMESTAMP(3),

    CONSTRAINT "job_details_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "service_details" (
    "listingId" UUID NOT NULL,
    "serviceType" VARCHAR(120),
    "priceFrom" DECIMAL(12,2),
    "priceTo" DECIMAL(12,2),
    "pricingUnit" VARCHAR(40),
    "experienceYears" INTEGER,
    "availability" VARCHAR(180),
    "servesAtHome" BOOLEAN NOT NULL DEFAULT false,
    "servesOnline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "service_details_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "rental_details" (
    "listingId" UUID NOT NULL,
    "propertyType" VARCHAR(80),
    "rentAmount" DECIMAL(12,2),
    "depositAmount" DECIMAL(12,2),
    "rentPeriod" VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "areaSqft" INTEGER,
    "furnishing" VARCHAR(40),
    "availableFrom" TIMESTAMP(3),
    "preferredTenant" VARCHAR(60),
    "amenities" TEXT[],

    CONSTRAINT "rental_details_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "event_details" (
    "listingId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venueName" VARCHAR(180),
    "isFreeEntry" BOOLEAN NOT NULL DEFAULT true,
    "ticketPrice" DECIMAL(12,2),
    "ticketUrl" VARCHAR(400),
    "organiser" VARCHAR(180),
    "capacity" INTEGER,

    CONSTRAINT "event_details_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "saved_listings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_businesses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recently_viewed" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recently_viewed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "context" "ConversationContext" NOT NULL,
    "listingId" UUID,
    "businessId" UUID,
    "initiatorId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" VARCHAR(160),
    "initiatorUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "recipientUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "reason" VARCHAR(240),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "listingId" UUID,
    "businessId" UUID,
    "reportedUserId" UUID,
    "conversationId" UUID,
    "reporterId" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(1000),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolutionNote" VARCHAR(1000),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "listingId" UUID,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(500),
    "systemReasons" TEXT[],
    "isAutomated" BOOLEAN NOT NULL DEFAULT false,
    "moderatorId" UUID,
    "appealStatus" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderator_notes" (
    "id" UUID NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderator_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_keywords" (
    "id" UUID NOT NULL,
    "keyword" VARCHAR(120) NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "scope" VARCHAR(30) NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banned_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" VARCHAR(40),
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(64),
    "changes" JSONB,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "correlationId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "query" VARCHAR(200),
    "filters" JSONB NOT NULL,
    "cityId" UUID,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "radiusKm" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastMatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "priceInPaise" INTEGER NOT NULL DEFAULT 0,
    "billingPeriod" VARCHAR(20) NOT NULL,
    "features" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "userId" UUID,
    "businessId" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'INACTIVE',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_placements" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "type" "PlacementType" NOT NULL,
    "cityId" UUID,
    "categoryId" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "featured_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "imageKey" VARCHAR(300) NOT NULL,
    "targetUrl" VARCHAR(400),
    "placement" VARCHAR(40) NOT NULL,
    "cityId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(300),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "expiry_rules" (
    "id" UUID NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "days" INTEGER NOT NULL,
    "warnBeforeDays" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expiry_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneE164_key" ON "users"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_lastActiveAt_idx" ON "users"("status", "lastActiveAt" DESC);

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE INDEX "devices_pushToken_idx" ON "devices"("pushToken");

-- CreateIndex
CREATE UNIQUE INDEX "devices_userId_deviceKey_key" ON "devices"("userId", "deviceKey");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "otp_attempts_phoneE164_createdAt_idx" ON "otp_attempts"("phoneE164", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "otp_attempts_expiresAt_idx" ON "otp_attempts"("expiresAt");

-- CreateIndex
CREATE INDEX "auth_lockouts_lockedUntil_idx" ON "auth_lockouts"("lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "auth_lockouts_scope_identifier_key" ON "auth_lockouts"("scope", "identifier");

-- CreateIndex
CREATE INDEX "user_suspensions_userId_endsAt_idx" ON "user_suspensions"("userId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "countries_iso2_key" ON "countries"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "states_countryId_slug_key" ON "states"("countryId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "districts_stateId_slug_key" ON "districts"("stateId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE INDEX "cities_stateId_isActive_idx" ON "cities"("stateId", "isActive");

-- CreateIndex
CREATE INDEX "cities_name_idx" ON "cities"("name");

-- CreateIndex
CREATE INDEX "localities_postalCode_idx" ON "localities"("postalCode");

-- CreateIndex
CREATE UNIQUE INDEX "localities_cityId_slug_key" ON "localities"("cityId", "slug");

-- CreateIndex
CREATE INDEX "addresses_cityId_idx" ON "addresses"("cityId");

-- CreateIndex
CREATE INDEX "saved_locations_userId_idx" ON "saved_locations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "businesses_ownerId_idx" ON "businesses"("ownerId");

-- CreateIndex
CREATE INDEX "businesses_cityId_categoryId_isActive_idx" ON "businesses"("cityId", "categoryId", "isActive");

-- CreateIndex
CREATE INDEX "businesses_verificationStatus_idx" ON "businesses"("verificationStatus");

-- CreateIndex
CREATE INDEX "business_staff_userId_idx" ON "business_staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "business_staff_businessId_userId_key" ON "business_staff"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "business_hours_businessId_dayOfWeek_opensAt_key" ON "business_hours"("businessId", "dayOfWeek", "opensAt");

-- CreateIndex
CREATE UNIQUE INDEX "business_holidays_businessId_date_key" ON "business_holidays"("businessId", "date");

-- CreateIndex
CREATE INDEX "service_areas_businessId_idx" ON "service_areas"("businessId");

-- CreateIndex
CREATE INDEX "service_areas_cityId_idx" ON "service_areas"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_sortOrder_idx" ON "categories"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "categories_isActive_idx" ON "categories"("isActive");

-- CreateIndex
CREATE INDEX "category_attributes_categoryId_sortOrder_idx" ON "category_attributes"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "category_attributes_categoryId_key_key" ON "category_attributes"("categoryId", "key");

-- CreateIndex
CREATE INDEX "listing_attribute_values_attributeId_valueText_idx" ON "listing_attribute_values"("attributeId", "valueText");

-- CreateIndex
CREATE INDEX "listing_attribute_values_attributeId_valueNumber_idx" ON "listing_attribute_values"("attributeId", "valueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "listing_attribute_values_listingId_attributeId_key" ON "listing_attribute_values"("listingId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "listings_slug_key" ON "listings"("slug");

-- CreateIndex
CREATE INDEX "listings_type_status_cityId_publishedAt_idx" ON "listings"("type", "status", "cityId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "listings_categoryId_status_publishedAt_idx" ON "listings"("categoryId", "status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "listings_ownerId_status_createdAt_idx" ON "listings"("ownerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "listings_businessId_type_status_idx" ON "listings"("businessId", "type", "status");

-- CreateIndex
CREATE INDEX "listings_status_expiresAt_idx" ON "listings"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "listings_moderationStatus_createdAt_idx" ON "listings"("moderationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "listings_duplicateHash_idx" ON "listings"("duplicateHash");

-- CreateIndex
CREATE INDEX "listing_media_listingId_sortOrder_idx" ON "listing_media"("listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "listing_media_status_createdAt_idx" ON "listing_media"("status", "createdAt");

-- CreateIndex
CREATE INDEX "marketplace_details_price_idx" ON "marketplace_details"("price");

-- CreateIndex
CREATE INDEX "marketplace_details_condition_idx" ON "marketplace_details"("condition");

-- CreateIndex
CREATE INDEX "buyer_requirement_details_budgetMax_idx" ON "buyer_requirement_details"("budgetMax");

-- CreateIndex
CREATE INDEX "offer_details_endsAt_idx" ON "offer_details"("endsAt");

-- CreateIndex
CREATE INDEX "offer_details_startsAt_endsAt_idx" ON "offer_details"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "job_details_employmentType_workplaceType_idx" ON "job_details"("employmentType", "workplaceType");

-- CreateIndex
CREATE INDEX "job_details_salaryMin_idx" ON "job_details"("salaryMin");

-- CreateIndex
CREATE INDEX "rental_details_rentAmount_idx" ON "rental_details"("rentAmount");

-- CreateIndex
CREATE INDEX "event_details_startsAt_idx" ON "event_details"("startsAt");

-- CreateIndex
CREATE INDEX "saved_listings_userId_createdAt_idx" ON "saved_listings"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_listings_userId_listingId_key" ON "saved_listings"("userId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_businesses_userId_businessId_key" ON "saved_businesses"("userId", "businessId");

-- CreateIndex
CREATE INDEX "recently_viewed_userId_viewedAt_idx" ON "recently_viewed"("userId", "viewedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "recently_viewed_userId_listingId_key" ON "recently_viewed"("userId", "listingId");

-- CreateIndex
CREATE INDEX "conversations_initiatorId_lastMessageAt_idx" ON "conversations"("initiatorId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "conversations_recipientId_lastMessageAt_idx" ON "conversations"("recipientId", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_listingId_initiatorId_key" ON "conversations"("listingId", "initiatorId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "blocks_blockedId_idx" ON "blocks"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blockerId_blockedId_key" ON "blocks"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_listingId_status_idx" ON "reports"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporterId_listingId_key" ON "reports"("reporterId", "listingId");

-- CreateIndex
CREATE INDEX "moderation_actions_targetType_targetId_createdAt_idx" ON "moderation_actions"("targetType", "targetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "moderation_actions_moderatorId_createdAt_idx" ON "moderation_actions"("moderatorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "moderator_notes_targetType_targetId_idx" ON "moderator_notes"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "banned_keywords_keyword_key" ON "banned_keywords"("keyword");

-- CreateIndex
CREATE INDEX "banned_keywords_isActive_idx" ON "banned_keywords"("isActive");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_correlationId_idx" ON "audit_logs"("correlationId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_type_channel_key" ON "notification_preferences"("userId", "type", "channel");

-- CreateIndex
CREATE INDEX "search_subscriptions_userId_isActive_idx" ON "search_subscriptions"("userId", "isActive");

-- CreateIndex
CREATE INDEX "search_subscriptions_isActive_cityId_idx" ON "search_subscriptions"("isActive", "cityId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_businessId_status_idx" ON "subscriptions"("businessId", "status");

-- CreateIndex
CREATE INDEX "featured_placements_cityId_type_startsAt_endsAt_idx" ON "featured_placements"("cityId", "type", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "banners_placement_isActive_sortOrder_idx" ON "banners"("placement", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "expiry_rules_listingType_key" ON "expiry_rules"("listingType");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_suspensions" ADD CONSTRAINT "user_suspensions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localities" ADD CONSTRAINT "localities_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_staff" ADD CONSTRAINT "business_staff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_staff" ADD CONSTRAINT "business_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_holidays" ADD CONSTRAINT "business_holidays_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_attribute_values" ADD CONSTRAINT "listing_attribute_values_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_attribute_values" ADD CONSTRAINT "listing_attribute_values_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "category_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_details" ADD CONSTRAINT "marketplace_details_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirement_details" ADD CONSTRAINT "buyer_requirement_details_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_details" ADD CONSTRAINT "offer_details_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_details" ADD CONSTRAINT "job_details_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_details" ADD CONSTRAINT "service_details_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_details" ADD CONSTRAINT "rental_details_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_details" ADD CONSTRAINT "event_details_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_businesses" ADD CONSTRAINT "saved_businesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_businesses" ADD CONSTRAINT "saved_businesses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_subscriptions" ADD CONSTRAINT "search_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_placements" ADD CONSTRAINT "featured_placements_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

