'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Category, City } from '@locz/shared-types';
import { CityCombobox } from '@/components/city-combobox';
import { categoryIconName, Icon } from '@/components/icons';
import { createBusinessAction, type BusinessFormState } from '../actions';

interface BusinessOption {
  id: string;
  label: string;
  iconKey: string | null;
}

interface BusinessDraft {
  name: string;
  businessType: string;
  categoryId: string;
  cityId: string;
  description: string;
  addressLine: string;
  primaryPhone: string;
  whatsappNumber: string;
  email: string;
  website: string;
}

const INITIAL_DRAFT: BusinessDraft = {
  name: '',
  businessType: 'RETAIL_STORE',
  categoryId: '',
  cityId: '',
  description: '',
  addressLine: '',
  primaryPhone: '',
  whatsappNumber: '',
  email: '',
  website: '',
};

function SubmitButton({ labels: l }: { labels: Record<string, string> }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary business-actions__submit" disabled={pending}>
      {pending ? (
        <>
          <Icon name="sparkles" /> {l.creating}
        </>
      ) : (
        <>
          {l.createProfile} <Icon name="arrow" />
        </>
      )}
    </button>
  );
}

export function BusinessForm({
  categories,
  cities,
  defaultCityId,
  defaultCityLabel,
  userId,
  labels,
}: {
  categories: Category[];
  cities: City[];
  defaultCityId?: string;
  defaultCityLabel?: string;
  userId: string;
  labels: Record<string, string>;
}) {
  const l = labels;
  const [state, action] = useActionState<BusinessFormState, FormData>(createBusinessAction, {});
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState('');
  const [draft, setDraft] = useState<BusinessDraft>({
    ...INITIAL_DRAFT,
    cityId: defaultCityId ?? '',
  });
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const draftKey = `locz-business-draft:${userId}`;

  const options: BusinessOption[] = categories
    .filter((category) => category.listingTypes.includes('BUSINESS_LISTING'))
    .flatMap((category) =>
      category.children && category.children.length > 0
        ? category.children.map((child) => ({
            id: child.id,
            label: child.name,
            iconKey: child.iconKey ?? category.iconKey,
          }))
        : [{ id: category.id, label: category.name, iconKey: category.iconKey }],
    );

  useEffect(() => {
    if (!state.fieldErrors) return;
    const errorStep =
      state.fieldErrors.name || state.fieldErrors.categoryId ? 1 : state.fieldErrors.cityId ? 2 : 3;
    queueMicrotask(() => setStep(errorStep));
  }, [state.fieldErrors]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) {
        const recovered = JSON.parse(saved) as Partial<BusinessDraft>;
        queueMicrotask(() => {
          setDraft({ ...INITIAL_DRAFT, cityId: defaultCityId ?? '', ...recovered });
          setDraftSaved(true);
        });
      }
    } catch {
      window.localStorage.removeItem(draftKey);
    } finally {
      queueMicrotask(() => setDraftReady(true));
    }
  }, [defaultCityId, draftKey]);

  useEffect(() => {
    if (!draftReady || state.created) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
      setDraftSaved(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft, draftKey, draftReady, state.created]);

  useEffect(() => {
    if (state.created) window.localStorage.removeItem(draftKey);
  }, [draftKey, state.created]);

  const selectedCategory = options.find((option) => option.id === draft.categoryId);
  const selectedCity = cities.find((city) => city.id === draft.cityId);

  function updateDraft(field: keyof BusinessDraft, value: string): void {
    setDraft((current) => ({ ...current, [field]: value }));
    setDraftSaved(false);
    setStepError('');
  }

  function nextStep(): void {
    if (step === 1 && draft.name.trim().length < 2) {
      setStepError(l.nameRequired);
      return;
    }
    if (step === 1 && !draft.categoryId) {
      setStepError(l.categoryRequired);
      return;
    }
    if (step === 2 && !draft.cityId) {
      setStepError(l.cityRequired);
      return;
    }
    setStep((current) => Math.min(3, current + 1));
    setStepError('');
    window.scrollTo({ top: 300, behavior: 'smooth' });
  }

  if (state.created) {
    return (
      <div className="container business-success">
        <div className="business-success__confetti" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="business-success__mark">
          <Icon name="check" />
        </span>
        <span className="section-kicker">{l.successKicker}</span>
        <h1>{l.successTitle.replace('{name}', draft.name || l.yourBusiness)}</h1>
        <p>{l.successBody}</p>
        <div className="business-success__next">
          <Link href={`/b/${state.created.slug}`} className="btn btn--primary">
            {l.viewProfile} <Icon name="arrow" />
          </Link>
          <Link href="/post?type=OFFER" className="btn btn--outline">
            <Icon name="tag" /> {l.postOffer}
          </Link>
          <Link href="/post?type=JOB" className="btn btn--outline">
            <Icon name="briefcase" /> {l.postJob}
          </Link>
          <Link href={`/business/manage/${state.created.id}`} className="btn btn--outline">
            <Icon name="tools" /> {l.completeDetails}
          </Link>
        </div>
        <div className="business-success__tip">
          <Icon name="shield" />
          <span>
            <strong>{l.buildTrust}</strong>
            {l.buildTrustBody}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="business-onboarding">
      <section className="business-hero">
        <div className="container business-hero__inner">
          <div>
            <span className="section-kicker">{l.heroKicker}</span>
            <h1>
              {l.heroTitle1}
              <br />
              {l.heroTitle2}
            </h1>
            <p>{l.heroBody}</p>
            <div className="business-hero__proof">
              <span>
                <Icon name="check" /> {l.liveImmediately}
              </span>
              <span>
                <Icon name="check" /> {l.noCommission}
              </span>
              <span>
                <Icon name="check" /> {l.threeMinutes}
              </span>
            </div>
          </div>
          <div className="business-hero__art" aria-hidden="true">
            <span className="business-hero__store">
              <Icon name="store" />
            </span>
            <span className="business-hero__pin">
              <Icon name="location" />
            </span>
            <span className="business-hero__message">
              <Icon name="message" />
            </span>
            <i>OPEN</i>
          </div>
        </div>
      </section>

      <div className="container business-layout">
        <form className="business-form" action={action}>
          <div className="business-draft-status" role="status">
            <Icon name={draftSaved ? 'check' : 'clock'} />
            {draftSaved ? l.draftSaved : l.autoSave}
          </div>
          <nav className="business-progress" aria-label={l.progressLabel}>
            {[
              { number: 1, label: l.progressBusiness, note: l.progressBusinessNote },
              { number: 2, label: l.progressPlace, note: l.progressPlaceNote },
              { number: 3, label: l.progressContact, note: l.progressContactNote },
            ].map((item) => (
              <button
                key={item.number}
                type="button"
                className={
                  step === item.number ? 'is-active' : step > item.number ? 'is-complete' : ''
                }
                disabled={item.number > step}
                onClick={() => setStep(item.number)}
              >
                <span>{step > item.number ? <Icon name="check" /> : item.number}</span>
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </nav>

          {state.error ? (
            <div className="alert alert--error" role="alert">
              {state.error}
            </div>
          ) : null}
          {stepError ? (
            <div className="business-step-error" role="alert">
              <Icon name="shield" /> {stepError}
            </div>
          ) : null}

          <section className="business-step" hidden={step !== 1}>
            <header>
              <span>{l.step1}</span>
              <h2>{l.step1Title}</h2>
              <p>{l.step1Body}</p>
            </header>

            <div
              className={`field business-name-field${state.fieldErrors?.name ? ' field--error' : ''}`}
            >
              <label htmlFor="business-name">{l.businessName}</label>
              <input
                id="business-name"
                name="name"
                type="text"
                required
                maxLength={180}
                autoFocus
                value={draft.name}
                onChange={(event) => updateDraft('name', event.target.value)}
                placeholder={l.businessNamePlaceholder}
              />
              <p className="field__hint">{l.businessNameHint}</p>
              {state.fieldErrors?.name ? (
                <p className="field__error">{state.fieldErrors.name}</p>
              ) : null}
            </div>

            <fieldset className="business-category">
              <legend>{l.businessType}</legend>
              <p className="field__hint">{l.businessTypeHint}</p>
              <div className="business-category__quick">
                {[
                  ['RETAIL_STORE', l.typeRetail, 'store'],
                  ['HOME_BUSINESS', l.typeHome, 'home'],
                  ['SERVICE_PROVIDER', l.typeService, 'tools'],
                  ['PROFESSIONAL', l.typeProfessional, 'briefcase'],
                ].map(([value, label, icon]) => (
                  <button
                    key={value}
                    type="button"
                    className={draft.businessType === value ? 'is-selected' : ''}
                    onClick={() => updateDraft('businessType', value)}
                  >
                    <span>
                      <Icon name={icon} />
                    </span>
                    {label}
                    <i>
                      <Icon name="check" />
                    </i>
                  </button>
                ))}
              </div>
              <input type="hidden" name="businessType" value={draft.businessType} />
            </fieldset>

            <fieldset
              className={`business-category${state.fieldErrors?.categoryId ? ' field--error' : ''}`}
            >
              <legend>{l.businessKind}</legend>
              <div className="business-category__quick">
                {options.slice(0, 6).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={draft.categoryId === option.id ? 'is-selected' : ''}
                    onClick={() => updateDraft('categoryId', option.id)}
                  >
                    <span>
                      <Icon name={categoryIconName(option.iconKey)} />
                    </span>
                    {option.label}
                    <i>
                      <Icon name="check" />
                    </i>
                  </button>
                ))}
              </div>
              <label htmlFor="business-category">{l.allCategories}</label>
              <select
                id="business-category"
                name="categoryId"
                required
                value={draft.categoryId}
                onChange={(event) => updateDraft('categoryId', event.target.value)}
              >
                <option value="">{l.selectCategory}</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.categoryId ? (
                <p className="field__error">{state.fieldErrors.categoryId}</p>
              ) : null}
            </fieldset>

            <div className="business-actions business-actions--end">
              <button type="button" className="btn btn--primary" onClick={nextStep}>
                {l.continue} <Icon name="arrow" />
              </button>
            </div>
          </section>

          <section className="business-step" hidden={step !== 2}>
            <header>
              <span>{l.step2}</span>
              <h2>{l.step2Title}</h2>
              <p>{l.step2Body}</p>
            </header>

            <div className={`field${state.fieldErrors?.cityId ? ' field--error' : ''}`}>
              <label htmlFor="business-city">{l.city}</label>
              <CityCombobox
                key={draftReady ? 'draft-ready' : 'draft-loading'}
                id="business-city"
                cities={cities}
                defaultValue={draft.cityId}
                defaultLabel={defaultCityLabel}
                onValueChange={(cityId) => updateDraft('cityId', cityId)}
                placeholder={l.searchCity}
                noResultsLabel={l.noCityMatches}
                required
              />
              {state.fieldErrors?.cityId ? (
                <p className="field__error">{state.fieldErrors.cityId}</p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="business-address">
                {l.businessAddress} <span>{l.optional}</span>
              </label>
              <div className="business-input-icon">
                <Icon name="location" />
                <input
                  id="business-address"
                  name="addressLine"
                  type="text"
                  maxLength={200}
                  value={draft.addressLine}
                  onChange={(event) => updateDraft('addressLine', event.target.value)}
                  placeholder={l.addressPlaceholder}
                />
              </div>
              <p className="field__hint">{l.addressHint}</p>
            </div>

            <div className="field">
              <label htmlFor="business-description">
                {l.descriptionLabel} <span>{l.optional}</span>
              </label>
              <textarea
                id="business-description"
                name="description"
                rows={5}
                maxLength={2000}
                value={draft.description}
                onChange={(event) => updateDraft('description', event.target.value)}
                placeholder={l.descriptionPlaceholder}
              />
              <div className="business-character-count">
                <span>{l.descriptionHint}</span>
                <strong>{draft.description.length}/2,000</strong>
              </div>
            </div>

            <div className="business-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>
                <Icon name="arrow" /> {l.back}
              </button>
              <button type="button" className="btn btn--primary" onClick={nextStep}>
                {l.continue} <Icon name="arrow" />
              </button>
            </div>
          </section>

          <section className="business-step" hidden={step !== 3}>
            <header>
              <span>{l.step3}</span>
              <h2>{l.step3Title}</h2>
              <p>{l.step3Body}</p>
            </header>

            <div className="business-contact-grid">
              <div className={`field${state.fieldErrors?.primaryPhone ? ' field--error' : ''}`}>
                <label htmlFor="business-phone">
                  {l.businessPhone} <span>{l.optional}</span>
                </label>
                <div className="business-input-icon">
                  <Icon name="phone" />
                  <span className="business-phone-prefix">+91</span>
                  <input
                    id="business-phone"
                    name="primaryPhone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={draft.primaryPhone}
                    onChange={(event) =>
                      updateDraft('primaryPhone', event.target.value.replace(/\D/g, ''))
                    }
                    placeholder="98765 43210"
                  />
                </div>
                {state.fieldErrors?.primaryPhone ? (
                  <p className="field__error">{state.fieldErrors.primaryPhone}</p>
                ) : null}
              </div>

              <div className={`field${state.fieldErrors?.whatsappNumber ? ' field--error' : ''}`}>
                <label htmlFor="business-whatsapp">
                  WhatsApp <span>{l.optional}</span>
                </label>
                <div className="business-input-icon">
                  <Icon name="message" />
                  <span className="business-phone-prefix">+91</span>
                  <input
                    id="business-whatsapp"
                    name="whatsappNumber"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={draft.whatsappNumber}
                    onChange={(event) =>
                      updateDraft('whatsappNumber', event.target.value.replace(/\D/g, ''))
                    }
                    placeholder="98765 43210"
                  />
                </div>
                {state.fieldErrors?.whatsappNumber ? (
                  <p className="field__error">{state.fieldErrors.whatsappNumber}</p>
                ) : null}
              </div>
            </div>

            <div className={`field${state.fieldErrors?.email ? ' field--error' : ''}`}>
              <label htmlFor="business-email">
                {l.businessEmail} <span>{l.optional}</span>
              </label>
              <input
                id="business-email"
                name="email"
                type="email"
                maxLength={254}
                value={draft.email}
                onChange={(event) => updateDraft('email', event.target.value)}
                placeholder="hello@yourbusiness.in"
              />
              {state.fieldErrors?.email ? (
                <p className="field__error">{state.fieldErrors.email}</p>
              ) : null}
            </div>

            <div className={`field${state.fieldErrors?.website ? ' field--error' : ''}`}>
              <label htmlFor="business-website">
                {l.website} <span>{l.optional}</span>
              </label>
              <input
                id="business-website"
                name="website"
                type="url"
                maxLength={255}
                value={draft.website}
                onChange={(event) => updateDraft('website', event.target.value)}
                placeholder="https://yourbusiness.in"
              />
              {state.fieldErrors?.website ? (
                <p className="field__error">{state.fieldErrors.website}</p>
              ) : null}
            </div>

            <div className="business-privacy-note">
              <Icon name="shield" />
              <span>
                <strong>{l.privacyTitle}</strong>
                {l.privacyBody}
              </span>
            </div>

            <section className="business-final-review" aria-labelledby="business-review-title">
              <span>
                <Icon name="check" />
              </span>
              <div>
                <small>{l.readyPublish}</small>
                <h3 id="business-review-title">{draft.name || l.yourBusiness}</h3>
                <p>
                  {selectedCategory?.label ?? l.categoryNeeded} ·{' '}
                  {selectedCity?.name ?? l.cityNeeded}
                  {draft.addressLine ? ` · ${draft.addressLine}` : ''}
                </p>
                <button type="button" onClick={() => setStep(1)}>
                  {l.reviewEssentials}
                </button>
              </div>
            </section>

            <div className="business-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setStep(2)}>
                <Icon name="arrow" /> {l.back}
              </button>
              <SubmitButton labels={l} />
            </div>
          </section>
        </form>

        <aside className="business-preview">
          <span className="business-preview__label">
            <i /> {l.livePreview}
          </span>
          <div className="business-preview__card">
            <div className="business-preview__cover">
              <span>
                <Icon
                  name={selectedCategory ? categoryIconName(selectedCategory.iconKey) : 'store'}
                />
              </span>
              <i>{l.freeProfile}</i>
            </div>
            <div className="business-preview__body">
              <span className="business-preview__logo">
                {(draft.name.trim() || 'B').slice(0, 1).toUpperCase()}
              </span>
              <small>{selectedCategory?.label ?? l.yourCategory}</small>
              <h2>{draft.name.trim() || l.yourBusinessName}</h2>
              <p>
                <Icon name="location" /> {selectedCity?.name ?? l.yourCity}
              </p>
              <div className="business-preview__actions">
                <span>
                  <Icon name="message" /> {l.enquire}
                </span>
                <span>
                  <Icon name="phone" /> {l.call}
                </span>
              </div>
            </div>
          </div>

          <section className="business-preview__promise">
            <Icon name="sparkles" />
            <div>
              <strong>{l.moreThanDirectory}</strong>
              <p>{l.moreThanDirectoryBody}</p>
            </div>
          </section>

          <div className="business-preview__trust">
            <span>
              <Icon name="check" />
            </span>
            <div>
              <strong>{l.freeForever}</strong>
              <small>{l.noSetupFee}</small>
            </div>
            <span>
              <Icon name="shield" />
            </span>
            <div>
              <strong>{l.verificationReady}</strong>
              <small>{l.completeBuildsTrust}</small>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
