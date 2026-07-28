import type { Category, CategoryAttribute, CategoryAttributeOption } from '@locz/shared-types';
import type { Locale } from '@/i18n';
import { apiSafe } from '@/lib/api';

/**
 * The API's category-detail response has always carried attributes. Newer category-tree
 * responses carry them too; the detail fallback keeps clients compatible while that
 * response rolls through every environment.
 */
export async function hydrateCategoryAttributes(categories: Category[]): Promise<Category[]> {
  async function hydrate(category: Category): Promise<Category> {
    const children = category.children?.length
      ? await Promise.all(category.children.map(hydrate))
      : category.children;

    if (category.attributes !== undefined) return { ...category, children };
    // Only leaves can be selected by the posting and search forms. Avoid a detail request
    // for grouping nodes such as "Electronics" whose inherited fields are never rendered.
    if (children?.length) return { ...category, children, attributes: [] };

    const detail = await apiSafe<Category>(`/categories/${encodeURIComponent(category.slug)}`, {
      revalidate: 3600,
    });
    return {
      ...category,
      children,
      attributes: detail?.attributes ?? [],
    };
  }

  return Promise.all(categories.map(hydrate));
}

export function findCategory(categories: Category[], id: string): Category | undefined {
  for (const category of categories) {
    if (category.id === id) return category;
    const child = findCategory(category.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

export function categoryAttributeLabel(attribute: CategoryAttribute, locale: Locale): string {
  if (locale === 'te') return attribute.labelTe || attribute.label;
  if (locale === 'hi') return attribute.labelHi || attribute.label;
  return attribute.label;
}

export function categoryAttributeOptionLabel(
  option: CategoryAttributeOption,
  locale: Locale,
): string {
  if (locale === 'te') return option.labelTe || option.label;
  if (locale === 'hi') return option.labelHi || option.label;
  return option.label;
}
