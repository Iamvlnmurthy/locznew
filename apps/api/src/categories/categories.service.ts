import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttributeDataType,
  Category,
  CategoryAttribute,
  ListingType,
  Prisma,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slug.util';
import {
  CategoryAttributeDto,
  CategoryAttributeOptionDto,
  CategoryDetailDto,
  CategoryDto,
  CategoryTreeQueryDto,
  CreateCategoryAttributeDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

export interface AttributeValueInput {
  key: string;
  value: string | number | boolean | string[] | null;
}

/**
 * Categories carry the platform's dynamic form definitions. An administrator adding an
 * attribute here changes the posting form on web and mobile with no client release —
 * which is why validation of submitted attribute values also lives here rather than in
 * each client.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toDto(category: Category): CategoryDto {
    return {
      id: category.id,
      name: category.name,
      nameTe: category.nameTe,
      nameHi: category.nameHi,
      slug: category.slug,
      iconKey: category.iconKey,
      listingTypes: category.listingTypes,
      parentId: category.parentId,
      sortOrder: category.sortOrder,
    };
  }

  private toAttributeDto(attribute: CategoryAttribute): CategoryAttributeDto {
    return {
      id: attribute.id,
      key: attribute.key,
      label: attribute.label,
      labelTe: attribute.labelTe,
      labelHi: attribute.labelHi,
      dataType: attribute.dataType,
      options: (attribute.options as CategoryAttributeOptionDto[] | null) ?? null,
      unit: attribute.unit,
      isRequired: attribute.isRequired,
      isFilterable: attribute.isFilterable,
      minValue: attribute.minValue ? Number(attribute.minValue) : null,
      maxValue: attribute.maxValue ? Number(attribute.maxValue) : null,
      sortOrder: attribute.sortOrder,
    };
  }

  /**
   * The whole tree in one query, assembled in memory. The table is small (tens to low
   * hundreds of rows) and read constantly, so one flat SELECT beats recursive queries
   * or N+1 traversal.
   */
  async getTree(query: CategoryTreeQueryDto): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.listingType ? { listingTypes: { has: query.listingType } } : {}),
        // Directory categories classify imported businesses and are fully searchable, but
        // they are not choices anybody makes when posting. Showing "hospitals and clinics"
        // to somebody listing a used phone is noise, and a list that long is one nobody reads.
        isDirectoryOnly: false,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const byId = new Map<string, CategoryDto>();
    for (const category of categories) {
      byId.set(category.id, { ...this.toDto(category), children: [] });
    }

    const roots: CategoryDto[] = [];
    for (const category of categories) {
      const dto = byId.get(category.id)!;
      // A child whose parent was filtered out (different listing type) is surfaced at
      // the root rather than being lost.
      const parent = category.parentId ? byId.get(category.parentId) : undefined;
      if (parent) {
        parent.children!.push(dto);
      } else {
        roots.push(dto);
      }
    }

    return roots;
  }

  async getBySlug(slug: string): Promise<CategoryDetailDto> {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category || !category.isActive) throw new NotFoundException('Category not found');
    return this.getDetail(category);
  }

  async getById(id: string): Promise<CategoryDetailDto> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return this.getDetail(category);
  }

  private async getDetail(category: Category): Promise<CategoryDetailDto> {
    const attributes = await this.resolveAttributes(category.id);
    return {
      ...this.toDto(category),
      attributes: attributes.map((attribute) => this.toAttributeDto(attribute)),
    };
  }

  /**
   * A subcategory's attributes are its own plus its ancestors'. "Brand" is defined once
   * on Electronics rather than repeated on every leaf; a child may override an inherited
   * key by defining the same key itself.
   */
  private async resolveAttributes(categoryId: string): Promise<CategoryAttribute[]> {
    const chain: string[] = [];
    let current = await this.prisma.category.findUnique({ where: { id: categoryId } });

    // The tree is at most a few levels deep; the guard is against a cycle introduced by
    // a bad admin edit, not against legitimate depth.
    let guard = 0;
    while (current && guard < 10) {
      chain.push(current.id);
      if (!current.parentId) break;
      current = await this.prisma.category.findUnique({ where: { id: current.parentId } });
      guard += 1;
    }

    const attributes = await this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: chain }, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Nearest definition wins: chain[0] is the category itself.
    const byKey = new Map<string, CategoryAttribute>();
    for (const id of chain) {
      for (const attribute of attributes.filter((a) => a.categoryId === id)) {
        if (!byKey.has(attribute.key)) byKey.set(attribute.key, attribute);
      }
    }

    return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Validates submitted attribute values against the category's definitions and returns
   * rows ready to insert. Called by the listing service before a listing is created, so
   * a client that skips a required field is rejected by the backend, not by the form.
   */
  async buildAttributeValues(
    categoryId: string,
    inputs: AttributeValueInput[],
  ): Promise<Prisma.ListingAttributeValueCreateManyListingInput[]> {
    const definitions = await this.resolveAttributes(categoryId);
    const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
    const provided = new Map(inputs.map((input) => [input.key, input.value]));

    for (const definition of definitions) {
      if (definition.isRequired && (provided.get(definition.key) ?? null) === null) {
        throw new BadRequestException(`${definition.label} is required`);
      }
    }

    const rows: Prisma.ListingAttributeValueCreateManyListingInput[] = [];

    for (const [key, value] of provided) {
      const definition = byKey.get(key);
      if (!definition) {
        throw new BadRequestException(`Unknown attribute "${key}" for this category`);
      }
      if (value === null || value === '') continue;

      rows.push({
        id: uuid(),
        attributeId: definition.id,
        ...this.coerceValue(definition, value),
      });
    }

    return rows;
  }

  private coerceValue(
    definition: CategoryAttribute,
    value: string | number | boolean | string[],
  ): Partial<Prisma.ListingAttributeValueCreateManyListingInput> {
    const options = (definition.options as CategoryAttributeOptionDto[] | null) ?? [];

    switch (definition.dataType) {
      case AttributeDataType.NUMBER: {
        const numeric = Number(value);
        if (Number.isNaN(numeric)) {
          throw new BadRequestException(`${definition.label} must be a number`);
        }
        if (definition.minValue && numeric < Number(definition.minValue)) {
          throw new BadRequestException(
            `${definition.label} must be at least ${String(definition.minValue)}`,
          );
        }
        if (definition.maxValue && numeric > Number(definition.maxValue)) {
          throw new BadRequestException(
            `${definition.label} must be at most ${String(definition.maxValue)}`,
          );
        }
        return { valueNumber: new Prisma.Decimal(numeric) };
      }

      case AttributeDataType.BOOLEAN:
        return { valueBool: value === true || value === 'true' };

      case AttributeDataType.DATE: {
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) {
          throw new BadRequestException(`${definition.label} must be a valid date`);
        }
        return { valueDate: date };
      }

      case AttributeDataType.SELECT: {
        const selected = String(value);
        if (options.length > 0 && !options.some((option) => option.value === selected)) {
          throw new BadRequestException(`${definition.label} must be one of the offered options`);
        }
        return { valueText: selected };
      }

      case AttributeDataType.MULTI_SELECT: {
        const values = Array.isArray(value) ? value.map(String) : [String(value)];
        const allowed = new Set(options.map((option) => option.value));
        if (allowed.size > 0) {
          const invalid = values.filter((entry) => !allowed.has(entry));
          if (invalid.length > 0) {
            throw new BadRequestException(`${definition.label} contains an unsupported option`);
          }
        }
        return { valueJson: values };
      }

      case AttributeDataType.TEXT:
      default:
        return { valueText: String(value).slice(0, 300) };
    }
  }

  async assertUsableFor(categoryId: string, listingType: ListingType): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || !category.isActive)
      throw new BadRequestException('That category is not available');
    if (!category.listingTypes.includes(listingType)) {
      throw new BadRequestException(
        `"${category.name}" cannot be used for ${listingType} listings`,
      );
    }
    return category;
  }

  // ---------- Administration ----------

  async create(dto: CreateCategoryDto, actorId: string): Promise<CategoryDto> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);

    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`A category with the slug "${slug}" already exists`);

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('Parent category not found');
    }

    const category = await this.prisma.category.create({
      data: {
        id: uuid(),
        name: dto.name,
        nameTe: dto.nameTe,
        nameHi: dto.nameHi,
        slug,
        parentId: dto.parentId ?? null,
        iconKey: dto.iconKey,
        listingTypes: dto.listingTypes,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.audit.record({
      action: 'category.create',
      entityType: 'Category',
      entityId: category.id,
      actorId,
      changes: { name: category.name, slug: category.slug },
    });

    return this.toDto(category);
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string): Promise<CategoryDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        nameTe: dto.nameTe ?? undefined,
        nameHi: dto.nameHi ?? undefined,
        iconKey: dto.iconKey ?? undefined,
        listingTypes: dto.listingTypes ?? undefined,
        sortOrder: dto.sortOrder ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });

    await this.audit.record({
      action: 'category.update',
      entityType: 'Category',
      entityId: id,
      actorId,
      changes: this.audit.diff(
        { name: existing.name, isActive: existing.isActive, listingTypes: existing.listingTypes },
        { name: updated.name, isActive: updated.isActive, listingTypes: updated.listingTypes },
      ),
    });

    return this.toDto(updated);
  }

  async addAttribute(
    categoryId: string,
    dto: CreateCategoryAttributeDto,
    actorId: string,
  ): Promise<CategoryAttributeDto> {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const needsOptions =
      dto.dataType === AttributeDataType.SELECT || dto.dataType === AttributeDataType.MULTI_SELECT;
    if (needsOptions && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException(`${dto.dataType} attributes must define at least one option`);
    }

    const attribute = await this.prisma.categoryAttribute.create({
      data: {
        id: uuid(),
        categoryId,
        key: slugify(dto.key).replace(/-/g, '_'),
        label: dto.label,
        labelTe: dto.labelTe,
        labelHi: dto.labelHi,
        dataType: dto.dataType,
        options: dto.options ? (dto.options as unknown as Prisma.InputJsonValue) : undefined,
        unit: dto.unit,
        isRequired: dto.isRequired ?? false,
        isFilterable: dto.isFilterable ?? false,
        isSearchable: dto.isSearchable ?? false,
        minValue: dto.minValue !== undefined ? new Prisma.Decimal(dto.minValue) : null,
        maxValue: dto.maxValue !== undefined ? new Prisma.Decimal(dto.maxValue) : null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.audit.record({
      action: 'category.attribute_create',
      entityType: 'CategoryAttribute',
      entityId: attribute.id,
      actorId,
      changes: { categoryId, key: attribute.key, dataType: attribute.dataType },
    });

    return this.toAttributeDto(attribute);
  }
}
