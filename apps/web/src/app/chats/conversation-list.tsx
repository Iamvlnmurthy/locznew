import Link from 'next/link';
import type { Locale } from '@/i18n';
import type { ConversationSummary } from './types';

export function ConversationList({
  conversations,
  activeId,
  labels,
  locale,
}: {
  conversations: ConversationSummary[];
  activeId?: string;
  labels: Record<string, string>;
  locale: Locale;
}) {
  if (!conversations.length) {
    return (
      <div className="chat-list-empty">
        <span>💬</span>
        <strong>{labels.emptyTitle}</strong>
        <p>{labels.emptyBody}</p>
      </div>
    );
  }

  return (
    <nav className="chat-list" aria-label={labels.conversationsAria}>
      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href={`/chats/${conversation.id}`}
          className={`${activeId === conversation.id ? 'is-active' : ''}${
            conversation.unreadCount ? ' is-unread' : ''
          }`}
          aria-current={activeId === conversation.id ? 'page' : undefined}
        >
          {conversation.listingThumbUrl ? (
            <img src={conversation.listingThumbUrl} alt="" width={54} height={54} />
          ) : (
            <span className="chat-list__avatar">
              {conversation.otherPartyName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="chat-list__content">
            <span>
              <strong>{conversation.otherPartyName}</strong>
              {conversation.lastMessageAt ? (
                <time>{shortTime(conversation.lastMessageAt, locale)}</time>
              ) : null}
            </span>
            <small>{conversation.listingTitle ?? labels.localConversation}</small>
            <span className="chat-list__preview">
              {conversation.lastMessagePreview ?? labels.startConversation}
            </span>
          </span>
          {conversation.unreadCount ? (
            <span className="chat-list__unread">{conversation.unreadCount}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

function shortTime(value: string, locale: Locale): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(`${locale}-IN`, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString(`${locale}-IN`, { day: 'numeric', month: 'short' });
}
