'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type {
  Category,
  CategoryAttribute,
  CategoryAttributeOption,
  City,
  ListingType,
} from '@locz/shared-types';
import type { Locale } from '@/i18n';
import { createListingAction, updateListingAction, type PostAdState } from './actions';
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
  editTitle: string;
  editSubtitle: string;
  saveChanges: string;
  savingChanges: string;
  updateSuccess: string;
  moderationWarning: string;
  removedCannotEdit: string;
  draftSaved: string;
  restoreTitle: string;
  restoreBody: string;
  restore: string;
  discard: string;
  preview: string;
  previewTitle: string;
  closePreview: string;
  attributes: Record<string, string>;
  wizard: Record<string, string>;
  detailFields: Record<string, string>;
  contactOptions: Record<string, string>;
  types: Record<string, string>;
}

export interface PostFormInitialListing {
  id: string;
  slug: string;
  status: string;
  type: ListingType;
  title: string;
  description: string;
  categoryId: string;
  cityId?: string;
  cityName: string;
  pincodeCode?: string | null;
  contactPreference: string;
  details?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

interface SavedPostProgress {
  version: 1;
  savedAt: number;
  step: number;
  fields: Record<string, string>;
}

const POST_PROGRESS_KEY = 'locz.post-progress.v1';

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

function translatedAttributeLabel(attribute: CategoryAttribute, locale: Locale): string {
  if (locale === 'te') return attribute.labelTe || attribute.label;
  if (locale === 'hi') return attribute.labelHi || attribute.label;
  return attribute.label;
}

function translatedOptionLabel(option: CategoryAttributeOption, locale: Locale): string {
  if (locale === 'te') return option.labelTe || option.label;
  if (locale === 'hi') return option.labelHi || option.label;
  return option.label;
}

function CategoryAttributeFields({
  attributes,
  values,
  locale,
  labels,
}: {
  attributes: CategoryAttribute[];
  values?: Record<string, unknown>;
  locale: Locale;
  labels: Record<string, string>;
}) {
  if (attributes.length === 0) return null;

  return (
    <section className="category-attributes" aria-labelledby="category-attributes-title">
      <div className="category-attributes__head">
        <h3 id="category-attributes-title">{labels.title}</h3>
        <p>{labels.hint}</p>
      </div>
      <div className="category-attributes__grid">
        {attributes.map((attribute) => {
          const id = `attribute-${attribute.key}`;
          const label = translatedAttributeLabel(attribute, locale);
          const savedValue = values?.[attribute.key];
          const scalarValue =
            savedValue === null || savedValue === undefined ? '' : String(savedValue);
          const common = {
            id,
            name: `attribute.${attribute.key}`,
            required: attribute.isRequired,
          };

          return (
            <div className="field" key={attribute.key}>
              <input type="hidden" name="attributeKey" value={attribute.key} />
              <input
                type="hidden"
                name={`attributeType.${attribute.key}`}
                value={attribute.dataType}
              />
              <label htmlFor={id}>
                {label}
                {attribute.isRequired ? <span aria-hidden="true"> *</span> : null}
                {attribute.unit ? <small> ({attribute.unit})</small> : null}
              </label>

              {attribute.dataType === 'SELECT' ? (
                <select {...common} defaultValue={scalarValue}>
                  <option value="">{labels.select}</option>
                  {(attribute.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {translatedOptionLabel(option, locale)}
                    </option>
                  ))}
                </select>
              ) : attribute.dataType === 'MULTI_SELECT' ? (
                <select
                  {...common}
                  multiple
                  defaultValue={
                    Array.isArray(savedValue)
                      ? savedValue.map(String)
                      : scalarValue
                        ? [scalarValue]
                        : []
                  }
                  size={Math.min(5, Math.max(3, attribute.options?.length ?? 3))}
                >
                  {(attribute.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {translatedOptionLabel(option, locale)}
                    </option>
                  ))}
                </select>
              ) : attribute.dataType === 'BOOLEAN' ? (
                <select {...common} defaultValue={scalarValue}>
                  <option value="">{labels.select}</option>
                  <option value="true">{labels.yes}</option>
                  <option value="false">{labels.no}</option>
                </select>
              ) : (
                <input
                  {...common}
                  type={
                    attribute.dataType === 'NUMBER'
                      ? 'number'
                      : attribute.dataType === 'DATE'
                        ? 'date'
                        : 'text'
                  }
                  inputMode={attribute.dataType === 'NUMBER' ? 'decimal' : undefined}
                  min={
                    attribute.dataType === 'NUMBER' ? (attribute.minValue ?? undefined) : undefined
                  }
                  max={
                    attribute.dataType === 'NUMBER' ? (attribute.maxValue ?? undefined) : undefined
                  }
                  step={attribute.dataType === 'NUMBER' ? 'any' : undefined}
                  defaultValue={
                    attribute.dataType === 'DATE' && scalarValue
                      ? scalarValue.slice(0, 10)
                      : scalarValue
                  }
                />
              )}
              {attribute.key === 'capacity' ? (
                <p className="field__hint">{labels.capacityHint}</p>
              ) : attribute.dataType === 'MULTI_SELECT' ? (
                <p className="field__hint">{labels.multipleHint}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PublishButton({
  idle,
  busy,
  disabled = false,
}: {
  idle: string;
  busy: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn--primary post-actions__publish"
      disabled={pending || disabled}
    >
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
  initialListing,
  locale,
  labels,
}: {
  categories: Category[];
  cities: City[];
  defaultCityId?: string;
  defaultCityLabel?: string;
  defaultPincode?: string;
  defaultType?: ListingType;
  initialListing?: PostFormInitialListing;
  locale: Locale;
  labels: Labels;
}) {
  const formAction = initialListing
    ? updateListingAction.bind(null, initialListing.id)
    : createListingAction;
  const [state, action] = useActionState<PostAdState, FormData>(formAction, {});
  const [type, setType] = useState<ListingType>(initialListing?.type ?? defaultType ?? 'PRODUCT');
  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState(initialListing?.categoryId ?? '');
  const [draftTitle, setDraftTitle] = useState(initialListing?.title ?? '');
  const [draftDescription, setDraftDescription] = useState(initialListing?.description ?? '');
  const [restoreCandidate, setRestoreCandidate] = useState<SavedPostProgress | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPrice, setPreviewPrice] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const w = labels.wizard;
  const isEdit = Boolean(initialListing);
  const isRemoved = initialListing?.status === 'REMOVED';

  // Only categories configured for the chosen type, and only leaves — posting into
  // "Electronics" instead of "Mobile Phones" is the commonest miscategorisation.
  const categoryOptions = useMemo(() => {
    const usable = categories.filter((category) => category.listingTypes.includes(type));

    function leaves(
      category: Category,
      parents: string[] = [],
    ): Array<{
      id: string;
      label: string;
      category: Category;
    }> {
      const translatedName =
        locale === 'te'
          ? category.nameTe || category.name
          : locale === 'hi'
            ? category.nameHi || category.name
            : category.name;
      const path = [...parents, translatedName];
      const children = (category.children ?? []).filter((child) =>
        child.listingTypes.includes(type),
      );
      return children.length
        ? children.flatMap((child) => leaves(child, path))
        : [{ id: category.id, label: path.join(' › '), category }];
    }

    return usable.flatMap((category) => leaves(category));
  }, [categories, locale, type]);

  const selectedCategory =
    categoryOptions.find((option) => option.id === categoryId)?.label ?? w.categoryPlaceholder;
  const selectedCategoryAttributes =
    categoryOptions.find((option) => option.id === categoryId)?.category.attributes ?? [];

  function applyUncontrolledFields(fields: Record<string, string>): void {
    const form = formRef.current;
    if (!form) return;

    for (const [name, value] of Object.entries(fields)) {
      const control = form.elements.namedItem(name);
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) continue;
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = value === 'true';
      } else if (!['type', 'categoryId', 'title', 'description'].includes(name)) {
        control.value = value;
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function applySavedFields(fields: Record<string, string>): void {
    if (fields.type) setType(fields.type as ListingType);
    if (fields.categoryId) setCategoryId(fields.categoryId);
    if (fields.title !== undefined) setDraftTitle(fields.title);
    if (fields.description !== undefined) setDraftDescription(fields.description);
    applyUncontrolledFields(fields);
  }

  useEffect(() => {
    if (initialListing?.details) {
      applyUncontrolledFields(
        Object.fromEntries(
          Object.entries(initialListing.details).map(([key, value]) => [
            key,
            value === null || value === undefined ? '' : String(value),
          ]),
        ),
      );
    }
    // Initial values must be applied once; repeating after controlled state changes would
    // overwrite the person's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialListing?.id]);

  useEffect(() => {
    if (isEdit) return;
    try {
      const raw = localStorage.getItem(POST_PROGRESS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedPostProgress;
      if (
        saved.version === 1 &&
        saved.fields &&
        (saved.fields.title?.trim() || saved.fields.description?.trim())
      ) {
        queueMicrotask(() => setRestoreCandidate(saved));
      }
    } catch {
      localStorage.removeItem(POST_PROGRESS_KEY);
    }
  }, [isEdit]);

  useEffect(() => {
    if (state.outcome && !isEdit) localStorage.removeItem(POST_PROGRESS_KEY);
  }, [isEdit, state.outcome]);

  function saveProgress(): void {
    if (isEdit || state.outcome) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const fields: Record<string, string> = {};
      for (const control of Array.from(form.elements)) {
        if (
          !(
            control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement ||
            control instanceof HTMLTextAreaElement
          ) ||
          !control.name ||
          control.type === 'file' ||
          control.type === 'submit'
        ) {
          continue;
        }
        fields[control.name] =
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? String(control.checked)
            : control.value;
      }
      localStorage.setItem(
        POST_PROGRESS_KEY,
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          step,
          fields,
        } satisfies SavedPostProgress),
      );
    }, 250);
  }

  function restoreProgress(): void {
    if (!restoreCandidate) return;
    setStep(Math.min(3, Math.max(1, restoreCandidate.step)));
    applySavedFields(restoreCandidate.fields);
    setRestoreCandidate(null);
  }

  function discardProgress(): void {
    localStorage.removeItem(POST_PROGRESS_KEY);
    setRestoreCandidate(null);
  }

  function openPreview(): void {
    const price = formRef.current?.elements.namedItem('price');
    const isFree = formRef.current?.elements.namedItem('isFree');
    const free = isFree instanceof HTMLInputElement && isFree.type === 'checkbox' && isFree.checked;
    setPreviewPrice(
      free ? w.free : price instanceof HTMLInputElement && price.value ? `₹${price.value}` : '',
    );
    setPreviewOpen(true);
  }

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
    const draft = state.outcome.status === 'DRAFT';

    return (
      <div className="post-success">
        <div className="post-success__mark">
          <Icon name={published ? 'check' : 'shield'} />
        </div>
        <span className="section-kicker">
          {published ? w.successLiveKicker : w.successReviewKicker}
        </span>
        <h1>
          {state.outcome.updated
            ? labels.updateSuccess
            : draft
              ? labels.draftSaved
              : published
                ? w.successLiveTitle
                : w.successReviewTitle}
        </h1>
        <p>
          {state.outcome.updated
            ? labels.updateSuccess
            : draft
              ? labels.draftSaved
              : published
                ? labels.successPublished
                : labels.successPending}
        </p>

        {!state.outcome.updated && !draft ? (
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
        ) : null}

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
        <h1>{isEdit ? labels.editTitle : labels.title}</h1>
        <p>{isEdit ? labels.editSubtitle : labels.subtitle}</p>
      </header>

      {restoreCandidate ? (
        <section className="post-restore" role="status">
          <div>
            <strong>{labels.restoreTitle}</strong>
            <p>{labels.restoreBody}</p>
          </div>
          <div>
            <button type="button" className="btn btn--primary" onClick={restoreProgress}>
              {labels.restore}
            </button>
            <button type="button" className="btn btn--ghost" onClick={discardProgress}>
              {labels.discard}
            </button>
          </div>
        </section>
      ) : null}

      <div className="post-layout">
        <form
          ref={formRef}
          className="post-card"
          action={action}
          onInput={saveProgress}
          onChange={saveProgress}
        >
          {initialListing ? (
            <>
              <input type="hidden" name="originalStatus" value={initialListing.status} />
              <input type="hidden" name="type" value={type} />
            </>
          ) : null}
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
          {isRemoved ? (
            <div className="alert alert--error" role="alert">
              {labels.removedCannotEdit}
            </div>
          ) : null}
          {initialListing?.status === 'PUBLISHED' ? (
            <div className="alert alert--info">
              <Icon name="shield" /> {labels.moderationWarning}
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
                      disabled={isEdit}
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
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
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
            <CategoryAttributeFields
              key={categoryId}
              attributes={selectedCategoryAttributes}
              values={
                initialListing?.categoryId === categoryId ? initialListing.attributes : undefined
              }
              locale={locale}
              labels={labels.attributes}
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
                  defaultValue={initialListing?.cityId ?? defaultCityId}
                  defaultLabel={initialListing?.cityName ?? defaultCityLabel}
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
                  defaultValue={initialListing?.pincodeCode ?? defaultPincode ?? ''}
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
              <select
                id="contactPreference"
                name="contactPreference"
                defaultValue={initialListing?.contactPreference ?? 'IN_APP_ONLY'}
              >
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
                <button type="button" className="btn btn--outline" onClick={openPreview}>
                  <Icon name="image" /> {labels.preview}
                </button>
                {!isEdit || initialListing?.status === 'DRAFT' ? (
                  <button
                    type="submit"
                    name="saveAsDraft"
                    value="true"
                    className="btn btn--ghost"
                    disabled={isRemoved}
                  >
                    {labels.saveDraft}
                  </button>
                ) : null}
                <PublishButton
                  idle={isEdit ? labels.saveChanges : labels.publish}
                  busy={isEdit ? labels.savingChanges : labels.publishing}
                  disabled={isRemoved}
                />
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

      {previewOpen ? (
        <div
          className="post-preview-backdrop"
          role="presentation"
          onMouseDown={() => setPreviewOpen(false)}
        >
          <section
            className="post-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-preview-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="post-preview__close"
              onClick={() => setPreviewOpen(false)}
              aria-label={labels.closePreview}
            >
              ×
            </button>
            <span className="section-kicker">{labels.previewTitle}</span>
            <div className="post-preview__image">
              <Icon name="image" />
            </div>
            {previewPrice ? <strong className="post-preview__price">{previewPrice}</strong> : null}
            <h2 id="post-preview-title">{draftTitle || w.listingTitle}</h2>
            <p>{draftDescription || labels.descriptionHint}</p>
            <div className="post-preview__meta">
              <span>
                <Icon name="location" />{' '}
                {initialListing?.cityName ?? defaultCityLabel ?? labels.fieldCity}
              </span>
              <span>
                <Icon name="tag" /> {selectedCategory}
              </span>
            </div>
            <div className="alert alert--info">
              <Icon name="shield" /> {w.contactPrivacy}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
