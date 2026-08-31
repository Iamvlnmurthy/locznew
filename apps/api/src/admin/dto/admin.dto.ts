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
  @ApiProperty({ description: 'Business claims awaiting review' }) pendingClaims!: number;
  @ApiProperty({ description: 'Businesses awaiting verification' }) pendingVerifications!: number;
  @ApiProperty() openJobs!: number;
  @ApiProperty() liveOffers!: number;
}

export class ListingsByBucketDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() count!: number;
}

/**
 * The demand half of the marketplace, for the admin console. `unansweredRequirements` is the
 * number that matters most: open requirements nobody nearby has answered name demand the area
 * cannot currently meet — the strongest supply-gap signal the platform collects (VISION §25).
 */
export class DemandMetricsDto {
  @ApiProperty({ description: 'Published, not yet fulfilled' }) openRequirements!: number;
  @ApiProperty({ description: 'Closed by the buyer' }) fulfilledRequirements!: number;
  @ApiProperty({ description: 'Open with zero seller responses — the supply gap' })
  unansweredRequirements!: number;
  @ApiProperty({ description: 'Live seller responses across all requirements' })
  totalResponses!: number;
  @ApiProperty() newRequirementsThisWeek!: number;
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
  /** Null until a Google sign-up confirms one. Moderators search by name or email instead. */
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty() displayName!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  /** From the account's default saved location — the closest thing a user has to a "city". */
  @ApiProperty({ nullable: true }) cityName!: string | null;
  @ApiProperty({ nullable: true }) stateName!: string | null;
  @ApiProperty({ nullable: true }) localityName!: string | null;
  @ApiProperty() phoneVerified!: boolean;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ description: 'EN / TE / HI' }) preferredLanguage!: string;
  @ApiProperty({ description: 'How they sell when not trading as a business' })
  sellerType!: string;
  @ApiProperty() listingCount!: number;
  @ApiProperty({ description: 'Businesses this account owns' }) businessCount!: number;
  @ApiProperty({ description: 'Business claims this account has filed' }) claimCount!: number;
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
