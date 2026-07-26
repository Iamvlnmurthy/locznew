import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Paginated } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { getMessageGroup, getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { ConversationList } from './conversation-list';
import type { ConversationSummary } from './types';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('chatUi.messages'),
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function ChatsPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) redirect('/signin?next=%2Fchats');
  const t = getTranslator(locale);
  const labels = getMessageGroup(locale, 'chatUi');

  const conversations = await apiSafe<Paginated<ConversationSummary>>('/conversations?limit=50', {
    auth: true,
  });
  const items = conversations?.items ?? [];
  const unread = items.reduce((total, conversation) => total + conversation.unreadCount, 0);

  return (
    <div className="container chats">
      <header className="chats-hero">
        <div>
          <span className="section-kicker">{t('chatUi.kicker')}</span>
          <h1>{t('chatUi.messages')}</h1>
          <p>
            {unread
              ? t(unread === 1 ? 'chatUi.unreadSingle' : 'chatUi.unreadPlural', {
                  count: unread,
                })
              : t('chatUi.heroBody')}
          </p>
        </div>
        <Link href="/dashboard" className="btn btn--outline">
          {t('chatUi.accountOverview')}
        </Link>
      </header>

      <div className="chat-shell chat-shell--empty">
        <aside className="chat-sidebar">
          <div className="chat-sidebar__head">
            <strong>{t('chatUi.allConversations')}</strong>
            <span>{items.length}</span>
          </div>
          <ConversationList conversations={items} labels={labels} locale={locale} />
        </aside>

        <section className="chat-welcome">
          <div className="chat-welcome__art">
            <Icon name="message" />
          </div>
          <span className="section-kicker">{t('chatUi.privateKicker')}</span>
          <h2>{t('chatUi.selectConversation')}</h2>
          <p>{t('chatUi.welcomeBody')}</p>
          <div className="chat-welcome__promises">
            <span>
              <Icon name="shield" /> {t('chatUi.builtInReporting')}
            </span>
            <span>
              <Icon name="location" /> {t('chatUi.saferMeetups')}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
