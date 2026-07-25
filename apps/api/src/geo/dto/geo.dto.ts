import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
