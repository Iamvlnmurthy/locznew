import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { getTranslator } from '@/i18n';
import { ApiError, api, apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';

interface CategoryDetail extends Category {
  attributes: Array<{ key: string; label: string }>;
}

async function loadCategory(slug: string): Promise<CategoryDetail | null> {
  try {
    // Cached: category pages are the crawlable surface and change rarely.
    return await api<CategoryDetail>(`/categories/${encodeURIComponent(slug)}`, {
      revalidate: 3600,
      tags: ['categories'],
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await loadCategory(slug).catch(() => null);
  if (!category) return { title: 'Category not found', robots: { index: false, follow: false } };

  const title = `Free ${category.name} classifieds near you`;
  const description = `Buy and sell ${category.name.toLowerCase()} locally on LocZ. Posting is always free.`;

  return {
    title,
    description,
    alternates: { canonical: `/c/${category.slug}` },
    openGraph: { title, description, type: 'website' },
  };
}

/**
 * Category landing page — one of the two indexable surfaces (the other is city). Unlike
 * /search this is cached and crawlable, which is what makes it worth having separately.
 */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [locale, category, city] = await Promise.all([
    getLocale(),
    loadCategory(slug),
    getSelectedCity(),
  ]);

  if (!category) notFound();

  const t = getTranslator(locale);
  const query = new URLSearchParams({ categoryId: category.id, limit: '24' });
  if (city?.id) query.set('cityId', city.id);

  const result = await apiSafe<{ items: ListingSummary[]; total: number }>(
    `/search?${query.toString()}`,
    { revalidate: 120 },
  );

  const localisedName =
    locale === 'te'
      ? (category.nameTe ?? category.name)
      : locale === 'hi'
        ? (category.nameHi ?? category.name)
        : category.name;

  return (
    <div className="container">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">{t('nav.home')}</Link>
        <span>›</span>
        <span>{localisedName}</span>
      </nav>

      <h1 className="page-title">
        {localisedName}
        {city ? ` · ${city.name}` : ''}
      </h1>
      <p className="page-subtitle">
        {result ? `${result.total.toLocaleString('en-IN')} ads` : ''} · {t('footer.postFree')}
      </p>

      {category.children && category.children.length > 0 ? (
        <nav className="category-strip" aria-label={localisedName}>
          {category.children.map((child) => (
            <Link key={child.id} href={`/c/${child.slug}`} className="category-chip">
              {child.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!result || result.items.length === 0 ? (
        <div className="empty-state">
          <p>{t('feed.empty')}</p>
          <Link href="/post" className="btn btn--primary" style={{ marginTop: 16 }}>
            + {t('nav.post')}
          </Link>
        </div>
      ) : (
        <div className="card-grid" style={{ marginTop: 24 }}>
          {result.items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
