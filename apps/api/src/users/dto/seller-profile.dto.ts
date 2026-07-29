import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The public view of a seller.
 *
 * No phone and no email. A number the owner published on one listing stays on that listing;
 * it is not a fact about the person that a profile page hands out.
 */
export class SellerProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional() bio!: string | null;
  @ApiProperty() memberSince!: Date;
  @ApiProperty({ description: 'Listings currently live' })
  publishedListings!: number;
  @ApiProperty({ description: 'Listings this seller marked sold' })
  soldListings!: number;

  @ApiPropertyOptional({
    description:
      'Percentage of enquiries answered in the last 90 days. Null until there are enough ' +
      'conversations to say anything honest — a rate over three is a number about a coin toss.',
  })
  responseRate!: number | null;

  @ApiPropertyOptional({
    description: 'Median minutes to a first reply, on the same basis. Median, not mean.',
  })
  medianResponseMinutes!: number | null;
}
