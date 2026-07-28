'use client';

import type { Category, CategoryAttribute, CategoryAttributeOption } from '@locz/shared-types';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import type { Locale } from '@/i18n';

interface FilterValues {
  q?: string;
  type?: string;
  categoryId?: string;
  priceMin?: string;
  priceMax?: string;
  condition?: string;
  radiusKm?: string;
  postedWithinDays?: string;
  verifiedOnly?: string;
  attrs?: string[];
}

function localName(
  value: {
    name?: string;
    nameTe?: string | null;
    nameHi?: string | null;
    label?: string;
    labelTe?: string | null;
    labelHi?: string | null;
  },
  locale: Locale,
): string {
  const fallback = value.name ?? value.label ?? '';
  if (locale === 'te') return value.nameTe || value.labelTe || fallback;
  if (locale === 'hi') return value.nameHi || value.labelHi || fallback;
  return fallback;
}

function findCategory(categories: Category[], id: string): Category | undefined {
  for (const category of categories) {
    if (category.id === id) return category;
    const child = findCategory(category.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

function categoryOptions(
  categories: Category[],
  locale: Locale,
  parents: string[] = [],
): Array<{ id: string; label: string }> {
  return categories.flatMap((category) => {
    const path = [...parents, localName(category, locale)];
    return category.children?.length
      ? categoryOptions(category.children, locale, path)
      : [{ id: category.id, label: path.join(' › ') }];
  });
}

function optionLabel(option: CategoryAttributeOption, locale: Locale): string {
  return localName(option, locale);
}

function DynamicAttributeFilter({
  attribute,
  locale,
  selected,
  labels,
}: {
  attribute: CategoryAttribute;
  locale: Locale;
  selected: string[];
  labels: Record<string, string>;
}) {
  const prefix = `${attribute.key}:`;
  const rawValues = selected
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length));
  const id = `search-attribute-${attribute.key}`;
  const label = localName(attribute, locale);

  if (attribute.dataType === 'NUMBER') {
    const [initialMin = '', initialMax = ''] = (rawValues[0] ?? '').split('..');
    return (
      <NumberAttributeFilter
        id={id}
        attribute={attribute}
        label={label}
        initialMin={initialMin}
        initialMax={initialMax}
        labels={labels}
      />
    );
  }

  if (attribute.dataType === 'SELECT' || attribute.dataType === 'BOOLEAN') {
    const options =
      attribute.dataType === 'BOOLEAN'
        ? [
            { value: 'true', label: labels.yes },
            { value: 'false', label: labels.no },
          ]
        : (attribute.options ?? []).map((option) => ({
            value: option.value,
            label: optionLabel(option, locale),
          }));
    return (
      <div className="field search-attribute-filter">
        <label htmlFor={id}>{label}</label>
        <select id={id} name="attr" defaultValue={rawValues[0] ? `${prefix}${rawValues[0]}` : ''}>
          <option value="">{labels.any}</option>
          {options.map((option) => (
            <option key={option.value} value={`${prefix}${option.value}`}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (attribute.dataType === 'MULTI_SELECT') {
    return (
      <div className="field search-attribute-filter">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          name="attr"
          multiple
          size={Math.min(5, Math.max(3, attribute.options?.length ?? 3))}
          defaultValue={rawValues.map((value) => `${prefix}${value}`)}
        >
          {(attribute.options ?? []).map((option) => (
            <option key={option.value} value={`${prefix}${option.value}`}>
              {optionLabel(option, locale)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <TextAttributeFilter
      id={id}
      attribute={attribute}
      label={label}
      initialValue={rawValues[0] ?? ''}
    />
  );
}

function NumberAttributeFilter({
  id,
  attribute,
  label,
  initialMin,
  initialMax,
  labels,
}: {
  id: string;
  attribute: CategoryAttribute;
  label: string;
  initialMin: string;
  initialMax: string;
  labels: Record<string, string>;
}) {
  const [minimum, setMinimum] = useState(initialMin);
  const [maximum, setMaximum] = useState(initialMax);
  const encoded = minimum || maximum ? `${attribute.key}:${minimum}..${maximum}` : '';
  return (
    <fieldset className="search-filter-group search-attribute-filter">
      <legend>
        {label}
        {attribute.unit ? ` (${attribute.unit})` : ''}
      </legend>
      {encoded ? <input type="hidden" name="attr" value={encoded} /> : null}
      <div className="search-filter-price">
        <label>
          <span>{labels.minimum}</span>
          <input
            id={`${id}-min`}
            type="number"
            inputMode="decimal"
            min={attribute.minValue ?? undefined}
            max={attribute.maxValue ?? undefined}
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
          />
        </label>
        <span aria-hidden="true">—</span>
        <label>
          <span>{labels.maximum}</span>
          <input
            id={`${id}-max`}
            type="number"
            inputMode="decimal"
            min={attribute.minValue ?? undefined}
            max={attribute.maxValue ?? undefined}
            value={maximum}
            onChange={(event) => setMaximum(event.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}

function TextAttributeFilter({
  id,
  attribute,
  label,
  initialValue,
}: {
  id: string;
  attribute: CategoryAttribute;
  label: string;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="field search-attribute-filter">
      <label htmlFor={id}>{label}</label>
      {value ? <input type="hidden" name="attr" value={`${attribute.key}:${value}`} /> : null}
      <input
        id={id}
        type={attribute.dataType === 'DATE' ? 'date' : 'text'}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}

export function SearchFilters({
  categories,
  values,
  locale,
  labels: s,
}: {
  categories: Category[];
  values: FilterValues;
  locale: Locale;
  labels: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(values.categoryId ?? '');
  const selectedCategory = findCategory(categories, categoryId);
  const filterableAttributes = (selectedCategory?.attributes ?? []).filter(
    (attribute) => attribute.isFilterable,
  );

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('has-search-drawer');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('has-search-drawer');
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="search-filter-trigger"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
      >
        <Icon name="sliders" />
        {s.filters}
        {activeFilterCount(values) ? <span>{activeFilterCount(values)}</span> : null}
      </button>

      {isOpen ? (
        <button
          type="button"
          className="search-filters__backdrop"
          onClick={() => setIsOpen(false)}
          aria-label={s.closeFilters}
        />
      ) : null}

      <aside className={`search-filters${isOpen ? ' is-open' : ''}`} aria-label={s.searchFilters}>
        <form className="panel" action="/search" method="get">
          <div className="search-filters__head">
            <div>
              <span className="section-kicker">{s.narrowDown}</span>
              <h2>{s.filters}</h2>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label={s.closeFilters}>
              ×
            </button>
          </div>

          {values.q ? <input type="hidden" name="q" value={values.q} /> : null}
          {values.type ? <input type="hidden" name="type" value={values.type} /> : null}

          <div className="field">
            <label htmlFor="categoryId">{s.category}</label>
            <select
              id="categoryId"
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">{s.allCategories}</option>
              {categoryOptions(categories, locale).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          {filterableAttributes.length ? (
            <div className="search-attribute-filters" key={categoryId}>
              <div className="search-attribute-filters__head">
                <strong>{s.categoryDetails}</strong>
                <span>{s.categoryDetailsHint}</span>
              </div>
              {filterableAttributes.map((attribute) => (
                <DynamicAttributeFilter
                  key={attribute.key}
                  attribute={attribute}
                  locale={locale}
                  selected={categoryId === values.categoryId ? (values.attrs ?? []) : []}
                  labels={s}
                />
              ))}
            </div>
          ) : null}

          <fieldset className="search-filter-group">
            <legend>{s.priceRange}</legend>
            <div className="search-filter-price">
              <label>
                <span>{s.minimum}</span>
                <input
                  name="priceMin"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  defaultValue={values.priceMin ?? ''}
                />
              </label>
              <span aria-hidden="true">—</span>
              <label>
                <span>{s.maximum}</span>
                <input
                  name="priceMax"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder={s.any}
                  defaultValue={values.priceMax ?? ''}
                />
              </label>
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="condition">{s.condition}</label>
            <select id="condition" name="condition" defaultValue={values.condition ?? ''}>
              <option value="">{s.anyCondition}</option>
              <option value="NEW">{s.conditionNew}</option>
              <option value="LIKE_NEW">{s.conditionLikeNew}</option>
              <option value="GOOD">{s.conditionGood}</option>
              <option value="FAIR">{s.conditionFair}</option>
              <option value="FOR_PARTS">{s.conditionParts}</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="radiusKm">{s.distance}</label>
            <select id="radiusKm" name="radiusKm" defaultValue={values.radiusKm ?? ''}>
              <option value="">{s.entireCity}</option>
              {[1, 3, 5, 10, 25, 50].map((km) => (
                <option key={km} value={km}>
                  {s.withinKm.replace('{km}', String(km))}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="postedWithinDays">{s.posted}</label>
            <select
              id="postedWithinDays"
              name="postedWithinDays"
              defaultValue={values.postedWithinDays ?? ''}
            >
              <option value="">{s.anyTime}</option>
              <option value="1">{s.today}</option>
              <option value="7">{s.thisWeek}</option>
              <option value="30">{s.thisMonth}</option>
            </select>
          </div>

          <label className="search-filter-check">
            <input
              type="checkbox"
              name="verifiedOnly"
              value="true"
              defaultChecked={values.verifiedOnly === 'true'}
            />
            <span>
              <Icon name="shield" />
            </span>
            <span>
              <strong>{s.verifiedOnly}</strong>
              {s.verifiedOnlyBody}
            </span>
          </label>

          <div className="search-filters__actions">
            <a href="/search" className="btn btn--ghost">
              {s.clearAll}
            </a>
            <button type="submit" className="btn btn--primary">
              {s.applyFilters}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function activeFilterCount(values: FilterValues): number {
  return [
    values.categoryId,
    values.priceMin,
    values.priceMax,
    values.condition,
    values.radiusKm,
    values.postedWithinDays,
    values.verifiedOnly,
    ...(values.attrs ?? []),
  ].filter(Boolean).length;
}
