import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ContactPreference, ItemCondition, ListingStatus, ListingType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  Matches,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  registerDecorator,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  BuyerRequirementDetailsDto,
  EventDetailsDto,
  JobDetailsDto,
  OfferDetailsDto,
  RentalDetailsDto,
  ServiceDetailsDto,
} from './listing-details.dto';
import { RADIUS_PRESETS_KM } from '../../geo/dto/geo.dto';
import { MediaDto } from '../../media/dto/media.dto';

/**
 * An attribute value is one of four shapes, so no single class-validator decorator fits.
 *
 * It needs *some* decorator regardless: the global pipe runs with `forbidNonWhitelisted`, so
 * an undecorated property is not merely unvalidated but actively rejected. Without this,
 * every request carrying attributes failed with "property value should not exist" — which is
 * how a fully implemented feature reached production dead at the HTTP layer, with the
 * service, the schema and the storage all working perfectly behind it.
 *
 * The check is deliberately shallow. What each value must actually *be* depends on the
 * attribute's declared data type, which only the database knows, and `coerceValue` already
 * enforces it there against the real definition — including select options and min/max
 * bounds. Duplicating any of that here would create a second opinion to disagree with.
 * All this rules out is the shape nothing downstream could handle: an object, or an array of
 * anything other than strings, both of which would reach `String(value)` and store
 * "[object Object]".
 */
function IsAttributeValue() {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isAttributeValue',
      target: object.constructor,
      propertyName,
      validator: {
        validate(value: unknown) {
          if (Array.isArray(value)) return value.every((entry) => typeof entry === 'string');
          return ['string', 'number', 'boolean'].includes(typeof value);
        },
        defaultMessage() {
          return 'value must be a string, number, boolean or array of strings';
        },
      },
    });
  };
}

export class ListingAttributeInputDto {
  @ApiProperty({ example: 'brand' })
  @IsString()
  @MaxLength(60)
  key!: string;

  @ApiProperty({ example: 'Samsung', description: 'string | number | boolean | string[]' })
  @IsAttributeValue()
  value!: string | number | boolean | string[];
}

export class MarketplaceDetailsDto {
  @ApiPropertyOptional({ example: 18000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  price?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isNegotiable?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Giving the item away' })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiProperty({ enum: ItemCondition })
  @IsEnum(ItemCondition)
  condition!: ItemCondition;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) model?: string;

  @ApiPropertyOptional({ example: 2023 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  purchaseYear?: number;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() hasWarranty?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) warrantyDetails?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() deliveryAvailable?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() pickupAvailable?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateListingDto {
  @ApiProperty({ enum: ListingType, example: ListingType.PRODUCT })
  @IsEnum(ListingType)
  type!: ListingType;

  @ApiProperty({ example: 'Samsung 43-inch smart TV, barely used' })
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ example: 'Bought last year, moving cities so selling. Includes remote and box.' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @ApiPropertyOptional({ description: 'Post on behalf of a business you own or manage' })
  @IsOptional()
  @IsUUID()
  businessId?: string;

  @ApiPropertyOptional({
    description:
      'The business whose page this requirement was raised from. An unclaimed directory ' +
      'record has nobody to message, so asking whether they stock something becomes a ' +
      'requirement rather than a dead end.',
  })
  @IsOptional()
  @IsUUID()
  promptedByBusinessId?: string;

  @ApiProperty()
  @IsUUID()
  cityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional({
    example: '500081',
    description:
      'Postal code. Supply this instead of coordinates and the listing is placed at the pincode centroid — most users know their pincode and decline a GPS prompt.',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  pincodeCode?: string;

  @ApiPropertyOptional({ example: 17.4483 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 78.3915 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: 'Near Durgam Cheruvu metro' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @ApiPropertyOptional({ enum: ContactPreference, default: ContactPreference.IN_APP_ONLY })
  @IsOptional()
  @IsEnum(ContactPreference)
  contactPreference?: ContactPreference;

  @ApiPropertyOptional({
    default: false,
    description: 'Personal numbers stay hidden unless the owner opts in',
  })
  @IsOptional()
  @IsBoolean()
  showPhonePublicly?: boolean;

  @ApiPropertyOptional({
    type: MarketplaceDetailsDto,
    description: 'Required for PRODUCT and CLASSIFIED',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MarketplaceDetailsDto)
  marketplace?: MarketplaceDetailsDto;

  @ApiPropertyOptional({ type: JobDetailsDto, description: 'Required for JOB listings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => JobDetailsDto)
  job?: JobDetailsDto;

  @ApiPropertyOptional({ type: OfferDetailsDto, description: 'Required for OFFER listings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OfferDetailsDto)
  offer?: OfferDetailsDto;

  @ApiPropertyOptional({ type: ServiceDetailsDto, description: 'Required for SERVICE listings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceDetailsDto)
  service?: ServiceDetailsDto;

  @ApiPropertyOptional({ type: RentalDetailsDto, description: 'Required for RENTAL listings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RentalDetailsDto)
  rental?: RentalDetailsDto;

  @ApiPropertyOptional({ type: EventDetailsDto, description: 'Required for EVENT listings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => EventDetailsDto)
  event?: EventDetailsDto;

  @ApiPropertyOptional({
    type: BuyerRequirementDetailsDto,
    description: 'Required for BUYER_REQUIREMENT listings',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BuyerRequirementDetailsDto)
  buyerRequirement?: BuyerRequirementDetailsDto;

  @ApiPropertyOptional({
    type: [ListingAttributeInputDto],
    description: 'Values for the category’s dynamic attributes',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ListingAttributeInputDto)
  attributes?: ListingAttributeInputDto[];

  @ApiPropertyOptional({
    default: false,
    description: 'Save without submitting for review — the poster can finish later',
  })
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;
}

export class UpdateListingDto extends PartialType(CreateListingDto) {}

export class ListingSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ListingType }) type!: ListingType;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ListingStatus }) status!: ListingStatus;
  @ApiPropertyOptional() price!: number | null;
  @ApiProperty() isNegotiable!: boolean;
  @ApiProperty() cityName!: string;
  @ApiPropertyOptional() localityName!: string | null;
  @ApiPropertyOptional() thumbUrl!: string | null;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty() viewCount!: number;
  @ApiPropertyOptional() publishedAt!: Date | null;
  @ApiPropertyOptional({ description: 'Present when the request supplied coordinates' })
  distanceMeters?: number;
  @ApiPropertyOptional({ description: 'Present when the request is authenticated' })
  isSaved?: boolean;
}

export class ListingOwnerDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() memberSince!: Date;
  @ApiPropertyOptional({ description: 'Only when the owner chose to display it' })
  phone?: string | null;
}

export class ListingDetailDto extends ListingSummaryDto {
  @ApiProperty() description!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() categoryName!: string;
  @ApiPropertyOptional() addressLine!: string | null;
  @ApiPropertyOptional({ example: '500081' }) pincodeCode!: string | null;
  @ApiPropertyOptional() latitude!: number | null;
  @ApiPropertyOptional() longitude!: number | null;
  @ApiProperty({ enum: ContactPreference }) contactPreference!: ContactPreference;
  @ApiProperty({ type: ListingOwnerDto }) owner!: ListingOwnerDto;
  @ApiProperty({ type: [MediaDto] }) media!: MediaDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Resolved dynamic attributes',
  })
  attributes!: Record<string, unknown>;
  @ApiPropertyOptional() marketplace!: Record<string, unknown> | null;
  @ApiPropertyOptional() buyerRequirement!: Record<string, unknown> | null;
  @ApiPropertyOptional() expiresAt!: Date | null;
  @ApiProperty() saveCount!: number;
}

export class ListingSearchQueryDto extends PaginationQueryDto {
  /**
   * Keyword, used only when the search index is unavailable and the database has to answer
   * a keyword search itself. Browse callers leave it unset; `SearchQueryService` supplies it
   * on the fallback path so an outage narrows the results instead of ignoring the word.
   */
  @ApiPropertyOptional({ description: 'Keyword; matched against title, brand and category' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ListingType })
  @IsOptional()
  @IsEnum(ListingType)
  type?: ListingType;

  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() localityId?: string;

  @ApiPropertyOptional({ description: 'Only listings posted by this business' })
  @IsOptional()
  @IsUUID()
  businessId?: string;

  @ApiPropertyOptional({
    example: '500081',
    description:
      'Listings in and around this pincode. Combined with radiusKm it searches outward from the pincode centroid; on its own it defaults to 10 km, because neighbouring codes are still "the area".',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  pincode?: string;

  @ApiPropertyOptional({
    example: 17.4483,
    description: 'With longitude and radiusKm, enables nearby search',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 78.3915 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ enum: RADIUS_PRESETS_KM })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  radiusKm?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceMin?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceMax?: number;

  @ApiPropertyOptional({ enum: ItemCondition })
  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @ApiPropertyOptional({ description: 'Only listings from verified businesses' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  verifiedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Posted within the last N days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postedWithinDays?: number;

  @ApiPropertyOptional({
    enum: ['newest', 'price_asc', 'price_desc', 'popular', 'distance'],
    default: 'newest',
  })
  @IsOptional()
  @IsString()
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'distance';

  /**
   * Filters on the typed detail columns.
   *
   * These are not category attributes and never were: brand, model, year, bedrooms and area
   * are columns on `marketplace_details` and `rental_details`, where they are indexed and
   * where the listing page already reads them. Until now nothing could filter on them at
   * all -- `attr=` only reaches the attribute table -- so the most obvious filters on a
   * classifieds site were the ones that did not exist.
   */
  @ApiPropertyOptional({ example: 'Maruti Suzuki', description: 'Marketplace brand' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @ApiPropertyOptional({ example: 'Swift', description: 'Marketplace model, matched loosely' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @ApiPropertyOptional({ example: 2018, description: 'Earliest purchase year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  yearMin?: number;

  @ApiPropertyOptional({ example: 2024, description: 'Latest purchase year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(2100)
  yearMax?: number;

  @ApiPropertyOptional({ example: 2, description: 'Rentals with at least this many bedrooms' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedroomsMin?: number;

  @ApiPropertyOptional({ example: 600, description: 'Rentals of at least this carpet area' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  areaMin?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  areaMax?: number;

  /**
   * Category attribute filters, repeated: `attr=fuel_type:PETROL&attr=bedrooms:2..3`.
   *
   * A query string cannot carry a nested object without inventing an encoding, and every
   * such encoding is a source of parsing bugs. `key:value` is readable in a URL, shareable,
   * and trivially inspectable in a log — which matters when someone reports that a filter
   * "did nothing" and the request is all we have.
   *
   * A range is `min..max`, with either side optional: `..50000` is up to fifty thousand,
   * `2..` is two or more.
   *
   * Capped because each filter becomes its own join. Ten is far past any real filter panel
   * and well short of a query anyone could use to make the database work hard.
   */
  @ApiPropertyOptional({
    isArray: true,
    type: String,
    example: ['fuel_type:PETROL', 'km_driven:..50000'],
    description: 'Category attribute filters as key:value; ranges as key:min..max',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [String(value)],
  )
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^[a-z0-9_]{1,60}:.{1,120}$/, {
    each: true,
    message: 'Each attribute filter must look like key:value',
  })
  attr?: string[];
}

export class MyListingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ListingStatus })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}

export class ListingStatusChangeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ListingStatus }) status!: ListingStatus;
  @ApiPropertyOptional() message?: string;
}
