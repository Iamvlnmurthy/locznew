import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, IsUUID } from 'class-validator';
import { ListingSummaryDto } from '../../listings/dto/listing.dto';

export class FeedQueryDto {
  @ApiPropertyOptional({
    description: 'Falls back to the user’s default saved location, then to the launch city',
  })
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;

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
