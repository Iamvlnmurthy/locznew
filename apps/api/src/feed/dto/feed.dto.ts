import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, IsUUID, Matches } from 'class-validator';
import { RADIUS_PRESETS_KM } from '../../geo/dto/geo.dto';
import { ListingSummaryDto } from '../../listings/dto/listing.dto';

export class FeedQueryDto {
  @ApiPropertyOptional({
    description: 'Falls back to the user’s default saved location, then to the launch city',
  })
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @ApiPropertyOptional({
    example: '500081',
    description:
      'The visitor’s pincode. Its centroid becomes the coordinates the feed is built around, so someone who never granted location still gets a local feed.',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  pincode?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;

  @ApiPropertyOptional({
    enum: RADIUS_PRESETS_KM,
    description:
      'Only applied with latitude+longitude: restricts every section to items within this many km of the viewer. Without coordinates it is ignored — a radius around an unknown point is meaningless.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  radiusKm?: number;

  @ApiPropertyOptional({ default: 10, description: 'Items per section' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit: number = 10;
}

export class FeedSectionDto {
  @ApiProperty({ example: 'nearby' }) key!: string;
  @ApiProperty({ example: 'Near you' }) title!: string;
  @ApiPropertyOptional({ description: 'Deep link to the full list' }) seeAllHref?: string;
  @ApiProperty({ type: [ListingSummaryDto] }) items!: ListingSummaryDto[];
}

export class FeedDto {
  @ApiProperty() cityId!: string;
  @ApiProperty() cityName!: string;
  @ApiProperty({ type: [FeedSectionDto] }) sections!: FeedSectionDto[];
}
