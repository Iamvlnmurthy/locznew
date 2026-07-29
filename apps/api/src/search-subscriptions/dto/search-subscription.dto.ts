import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ListingSearchQueryDto } from '../../listings/dto/listing.dto';

/**
 * What a saved search may carry.
 *
 * Derived from the search query rather than redeclared, so a filter cannot be accepted here
 * in a shape the search page would reject. The chosen keys are the ones the matcher can
 * honour: `latitude`, `longitude` and `radiusKm` are deliberately absent even though the
 * table has columns for them, because a radius that is stored but never matched on is a
 * saved search that silently never fires — worse than one the user could not create.
 */
export class SaveSearchDto extends PickType(ListingSearchQueryDto, [
  'q',
  'type',
  'categoryId',
  'cityId',
  'localityId',
  'priceMin',
  'priceMax',
  'condition',
  'brand',
  'model',
  'yearMin',
  'yearMax',
  'bedroomsMin',
  'areaMin',
  'areaMax',
  'attr',
] as const) {
  @ApiProperty({ example: '2BHK under 20k in Madhapur', description: 'What the user calls it' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;
}

export class SetSavedSearchActiveDto {
  @ApiProperty({ description: 'Alerts are paused while this is false' })
  @IsBoolean()
  isActive!: boolean;
}

export class SavedSearchDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() q!: string | null;
  @ApiPropertyOptional() cityId!: string | null;
  @ApiProperty({ description: 'The stored filter set, as the search endpoint would take it' })
  filters!: Record<string, unknown>;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional({ description: 'When this search last matched a new listing' })
  lastMatchedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
