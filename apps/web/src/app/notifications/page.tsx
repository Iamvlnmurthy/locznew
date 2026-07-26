import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Paginated } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { getMessageGroup, getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { markAllReadAction } from './actions';
import { NotificationItem } from './notification-item';
import { PreferenceGrid } from './preference-grid';
import type { Notification, NotificationPreference } from './types';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('notificationUi.title'),
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

type Filter = 'all' | 'unread';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const [{ filter: requestedFilter }, user, locale] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getLocale(),
  ]);
  if (!user) redirect('/signin?next=%2Fnotifications');
  const t = getTranslator(locale);
  const labels = getMessageGroup(locale, 'notificationUi');

  const filter: Filter = requestedFilter === 'unread' ? 'unread' : 'all';
  const [result, unreadResult, preferences] = await Promise.all([
    apiSafe<Paginated<Notification>>(
      `/notifications?limit=50${filter === 'unread' ? '&unreadOnly=true' : ''}`,
      { auth: true },
    ),
    apiSafe<{ count: number }>('/notifications/unread-count', { auth: true }),
    apiSafe<NotificationPreference[]>('/notifications/preferences', { auth: true }),
  ]);

  const notifications = result?.items ?? [];
  const unreadCount = unreadResult?.count ?? 0;
  const today = notifications.filter((notification) => isToday(notification.createdAt));
  const earlier = notifications.filter((notification) => !isToday(notification.createdAt));

  return (
    <div className="notifications-page">
      <section className="notifications-hero">
        <div className="container notifications-hero__inner">
          <div>
            <Link href="/dashboard" className="notifications-back">
              <Icon name="arrow" /> {t('notificationUi.myLocz')}
            </Link>
            <span className="section-kicker">{t('notificationUi.kicker')}</span>
            <h1>{t('notificationUi.title')}</h1>
            <p>
              {unreadCount
                ? t(
                    unreadCount === 1
                      ? 'notificationUi.waitingSingle'
                      : 'notificationUi.waitingPlural',
                    { count: unreadCount },
                  )
                : t('notificationUi.caughtUp')}
            </p>
          </div>
          <span className={`notifications-hero__bell${unreadCount ? ' has-unread' : ''}`}>
            <Icon name="bell" />
            {unreadCount ? (
              <strong>{unreadCount > 99 ? '99+' : unreadCount}</strong>
            ) : (
              <i>
                <Icon name="check" />
              </i>
            )}
          </span>
        </div>
      </section>

      <div className="container notifications-layout">
        <main className="notifications-feed">
          <div className="notifications-toolbar">
            <nav aria-label={t('notificationUi.filterAria')}>
              <Link href="/notifications" className={filter === 'all' ? 'is-active' : ''}>
                {t('notificationUi.all')}
              </Link>
              <Link
                href="/notifications?filter=unread"
                className={filter === 'unread' ? 'is-active' : ''}
              >
                {t('notificationUi.unread')} {unreadCount ? <strong>{unreadCount}</strong> : null}
              </Link>
            </nav>
            {unreadCount ? (
              <form action={markAllReadAction}>
                <button type="submit">
                  <Icon name="check" /> {t('notificationUi.markAllRead')}
                </button>
              </form>
            ) : null}
          </div>

          {notifications.length ? (
            <div className="notifications-groups">
              {today.length ? (
                <section>
                  <h2>{t('notificationUi.today')}</h2>
                  <div className="notifications-list">
                    {today.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        labels={labels}
                        locale={locale}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
              {earlier.length ? (
                <section>
                  <h2>{t('notificationUi.earlier')}</h2>
                  <div className="notifications-list">
                    {earlier.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        labels={labels}
                        locale={locale}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="notifications-empty">
              <Image
                src="/illustrations/empty-neighbourhood.webp"
                alt=""
                width={220}
                height={160}
              />
              <h2>
                {t(
                  filter === 'unread'
                    ? 'notificationUi.emptyUnreadTitle'
                    : 'notificationUi.emptyAllTitle',
                )}
              </h2>
              <p>
                {t(
                  filter === 'unread'
                    ? 'notificationUi.emptyUnreadBody'
                    : 'notificationUi.emptyAllBody',
                )}
              </p>
              {filter === 'unread' ? (
                <Link href="/notifications">{t('notificationUi.seeAll')}</Link>
              ) : null}
            </div>
          )}
        </main>

        <aside className="notifications-aside">
          <section>
            <span className="notifications-aside__icon">
              <Icon name="shield" />
            </span>
            <div>
              <strong>{t('notificationUi.usefulTitle')}</strong>
              <p>{t('notificationUi.usefulBody')}</p>
            </div>
          </section>
          <a href="#preferences">
            <span>
              <Icon name="bell" />
            </span>
            <div>
              <strong>{t('notificationUi.chooseTitle')}</strong>
              <p>{t('notificationUi.chooseBody')}</p>
            </div>
            <Icon name="arrow" />
          </a>
          <Link href="/safety">
            <span>
              <Icon name="shield" />
            </span>
            <div>
              <strong>{t('notificationUi.suspiciousTitle')}</strong>
              <p>{t('notificationUi.suspiciousBody')}</p>
            </div>
            <Icon name="arrow" />
          </Link>
        </aside>
      </div>

      <div className="container">
        <PreferenceGrid preferences={preferences ?? []} labels={labels} />
      </div>
    </div>
  );
}

function isToday(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
