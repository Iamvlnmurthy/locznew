import { BadRequestException, Injectable } from '@nestjs/common';
import { ListingType, Prisma, SalaryPeriod } from '@prisma/client';
import { CreateListingDto } from './dto/listing.dto';

/**
 * Turns the type-specific half of a create request into the right extension-table write
 * (ADR-0004), and enforces the rules that only make sense per type.
 *
 * This lives apart from ListingsService so adding a tenth listing type means adding one
 * case here rather than growing a method that already does five other things.
 */
@Injectable()
export class ListingDetailsBuilder {
  /** Types that must carry a detail payload; the rest are title + description only. */
  private static readonly REQUIRED_DETAIL: Partial<Record<ListingType, keyof CreateListingDto>> = {
    [ListingType.PRODUCT]: 'marketplace',
    [ListingType.CLASSIFIED]: 'marketplace',
    [ListingType.JOB]: 'job',
    [ListingType.OFFER]: 'offer',
    [ListingType.SERVICE]: 'service',
    [ListingType.RENTAL]: 'rental',
    [ListingType.EVENT]: 'event',
    [ListingType.BUYER_REQUIREMENT]: 'buyerRequirement',
  };

  assertDetailPresent(dto: CreateListingDto): void {
    const required = ListingDetailsBuilder.REQUIRED_DETAIL[dto.type];
    if (required && dto[required] === undefined) {
      throw new BadRequestException(`${required} details are required for a ${dto.type} listing`);
    }
  }

  /**
   * The nested-create fragment for `prisma.listing.create`. Returns `{}` for types with
   * no extension row (business listings carry everything on the base record).
   */
  build(dto: CreateListingDto): Prisma.ListingCreateInput extends never ? never : object {
    switch (dto.type) {
      case ListingType.PRODUCT:
      case ListingType.CLASSIFIED:
        return this.marketplace(dto);
      case ListingType.JOB:
        return this.job(dto);
      case ListingType.OFFER:
        return this.offer(dto);
      case ListingType.SERVICE:
        return this.service(dto);
      case ListingType.RENTAL:
        return this.rental(dto);
      case ListingType.EVENT:
        return this.event(dto);
      case ListingType.BUYER_REQUIREMENT:
        return this.buyerRequirement(dto);
      default:
        return {};
    }
  }

  /** The value moderation scores against — price for goods, rent, salary floor, and so on. */
  priceFor(dto: CreateListingDto): number | null {
    switch (dto.type) {
      case ListingType.PRODUCT:
      case ListingType.CLASSIFIED:
        return dto.marketplace?.isFree ? 0 : (dto.marketplace?.price ?? null);
      case ListingType.OFFER:
        return dto.offer?.offerPrice ?? null;
      case ListingType.JOB:
        return dto.job?.salaryMin ?? null;
      case ListingType.SERVICE:
        return dto.service?.priceFrom ?? null;
      case ListingType.RENTAL:
        return dto.rental?.rentAmount ?? null;
      case ListingType.EVENT:
        return dto.event?.isFreeEntry ? 0 : (dto.event?.ticketPrice ?? null);
      default:
        return null;
    }
  }

  /**
   * Offers and events expire on their own end date rather than a fixed window, so they
   * override whatever the expiry rule says.
   */
  explicitExpiry(dto: CreateListingDto): Date | null {
    if (dto.type === ListingType.OFFER && dto.offer) return new Date(dto.offer.endsAt);
    if (dto.type === ListingType.EVENT && dto.event) {
      return new Date(dto.event.endsAt ?? dto.event.startsAt);
    }
    return null;
  }

  private marketplace(dto: CreateListingDto) {
    const details = dto.marketplace!;
    const price = details.isFree ? 0 : details.price;

    return {
      marketplace: {
        create: {
          price: price !== undefined ? new Prisma.Decimal(price) : null,
          isNegotiable: details.isNegotiable ?? false,
          isFree: details.isFree ?? false,
          condition: details.condition,
          isNewItem: details.condition === 'NEW',
          brand: details.brand,
          model: details.model,
          purchaseYear: details.purchaseYear,
          hasWarranty: details.hasWarranty ?? false,
          warrantyDetails: details.warrantyDetails,
          deliveryAvailable: details.deliveryAvailable ?? false,
          pickupAvailable: details.pickupAvailable ?? true,
          quantity: details.quantity ?? 1,
        },
      },
    };
  }

  private job(dto: CreateListingDto) {
    const details = dto.job!;

    if (
      details.salaryMin !== undefined &&
      details.salaryMax !== undefined &&
      details.salaryMin > details.salaryMax
    ) {
      throw new BadRequestException('The minimum salary cannot be above the maximum');
    }

    // An external application link that is not a link is a dead end for every applicant.
    if (details.applyMethod === 'EXTERNAL_LINK' && !details.externalApplyUrl) {
      throw new BadRequestException('Provide the application link');
    }
    if (details.applyMethod === 'WALK_IN' && !details.walkInDetails) {
      throw new BadRequestException('Provide the walk-in address and timings');
    }

    return {
      job: {
        create: {
          companyName: details.companyName,
          employmentType: details.employmentType,
          workplaceType: details.workplaceType,
          salaryMin: details.salaryMin !== undefined ? new Prisma.Decimal(details.salaryMin) : null,
          salaryMax: details.salaryMax !== undefined ? new Prisma.Decimal(details.salaryMax) : null,
          salaryPeriod: details.salaryPeriod ?? SalaryPeriod.MONTHLY,
          isSalaryVisible: details.isSalaryVisible ?? true,
          experienceMinYears: details.experienceMinYears,
          experienceMaxYears: details.experienceMaxYears,
          educationRequirement: details.educationRequirement,
          skills: details.skills ?? [],
          openings: details.openings ?? 1,
          applicationDeadline: details.applicationDeadline
            ? new Date(details.applicationDeadline)
            : null,
          applyMethod: details.applyMethod,
          externalApplyUrl: details.externalApplyUrl,
          walkInDetails: details.walkInDetails,
        },
      },
    };
  }

  private offer(dto: CreateListingDto) {
    const details = dto.offer!;
    const startsAt = new Date(details.startsAt);
    const endsAt = new Date(details.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException('The offer must end after it starts');
    }
    if (endsAt.getTime() < Date.now()) {
      throw new BadRequestException('That offer has already expired');
    }

    // Derived rather than trusted: a "70% off" badge that does not match the prices is
    // the most common misleading-offer complaint.
    const discount =
      details.originalPrice && details.offerPrice && details.originalPrice > 0
        ? Math.round(((details.originalPrice - details.offerPrice) / details.originalPrice) * 100)
        : (details.discountPercentage ?? null);

    return {
      offer: {
        create: {
          originalPrice:
            details.originalPrice !== undefined ? new Prisma.Decimal(details.originalPrice) : null,
          offerPrice:
            details.offerPrice !== undefined ? new Prisma.Decimal(details.offerPrice) : null,
          discountPercentage: discount,
          couponCode: details.couponCode,
          startsAt,
          endsAt,
          redemptionInstructions: details.redemptionInstructions,
          termsAndConditions: details.termsAndConditions,
          limitedQuantity: details.limitedQuantity,
          isOnline: details.isOnline ?? false,
          isInStore: details.isInStore ?? true,
        },
      },
    };
  }

  private service(dto: CreateListingDto) {
    const details = dto.service!;

    return {
      service: {
        create: {
          serviceType: details.serviceType,
          priceFrom: details.priceFrom !== undefined ? new Prisma.Decimal(details.priceFrom) : null,
          priceTo: details.priceTo !== undefined ? new Prisma.Decimal(details.priceTo) : null,
          pricingUnit: details.pricingUnit,
          experienceYears: details.experienceYears,
          availability: details.availability,
          servesAtHome: details.servesAtHome ?? false,
          servesOnline: details.servesOnline ?? false,
        },
      },
    };
  }

  private rental(dto: CreateListingDto) {
    const details = dto.rental!;

    return {
      rental: {
        create: {
          propertyType: details.propertyType,
          rentAmount:
            details.rentAmount !== undefined ? new Prisma.Decimal(details.rentAmount) : null,
          depositAmount:
            details.depositAmount !== undefined ? new Prisma.Decimal(details.depositAmount) : null,
          bedrooms: details.bedrooms,
          bathrooms: details.bathrooms,
          areaSqft: details.areaSqft,
          furnishing: details.furnishing,
          availableFrom: details.availableFrom ? new Date(details.availableFrom) : null,
          preferredTenant: details.preferredTenant,
          amenities: details.amenities ?? [],
        },
      },
    };
  }

  private event(dto: CreateListingDto) {
    const details = dto.event!;
    const startsAt = new Date(details.startsAt);
    const endsAt = details.endsAt ? new Date(details.endsAt) : null;

    if (endsAt && endsAt < startsAt) {
      throw new BadRequestException('The event cannot end before it starts');
    }

    return {
      event: {
        create: {
          startsAt,
          endsAt,
          venueName: details.venueName,
          isFreeEntry: details.isFreeEntry ?? true,
          ticketPrice:
            details.ticketPrice !== undefined ? new Prisma.Decimal(details.ticketPrice) : null,
          ticketUrl: details.ticketUrl,
          organiser: details.organiser,
          capacity: details.capacity,
        },
      },
    };
  }

  private buyerRequirement(dto: CreateListingDto) {
    const details = dto.buyerRequirement!;

    if (
      details.budgetMin !== undefined &&
      details.budgetMax !== undefined &&
      details.budgetMin > details.budgetMax
    ) {
      throw new BadRequestException('The minimum budget cannot be above the maximum');
    }

    return {
      buyerRequirement: {
        create: {
          budgetMin: details.budgetMin !== undefined ? new Prisma.Decimal(details.budgetMin) : null,
          budgetMax: details.budgetMax !== undefined ? new Prisma.Decimal(details.budgetMax) : null,
          requiredBy: details.requiredBy ? new Date(details.requiredBy) : null,
          quantity: details.quantity,
          preferredCondition: details.preferredCondition,
        },
      },
    };
  }
}
