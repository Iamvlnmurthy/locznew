import type { Category } from '@locz/shared-types';
import { ApiRequestError, api } from '@/lib/api';

export const dynamic = 'force-dynamic';

function CategoryRow({ category, depth }: { category: Category; depth: number }) {
  return (
    <>
      <tr>
        <td style={{ paddingLeft: 12 + depth * 20 }}>
          {depth > 0 ? <span style={{ color: 'var(--locz-text-muted)' }}>└ </span> : null}
          {category.name}
        </td>
        <td style={{ color: 'var(--locz-text-secondary)' }}>
          {category.nameTe ?? <span style={{ color: 'var(--locz-text-muted)' }}>—</span>}
        </td>
        <td style={{ color: 'var(--locz-text-secondary)' }}>
          {category.nameHi ?? <span style={{ color: 'var(--locz-text-muted)' }}>—</span>}
        </td>
        <td>
          <code style={{ fontSize: '0.75rem' }}>{category.slug}</code>
        </td>
        <td style={{ fontSize: '0.75rem' }}>
          {category.listingTypes.map((type) => type.toLowerCase().replace(/_/g, ' ')).join(', ')}
        </td>
      </tr>
      {category.children?.map((child) => (
        <CategoryRow key={child.id} category={child} depth={depth + 1} />
      ))}
    </>
  );
}

function countMissingTe(categories: Category[]): number {
  return categories.reduce(
    (total, category) =>
      total + (category.nameTe ? 0 : 1) + countMissingTe(category.children ?? []),
    0,
  );
}

function countTree(categories: Category[]): number {
  return categories.reduce((total, category) => total + 1 + countTree(category.children ?? []), 0);
}

/**
 * Read-only view of the category tree and its translations. Editing exists on the API
 * (`category:manage`); the console surfaces the tree first because the immediate
 * operational need is spotting categories with missing Telugu or Hindi names.
 */
export default async function CategoriesPage() {
  let categories: Category[];
  try {
    categories = await api<Category[]>('/categories?includeInactive=true');
  } catch (error) {
    return (
      <>
        <div className="page-header">
          <h1>Categories</h1>
        </div>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError ? error.message : 'Could not load categories.'}
        </div>
      </>
    );
  }

  const total = countTree(categories);
  const missingTranslations = countMissingTe(categories);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Categories</h1>
          <p>
            {total} categories
            {missingTranslations > 0
              ? ` · ${missingTranslations} missing a Telugu name`
              : ' · all translated'}
          </p>
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Telugu</th>
              <th>Hindi</th>
              <th>Slug</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <CategoryRow key={category.id} category={category} depth={0} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
