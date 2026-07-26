'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { sendEnquiryAction, type EnquiryState } from './actions';

function SendButton({ label, sending }: { label: string; sending: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      <Icon name="message" />
      {pending ? sending : label}
    </button>
  );
}

/**
 * Contact controls.
 *
 * The phone number is rendered only when the API decided the owner opted in — the
 * component never reconstructs it from anything else, so "hide my number" means hidden
 * even to someone reading the page source.
 */
export function ContactPanel({
  listingId,
  listingSlug,
  sellerName,
  phone,
  isSignedIn,
  labels,
}: {
  listingId: string;
  listingSlug: string;
  sellerName: string;
  phone: string | null;
  isSignedIn: boolean;
  labels: Record<string, string>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [state, action] = useActionState<EnquiryState, FormData>(sendEnquiryAction, {});

  if (!isSignedIn) {
    return (
      <Link
        href={`/signin?next=${encodeURIComponent(`/ad/${listingSlug}`)}`}
        className="btn btn--primary btn--block contact-panel__trigger"
      >
        <Icon name="message" />
        {labels.signInToMessage.replace('{signIn}', labels.signIn)}
      </Link>
    );
  }

  if (state.sent) {
    return (
      <div className="contact-panel__success">
        <span>
          <Icon name="check" />
        </span>
        <div>
          <strong>
            {labels.messageSent.replace('{name}', sellerName.split(' ')[0] ?? sellerName)}
          </strong>
          <Link href="/chats">
            {labels.openConversation} <Icon name="arrow" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`contact-panel${showForm ? ' is-open' : ''}`}>
      {!showForm ? (
        <button
          type="button"
          className="btn btn--primary btn--block contact-panel__trigger"
          onClick={() => setShowForm(true)}
        >
          <Icon name="message" />
          {labels.contactSeller}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="contact-panel__backdrop"
            onClick={() => setShowForm(false)}
            aria-label={labels.closeComposer}
          />
          <form action={action} className="contact-panel__composer">
            <div className="contact-panel__head">
              <span>
                <Icon name="message" />
              </span>
              <div>
                <strong>
                  {labels.messagePerson.replace('{name}', sellerName.split(' ')[0] ?? sellerName)}
                </strong>
                <p>{labels.messageHint}</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} aria-label={labels.close}>
                ×
              </button>
            </div>
            <input type="hidden" name="listingId" value={listingId} />
            <div className="field">
              <label htmlFor="enquiry-message">{labels.yourMessage}</label>
              <textarea
                id="enquiry-message"
                name="message"
                rows={4}
                required
                minLength={2}
                maxLength={2000}
                defaultValue={labels.defaultMessage}
                autoFocus
              />
              <p className="field__hint">{labels.firstMessageSafety}</p>
            </div>
            {state.error ? (
              <p className="field__error" role="alert">
                {state.error}
              </p>
            ) : null}
            <div className="contact-panel__send">
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>
                {labels.notNow}
              </button>
              <SendButton label={labels.sendMessage} sending={labels.sending} />
            </div>
          </form>
        </>
      )}

      <div className="contact-panel__phone">
        {phone ? (
          phoneRevealed ? (
            <a href={`tel:${phone}`} className="btn btn--outline btn--block">
              <Icon name="phone" />
              {phone}
            </a>
          ) : (
            <button
              type="button"
              className="btn btn--outline btn--block"
              onClick={() => setPhoneRevealed(true)}
            >
              <Icon name="phone" />
              {labels.showPhone}
            </button>
          )
        ) : (
          <p className="contact-panel__privacy">
            <Icon name="lock" />
            {labels.phoneHidden}
          </p>
        )}
      </div>
    </div>
  );
}
