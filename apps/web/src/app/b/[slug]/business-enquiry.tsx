'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { sendBusinessEnquiryAction, type BusinessEnquiryState } from './actions';

function SendButton({ labels: l }: { labels: Record<string, string> }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      {pending ? (
        <>
          <Icon name="sparkles" /> {l.sending}
        </>
      ) : (
        <>
          {l.sendEnquiry} <Icon name="arrow" />
        </>
      )}
    </button>
  );
}

export function BusinessEnquiry({
  businessId,
  businessName,
  businessSlug,
  isSignedIn,
  labels: l,
}: {
  businessId: string;
  businessName: string;
  businessSlug: string;
  isSignedIn: boolean;
  labels: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const actionWithBusiness = sendBusinessEnquiryAction.bind(null, businessId);
  const [state, action] = useActionState<BusinessEnquiryState, FormData>(actionWithBusiness, {});

  if (!isSignedIn) {
    return (
      <Link
        href={`/signin?next=${encodeURIComponent(`/b/${businessSlug}`)}`}
        className="btn btn--primary btn--block"
      >
        <Icon name="message" /> {l.signInEnquire}
      </Link>
    );
  }

  if (state.conversationId) {
    return (
      <div className="business-profile-enquiry__sent">
        <span>
          <Icon name="check" />
        </span>
        <div>
          <strong>{l.enquirySent}</strong>
          <p>{l.replySafely}</p>
          <Link href={`/chats/${state.conversationId}`}>
            {l.openConversation} <Icon name="arrow" />
          </Link>
        </div>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button type="button" className="btn btn--primary btn--block" onClick={() => setIsOpen(true)}>
        <Icon name="message" /> {l.sendEnquiry}
      </button>
    );
  }

  return (
    <form action={action} className="business-profile-enquiry">
      <label htmlFor="business-enquiry-message">{l.yourMessage}</label>
      <textarea
        id="business-enquiry-message"
        name="message"
        rows={4}
        minLength={2}
        maxLength={2000}
        required
        defaultValue={l.defaultEnquiry.replace('{name}', businessName)}
      />
      {state.error ? (
        <p className="field__error" role="alert">
          {state.error}
        </p>
      ) : null}
      <SendButton labels={l} />
      <button type="button" onClick={() => setIsOpen(false)}>
        {l.cancel}
      </button>
    </form>
  );
}
