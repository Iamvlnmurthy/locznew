'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Category, City } from '@locz/shared-types';
import { createListingAction, type PostAdState } from './actions';
import { PhotoUploader } from './photo-uploader';

interface Labels {
  title: string;
  subtitle: string;
  fieldTitle: string;
  titleHint: string;
  fieldDescription: string;
  descriptionHint: string;
  fieldPrice: string;
  priceFree: string;
  negotiable: string;
  fieldCity: string;
  fieldCategory: string;
  contactPreference: string;
  photos: string;
  photosHint: string;
  publish: string;
  publishing: string;
  saveDraft: string;
  successPublished: string;
  successPending: string;
  contactOptions: Record<string, string>;
  conditionLabel: string;
}

function PublishButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

/**
 * Single-screen posting form.
 *
 * The brief describes a ten-step wizard; this collapses it to one scrollable screen for
 * the marketplace flow. On a phone, a wizard multiplies taps and abandonment for a form
 * this short — the steps remain as visual grouping rather than as separate pages.
 * Photos are uploaded after creation because the API scopes upload URLs to a listing id.
 */
export function PostForm({
  categories,
  cities,
  defaultCityId,
  labels,
}: {
  categories: Category[];
  cities: City[];
  defaultCityId?: string;
  labels: Labels;
}) {
  const [state, action] = useActionState<PostAdState, FormData>(createListingAction, {});
  const [isFree, setIsFree] = useState(false);

  // Only leaf categories are offered — posting into "Electronics" instead of
  // "Mobile Phones" is the most common miscategorisation.
  const options = categories.flatMap((category) =>
    category.children && category.children.length > 0
      ? category.children.map((child) => ({
          id: child.id,
          label: `${category.name} › ${child.name}`,
        }))
      : [{ id: category.id, label: category.name }],
  );

  if (state.outcome) {
    const published = state.outcome.status === 'PUBLISHED';
    return (
      <div className="form-card">
        <div className={`alert ${published ? 'alert--success' : 'alert--info'}`}>
          {published ? labels.successPublished : labels.successPending}
        </div>

        <PhotoUploader
          listingId={state.outcome.id}
          label={labels.photos}
          hint={labels.photosHint}
        />

        <div style={{ display: 'grid', gap: 8, marginTop: 24 }}>
          {published ? (
            <Link href={`/ad/${state.outcome.slug}`} className="btn btn--primary btn--block">
              {labels.title}
            </Link>
          ) : null}
          <Link href="/dashboard" className="btn btn--outline btn--block">
            {labels.saveDraft}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="form-card" action={action}>
      <h1 style={{ marginTop: 0, fontSize: '1.375rem' }}>{labels.title}</h1>
      <p className="field__hint" style={{ marginBottom: 24 }}>
        {labels.subtitle}
      </p>

      {state.error ? (
        <div className="alert alert--error" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="title">{labels.fieldTitle}</label>
        <input
          id="title"
          name="title"
          type="text"
          required
          minLength={5}
          maxLength={160}
          autoFocus
        />
        <p className="field__hint">{labels.titleHint}</p>
      </div>

      <div className="field">
        <label htmlFor="categoryId">{labels.fieldCategory}</label>
        <select id="categoryId" name="categoryId" required defaultValue="">
          <option value="" disabled>
            —
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="description">{labels.fieldDescription}</label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          minLength={10}
          maxLength={5000}
        />
        <p className="field__hint">{labels.descriptionHint}</p>
      </div>

      <div className={`field${state.fieldErrors?.price ? ' field--error' : ''}`}>
        <label htmlFor="price">{labels.fieldPrice}</label>
        <input
          id="price"
          name="price"
          type="number"
          min="0"
          inputMode="numeric"
          disabled={isFree}
          placeholder="0"
        />
        {state.fieldErrors?.price ? (
          <p className="field__error">{state.fieldErrors.price}</p>
        ) : null}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input
            type="checkbox"
            name="isFree"
            style={{ width: 'auto', minHeight: 'auto' }}
            onChange={(event) => setIsFree(event.target.checked)}
          />
          {labels.priceFree}
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" name="isNegotiable" style={{ width: 'auto', minHeight: 'auto' }} />
          {labels.negotiable}
        </label>
      </div>

      <div className="field">
        <label htmlFor="condition">{labels.conditionLabel}</label>
        <select id="condition" name="condition" defaultValue="GOOD">
          <option value="NEW">New</option>
          <option value="LIKE_NEW">Like new</option>
          <option value="GOOD">Good</option>
          <option value="FAIR">Fair</option>
          <option value="FOR_PARTS">For parts</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="cityId">{labels.fieldCity}</label>
        <select id="cityId" name="cityId" required defaultValue={defaultCityId ?? ''}>
          <option value="" disabled>
            —
          </option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="contactPreference">{labels.contactPreference}</label>
        <select id="contactPreference" name="contactPreference" defaultValue="IN_APP_ONLY">
          {Object.entries(labels.contactOptions).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <PublishButton idle={labels.publish} busy={labels.publishing} />

      <button
        type="submit"
        name="saveAsDraft"
        value="true"
        className="btn btn--ghost btn--block"
        style={{ marginTop: 8 }}
      >
        {labels.saveDraft}
      </button>
    </form>
  );
}
