import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../rbac/rbac.decorators';
import {
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
import { GeoService } from './geo.service';

@ApiTags('locations')
@Controller('locations')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('cities')
  @ApiOperation({ summary: 'Search cities by name' })
  @ApiResponse({ status: 200, type: [CityDto] })
  searchCities(@Query() query: CitySearchQueryDto): Promise<CityDto[]> {
    return this.geo.searchCities(query);
  }

  @Public()
  @Get('cities/:slug')
  @ApiOperation({ summary: 'One city by slug — backs the /:city landing pages' })
  @ApiResponse({ status: 200, type: CityDto })
  getCity(@Param('slug') slug: string): Promise<CityDto> {
    return this.geo.getCityBySlug(slug);
  }

  @Public()
  @Get('cities/:cityId/localities')
  @ApiOperation({ summary: 'Localities within a city' })
  @ApiResponse({ status: 200, type: [LocalityDto] })
  listLocalities(@Param('cityId') cityId: string): Promise<LocalityDto[]> {
    return this.geo.listLocalities(cityId);
  }

  @Public()
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve device coordinates to a launched city',
    description: 'Returns `city: null` when the coordinates fall outside every launched area.',
  })
  @ApiResponse({ status: 200, type: ResolvedLocationDto })
  resolve(@Body() dto: ResolveLocationDto): Promise<ResolvedLocationDto> {
    return this.geo.resolveByCoordinates(dto);
  }

  @Public()
  @Post('resolve/pincode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve coordinates to the nearest pincode',
    description:
      'The GPS path and the typed-pincode path end in the same place, so everything downstream only has to understand one kind of location.',
  })
  @ApiResponse({ status: 200, type: PincodeDto })
  async resolvePincode(@Body() dto: ResolveLocationDto): Promise<{ pincode: PincodeDto | null }> {
    return { pincode: await this.geo.resolvePincodeByCoordinates(dto.latitude, dto.longitude) };
  }

  @Public()
  @Get('pincodes')
  @ApiOperation({
    summary: 'Search pincodes by partial code or place name',
    description:
      'Typeahead over every Indian postal code. "5000" and "madhapur" both work. Codes inside a launched city rank first.',
  })
  @ApiResponse({ status: 200, type: [PincodeDto] })
  searchPincodes(@Query() query: PincodeSearchQueryDto): Promise<PincodeDto[]> {
    return this.geo.searchPincodes(query);
  }

  @Public()
  @Get('pincodes/:code')
  @ApiOperation({
    summary: 'Resolve a pincode to its area',
    description:
      'Returns the place, district and state, how many ads are posted there, and the adjacent codes within 10 km — because "my area" is a radius, not a boundary.',
  })
  @ApiResponse({ status: 200, type: PincodeAreaDto })
  @ApiResponse({ status: 404, description: 'Not a recognised Indian pincode' })
  getPincode(@Param('code') code: string): Promise<PincodeAreaDto> {
    return this.geo.getPincodeArea(code);
  }

  @Public()
  @Get('radius-presets')
  @ApiOperation({ summary: 'Radius options accepted by nearby search' })
  radiusPresets(): { radiusKm: number[] } {
    return { radiusKm: [...RADIUS_PRESETS_KM] };
  }

  @Get('saved')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The current user’s saved locations' })
  @ApiResponse({ status: 200, type: [SavedLocationDto] })
  listSaved(@CurrentUser() user: AuthenticatedUser): Promise<SavedLocationDto[]> {
    return this.geo.listSavedLocations(user.id);
  }

  @Post('saved')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a location' })
  @ApiResponse({ status: 201, type: SavedLocationDto })
  createSaved(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedLocationDto,
  ): Promise<SavedLocationDto> {
    return this.geo.createSavedLocation(user.id, dto);
  }

  @Post('saved/:id/default')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Make a saved location the default' })
  setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.geo.setDefaultLocation(user.id, id);
  }

  @Delete('saved/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a saved location' })
  deleteSaved(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.geo.deleteSavedLocation(user.id, id);
  }
}
