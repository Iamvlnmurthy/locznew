'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Category, City, ListingType } from '@locz/shared-types';
import { createListingAction, type PostAdState } from './actions';
import { ListingTypeFields } from './listing-type-fields';
import { PhotoUploader } from './photo-uploader';
import { CityCombobox } from '@/components/city-combobox';
import { Icon } from '@/components/icons';

interface Labels {
  title: string;
  subtitle: string;
  fieldTitle: string;
  titleHint: string;
  fieldDescription: string;
  descriptionHint: string;
  fieldCity: string;
  citySearch: string;
  noCityMatches: string;
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
  wizard: Record<string, string>;
  detailFields: Record<string, string>;
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
    <button type="submit" className="btn btn--primary post-actions__publish" disabled={pending}>
      {pending ? busy : idle} {!pending ? <Icon name="arrow" /> : null}
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
  defaultCityLabel,
  defaultPincode,
  defaultType,
  labels,
}: {
  categories: Category[];
  cities: City[];
  defaultCityId?: string;
  defaultCityLabel?: string;
  defaultPincode?: string;
  defaultType?: ListingType;
  labels: Labels;
}) {
  const [state, action] = useActionState<PostAdState, FormData>(createListingAction, {});
  const [type, setType] = useState<ListingType>(defaultType ?? 'PRODUCT');
  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const w = labels.wizard;

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

  const selectedCategory =
    categoryOptions.find((option) => option.id === categoryId)?.label ?? 'Choose a category';

  useEffect(() => {
    const errors = state.fieldErrors;
    if (!errors) return;

    const errorStep =
      errors.categoryId || errors.type
        ? 1
        : errors.title ||
            errors.description ||
            Object.keys(errors).some((key) =>
              [
                'price',
                'companyName',
                'salaryMax',
                'offerPrice',
                'serviceType',
                'rentAmount',
                'startsAt',
                'budgetMax',
              ].includes(key),
            )
          ? 2
          : 3;
    queueMicrotask(() => setStep(errorStep));
  }, [state.fieldErrors]);

  function moveTo(nextStep: number) {
    if (nextStep > step) {
      const activePanel = formRef.current?.querySelector<HTMLElement>(
        `.post-step[data-step="${step}"]`,
      );
      const controls = Array.from(
        activePanel?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input, select, textarea',
        ) ?? [],
      );
      const invalid = controls.find((control) => !control.checkValidity());
      if (invalid) {
        invalid.reportValidity();
        return;
      }
    }

    setStep(nextStep);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (state.outcome) {
    const published = state.outcome.status === 'PUBLISHED';

    return (
      <div className="post-success">
        <div className="post-success__mark">
          <Icon name={published ? 'check' : 'shield'} />
        </div>
        <span className="section-kicker">
          {published ? w.successLiveKicker : w.successReviewKicker}
        </span>
        <h1>{published ? w.successLiveTitle : w.successReviewTitle}</h1>
        <p>{published ? labels.successPublished : labels.successPending}</p>

        <div className="post-success__upload">
          <div className="post-success__upload-copy">
            <span>{w.finalTouch}</span>
            <h2>{w.addBestPhotos}</h2>
            <p>{w.photoAdvice}</p>
          </div>
          <PhotoUploader
            listingId={state.outcome.id}
            label={labels.photos}
            hint={labels.photosHint}
            labels={{
              choosePhotos: w.choosePhotos,
              formats: w.photoFormats,
              preparing: w.preparingPhoto,
              ready: w.photoReady,
              remove: w.removePhoto,
              processError: w.processImageError,
              uploadFailed: w.uploadFailed,
              networkError: w.networkError,
            }}
          />
        </div>

        <div className="post-success__actions">
          {published ? (
            <Link href={`/ad/${state.outcome.slug}`} className="btn btn--primary">
              {w.viewAd} <Icon name="arrow" />
            </Link>
          ) : null}
          <Link href="/dashboard" className="btn btn--outline">
            {w.myAds}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="post-experience">
      <header className="post-form__intro">
        <span className="post-form__free">
          <Icon name="plus" /> {w.freeToPost}
        </span>
        <h1>{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </header>

      <div className="post-layout">
        <form ref={formRef} className="post-card" action={action}>
          <nav className="post-progress" aria-label={w.progressLabel}>
            {[
              [w.choose, w.chooseHint],
              [w.describe, w.describeHint],
              [w.review, w.reviewHint],
            ].map(([label, detail], index) => {
              const number = index + 1;
              return (
                <button
                  key={label}
                  type="button"
                  className={step === number ? 'is-active' : step > number ? 'is-complete' : ''}
                  aria-current={step === number ? 'step' : undefined}
                  disabled={number > step}
                  onClick={() => moveTo(number)}
                >
                  <span>{step > number ? <Icon name="check" /> : number}</span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </button>
              );
            })}
          </nav>

          {state.error ? (
            <div className="alert alert--error" role="alert">
              {state.error}
            </div>
          ) : null}

          <section className="post-step" data-step="1" hidden={step !== 1}>
            <div className="post-step__head">
              <span>{w.step1Label}</span>
              <h2>{w.step1Title}</h2>
              <p>{w.step1Hint}</p>
            </div>

            <fieldset className="post-type">
              <legend>{w.listingType}</legend>
              <div className="post-type__grid">
                {POSTABLE_TYPES.map((option) => (
                  <label key={option} className="post-type__option">
                    <input
                      type="radio"
                      name="type"
                      value={option}
                      checked={type === option}
                      onChange={(event) => {
                        setType(event.target.value as ListingType);
                        setCategoryId('');
                      }}
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

            <div className={`field${state.fieldErrors?.categoryId ? ' field--error' : ''}`}>
              <label htmlFor="categoryId">{labels.fieldCategory}</label>
              <select
                id="categoryId"
                name="categoryId"
                required
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="" disabled>
                  {w.categoryPlaceholder}
                </option>
                {categoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {categoryOptions.length === 0 ? (
                <p className="field__hint">{w.noCategories}</p>
              ) : null}
              {state.fieldErrors?.categoryId ? (
                <p className="field__error">{state.fieldErrors.categoryId}</p>
              ) : (
                <p className="field__hint">{w.categoryHint}</p>
              )}
            </div>

            <div className="post-actions post-actions--end">
              <button type="button" className="btn btn--primary" onClick={() => moveTo(2)}>
                {w.continue} <Icon name="arrow" />
              </button>
            </div>
          </section>

          <section className="post-step" data-step="2" hidden={step !== 2}>
            <div className="post-step__head">
              <span>{w.step2Label}</span>
              <h2>{w.step2Title}</h2>
              <p>{w.step2Hint}</p>
            </div>

            <div className={`field${state.fieldErrors?.title ? ' field--error' : ''}`}>
              <label htmlFor="title">{labels.fieldTitle}</label>
              <input
                id="title"
                name="title"
                type="text"
                required
                minLength={5}
                maxLength={160}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder={w.titlePlaceholder}
              />
              {state.fieldErrors?.title ? (
                <p className="field__error">{state.fieldErrors.title}</p>
              ) : (
                <p className="field__hint">{labels.titleHint}</p>
              )}
            </div>

            <div className={`field${state.fieldErrors?.description ? ' field--error' : ''}`}>
              <label htmlFor="description">{labels.fieldDescription}</label>
              <textarea
                id="description"
                name="description"
                rows={6}
                required
                minLength={10}
                maxLength={5000}
                placeholder={w.descriptionPlaceholder}
              />
              {state.fieldErrors?.description ? (
                <p className="field__error">{state.fieldErrors.description}</p>
              ) : (
                <p className="field__hint">{labels.descriptionHint}</p>
              )}
            </div>

            <div className="post-fields-divider">
              <span>{w.usefulDetails}</span>
            </div>
            <ListingTypeFields
              type={type}
              errors={state.fieldErrors}
              labels={labels.detailFields}
            />

            <div className="post-actions">
              <button type="button" className="btn btn--ghost" onClick={() => moveTo(1)}>
                {w.back}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => moveTo(3)}>
                {w.reviewDetails} <Icon name="arrow" />
              </button>
            </div>
          </section>

          <section className="post-step" data-step="3" hidden={step !== 3}>
            <div className="post-step__head">
              <span>{w.step3Label}</span>
              <h2>{w.step3Title}</h2>
              <p>{w.step3Hint}</p>
            </div>

            <div className="post-field-row">
              <div className={`field${state.fieldErrors?.cityId ? ' field--error' : ''}`}>
                <label htmlFor="cityId">{labels.fieldCity}</label>
                <CityCombobox
                  id="cityId"
                  cities={cities}
                  defaultValue={defaultCityId}
                  defaultLabel={defaultCityLabel}
                  placeholder={labels.citySearch}
                  noResultsLabel={labels.noCityMatches}
                  required
                />
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
                {state.fieldErrors?.pincodeCode ? (
                  <p className="field__error">{state.fieldErrors.pincodeCode}</p>
                ) : (
                  <p className="field__hint">{labels.fieldPincodeHint}</p>
                )}
              </div>
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
              <p className="field__hint">{w.contactPrivacy}</p>
            </div>

            <div className="post-review">
              <span className="post-review__icon">
                <Icon name={TYPE_ICONS[type] ?? 'box'} />
              </span>
              <div>
                <span>{w.readyToPublish}</span>
                <strong>{draftTitle || w.listingTitle}</strong>
                <small>
                  {labels.types[type]} · {selectedCategory}
                </small>
              </div>
              <span className="post-review__free">{w.free}</span>
            </div>

            <div className="post-photo-note">
              <Icon name="image" />
              <div>
                <strong>{w.photosNext}</strong>
                <span>
                  {PHOTOS_ESSENTIAL.includes(type) ? w.photosEssential : w.photosOptional}
                </span>
              </div>
            </div>

            <div className="post-actions">
              <button type="button" className="btn btn--ghost" onClick={() => moveTo(2)}>
                {w.back}
              </button>
              <div className="post-actions__finish">
                <button type="submit" name="saveAsDraft" value="true" className="btn btn--ghost">
                  {labels.saveDraft}
                </button>
                <PublishButton idle={labels.publish} busy={labels.publishing} />
              </div>
            </div>
          </section>
        </form>

        <aside className="post-guide">
          <div className="post-guide__card">
            <span className="post-guide__eyebrow">
              <Icon name="sparkles" /> {w.guideEyebrow}
            </span>
            <h2>{step === 1 ? w.guide1Title : step === 2 ? w.guide2Title : w.guide3Title}</h2>
            <p>{step === 1 ? w.guide1Body : step === 2 ? w.guide2Body : w.guide3Body}</p>
            <ul>
              <li>
                <Icon name="check" /> {w.guideMinutes}
              </li>
              <li>
                <Icon name="check" /> {w.guideNoFees}
              </li>
              <li>
                <Icon name="check" /> {w.guidePrivacy}
              </li>
            </ul>
          </div>
          <div className="post-guide__trust">
            <Icon name="shield" />
            <span>
              <strong>{w.trustTitle}</strong>
              {w.trustBody}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
