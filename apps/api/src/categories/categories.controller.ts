import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public, RequirePermissions } from '../rbac/rbac.decorators';
import { CategoriesService } from './categories.service';
import { ModelSuggestionsService } from './model-suggestions.service';
import {
  CategoryAttributeDto,
  CategoryDetailDto,
  CategoryDto,
  CategoryTreeQueryDto,
  CreateCategoryAttributeDto,
  CreateCategoryDto,
  ModelSuggestionQueryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly modelSuggestions: ModelSuggestionsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Category tree',
    description:
      'Filter by `listingType` to get exactly the categories a posting flow should offer.',
  })
  @ApiResponse({ status: 200, type: [CategoryDto] })
  getTree(@Query() query: CategoryTreeQueryDto): Promise<CategoryDto[]> {
    return this.categories.getTree(query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({
    summary: 'One category with its attribute definitions',
    description: 'Attributes include those inherited from ancestor categories.',
  })
  @ApiResponse({ status: 200, type: CategoryDetailDto })
  getBySlug(@Param('slug') slug: string): Promise<CategoryDetailDto> {
    return this.categories.getBySlug(slug);
  }

  @Public()
  @Get(':slug/models')
  @ApiOperation({
    summary: 'Model-name suggestions for a category',
    description:
      'Suggestions only. The model a listing stores is free text, because no list of models ' +
      'stays complete and a seller whose phone is missing from a picklist simply does not ' +
      'post. Narrow by `brand` once the brand is known, and by `q` as the user types.',
  })
  @ApiResponse({ status: 200, type: [String] })
  getModelSuggestions(
    @Param('slug') slug: string,
    @Query() query: ModelSuggestionQueryDto,
  ): string[] {
    return this.modelSuggestions.suggest(slug, query);
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermissions('category:manage')
  @ApiOperation({ summary: 'Create a category (admin)' })
  @ApiResponse({ status: 201, type: CategoryDto })
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryDto> {
    return this.categories.create(dto, user.id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @RequirePermissions('category:manage')
  @ApiOperation({ summary: 'Update a category (admin)' })
  @ApiResponse({ status: 200, type: CategoryDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryDto> {
    return this.categories.update(id, dto, user.id);
  }

  @Post(':id/attributes')
  @ApiBearerAuth()
  @RequirePermissions('category:manage')
  @ApiOperation({
    summary: 'Define a category attribute (admin)',
    description:
      'Appears in the posting form on web and mobile immediately — no client release needed.',
  })
  @ApiResponse({ status: 201, type: CategoryAttributeDto })
  addAttribute(
    @Param('id') id: string,
    @Body() dto: CreateCategoryAttributeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryAttributeDto> {
    return this.categories.addAttribute(id, dto, user.id);
  }
}
