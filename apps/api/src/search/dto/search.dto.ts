import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemCondition, ListingType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ListingSummaryDto } from '../../listings/dto/listing.dto';

export type SearchSort =
  'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'distance';

export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'samsung tv', description: 'Typo-tolerant keyword query' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
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

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() radiusKm?: number;

  @ApiPropertyOptional({
    example: '500081',
    description:
      'Search in and around this pincode. Resolved to the code’s centroid and searched by radius (10 km by default), so neighbouring codes are included.',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  pincode?: string;

  @ApiPropertyOptional({
    enum: ['relevance', 'newest', 'price_asc', 'price_desc', 'popular', 'distance'],
    default: 'relevance',
  })
  @IsOptional()
  @IsString()
  sort?: SearchSort;
}

export class SearchResultDto {
  @ApiProperty({ type: [ListingSummaryDto] }) items!: ListingSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty({
    description: 'False when the search index was unavailable and results came from the database',
  })
  usedSearchIndex!: boolean;
}

export class SearchIndexStatusDto {
  @ApiProperty() available!: boolean;
  @ApiPropertyOptional() indexedDocuments?: number;
  @ApiProperty() publishedListings!: number;
  @ApiProperty({ description: 'Published listings missing from the index' }) drift!: number;
}
