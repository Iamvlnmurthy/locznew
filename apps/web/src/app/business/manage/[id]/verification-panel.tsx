'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { requestBusinessVerificationAction, type BusinessTrustState } from '../../actions';
import type { ManagedBusiness } from './business-manage-form';

function RequestButton({ ready, labels: m }: { ready: boolean; labels: Record<string, string> }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={!ready || pending}>
      {pending ? m.sendingRequest : m.requestVerification}
      <Icon name={pending ? 'clock' : 'arrow'} />
    </button>
  );
}

export function VerificationPanel({
  business,
  labels: m,
}: {
  business: ManagedBusiness;
  labels: Record<string, string>;
}) {
  const boundAction = requestBusinessVerificationAction.bind(null, business.id);
  const [state, action] = useActionState<BusinessTrustState, FormData>(boundAction, {});
  const requirements = [
    { label: m.businessDescription, complete: Boolean(business.description?.trim()) },
    { label: m.localAddress, complete: Boolean(business.addressLine?.trim()) },
    { label: m.businessPhone, complete: Boolean(business.primaryPhone) },
    { label: m.openingHours, complete: business.hours.length > 0 },
  ];
  const complete = requirements.filter((item) => item.complete).length;
  const ready = complete === requirements.length;
  const status = state.ok ? 'PENDING' : business.verificationStatus;

  return (
    <section className={`business-trust-panel is-${status.toLowerCase()}`}>
      <header>
        <span>
          <Icon name="shield" />
        </span>
        <div>
          <small>{m.trustSignal}</small>
          <h2>{trustHeading(status, m)}</h2>
          <p>{trustDescription(status, m)}</p>
        </div>
      </header>

      {status === 'UNVERIFIED' || status === 'REJECTED' ? (
        <>
          <div className="business-trust-requirements">
            {requirements.map((requirement) => (
              <span className={requirement.complete ? 'is-complete' : ''} key={requirement.label}>
                <Icon name={requirement.complete ? 'check' : 'plus'} />
                {requirement.label}
              </span>
            ))}
          </div>
          <form action={action}>
            <div>
              <strong>
                {m.readyCount
                  .replace('{count}', String(complete))
                  .replace('{total}', String(requirements.length))}
              </strong>
              <span>{m.verificationFree}</span>
            </div>
            <RequestButton ready={ready} labels={m} />
          </form>
        </>
      ) : null}

      {status === 'PENDING' ? (
        <div className="business-trust-waiting">
          <Icon name="clock" />
          <span>
            <strong>{m.reviewRequested}</strong>
            {m.reviewRequestedBody}
          </span>
        </div>
      ) : null}

      {status === 'VERIFIED' ? (
        <div className="business-trust-waiting">
          <Icon name="check" />
          <span>
            <strong>{m.badgeActive}</strong>
            {m.badgeActiveBody}
          </span>
        </div>
      ) : null}

      {state.error ? (
        <p className="business-trust-message is-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="business-trust-message" role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

function trustHeading(status: string, labels: Record<string, string>): string {
  if (status === 'VERIFIED') return labels.trustVerified;
  if (status === 'PENDING') return labels.trustPending;
  if (status === 'REJECTED') return labels.trustRejected;
  return labels.trustReady;
}

function trustDescription(status: string, labels: Record<string, string>): string {
  if (status === 'VERIFIED') return labels.trustVerifiedBody;
  if (status === 'PENDING') return labels.trustPendingBody;
  if (status === 'REJECTED') return labels.trustRejectedBody;
  return labels.trustReadyBody;
}
