'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { sendEnquiryAction, type EnquiryState } from './actions';

function SendButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      {pending ? '…' : label}
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
  phone,
  isSignedIn,
  labels,
}: {
  listingId: string;
  phone: string | null;
  isSignedIn: boolean;
  labels: { contact: string; showPhone: string; hidden: string; signIn: string };
}) {
  const [showForm, setShowForm] = useState(false);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [state, action] = useActionState<EnquiryState, FormData>(sendEnquiryAction, {});

  if (!isSignedIn) {
    return (
      <Link href="/signin" className="btn btn--primary btn--block">
        {labels.signIn}
      </Link>
    );
  }

  if (state.sent) {
    return (
      <div className="alert alert--success" style={{ marginBottom: 0 }}>
        ✓ <Link href="/chats">{labels.contact}</Link>
      </div>
    );
  }

  return (
    <>
      {!showForm ? (
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => setShowForm(true)}
        >
          {labels.contact}
        </button>
      ) : (
        <form action={action}>
          <input type="hidden" name="listingId" value={listingId} />
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="enquiry-message" className="sr-only">
              {labels.contact}
            </label>
            <textarea
              id="enquiry-message"
              name="message"
              rows={3}
              required
              minLength={2}
              maxLength={2000}
              defaultValue="Is this still available?"
            />
          </div>
          {state.error ? (
            <p className="field__error" role="alert">
              {state.error}
            </p>
          ) : null}
          <SendButton label={labels.contact} />
        </form>
      )}

      {phone ? (
        phoneRevealed ? (
          <a href={`tel:${phone}`} className="btn btn--outline btn--block">
            {phone}
          </a>
        ) : (
          // Revealed on tap rather than rendered inline: it keeps the number out of the
          // page a scraper fetches without JavaScript.
          <button
            type="button"
            className="btn btn--outline btn--block"
            onClick={() => setPhoneRevealed(true)}
          >
            {labels.showPhone}
          </button>
        )
      ) : (
        <p className="field__hint" style={{ textAlign: 'center' }}>
          {labels.hidden}
        </p>
      )}
    </>
  );
}
