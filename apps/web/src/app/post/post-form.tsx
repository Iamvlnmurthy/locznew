'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Category, City, ListingType } from '@locz/shared-types';
import { createListingAction, type PostAdState } from './actions';
import { ListingTypeFields } from './listing-type-fields';
import { PhotoUploader } from './photo-uploader';
import { Icon } from '@/components/icons';

interface Labels {
  title: string;
  subtitle: string;
  fieldTitle: string;
  titleHint: string;
  fieldDescription: string;
  descriptionHint: string;
  fieldCity: string;
  fieldPincode: string;
  fieldPincodeHint: string;
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
  types: Record<string, string>;
}

/** What a person can post from the web flow. Business profiles go through /business. */
const POSTABLE_TYPES: ListingType[] = [
  'PRODUCT',
  'JOB',
  'OFFER',
  'SERVICE',
  'RENTAL',
  'BUYER_REQUIREMENT',
  'EVENT',
];

/** Photos are the whole listing for some types and merely helpful for others. */
const PHOTOS_ESSENTIAL: ListingType[] = ['PRODUCT', 'RENTAL'];

const TYPE_ICONS: Record<string, string> = {
  PRODUCT: 'box',
  JOB: 'briefcase',
  OFFER: 'tag',
  SERVICE: 'tools',
  RENTAL: 'homeCategory',
  BUYER_REQUIREMENT: 'search',
  EVENT: 'calendar',
};

function PublishButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

/**
 * One posting form for every listing type.
 *
 * The brief describes a ten-step wizard; this is a single scrollable screen with the
 * type chosen first. On a phone a wizard multiplies taps and abandonment for a form this
 * short — the steps survive as visual grouping. Photos are uploaded after creation
 * because the API scopes upload URLs to a listing id, which also means a dropped
 * connection mid-upload loses photos, never the ad itself.
 */
export function PostForm({
  categories,
  cities,
  defaultCityId,
  defaultPincode,
  defaultType,
  labels,
}: {
  categories: Category[];
  cities: City[];
  defaultCityId?: string;
  defaultPincode?: string;
  defaultType?: ListingType;
  labels: Labels;
}) {
  const [state, action] = useActionState<PostAdState, FormData>(createListingAction, {});
  const [type, setType] = useState<ListingType>(defaultType ?? 'PRODUCT');

  // Only categories configured for the chosen type, and only leaves — posting into
  // "Electronics" instead of "Mobile Phones" is the commonest miscategorisation.
  const categoryOptions = useMemo(() => {
    const usable = categories.filter((category) => category.listingTypes.includes(type));

    return usable.flatMap((category) =>
      category.children && category.children.length > 0
        ? category.children
            .filter((child) => child.listingTypes.includes(type))
            .map((child) => ({ id: child.id, label: `${category.name} › ${child.name}` }))
        : [{ id: category.id, label: category.name }],
    );
  }, [categories, type]);

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
              View your ad
            </Link>
          ) : null}
          <Link href="/dashboard" className="btn btn--outline btn--block">
            My ads
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="form-card post-form" action={action}>
      <div className="post-form__intro">
        <span className="post-form__free">
          <Icon name="plus" /> Free to post
        </span>
        <h1>{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </div>

      <div className="post-progress" aria-hidden="true">
        <span className="post-progress__active" />
        <span />
        <span />
      </div>

      {state.error ? (
        <div className="alert alert--error" role="alert">
          {state.error}
        </div>
      ) : null}

      {/* Type first: it determines the category list and every field below it, so asking
          anything else first would mean re-asking. */}
      <fieldset className="post-type">
        <legend>What are you posting?</legend>
        <div className="post-type__grid">
          {POSTABLE_TYPES.map((option) => (
            <label key={option} className="post-type__option">
              <input
                type="radio"
                name="type"
                value={option}
                checked={type === option}
                onChange={(event) => setType(event.target.value as ListingType)}
              />
              <span className="post-type__icon">
                <Icon name={TYPE_ICONS[option] ?? 'box'} />
              </span>
              <span>{labels.types[option] ?? option}</span>
              <i aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`field${state.fieldErrors?.title ? ' field--error' : ''}`}>
        <label htmlFor="title">{labels.fieldTitle}</label>
        <input id="title" name="title" type="text" required minLength={5} maxLength={160} />
        {state.fieldErrors?.title ? (
          <p className="field__error">{state.fieldErrors.title}</p>
        ) : (
          <p className="field__hint">{labels.titleHint}</p>
        )}
      </div>

      <div className={`field${state.fieldErrors?.categoryId ? ' field--error' : ''}`}>
        <label htmlFor="categoryId">{labels.fieldCategory}</label>
        <select id="categoryId" name="categoryId" required defaultValue="">
          <option value="" disabled>
            —
          </option>
          {categoryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {categoryOptions.length === 0 ? (
          <p className="field__hint">No categories are configured for this type yet.</p>
        ) : null}
        {state.fieldErrors?.categoryId ? (
          <p className="field__error">{state.fieldErrors.categoryId}</p>
        ) : null}
      </div>

      <div className={`field${state.fieldErrors?.description ? ' field--error' : ''}`}>
        <label htmlFor="description">{labels.fieldDescription}</label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          minLength={10}
          maxLength={5000}
        />
        {state.fieldErrors?.description ? (
          <p className="field__error">{state.fieldErrors.description}</p>
        ) : (
          <p className="field__hint">{labels.descriptionHint}</p>
        )}
      </div>

      <ListingTypeFields type={type} errors={state.fieldErrors} />

      <div className={`field${state.fieldErrors?.cityId ? ' field--error' : ''}`}>
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
        {state.fieldErrors?.cityId ? (
          <p className="field__error">{state.fieldErrors.cityId}</p>
        ) : null}
      </div>

      <div className={`field${state.fieldErrors?.pincodeCode ? ' field--error' : ''}`}>
        <label htmlFor="pincodeCode">{labels.fieldPincode}</label>
        <input
          id="pincodeCode"
          name="pincodeCode"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          pattern="\d{6}"
          placeholder="500081"
          defaultValue={defaultPincode ?? ''}
        />
        <p className="field__hint">{labels.fieldPincodeHint}</p>
        {state.fieldErrors?.pincodeCode ? (
          <p className="field__error">{state.fieldErrors.pincodeCode}</p>
        ) : null}
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
        <p className="field__hint">Your number stays hidden unless you choose to show it.</p>
      </div>

      <p className="field__hint" style={{ marginBottom: 16 }}>
        {PHOTOS_ESSENTIAL.includes(type)
          ? 'Add photos on the next screen — listings with photos get far more replies.'
          : 'You can add photos on the next screen.'}
      </p>

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
