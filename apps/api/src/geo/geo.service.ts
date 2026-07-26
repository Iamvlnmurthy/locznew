import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, Prisma } from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { GeoRepository } from '../prisma/geo.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  AreaDto,
  CityDto,
  PincodeAreaDto,
  PincodeDto,
  PincodeSearchQueryDto,
  CitySearchQueryDto,
  CreateSavedLocationDto,
  LocalityDto,
  RADIUS_PRESETS_KM,
  ResolveLocationDto,
  ResolvedLocationDto,
  SavedLocationDto,
} from './dto/geo.dto';

type CityWithRelations = Prisma.CityGetPayload<{ include: { state: true; district: true } }>;

@Injectable()
export class GeoService {
  /**
   * How many people have to disagree with the arithmetic before it is overruled.
   *
   * One is a slip of the thumb. Two, within half a kilometre of each other, is a fact
   * about the place — and the cost of being wrong is small and self-correcting, since the
   * app still shows the answer and still offers the neighbours.
   */
  private static readonly CORRECTIONS_TO_OVERRIDE = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoRepository,
  ) {}

  private toCityDto(city: CityWithRelations, distanceMeters?: number): CityDto {
    return {
      id: city.id,
      name: city.name,
      slug: city.slug,
      nameTe: city.nameTe,
      nameHi: city.nameHi,
      stateName: city.state.name,
      districtName: city.district?.name ?? null,
      latitude: Number(city.latitude),
      longitude: Number(city.longitude),
      isLaunched: city.isLaunched,
      ...(distanceMeters !== undefined ? { distanceMeters: Math.round(distanceMeters) } : {}),
    };
  }

  async searchCities(query: CitySearchQueryDto): Promise<CityDto[]> {
    const cities = await this.prisma.city.findMany({
      where: {
        isActive: true,
        ...(query.id ? { id: query.id } : {}),
        ...(query.launchedOnly ? { isLaunched: true } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      include: { state: true, district: true },
      // Launched cities first, then by size — a user typing "vi" should see Vijayawada
      // and Visakhapatnam before a small town with a similar name.
      // Nulls last is what keeps this list useful now that every district in India is a
      // place. The eight cities seeded by hand carry a population; the 630 derived from the
      // pincode dataset do not, and PostgreSQL puts nulls first on a descending sort — so
      // without this the picker opened on Adilabad and buried Hyderabad, where the listings
      // actually are.
      orderBy: [
        { isLaunched: 'desc' },
        { population: { sort: 'desc', nulls: 'last' } },
        { name: 'asc' },
      ],
      take: query.limit,
    });

    return cities.map((city) => this.toCityDto(city));
  }

  async getCityBySlug(slug: string): Promise<CityDto> {
    const city = await this.prisma.city.findUnique({
      where: { slug },
      include: { state: true, district: true },
    });
    if (!city || !city.isActive) throw new NotFoundException('City not found');
    return this.toCityDto(city);
  }

  async listLocalities(cityId: string): Promise<LocalityDto[]> {
    const localities = await this.prisma.locality.findMany({
      where: { cityId, isActive: true },
      orderBy: { name: 'asc' },
    });

    return localities.map((locality) => ({
      id: locality.id,
      name: locality.name,
      slug: locality.slug,
      postalCode: locality.postalCode,
      latitude: locality.latitude ? Number(locality.latitude) : null,
      longitude: locality.longitude ? Number(locality.longitude) : null,
    }));
  }

  /**
   * "Use my current location". Returns null for the city when the device is outside
   * every launched area rather than snapping to a city 400 km away — the client then
   * shows the city picker instead of silently browsing the wrong place.
   */
  async resolveByCoordinates(dto: ResolveLocationDto): Promise<ResolvedLocationDto> {
    const nearest = await this.geo.findNearestCity(dto.latitude, dto.longitude);
    if (!nearest) {
      return { city: null, nearbyLocalities: [] };
    }

    const city = await this.prisma.city.findUnique({
      where: { id: nearest.id },
      include: { state: true, district: true },
    });
    if (!city) return { city: null, nearbyLocalities: [] };

    const localities = await this.geo.findNearbyLocalities(city.id, dto.latitude, dto.longitude, 8);

    return {
      city: this.toCityDto(city, nearest.distanceMeters),
      nearbyLocalities: localities.map((locality) => ({
        id: locality.id,
        name: locality.name,
        slug: locality.slug,
        postalCode: null,
        latitude: null,
        longitude: null,
        distanceMeters: Math.round(locality.distanceMeters),
      })),
    };
  }

  // -------------------------------------------------------------------
  // Pincodes — how most users tell LocZ where they are
  // -------------------------------------------------------------------

  private toPincodeDto(
    pincode: Prisma.PincodeGetPayload<{ include: { city: { select: { name: true } } } }>,
  ): PincodeDto {
    return {
      code: pincode.code,
      name: pincode.name,
      districtName: pincode.districtName,
      stateName: pincode.stateName,
      latitude: Number(pincode.latitude),
      longitude: Number(pincode.longitude),
      cityId: pincode.cityId,
      cityName: pincode.city?.name ?? null,
      officeCount: pincode.officeCount,
      isServiceable: pincode.isServiceable,
    };
  }

  /**
   * Resolves a pincode to its area: the code itself, how much is listed there, and the
   * adjacent codes within 10 km.
   *
   * The neighbours matter — someone in 500081 looking for a sofa does not care that the
   * seller is technically in 500084 a kilometre away. "The area" is a radius, not a
   * boundary, which is why the centroid is stored and indexed.
   */
  async getPincodeArea(code: string): Promise<PincodeAreaDto> {
    const pincode = await this.prisma.pincode.findUnique({
      where: { code },
      include: { city: { select: { name: true } } },
    });

    if (!pincode) {
      throw new NotFoundException(
        `We do not recognise pincode ${code}. Check the number, or choose a city instead.`,
      );
    }

    const latitude = Number(pincode.latitude);
    const longitude = Number(pincode.longitude);

    const [listingCount, neighbours] = await Promise.all([
      this.prisma.listing.count({
        where: { pincodeCode: code, status: ListingStatus.PUBLISHED, deletedAt: null },
      }),
      this.geo.findNearbyPincodes(latitude, longitude, 10_000, 8),
    ]);

    const nearby = await this.prisma.pincode.findMany({
      where: { code: { in: neighbours.map((entry) => entry.code), not: code } },
      include: { city: { select: { name: true } } },
    });

    return {
      ...this.toPincodeDto(pincode),
      listingCount,
      nearbyPincodes: nearby.map((entry) => this.toPincodeDto(entry)),
    };
  }

  /**
   * Typeahead over 19,000 codes. Matches a partial number or a place name, so both
   * "5000" and "madhapur" get there.
   */
  async searchPincodes(query: PincodeSearchQueryDto): Promise<PincodeDto[]> {
    const term = query.q?.trim();

    if (!term) {
      // No query: the codes with the most activity are the most useful default.
      const popular = await this.prisma.pincode.findMany({
        where: { cityId: { not: null } },
        include: { city: { select: { name: true } } },
        orderBy: { officeCount: 'desc' },
        take: query.limit,
      });
      return popular.map((entry) => this.toPincodeDto(entry));
    }

    const isNumeric = /^\d+$/.test(term);

    const matches = await this.prisma.pincode.findMany({
      where: isNumeric
        ? { code: { startsWith: term } }
        : {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { districtName: { contains: term, mode: 'insensitive' } },
            ],
          },
      include: { city: { select: { name: true } } },
      // A pincode inside a launched city is the more useful match.
      orderBy: [{ cityId: 'desc' }, { officeCount: 'desc' }, { code: 'asc' }],
      take: query.limit,
    });

    return matches.map((entry) => this.toPincodeDto(entry));
  }

  /**
   * Nearest pincode to a set of coordinates — the "use my current location" path now
   * resolves to a pincode as well as a city, so both routes end in the same place.
   */
  async resolvePincodeByCoordinates(
    latitude: number,
    longitude: number,
  ): Promise<PincodeDto | null> {
    const nearest = await this.geo.findNearbyPincodes(latitude, longitude, 50_000, 1);
    if (nearest.length === 0) return null;

    const pincode = await this.prisma.pincode.findUnique({
      where: { code: nearest[0]!.code },
      include: { city: { select: { name: true } } },
    });

    return pincode ? this.toPincodeDto(pincode) : null;
  }

  /**
   * Everything about where somebody is standing.
   *
   * A pincode alone is a number. What a person needs to see before they trust it is the
   * name of the area, the district and state it sits in, and — the part usually left out —
   * how far away the answer actually is.
   *
   * A pincode centroid is the average of its post offices, so a match 400 m away is the
   * area you are in and one 9 km away is the nearest area we know of, which is a different
   * claim. Saying which is which lets the app ask rather than assert, and the neighbours
   * are returned so that asking costs one tap.
   */
  async resolveArea(latitude: number, longitude: number): Promise<AreaDto | null> {
    // 25 km rather than 50: past that the nearest centroid stops describing where anyone
    // is. Six candidates is enough for a picker without becoming a list to read.
    const nearby = await this.geo.findNearbyPincodes(latitude, longitude, 25_000, 6);
    if (nearby.length === 0) return null;

    const codes = nearby.map((row) => row.code);
    const pincodes = await this.prisma.pincode.findMany({
      where: { code: { in: codes } },
      include: { city: { select: { id: true, name: true, slug: true } } },
    });

    const byCode = new Map(pincodes.map((row) => [row.code, row]));

    // What people standing here have already told us. Two independent corrections
    // outweigh the arithmetic: one person may have tapped the wrong row, but two making
    // the same choice within half a kilometre are describing the place they live in.
    const corrections = await this.geo.findAreaCorrections(latitude, longitude, 500);
    const corrected = corrections.find(
      (row) => row.votes >= GeoService.CORRECTIONS_TO_OVERRIDE && byCode.has(row.chosenCode),
    );

    const closest = corrected ? byCode.get(corrected.chosenCode)! : byCode.get(nearby[0]!.code);
    if (!closest) return null;

    const distance = Math.round(
      nearby.find((row) => row.code === closest.code)?.distanceMeters ?? nearby[0]!.distanceMeters,
    );

    // A locality is finer than a pincode and only exists for places somebody has mapped by
    // hand, so it is offered when available and never required.
    const locality = closest.cityId
      ? await this.geo.findNearbyLocalities(closest.cityId, latitude, longitude, 1)
      : [];

    // How much is actually here. The point of allowing location is to see what is nearby,
    // so the count comes back with the name rather than costing a second request — and an
    // area with nothing in it is worth saying so, since that is the moment to invite the
    // first post rather than show an empty shelf.
    const listingsNearby = await this.geo.countNearbyListings({
      latitude,
      longitude,
      radiusMeters: 10_000,
    });

    return {
      pincode: this.toPincodeDto(closest),
      areaName: closest.name,
      localityName: locality[0]?.name ?? null,
      mandal: closest.mandal ?? null,
      listingsNearby,
      districtName: closest.districtName,
      stateName: closest.stateName,
      cityId: closest.city?.id ?? null,
      cityName: closest.city?.name ?? null,
      citySlug: closest.city?.slug ?? null,
      distanceMeters: distance,
      // Under two kilometres the centroid is describing the caller's own neighbourhood;
      // beyond five it is the nearest place we know rather than where they are.
      // A corrected answer is HIGH regardless of distance: somebody who was there said so,
      // which beats a centroid however close it happens to sit.
      confidence: corrected
        ? 'HIGH'
        : distance <= 2_000
          ? 'HIGH'
          : distance <= 5_000
            ? 'MEDIUM'
            : 'LOW',
      correctedByNeighbours: Boolean(corrected),
      nearby: nearby
        .slice(1)
        .map((row) => {
          const match = byCode.get(row.code);
          return match
            ? {
                code: match.code,
                name: match.name,
                districtName: match.districtName,
                distanceMeters: Math.round(row.distanceMeters),
              }
            : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    };
  }

  /**
   * Records that the detected area was wrong, and what the right one is.
   *
   * Kept whether or not anyone is signed in: a correction is a fact about a place, and
   * demanding an account before accepting it would throw away most of them. The chosen
   * code is checked against the pincode table so this cannot be used to write arbitrary
   * strings into a table that later influences what other people are shown.
   */
  async recordAreaCorrection(
    latitude: number,
    longitude: number,
    detectedCode: string,
    chosenCode: string,
    userId?: string,
  ): Promise<{ recorded: true; agreeingNearby: number }> {
    const chosen = await this.prisma.pincode.findUnique({ where: { code: chosenCode } });
    if (!chosen) throw new BadRequestException(`We do not recognise pincode ${chosenCode}`);

    if (detectedCode === chosenCode) {
      throw new BadRequestException('That is the area we already suggested');
    }

    await this.prisma.areaCorrection.create({
      data: { id: uuid(), latitude, longitude, detectedCode, chosenCode, userId: userId ?? null },
    });

    const nearby = await this.geo.findAreaCorrections(latitude, longitude, 500);
    const agreeing = nearby.find((row) => row.chosenCode === chosenCode)?.votes ?? 1;

    return { recorded: true, agreeingNearby: agreeing };
  }

  async listSavedLocations(userId: string): Promise<SavedLocationDto[]> {
    const saved = await this.prisma.savedLocation.findMany({
      where: { userId },
      include: { city: true, locality: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return saved.map((location) => ({
      id: location.id,
      label: location.label,
      cityId: location.cityId,
      cityName: location.city.name,
      localityId: location.localityId,
      localityName: location.locality?.name ?? null,
      latitude: location.latitude ? Number(location.latitude) : null,
      longitude: location.longitude ? Number(location.longitude) : null,
      radiusKm: location.radiusKm,
      isDefault: location.isDefault,
    }));
  }

  async createSavedLocation(
    userId: string,
    dto: CreateSavedLocationDto,
  ): Promise<SavedLocationDto> {
    if (!RADIUS_PRESETS_KM.includes(dto.radiusKm as (typeof RADIUS_PRESETS_KM)[number])) {
      throw new BadRequestException(`radiusKm must be one of ${RADIUS_PRESETS_KM.join(', ')}`);
    }

    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
    if (!city) throw new NotFoundException('City not found');

    if (dto.localityId) {
      const locality = await this.prisma.locality.findFirst({
        where: { id: dto.localityId, cityId: dto.cityId },
      });
      if (!locality)
        throw new BadRequestException('That locality does not belong to the selected city');
    }

    const existingCount = await this.prisma.savedLocation.count({ where: { userId } });
    // The first saved location is the default whether or not the client asked, so a
    // user always has one — the feed never has to cope with "no location at all".
    const shouldBeDefault = dto.isDefault === true || existingCount === 0;

    const created = await this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        // The database enforces one default per user with a partial unique index;
        // clearing the previous one first is what keeps that insert from failing.
        await tx.savedLocation.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.savedLocation.create({
        data: {
          id: uuid(),
          userId,
          label: dto.label,
          cityId: dto.cityId,
          localityId: dto.localityId ?? null,
          latitude: dto.latitude ?? city.latitude,
          longitude: dto.longitude ?? city.longitude,
          radiusKm: dto.radiusKm,
          isDefault: shouldBeDefault,
        },
        include: { city: true, locality: true },
      });
    });

    return {
      id: created.id,
      label: created.label,
      cityId: created.cityId,
      cityName: created.city.name,
      localityId: created.localityId,
      localityName: created.locality?.name ?? null,
      latitude: created.latitude ? Number(created.latitude) : null,
      longitude: created.longitude ? Number(created.longitude) : null,
      radiusKm: created.radiusKm,
      isDefault: created.isDefault,
    };
  }

  async setDefaultLocation(userId: string, locationId: string): Promise<void> {
    const location = await this.prisma.savedLocation.findFirst({
      where: { id: locationId, userId },
    });
    if (!location) throw new NotFoundException('Saved location not found');

    await this.prisma.$transaction([
      this.prisma.savedLocation.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.savedLocation.update({
        where: { id: locationId },
        data: { isDefault: true },
      }),
    ]);
  }

  async deleteSavedLocation(userId: string, locationId: string): Promise<void> {
    const location = await this.prisma.savedLocation.findFirst({
      where: { id: locationId, userId },
    });
    if (!location) throw new NotFoundException('Saved location not found');

    await this.prisma.savedLocation.delete({ where: { id: locationId } });

    // Deleting the default promotes the oldest remaining location rather than leaving
    // the user with none.
    if (location.isDefault) {
      const next = await this.prisma.savedLocation.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.savedLocation.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  }
}
