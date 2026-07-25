import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { GeoRepository } from '../prisma/geo.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CityDto,
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
        ...(query.launchedOnly ? { isLaunched: true } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      include: { state: true, district: true },
      // Launched cities first, then by size — a user typing "vi" should see Vijayawada
      // and Visakhapatnam before a small town with a similar name.
      orderBy: [{ isLaunched: 'desc' }, { population: 'desc' }, { name: 'asc' }],
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
