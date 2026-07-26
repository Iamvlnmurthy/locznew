'use client';

import Link from 'next/link';
import { useActionState, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import type { Category, City } from '@locz/shared-types';
import { CityCombobox } from '@/components/city-combobox';
import { Icon } from '@/components/icons';
import { updateBusinessAction, type BusinessUpdateState } from '../../actions';

interface BusinessHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export interface ManagedBusiness {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  verificationStatus: string;
  description: string | null;
  addressLine: string | null;
  primaryPhone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  website: string | null;
  hours: BusinessHour[];
  listingCount: number;
  viewCount: number;
  isOwner: boolean;
}

const PROFILE_FIELDS = [
  'name',
  'categoryId',
  'cityId',
  'description',
  'addressLine',
  'primaryPhone',
];

function SaveButton({ labels: m }: { labels: Record<string, string> }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? (
        <>
          <Icon name="clock" /> {m.saving}
        </>
      ) : (
        <>
          {m.saveProfile} <Icon name="check" />
        </>
      )}
    </button>
  );
}

export function BusinessManageForm({
  business,
  categories,
  cities,
  labels: m,
}: {
  business: ManagedBusiness;
  categories: Category[];
  cities: City[];
  labels: Record<string, string>;
}) {
  const days = [m.sunday, m.monday, m.tuesday, m.wednesday, m.thursday, m.friday, m.saturday];
  const boundAction = updateBusinessAction.bind(null, business.id, business.slug);
  const [state, action] = useActionState<BusinessUpdateState, FormData>(boundAction, {});
  const [completion, setCompletion] = useState(() => initialCompletion(business));
  const categoryOptions = categories.flatMap((category) =>
    category.children?.length ? category.children : [category],
  );
  const selectedCategory = categoryOptions.find(
    (category) => category.name === business.categoryName,
  );
  const selectedCity = cities.find((city) => city.name === business.cityName);

  function updateCompletion(event: FormEvent<HTMLFormElement>): void {
    const form = new FormData(event.currentTarget);
    const completed = PROFILE_FIELDS.filter((field) => String(form.get(field) ?? '').trim()).length;
    setCompletion(Math.round((completed / PROFILE_FIELDS.length) * 100));
  }

  return (
    <div className="business-manager">
      <header className="business-manager-hero">
        <div className="container business-manager-hero__inner">
          <div>
            <Link href="/dashboard?tab=businesses" className="business-manager-back">
              <Icon name="chevronLeft" /> {m.myBusinesses}
            </Link>
            <span className="section-kicker">{m.workspace}</span>
            <h1>{business.name}</h1>
            <p>{m.workspaceBody}</p>
          </div>
          <div className="business-manager-hero__actions">
            <span
              className={`business-manager-status is-${business.verificationStatus.toLowerCase()}`}
            >
              <Icon name="shield" /> {verificationLabel(business.verificationStatus, m)}
            </span>
            <Link href={`/b/${business.slug}`} className="btn btn--outline">
              {m.viewProfile} <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </header>

      <div className="container business-manager-layout">
        <aside className="business-manager-summary">
          <span className="business-manager-summary__logo">
            {business.name.slice(0, 1).toUpperCase()}
          </span>
          <h2>{business.name}</h2>
          <p>
            {business.categoryName} · {business.cityName}
          </p>
          <div className="business-manager-completion">
            <span>
              <strong>{completion}%</strong> {m.profileComplete}
            </span>
            <i>
              <span style={{ width: `${completion}%` }} />
            </i>
            <small>{completion === 100 ? m.essentialsCovered : m.addEssentials}</small>
          </div>
          <dl>
            <div>
              <dt>{m.liveListings}</dt>
              <dd>{business.listingCount}</dd>
            </div>
            <div>
              <dt>{m.profileViews}</dt>
              <dd>{business.viewCount.toLocaleString('en-IN')}</dd>
            </div>
          </dl>
          <Link href="/post" className="btn btn--outline">
            <Icon name="plus" /> {m.postFromBusiness}
          </Link>
        </aside>

        <form className="business-manager-form" action={action} onInput={updateCompletion}>
          {state.ok ? (
            <div className="business-manager-saved" role="status">
              <Icon name="check" />
              <span>
                <strong>{m.changesSaved}</strong>
                {m.profileUpdated}
              </span>
              <Link href={`/b/${business.slug}`}>{m.seeProfile}</Link>
            </div>
          ) : null}
          {state.error ? (
            <div className="alert alert--error" role="alert">
              {state.error}
            </div>
          ) : null}

          <section>
            <header>
              <span>
                <Icon name="store" />
              </span>
              <div>
                <h2>{m.essentials}</h2>
                <p>{m.essentialsBody}</p>
              </div>
            </header>
            <div className="business-manager-grid">
              <label className={state.fieldErrors?.name ? 'field--error' : ''}>
                <span>{m.businessName}</span>
                <input name="name" defaultValue={business.name} maxLength={180} required />
                {state.fieldErrors?.name ? <small>{state.fieldErrors.name}</small> : null}
              </label>
              <label className={state.fieldErrors?.categoryId ? 'field--error' : ''}>
                <span>{m.category}</span>
                <select name="categoryId" defaultValue={selectedCategory?.id ?? ''} required>
                  <option value="">{m.chooseCategory}</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {state.fieldErrors?.categoryId ? (
                  <small>{state.fieldErrors.categoryId}</small>
                ) : null}
              </label>
            </div>
          </section>

          <section>
            <header>
              <span>
                <Icon name="location" />
              </span>
              <div>
                <h2>{m.placeStory}</h2>
                <p>{m.placeStoryBody}</p>
              </div>
            </header>
            <div className="business-manager-grid">
              <label className={state.fieldErrors?.cityId ? 'field--error' : ''}>
                <span>{m.city}</span>
                <CityCombobox
                  id="business-manage-city"
                  cities={cities}
                  defaultValue={selectedCity?.id}
                  defaultLabel={business.cityName}
                  placeholder={m.searchCity}
                  noResultsLabel={m.noCityMatches}
                  required
                />
                {state.fieldErrors?.cityId ? <small>{state.fieldErrors.cityId}</small> : null}
              </label>
              <label>
                <span>{m.address}</span>
                <input
                  name="addressLine"
                  defaultValue={business.addressLine ?? ''}
                  maxLength={200}
                  placeholder={m.addressPlaceholder}
                />
              </label>
              <label className="business-manager-grid__wide">
                <span>{m.description}</span>
                <textarea
                  name="description"
                  defaultValue={business.description ?? ''}
                  maxLength={2000}
                  rows={5}
                  placeholder={m.descriptionPlaceholder}
                />
              </label>
            </div>
          </section>

          <section>
            <header>
              <span>
                <Icon name="phone" />
              </span>
              <div>
                <h2>{m.contactDetails}</h2>
                <p>{m.contactDetailsBody}</p>
              </div>
            </header>
            <div className="business-manager-grid">
              <ContactField
                label={m.businessPhone}
                name="primaryPhone"
                value={nationalPhone(business.primaryPhone)}
                error={state.fieldErrors?.primaryPhone}
                type="tel"
              />
              <ContactField
                label="WhatsApp"
                name="whatsappNumber"
                value={nationalPhone(business.whatsappNumber)}
                error={state.fieldErrors?.whatsappNumber}
                type="tel"
              />
              <ContactField
                label={m.businessEmail}
                name="email"
                value={business.email ?? ''}
                error={state.fieldErrors?.email}
                type="email"
              />
              <ContactField
                label={m.website}
                name="website"
                value={business.website ?? ''}
                error={state.fieldErrors?.website}
                type="url"
              />
            </div>
          </section>

          <section>
            <header>
              <span>
                <Icon name="clock" />
              </span>
              <div>
                <h2>{m.openingHours}</h2>
                <p>{m.openingHoursBody}</p>
              </div>
            </header>
            <div className="business-hours-editor">
              {days.map((day, dayOfWeek) => {
                const hours = business.hours.find((item) => item.dayOfWeek === dayOfWeek);
                return (
                  <div key={day}>
                    <strong>{day}</strong>
                    <label>
                      <input
                        type="checkbox"
                        name={`closed-${dayOfWeek}`}
                        defaultChecked={hours?.isClosed}
                      />
                      {m.closed}
                    </label>
                    <input
                      type="time"
                      name={`opens-${dayOfWeek}`}
                      defaultValue={hours?.opensAt ?? '09:00'}
                      aria-label={m.openingTime.replace('{day}', day)}
                    />
                    <span>{m.to}</span>
                    <input
                      type="time"
                      name={`closes-${dayOfWeek}`}
                      defaultValue={hours?.closesAt ?? '18:00'}
                      aria-label={m.closingTime.replace('{day}', day)}
                    />
                  </div>
                );
              })}
            </div>
            {state.fieldErrors?.hours ? (
              <p className="business-manager-hours-error" role="alert">
                {state.fieldErrors.hours}
              </p>
            ) : null}
          </section>

          <footer className="business-manager-form__footer">
            <span>
              <Icon name="shield" /> {m.reverifyNote}
            </span>
            <SaveButton labels={m} />
          </footer>
        </form>
      </div>
    </div>
  );
}

function ContactField({
  label,
  name,
  value,
  error,
  type,
}: {
  label: string;
  name: string;
  value: string;
  error?: string;
  type: 'tel' | 'email' | 'url';
}) {
  return (
    <label className={error ? 'field--error' : ''}>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        inputMode={type === 'tel' ? 'numeric' : undefined}
        maxLength={type === 'tel' ? 10 : 255}
      />
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function initialCompletion(business: ManagedBusiness): number {
  const completed = [
    business.name,
    business.categoryName,
    business.cityName,
    business.description,
    business.addressLine,
    business.primaryPhone,
  ].filter(Boolean).length;
  return Math.round((completed / PROFILE_FIELDS.length) * 100);
}

function nationalPhone(value: string | null): string {
  return value?.replace(/^\+91/, '') ?? '';
}

function verificationLabel(status: string, labels: Record<string, string>): string {
  if (status === 'VERIFIED') return labels.verifiedBusiness;
  if (status === 'PENDING') return labels.verificationPending;
  return labels.notVerified;
}
