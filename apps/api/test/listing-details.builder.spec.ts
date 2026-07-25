import { BadRequestException } from '@nestjs/common';
import { EmploymentType, ItemCondition, ListingType, WorkplaceType } from '@prisma/client';
import { ListingDetailsBuilder } from '../src/listings/listing-details.builder';
import { CreateListingDto } from '../src/listings/dto/listing.dto';

/**
 * The details builder is where a wrong listing reaches the database, so its rules are
 * pinned here rather than left to the reviewer's eye.
 */
describe('ListingDetailsBuilder', () => {
  const builder = new ListingDetailsBuilder();

  const base = {
    title: 'A listing',
    description: 'A description long enough to pass',
    categoryId: 'c',
    cityId: 'city',
  };

  const dto = (overrides: Partial<CreateListingDto>): CreateListingDto =>
    ({ ...base, ...overrides }) as CreateListingDto;

  describe('required details', () => {
    it('rejects a product with no marketplace payload', () => {
      expect(() => builder.assertDetailPresent(dto({ type: ListingType.PRODUCT }))).toThrow(
        BadRequestException,
      );
    });

    it('rejects a job with no job payload', () => {
      expect(() => builder.assertDetailPresent(dto({ type: ListingType.JOB }))).toThrow(
        BadRequestException,
      );
    });

    it('accepts a business listing, which has no extension row', () => {
      expect(() =>
        builder.assertDetailPresent(dto({ type: ListingType.BUSINESS_LISTING })),
      ).not.toThrow();
    });
  });

  describe('jobs', () => {
    const job = {
      companyName: 'Sri Lakshmi Electronics',
      employmentType: EmploymentType.FULL_TIME,
      workplaceType: WorkplaceType.ON_SITE,
      applyMethod: 'IN_APP' as const,
    };

    it('rejects a salary range that runs backwards', () => {
      expect(() =>
        builder.build(
          dto({ type: ListingType.JOB, job: { ...job, salaryMin: 40000, salaryMax: 20000 } }),
        ),
      ).toThrow('The minimum salary cannot be above the maximum');
    });

    it('rejects an external application with no link — that is a dead end for applicants', () => {
      expect(() =>
        builder.build(
          dto({ type: ListingType.JOB, job: { ...job, applyMethod: 'EXTERNAL_LINK' } }),
        ),
      ).toThrow('Provide the application link');
    });

    it('rejects a walk-in with no address or timings', () => {
      expect(() =>
        builder.build(dto({ type: ListingType.JOB, job: { ...job, applyMethod: 'WALK_IN' } })),
      ).toThrow('Provide the walk-in address and timings');
    });

    it('defaults the salary to visible — hiding it halves applications', () => {
      const result = builder.build(dto({ type: ListingType.JOB, job })) as {
        job: { create: { isSalaryVisible: boolean; openings: number } };
      };

      expect(result.job.create.isSalaryVisible).toBe(true);
      expect(result.job.create.openings).toBe(1);
    });
  });

  describe('offers', () => {
    const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

    it('rejects an offer that ends before it starts', () => {
      expect(() =>
        builder.build(
          dto({
            type: ListingType.OFFER,
            offer: { startsAt: future(5), endsAt: future(2) },
          }),
        ),
      ).toThrow('The offer must end after it starts');
    });

    it('rejects an offer that has already expired', () => {
      expect(() =>
        builder.build(
          dto({
            type: ListingType.OFFER,
            offer: { startsAt: future(-10), endsAt: future(-2) },
          }),
        ),
      ).toThrow('That offer has already expired');
    });

    it('derives the discount from the prices rather than trusting the claim', () => {
      const result = builder.build(
        dto({
          type: ListingType.OFFER,
          offer: {
            startsAt: future(0),
            endsAt: future(7),
            originalPrice: 1000,
            offerPrice: 700,
            // A dishonest "90% off" badge must not survive.
            discountPercentage: 90,
          },
        }),
      ) as { offer: { create: { discountPercentage: number } } };

      expect(result.offer.create.discountPercentage).toBe(30);
    });

    it('uses the offer end date as the listing expiry', () => {
      const endsAt = future(14);
      const expiry = builder.explicitExpiry(
        dto({ type: ListingType.OFFER, offer: { startsAt: future(0), endsAt } }),
      );

      expect(expiry?.toISOString()).toBe(new Date(endsAt).toISOString());
    });
  });

  describe('price extraction for moderation', () => {
    it('treats a free item as zero, not as absent', () => {
      const price = builder.priceFor(
        dto({
          type: ListingType.PRODUCT,
          marketplace: { condition: ItemCondition.GOOD, isFree: true, price: 500 },
        }),
      );

      expect(price).toBe(0);
    });

    it('uses the salary floor for a job', () => {
      const price = builder.priceFor(
        dto({
          type: ListingType.JOB,
          job: {
            companyName: 'X',
            employmentType: EmploymentType.FULL_TIME,
            workplaceType: WorkplaceType.REMOTE,
            applyMethod: 'IN_APP',
            salaryMin: 25000,
          },
        }),
      );

      expect(price).toBe(25000);
    });

    it('uses the rent for a rental', () => {
      const price = builder.priceFor(
        dto({ type: ListingType.RENTAL, rental: { rentAmount: 12000 } }),
      );

      expect(price).toBe(12000);
    });
  });

  describe('buyer requirements', () => {
    it('rejects a budget range that runs backwards', () => {
      expect(() =>
        builder.build(
          dto({
            type: ListingType.BUYER_REQUIREMENT,
            buyerRequirement: { budgetMin: 50000, budgetMax: 20000 },
          }),
        ),
      ).toThrow('The minimum budget cannot be above the maximum');
    });
  });

  describe('events', () => {
    it('rejects an event that ends before it starts', () => {
      const start = new Date(Date.now() + 86_400_000).toISOString();
      const end = new Date(Date.now() + 3600_000).toISOString();

      expect(() =>
        builder.build(dto({ type: ListingType.EVENT, event: { startsAt: start, endsAt: end } })),
      ).toThrow('The event cannot end before it starts');
    });
  });
});
