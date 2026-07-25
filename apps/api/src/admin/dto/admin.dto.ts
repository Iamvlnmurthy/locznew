import { ApiProperty } from '@nestjs/swagger';

export class AdminMetricsDto {
  @ApiProperty() totalUsers!: number;
  @ApiProperty() newUsersToday!: number;
  @ApiProperty() newUsersThisWeek!: number;
  @ApiProperty({ description: 'Users active in the last 30 days' }) activeUsersThisMonth!: number;
  @ApiProperty() suspendedUsers!: number;
  @ApiProperty() publishedListings!: number;
  @ApiProperty({ description: 'Awaiting human review' }) pendingListings!: number;
  @ApiProperty() rejectedListings!: number;
  @ApiProperty() expiredListings!: number;
  @ApiProperty() listingsToday!: number;
  @ApiProperty() openReports!: number;
  @ApiProperty() totalBusinesses!: number;
  @ApiProperty() verifiedBusinesses!: number;
  @ApiProperty() openJobs!: number;
  @ApiProperty() liveOffers!: number;
}

export class ListingsByBucketDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() count!: number;
}

export class TopListingDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() cityName!: string;
  @ApiProperty() viewCount!: number;
  @ApiProperty() saveCount!: number;
}

export class QueueHealthDto {
  @ApiProperty() name!: string;
  @ApiProperty() waiting!: number;
  @ApiProperty() active!: number;
  @ApiProperty() failed!: number;
  @ApiProperty() delayed!: number;
  @ApiProperty() available!: boolean;
}

export class StorageStatsDto {
  @ApiProperty() mediaCount!: number;
  @ApiProperty() totalBytes!: number;
  @ApiProperty() failedCount!: number;
}

export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty() displayName!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() listingCount!: number;
  @ApiProperty() reportsAgainst!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true }) lastActiveAt!: Date | null;
}

export class AuditLogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'listing.approve' }) action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ nullable: true }) entityId!: string | null;
  @ApiProperty({ nullable: true, description: 'Null for system actions' })
  actorName!: string | null;
  @ApiProperty({ nullable: true }) actorRole!: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Changed fields only, with credentials redacted',
  })
  changes!: Record<string, unknown> | null;
  @ApiProperty({ nullable: true }) ip!: string | null;
  @ApiProperty({ nullable: true }) correlationId!: string | null;
  @ApiProperty() createdAt!: Date;
}
