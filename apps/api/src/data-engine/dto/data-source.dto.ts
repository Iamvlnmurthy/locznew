import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateDataSourceDto {
  @ApiProperty({ example: 'osm-overpass' })
  @Matches(/^[a-z0-9-]+$/, { message: 'key is lowercase kebab-case' })
  key!: string;

  @ApiProperty({ example: 'OpenStreetMap (Overpass)' }) @IsString() name!: string;
  @ApiProperty({ example: 'POI' }) @IsString() type!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() docsUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() baseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() attributionText?: string;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @IsInt() @Min(1) priority?: number;
  @ApiPropertyOptional({ default: 86400 }) @IsOptional() @IsInt() @Min(60) refreshSeconds?: number;

  // Licence gate — all default false; a source cannot ingest until these are set true.
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() termsReviewed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() commercialUse?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() storagePermitted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() cachingPermitted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mediaDisplay?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() attributionRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNotes?: string;
}

export class UpdateDataSourceDto extends PartialType(CreateDataSourceDto) {}
