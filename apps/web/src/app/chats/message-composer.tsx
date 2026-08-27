'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { sendMessageAction, type SendMessageState } from './actions';

function SendButton({ labels }: { labels: Record<string, string> }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={pending ? labels.sendingMessage : labels.sendMessage}
    >
      <Icon name={pending ? 'sparkles' : 'arrow'} />
    </button>
  );
}

export function MessageComposer({
  conversationId,
  labels,
}: {
  conversationId: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const action = sendMessageAction.bind(null, conversationId);
  const [state, formAction] = useActionState<SendMessageState, FormData>(action, {});

  useEffect(() => {
    if (!state.sentAt) return;
    formRef.current?.reset();
    queueMicrotask(() => setDraft(''));
    router.refresh();
  }, [router, state.sentAt]);

  const quickReplies = [
    labels.quickAvailable || 'Is this still available?',
    labels.quickPrice || 'What is your best price?',
    labels.quickMeet || 'Where is the pickup location?',
    labels.quickInspect || 'Can I inspect this today?',
  ].filter(Boolean);

  return (
    <>
      <div
        className="chat-quick-replies"
        aria-label={labels.suggestedReplies ?? 'Suggested quick replies'}
      >
        {quickReplies.map((reply) => (
          <button
            key={reply}
            type="button"
            onClick={() => {
              setDraft(reply);
              textareaRef.current?.focus();
            }}
          >
            {reply}
          </button>
        ))}
      </div>
      <form ref={formRef} className="chat-composer" action={formAction}>
        <label htmlFor="chat-message" className="sr-only">
          {labels.writeMessage}
        </label>
        <textarea
          ref={textareaRef}
          id="chat-message"
          name="message"
          rows={1}
          required
          maxLength={2000}
          placeholder={labels.writeMessagePlaceholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <SendButton labels={labels} />
        {state.error ? <p role="alert">{state.error}</p> : null}
      </form>
    </>
  );
}
