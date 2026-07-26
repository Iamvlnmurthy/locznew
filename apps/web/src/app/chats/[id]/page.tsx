import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Paginated } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { getMessageGroup, getTranslator, type Locale } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { ChatRefresh } from '../chat-refresh';
import { ConversationList } from '../conversation-list';
import { ConversationSafety } from '../conversation-safety';
import { MessageComposer } from '../message-composer';
import type { ChatMessage, ConversationDetail, ConversationSummary } from '../types';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('chatUi.conversation'),
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, locale] = await Promise.all([params, getCurrentUser(), getLocale()]);
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/chats/${id}`)}`);
  const t = getTranslator(locale);
  const labels = getMessageGroup(locale, 'chatUi');

  const [conversations, conversation] = await Promise.all([
    apiSafe<Paginated<ConversationSummary>>('/conversations?limit=50', { auth: true }),
    apiSafe<ConversationDetail>(`/conversations/${id}`, { auth: true }),
  ]);
  if (!conversation) notFound();

  return (
    <div className="container chats chats--thread">
      <ChatRefresh latestMessageId={conversation.messages.at(-1)?.id} />
      <div className="chat-shell">
        <aside className="chat-sidebar">
          <div className="chat-sidebar__head">
            <Link href="/chats" aria-label={t('chatUi.backMessages')}>
              <Icon name="arrow" />
            </Link>
            <strong>{t('chatUi.messages')}</strong>
            <span>{conversations?.meta.total ?? 0}</span>
          </div>
          <ConversationList
            conversations={conversations?.items ?? []}
            activeId={id}
            labels={labels}
            locale={locale}
          />
        </aside>

        <main className="chat-thread">
          <header className="chat-thread__head">
            <Link
              href="/chats"
              className="chat-thread__back"
              aria-label={t('chatUi.backConversations')}
            >
              <Icon name="arrow" />
            </Link>
            <span className="chat-thread__avatar" aria-hidden="true">
              {conversation.otherPartyName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{conversation.otherPartyName}</strong>
              <span>
                <i /> {t('chatUi.autoRefresh')}
              </span>
            </div>
            <div className="chat-thread__controls">
              <Link
                href={`/report?conversation=${conversation.id}`}
                aria-label={t('chatUi.reportConversation')}
              >
                {t('chatUi.report')}
              </Link>
              <ConversationSafety otherPartyId={conversation.otherPartyId} labels={labels} />
            </div>
          </header>

          {conversation.listingTitle ? (
            <section className="chat-listing-context">
              {conversation.listingThumbUrl ? (
                <img src={conversation.listingThumbUrl} alt="" width={58} height={58} />
              ) : (
                <span>
                  <Icon name="box" />
                </span>
              )}
              <div>
                <small>{t('chatUi.talkingAbout')}</small>
                <strong>{conversation.listingTitle}</strong>
              </div>
              <Icon name="shield" />
            </section>
          ) : null}

          <section
            className="chat-messages"
            aria-label={t('chatUi.conversationWith', {
              name: conversation.otherPartyName,
            })}
          >
            <div className="chat-date-divider">
              <span>{t('chatUi.conversation')}</span>
            </div>
            <div className="chat-safety-banner">
              <Icon name="shield" />
              <span>
                <strong>{t('chatUi.keepDealSafe')}</strong>
                {t('chatUi.safetyBody')}
              </span>
            </div>
            {conversation.messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                showSender={
                  index === 0 || conversation.messages[index - 1]?.isMine !== message.isMine
                }
                senderName={conversation.otherPartyName}
                labels={labels}
                locale={locale}
              />
            ))}
            <div id="latest-message" />
          </section>

          <footer className="chat-thread__footer">
            <MessageComposer conversationId={conversation.id} labels={labels} />
            <p>
              <Icon name="shield" /> {t('chatUi.phonePrivate')}
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  showSender,
  senderName,
  labels,
  locale,
}: {
  message: ChatMessage;
  showSender: boolean;
  senderName: string;
  labels: Record<string, string>;
  locale: Locale;
}) {
  return (
    <article className={`chat-message${message.isMine ? ' is-mine' : ''}`}>
      {showSender ? <span>{message.isMine ? labels.you : senderName}</span> : null}
      <div>
        <p>{message.body}</p>
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleTimeString(`${locale}-IN`, {
            hour: 'numeric',
            minute: '2-digit',
          })}
          {message.isMine ? ` · ${message.readAt ? labels.read : labels.sent}` : ''}
        </time>
      </div>
    </article>
  );
}
