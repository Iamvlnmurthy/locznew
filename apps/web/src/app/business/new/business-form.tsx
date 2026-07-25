'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Category, City } from '@locz/shared-types';
import { createBusinessAction, type BusinessFormState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      {pending ? 'Creating…' : 'Create free business profile'}
    </button>
  );
}

/**
 * Business registration.
 *
 * Only four things are required — name, category, city and nothing else — because every
 * extra required field at this step is a business that never finishes registering. The
 * rest can be filled in afterwards from the dashboard.
 */
export function BusinessForm({
  categories,
  cities,
  defaultCityId,
}: {
  categories: Category[];
  cities: City[];
  defaultCityId?: string;
}) {
  const [state, action] = useActionState<BusinessFormState, FormData>(createBusinessAction, {});

  // Categories usable for a business listing, flattened to leaves.
  const options = categories
    .filter((category) => category.listingTypes.includes('BUSINESS_LISTING'))
    .flatMap((category) =>
      category.children && category.children.length > 0
        ? category.children.map((child) => ({
            id: child.id,
            label: `${category.name} › ${child.name}`,
          }))
        : [{ id: category.id, label: category.name }],
    );

  if (state.created) {
    return (
      <div className="form-card">
        <div className="alert alert--success">
          Your business profile is live. You can post offers and jobs from it straight away.
        </div>

        <p className="field__hint" style={{ marginBottom: 24 }}>
          Verification is reviewed separately — a verified badge is granted by our team, not
          requested. Adding your address, opening hours and photos makes that review quicker.
        </p>

        <div style={{ display: 'grid', gap: 8 }}>
          <Link href={`/b/${state.created.slug}`} className="btn btn--primary btn--block">
            View your profile
          </Link>
          <Link href="/post?type=OFFER" className="btn btn--outline btn--block">
            Post your first offer
          </Link>
          <Link href="/post?type=JOB" className="btn btn--outline btn--block">
            Post a job
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="form-card" action={action}>
      <h1 style={{ marginTop: 0, fontSize: '1.375rem' }}>List your business</h1>
      <p className="field__hint" style={{ marginBottom: 24 }}>
        Free, and live immediately. Customers nearby can find you, and you can post offers and job
        vacancies from your profile.
      </p>

      {state.error ? (
        <div className="alert alert--error" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className={`field${state.fieldErrors?.name ? ' field--error' : ''}`}>
        <label htmlFor="name">Business name</label>
        <input id="name" name="name" type="text" required maxLength={180} autoFocus />
        {state.fieldErrors?.name ? <p className="field__error">{state.fieldErrors.name}</p> : null}
      </div>

      <div className={`field${state.fieldErrors?.categoryId ? ' field--error' : ''}`}>
        <label htmlFor="categoryId">What kind of business?</label>
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
        {state.fieldErrors?.categoryId ? (
          <p className="field__error">{state.fieldErrors.categoryId}</p>
        ) : null}
      </div>

      <div className={`field${state.fieldErrors?.cityId ? ' field--error' : ''}`}>
        <label htmlFor="cityId">City</label>
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

      <div className="field">
        <label htmlFor="description">What do you do? (optional)</label>
        <textarea id="description" name="description" rows={4} maxLength={2000} />
      </div>

      <div className="field">
        <label htmlFor="addressLine">Address (optional)</label>
        <input
          id="addressLine"
          name="addressLine"
          type="text"
          maxLength={200}
          placeholder="Shop 12, Road No 36, Jubilee Hills"
        />
      </div>

      <div className={`field${state.fieldErrors?.primaryPhone ? ' field--error' : ''}`}>
        <label htmlFor="primaryPhone">Business phone (optional)</label>
        <input
          id="primaryPhone"
          name="primaryPhone"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          placeholder="9876543210"
        />
        {state.fieldErrors?.primaryPhone ? (
          <p className="field__error">{state.fieldErrors.primaryPhone}</p>
        ) : (
          // Unlike a personal ad, a business number is meant to be public — but that is
          // still the owner's choice to make knowingly.
          <p className="field__hint">Shown publicly on your business profile.</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="whatsappNumber">WhatsApp (optional)</label>
        <input
          id="whatsappNumber"
          name="whatsappNumber"
          type="tel"
          inputMode="numeric"
          maxLength={10}
        />
      </div>

      <div className="field">
        <label htmlFor="website">Website (optional)</label>
        <input id="website" name="website" type="url" placeholder="https://example.com" />
      </div>

      <SubmitButton />
    </form>
  );
}
