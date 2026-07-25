import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportReason, ReportStatus, ReportTargetType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @ApiProperty({ description: 'Id of the listing, business, user or conversation being reported' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional({ example: 'The seller asked for a deposit before showing the item.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ResolveReportDto {
  @ApiProperty({ enum: [ReportStatus.RESOLVED, ReportStatus.DISMISSED] })
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @ApiProperty({ example: 'Listing removed and seller warned.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note!: string;

  @ApiPropertyOptional({
    description: 'Remove the reported listing as part of resolving',
    default: false,
  })
  @IsOptional()
  removeListing?: boolean;
}

export class ReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}

export class ReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ReportTargetType }) targetType!: ReportTargetType;
  @ApiProperty() targetId!: string;
  @ApiPropertyOptional() targetTitle!: string | null;
  @ApiProperty({ enum: ReportReason }) reason!: ReportReason;
  @ApiPropertyOptional() details!: string | null;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiProperty() reporterName!: string;
  @ApiProperty({ description: 'Total open reports against this same target' })
  reportsAgainstTarget!: number;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() resolutionNote!: string | null;
}

export class ReportCreatedDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Thanks — our team will review this.' }) message!: string;
}
