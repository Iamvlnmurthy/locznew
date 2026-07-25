import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  // Capped at 50: an uncapped limit is a cheap way to make the API do expensive work.
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export type SortDirection = 'asc' | 'desc';

export class SortQueryDto {
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: SortDirection = 'desc';
}

export class PaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty() hasNextPage!: boolean;
}

export class PaginatedDto<T> {
  items!: T[];
  meta!: PaginationMetaDto;
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedDto<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    meta: { page, limit, total, totalPages, hasNextPage: page < totalPages },
  };
}
