'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';

export interface FinderOption {
  slug: string;
  name: string;
}

export function ServiceFinder({
  categories,
  areas,
  initialCategory,
  initialArea,
  labels,
}: {
  categories: FinderOption[];
  areas: FinderOption[];
  initialCategory?: string;
  initialArea?: string;
  labels: {
    category: string;
    categoryPlaceholder: string;
    area: string;
    areaPlaceholder: string;
    submit: string;
    missing: string;
  };
}) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory || categories[0]?.slug || '');
  const [area, setArea] = useState(
    areas.find((item) => item.slug === initialArea)?.name || initialArea || '',
  );
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chosenArea = areas.find((item) => item.name.toLowerCase() === area.trim().toLowerCase());
    const areaSlug =
      chosenArea?.slug ||
      area
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    if (!category || !areaSlug) {
      setError(labels.missing);
      return;
    }
    setError('');
    router.push(`/services/${category}/${areaSlug}`);
  }

  return (
    <form className="service-finder" onSubmit={submit}>
      <div className="service-finder__field">
        <label htmlFor="service-category">{labels.category}</label>
        <select
          id="service-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="" disabled>
            {labels.categoryPlaceholder}
          </option>
          {categories.map((item) => (
            <option value={item.slug} key={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="service-finder__field service-finder__field--area">
        <label htmlFor="service-area">{labels.area}</label>
        <input
          id="service-area"
          list="service-area-options"
          value={area}
          onChange={(event) => setArea(event.target.value)}
          placeholder={labels.areaPlaceholder}
          autoComplete="address-level3"
        />
        <datalist id="service-area-options">
          {areas.map((item) => (
            <option value={item.name} key={item.slug} />
          ))}
        </datalist>
      </div>
      <button type="submit">
        {labels.submit} <Icon name="arrow" />
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
