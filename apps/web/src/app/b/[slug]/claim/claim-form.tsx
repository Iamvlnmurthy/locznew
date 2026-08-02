'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Category } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import {
  submitBusinessClaimAction,
  type BusinessClaimErrorCopy,
  type BusinessClaimState,
} from './actions';

type LocationState = 'idle' | 'loading' | 'ready' | 'declined' | 'unavailable';

interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

function SubmitButton({ labels }: { labels: Record<string, string> }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? labels.submitting : labels.submitClaim} <Icon name="arrow" />
    </button>
  );
}

export function BusinessClaimForm({
  business,
  categories,
  labels,
}: {
  business: { id: string; slug: string; name: string; categoryName: string; cityName: string };
  categories: Category[];
  labels: Record<string, string>;
}) {
  const errorCopy: BusinessClaimErrorCopy = {
    evidenceRequired: labels.evidenceRequired,
    scaleRequired: labels.scaleRequired,
    offeringRequired: labels.offeringRequired,
    phoneInvalid: labels.phoneInvalid,
    alreadyClaimed: labels.alreadyClaimed,
    alreadyOwned: labels.alreadyOwned,
    submitError: labels.submitError,
  };
  const action = submitBusinessClaimAction.bind(null, business.id, business.slug, errorCopy);
  const [state, formAction] = useActionState<BusinessClaimState, FormData>(action, {});
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [evidenceLength, setEvidenceLength] = useState(0);
  const categoryOptions = categories.flatMap((category) =>
    category.children?.length ? category.children : [category],
  );

  function requestLocation(): void {
    if (!navigator.geolocation) {
      setLocationState('unavailable');
      return;
    }
    setLocationState('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
        setLocationState('ready');
      },
      () => setLocationState('declined'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  if (state.status) {
    const approved = state.status === 'APPROVED';
    return (
      <main className="container business-claim-success">
        <span className="business-claim-success__mark">
          <Icon name="check" />
        </span>
        <span className="section-kicker">
          {approved ? labels.approvedKicker : labels.pendingKicker}
        </span>
        <h1>{approved ? labels.approvedTitle : labels.pendingTitle}</h1>
        <p>
          {(approved ? labels.approvedBody : labels.pendingBody).replace('{name}', business.name)}
        </p>
        <Link
          href={approved ? `/business/manage/${business.id}` : `/b/${business.slug}`}
          className="btn btn--primary"
        >
          {approved ? labels.manageBusiness : labels.backToBusiness} <Icon name="arrow" />
        </Link>
      </main>
    );
  }

  return (
    <main className="business-claim-page">
      <section className="business-claim-hero">
        <div className="container">
          <Link href={`/b/${business.slug}`} className="business-claim-back">
            <Icon name="arrow" /> {labels.backToBusiness}
          </Link>
          <span className="section-kicker">{labels.kicker}</span>
          <h1>{labels.title.replace('{name}', business.name)}</h1>
          <p>{labels.intro}</p>
          <div className="business-claim-identity">
            <span aria-hidden="true">{business.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{business.name}</strong>
              <small>
                {business.categoryName} · {business.cityName}
              </small>
            </div>
            <span>
              <Icon name="shield" /> {labels.privateReview}
            </span>
          </div>
        </div>
      </section>

      <div className="container business-claim-layout">
        <form action={formAction} className="business-claim-form">
          {state.error ? (
            <div className="alert alert--error" role="alert">
              {state.error}
            </div>
          ) : null}

          <section>
            <header>
              <span>01</span>
              <div>
                <h2>{labels.connectionTitle}</h2>
                <p>{labels.connectionBody}</p>
              </div>
            </header>
            <div className={`field${state.fieldErrors?.evidence ? ' field--error' : ''}`}>
              <label htmlFor="claim-evidence">{labels.evidenceLabel}</label>
              <textarea
                id="claim-evidence"
                name="evidence"
                minLength={20}
                maxLength={1000}
                rows={5}
                required
                aria-describedby="claim-evidence-hint"
                placeholder={labels.evidencePlaceholder}
                onChange={(event) => setEvidenceLength(event.target.value.length)}
              />
              <div className="business-claim-field-meta" id="claim-evidence-hint">
                <span>{labels.evidenceHint}</span>
                <span>{evidenceLength}/1000</span>
              </div>
              {state.fieldErrors?.evidence ? (
                <p className="field__error">{state.fieldErrors.evidence}</p>
              ) : null}
            </div>
          </section>

          <section>
            <header>
              <span>02</span>
              <div>
                <h2>{labels.businessShapeTitle}</h2>
                <p>{labels.businessShapeBody}</p>
              </div>
            </header>
            <fieldset className={state.fieldErrors?.scale ? 'field--error' : ''}>
              <legend>{labels.scaleLegend}</legend>
              <div className="business-claim-options">
                {[
                  ['INDIVIDUAL_SHOP', labels.scaleShop, labels.scaleShopBody, 'store'],
                  ['HOME_BUSINESS', labels.scaleHome, labels.scaleHomeBody, 'home'],
                  ['ENTERPRISE', labels.scaleEnterprise, labels.scaleEnterpriseBody, 'briefcase'],
                ].map(([value, title, body, icon]) => (
                  <label key={value}>
                    <input type="radio" name="scale" value={value} required />
                    <span>
                      <Icon name={icon} />
                    </span>
                    <strong>{title}</strong>
                    <small>{body}</small>
                  </label>
                ))}
              </div>
              {state.fieldErrors?.scale ? (
                <p className="field__error">{state.fieldErrors.scale}</p>
              ) : null}
            </fieldset>

            <fieldset className={state.fieldErrors?.offering ? 'field--error' : ''}>
              <legend>{labels.offeringLegend}</legend>
              <div className="business-claim-offerings">
                {[
                  ['PRODUCTS', labels.products],
                  ['SERVICES', labels.services],
                  ['BOTH', labels.both],
                ].map(([value, title]) => (
                  <label key={value}>
                    <input type="radio" name="offering" value={value} required />
                    <span>
                      {title}
                      <Icon name="check" />
                    </span>
                  </label>
                ))}
              </div>
              {state.fieldErrors?.offering ? (
                <p className="field__error">{state.fieldErrors.offering}</p>
              ) : null}
            </fieldset>

            <div className="field">
              <label htmlFor="claim-category">
                {labels.categoryLabel} <span>{labels.optional}</span>
              </label>
              <select id="claim-category" name="categoryId" defaultValue="">
                <option value="">
                  {labels.keepCategory.replace('{category}', business.categoryName)}
                </option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <p className="field__hint">{labels.categoryHint}</p>
            </div>
          </section>

          <section>
            <header>
              <span>03</span>
              <div>
                <h2>{labels.verificationTitle}</h2>
                <p>{labels.verificationBody}</p>
              </div>
            </header>
            <div className="business-claim-location">
              <span>
                <Icon name={locationState === 'ready' ? 'check' : 'location'} />
              </span>
              <div>
                <strong>
                  {locationState === 'ready' ? labels.locationAdded : labels.locationTitle}
                </strong>
                <p>
                  {locationState === 'ready'
                    ? labels.locationAccuracy.replace(
                        '{metres}',
                        String(coordinates?.accuracy ?? 0),
                      )
                    : locationState === 'declined' || locationState === 'unavailable'
                      ? labels.locationSkipped
                      : labels.locationBody}
                </p>
              </div>
              {locationState !== 'ready' ? (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={requestLocation}
                  disabled={locationState === 'loading'}
                >
                  {locationState === 'loading' ? labels.findingLocation : labels.addLocation}
                </button>
              ) : null}
            </div>
            <input type="hidden" name="latitude" value={coordinates?.latitude ?? ''} />
            <input type="hidden" name="longitude" value={coordinates?.longitude ?? ''} />
            <input type="hidden" name="locationAccuracyM" value={coordinates?.accuracy ?? ''} />

            <div className={`field${state.fieldErrors?.contactPhone ? ' field--error' : ''}`}>
              <label htmlFor="claim-phone">
                {labels.phoneLabel} <span>{labels.optional}</span>
              </label>
              <div className="business-claim-phone">
                <span>+91</span>
                <input
                  id="claim-phone"
                  name="contactPhone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={labels.phonePlaceholder}
                />
              </div>
              <p className="field__hint">{labels.phoneHint}</p>
              {state.fieldErrors?.contactPhone ? (
                <p className="field__error">{state.fieldErrors.contactPhone}</p>
              ) : null}
            </div>
          </section>

          <div className="business-claim-submit">
            <div>
              <Icon name="shield" />
              <p>
                <strong>{labels.reviewTitle}</strong>
                {labels.reviewBody}
              </p>
            </div>
            <SubmitButton labels={labels} />
          </div>
        </form>

        <aside className="business-claim-aside">
          <span>
            <Icon name="sparkles" />
          </span>
          <h2>{labels.asideTitle}</h2>
          <p>{labels.asideBody}</p>
          <ol>
            <li>
              <span>1</span>
              {labels.asideStepOne}
            </li>
            <li>
              <span>2</span>
              {labels.asideStepTwo}
            </li>
            <li>
              <span>3</span>
              {labels.asideStepThree}
            </li>
          </ol>
          <div>
            <Icon name="shield" />
            <p>
              <strong>{labels.contactPrivateTitle}</strong>
              {labels.contactPrivateBody}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
