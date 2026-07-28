import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttributeDataType, ListingType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CategoryAttributeOptionDto {
  @ApiProperty() value!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() labelTe?: string;
  @ApiPropertyOptional() labelHi?: string;
}

export class CategoryAttributeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'brand' }) key!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() labelTe!: string | null;
  @ApiPropertyOptional() labelHi!: string | null;
  @ApiProperty({ enum: AttributeDataType }) dataType!: AttributeDataType;
  @ApiPropertyOptional({ type: [CategoryAttributeOptionDto] })
  options!: CategoryAttributeOptionDto[] | null;
  @ApiPropertyOptional() unit!: string | null;
  @ApiProperty() isRequired!: boolean;
  @ApiProperty() isFilterable!: boolean;
  @ApiPropertyOptional() minValue!: number | null;
  @ApiPropertyOptional() maxValue!: number | null;
  @ApiProperty() sortOrder!: number;
}

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() nameTe!: string | null;
  @ApiPropertyOptional() nameHi!: string | null;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() iconKey!: string | null;
  @ApiProperty({ enum: ListingType, isArray: true }) listingTypes!: ListingType[];
  @ApiPropertyOptional() parentId!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiPropertyOptional({ type: () => [CategoryDto] }) children?: CategoryDto[];
}

export class CategoryDetailDto extends CategoryDto {
  @ApiProperty({
    type: [CategoryAttributeDto],
    description:
      'Attribute definitions for this category, including those inherited from its parent. The posting form renders exactly these fields — nothing is hardcoded client-side.',
  })
  attributes!: CategoryAttributeDto[];
}

export class CategoryTreeQueryDto {
  @ApiPropertyOptional({
    enum: ListingType,
    description: 'Only categories usable for this listing type',
  })
  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @ApiPropertyOptional({ description: 'Include inactive categories (administrators only)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;
}

// ---------- Administration ----------

export class CreateCategoryDto {
  @ApiProperty({ example: 'Air Conditioners' })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameTe?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameHi?: string;

  @ApiPropertyOptional({ description: 'Derived from the name when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) iconKey?: string;

  @ApiProperty({ enum: ListingType, isArray: true })
  @IsArray()
  @IsEnum(ListingType, { each: true })
  listingTypes!: ListingType[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(140) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameTe?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameHi?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) iconKey?: string;

  @ApiPropertyOptional({ enum: ListingType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ListingType, { each: true })
  listingTypes?: ListingType[];

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCategoryAttributeDto {
  @ApiProperty({ example: 'capacity_tons' })
  @IsString()
  @MaxLength(60)
  key!: string;

  @ApiProperty({ example: 'Capacity' })
  @IsString()
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(140) labelTe?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(140) labelHi?: string;

  @ApiProperty({ enum: AttributeDataType })
  @IsEnum(AttributeDataType)
  dataType!: AttributeDataType;

  @ApiPropertyOptional({
    type: [CategoryAttributeOptionDto],
    description: 'Required for SELECT and MULTI_SELECT',
  })
  @IsOptional()
  @IsArray()
  options?: CategoryAttributeOptionDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isFilterable?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isSearchable?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) minValue?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) maxValue?: number;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class ModelSuggestionQueryDto {
  @ApiPropertyOptional({
    example: 'MARUTI_SUZUKI',
    description: 'Attribute option value of the brand, when the user has already chosen one',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string;

  @ApiPropertyOptional({ example: 'swi', description: 'What the user has typed so far' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
