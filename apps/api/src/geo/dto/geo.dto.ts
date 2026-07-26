import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  Matches,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Radius options offered in the UI. Anything outside this set is rejected rather than
 * clamped — an arbitrary radius lets a client turn a nearby search into a table scan.
 */
export const RADIUS_PRESETS_KM = [1, 3, 5, 10, 25, 50] as const;
export type RadiusPresetKm = (typeof RADIUS_PRESETS_KM)[number];

export class CoordinatesDto {
  @ApiProperty({ example: 17.4483 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 78.3915 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;
}

export class CitySearchQueryDto {
  @ApiPropertyOptional({ example: 'hyd', description: 'Substring match on the city name' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ description: 'Restrict to cities that have launched' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  launchedOnly?: boolean;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class CityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() nameTe!: string | null;
  @ApiPropertyOptional() nameHi!: string | null;
  @ApiProperty() stateName!: string;
  @ApiPropertyOptional() districtName!: string | null;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty() isLaunched!: boolean;
  @ApiPropertyOptional({
    description: 'Metres from the supplied coordinates, when resolving by location',
  })
  distanceMeters?: number;
}

export class LocalityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() postalCode!: string | null;
  @ApiPropertyOptional() latitude!: number | null;
  @ApiPropertyOptional() longitude!: number | null;
  @ApiPropertyOptional() distanceMeters?: number;
}

export class ResolveLocationDto extends CoordinatesDto {}

export class ResolvedLocationDto {
  @ApiPropertyOptional({
    type: CityDto,
    description: 'Null when the coordinates are outside every launched city',
  })
  city!: CityDto | null;

  @ApiProperty({ type: [LocalityDto] })
  nearbyLocalities!: LocalityDto[];
}

export class CreateSavedLocationDto {
  @ApiProperty({ example: 'Home' })
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiProperty()
  @IsUUID()
  cityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  localityId?: string;

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

  @ApiPropertyOptional({ enum: RADIUS_PRESETS_KM, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  radiusKm: number = 10;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class SavedLocationDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() cityId!: string;
  @ApiProperty() cityName!: string;
  @ApiPropertyOptional() localityId!: string | null;
  @ApiPropertyOptional() localityName!: string | null;
  @ApiPropertyOptional() latitude!: number | null;
  @ApiPropertyOptional() longitude!: number | null;
  @ApiProperty() radiusKm!: number;
  @ApiProperty() isDefault!: boolean;
}

/**
 * A postal code and where it is.
 *
 * This is the primary way a user tells LocZ where they are: every Indian address has a
 * pincode, everyone knows their own, and it needs no permission prompt.
 */
export class PincodeDto {
  @ApiProperty({ example: '500081' }) code!: string;
  @ApiProperty({ example: 'Madhapur' }) name!: string;
  @ApiProperty({ example: 'Hyderabad' }) districtName!: string;
  @ApiProperty({ example: 'Telangana' }) stateName!: string;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;

  @ApiPropertyOptional({ description: 'Set when the pincode falls inside a launched city' })
  cityId!: string | null;

  @ApiPropertyOptional() cityName!: string | null;

  @ApiProperty({
    description:
      'Post offices sharing this code — a proxy for how coarse the centroid is. A code with many offices covers a wider area.',
  })
  officeCount!: number;

  @ApiProperty({ description: 'Whether LocZ currently serves this pincode' })
  isServiceable!: boolean;
}

export class PincodeAreaDto extends PincodeDto {
  @ApiProperty({ description: 'Published listings anchored to this exact pincode' })
  listingCount!: number;

  @ApiProperty({
    type: [PincodeDto],
    description: 'Adjacent codes within 10 km — "the area", not just the exact code',
  })
  nearbyPincodes!: PincodeDto[];
}

export class PincodeSearchQueryDto {
  @ApiPropertyOptional({
    example: '5000',
    description: 'Partial code or place name — typeahead as the user types',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ default: 15, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 15;
}

export class PincodeParamDto {
  @ApiProperty({ example: '500081' })
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  code!: string;
}

/** One of the neighbouring codes offered when the nearest one might be wrong. */
export class NearbyAreaDto {
  @ApiProperty({ example: '500084' }) code!: string;
  @ApiProperty({ example: 'Kondapur' }) name!: string;
  @ApiProperty({ example: 'Hyderabad' }) districtName!: string;
  @ApiProperty({ example: 2140 }) distanceMeters!: number;
}

/**
 * Where somebody is, in the terms they would use themselves.
 *
 * The distance and the confidence are the honest part. A pincode centroid is the average of
 * its post offices, so a match 400 m away describes the caller's own neighbourhood and one
 * 9 km away is merely the nearest area we know of. An app that shows both can ask "is this
 * right?" instead of asserting something a user in a boundary village knows to be wrong.
 */
export class AreaDto {
  @ApiProperty({ type: PincodeDto }) pincode!: PincodeDto;
  @ApiProperty({ example: 'Madhapur', description: 'The post office area' }) areaName!: string;
  @ApiPropertyOptional({ example: 'Gachibowli', description: 'Finer than a pincode, where mapped' })
  localityName!: string | null;
  @ApiProperty({ example: 'Hyderabad' }) districtName!: string;
  @ApiProperty({ example: 'Telangana' }) stateName!: string;
  @ApiPropertyOptional() cityId!: string | null;
  @ApiPropertyOptional({ example: 'Hyderabad' }) cityName!: string | null;
  @ApiPropertyOptional({ example: 'hyderabad' }) citySlug!: string | null;
  @ApiProperty({ example: 412, description: 'From the caller to the pincode centroid' })
  distanceMeters!: number;
  @ApiProperty({
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    description: 'HIGH within 2 km, MEDIUM within 5 km, LOW beyond — how much to trust the match',
  })
  confidence!: 'HIGH' | 'MEDIUM' | 'LOW';
  @ApiProperty({
    example: false,
    description:
      'True when people standing near this point corrected the automatic answer and this is what they chose instead.',
  })
  correctedByNeighbours!: boolean;

  @ApiProperty({ type: [NearbyAreaDto], description: 'Offer these when the caller says no' })
  nearby!: NearbyAreaDto[];
}

export class CorrectAreaDto {
  @ApiProperty({ example: 17.4483 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 78.3915 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiProperty({ example: '500081', description: 'What we suggested' })
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  detectedCode!: string;

  @ApiProperty({ example: '500084', description: 'What it actually is' })
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  chosenCode!: string;
}
