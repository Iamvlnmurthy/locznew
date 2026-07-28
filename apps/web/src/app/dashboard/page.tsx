import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ListingSummary, Paginated } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { formatPrice } from '@/components/listing-card';
import { getMessageGroup, getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { ListingActions } from './listing-actions';
import { ProfileForm } from './profile-form';
import { SavedLibrary } from './saved-library';

export const metadata: Metadata = {
  title: 'My LocZ',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type DashboardTab =
  'overview' | 'listings' | 'businesses' | 'saved' | 'inbox' | 'alerts' | 'profile';

interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  verificationStatus: string;
  listingCount: number;
  viewCount: number;
  description: string | null;
  addressLine: string | null;
}

interface Profile {
  id: string;
  phone: string;
  email: string | null;
  displayName: string;
  bio: string | null;
  preferredLanguage: string;
  status: string;
  roles: string[];
  createdAt: string;
  publishedListingCount: number;
  savedListingCount: number;
}

interface Conversation {
  id: string;
  listingTitle: string | null;
  listingThumbUrl: string | null;
  otherPartyName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const VALID_TABS: DashboardTab[] = [
  'overview',
  'listings',
  'businesses',
  'saved',
  'inbox',
  'alerts',
  'profile',
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab: requestedTab }, locale, user] = await Promise.all([
    searchParams,
    getLocale(),
    getCurrentUser(),
  ]);
  if (!user) redirect('/signin?next=%2Fdashboard');

  const tab = VALID_TABS.includes(requestedTab as DashboardTab)
    ? (requestedTab as DashboardTab)
    : 'overview';
  const t = getTranslator(locale);
  const d = getMessageGroup(locale, 'dashboardUi');
  const navItems: Array<{ tab: DashboardTab; label: string; icon: string }> = [
    { tab: 'overview', label: d.navOverview, icon: 'home' },
    { tab: 'listings', label: d.navAds, icon: 'box' },
    { tab: 'businesses', label: d.navBusinesses, icon: 'store' },
    { tab: 'saved', label: d.navSaved, icon: 'heart' },
    { tab: 'inbox', label: d.navInbox, icon: 'message' },
    { tab: 'alerts', label: d.navNotifications, icon: 'bell' },
    { tab: 'profile', label: d.navProfile, icon: 'user' },
  ];

  const [
    mine,
    saved,
    recentlyViewed,
    profile,
    conversations,
    notifications,
    unreadMessages,
    unreadAlerts,
    businesses,
  ] = await Promise.all([
    apiSafe<Paginated<ListingSummary>>('/listings/mine?limit=50', { auth: true }),
    apiSafe<Paginated<ListingSummary>>('/listings/saved?limit=50', { auth: true }),
    apiSafe<ListingSummary[]>('/listings/recently-viewed', { auth: true }),
    apiSafe<Profile>('/users/me', { auth: true }),
    apiSafe<Paginated<Conversation>>('/conversations?limit=20', { auth: true }),
    apiSafe<Paginated<Notification>>('/notifications?limit=20', { auth: true }),
    apiSafe<{ count: number }>('/conversations/unread-count', { auth: true }),
    apiSafe<{ count: number }>('/notifications/unread-count', { auth: true }),
    apiSafe<BusinessSummary[]>('/businesses/mine', { auth: true }),
  ]);

  const myListings = mine?.items ?? [];
  const savedListings = saved?.items ?? [];
  const activeAds = myListings.filter((listing) => listing.status === 'PUBLISHED').length;
  const totalViews = myListings.reduce((sum, listing) => sum + listing.viewCount, 0);
  const avatarLetter = (profile?.displayName ?? user.displayName).slice(0, 1).toUpperCase();

  return (
    <div className="container dashboard">
      <header className="dashboard-hero">
        <div className="dashboard-hero__identity">
          <span className="dashboard-hero__avatar" aria-hidden="true">
            {avatarLetter}
          </span>
          <div>
            <span className="section-kicker">{d.workspace}</span>
            <h1>
              {d.greeting.replace(
                '{name}',
                (profile?.displayName ?? user.displayName).split(' ')[0]!,
              )}
            </h1>
            <p>{d.workspaceBody}</p>
          </div>
        </div>
        <Link href="/post" className="btn btn--primary dashboard-hero__post">
          <Icon name="plus" /> {d.postFreeAd}
        </Link>
      </header>

      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          <nav aria-label={d.account}>
            {navItems.map((item) => {
              const count =
                item.tab === 'listings'
                  ? mine?.meta.total
                  : item.tab === 'businesses'
                    ? businesses?.length
                    : item.tab === 'saved'
                      ? saved?.meta.total
                      : item.tab === 'inbox'
                        ? unreadMessages?.count
                        : item.tab === 'alerts'
                          ? unreadAlerts?.count
                          : undefined;
              const href =
                item.tab === 'overview'
                  ? '/dashboard'
                  : item.tab === 'alerts'
                    ? '/notifications'
                    : `/dashboard?tab=${item.tab}`;
              return (
                <Link
                  key={item.tab}
                  href={href}
                  className={tab === item.tab ? 'is-active' : ''}
                  aria-current={tab === item.tab ? 'page' : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {count ? <strong>{count}</strong> : null}
                </Link>
              );
            })}
          </nav>

          <div className="dashboard-sidebar__support">
            <Icon name="shield" />
            <span>
              <strong>{d.needHelp}</strong>
              <Link href="/help">{d.visitHelp}</Link>
            </span>
          </div>
        </aside>

        <main className="dashboard-main">
          {tab === 'overview' ? (
            <Overview
              activeAds={activeAds}
              totalViews={totalViews}
              savedCount={saved?.meta.total ?? 0}
              unreadCount={unreadMessages?.count ?? 0}
              listings={myListings}
              notifications={notifications?.items ?? []}
              profile={profile}
              t={t}
              labels={d}
            />
          ) : null}

          {tab === 'listings' ? (
            <ListingsPanel listings={myListings} total={mine?.meta.total ?? 0} t={t} labels={d} />
          ) : null}

          {tab === 'businesses' ? (
            <BusinessesPanel businesses={businesses ?? []} labels={d} />
          ) : null}

          {tab === 'saved' ? (
            <SavedPanel listings={savedListings} recentlyViewed={recentlyViewed ?? []} labels={d} />
          ) : null}

          {tab === 'inbox' ? (
            <InboxPanel
              conversations={conversations?.items ?? []}
              unreadCount={unreadMessages?.count ?? 0}
              labels={d}
            />
          ) : null}

          {tab === 'alerts' ? (
            <AlertsPanel
              notifications={notifications?.items ?? []}
              unreadCount={unreadAlerts?.count ?? 0}
              labels={d}
            />
          ) : null}

          {tab === 'profile' ? (
            <ProfilePanel
              profile={profile}
              fallbackName={user.displayName}
              labels={d}
              dateLocale={`${locale}-IN`}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function BusinessesPanel({
  businesses,
  labels: d,
}: {
  businesses: BusinessSummary[];
  labels: Record<string, string>;
}) {
  return (
    <section className="dashboard-section dashboard-section--primary">
      <PanelHeader
        kicker={d.localPresence}
        title={d.myBusinesses}
        description={businesses.length ? d.businessesBody : d.businessesEmptyBody}
        action={
          <Link href="/business/new" className="btn btn--primary">
            <Icon name="plus" /> {d.listBusiness}
          </Link>
        }
      />
      {businesses.length ? (
        <div className="dashboard-businesses">
          {businesses.map((business) => (
            <article key={business.id}>
              <span className="dashboard-businesses__logo">
                {business.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <span className="section-kicker">
                  {business.categoryName} · {business.cityName}
                </span>
                <h3>{business.name}</h3>
                <p>{business.addressLine ?? business.description ?? d.addBusinessDetails}</p>
                <div>
                  <span>
                    <Icon name="chart" /> {business.viewCount} {d.profileViews}
                  </span>
                  <span>
                    <Icon name="box" /> {business.listingCount} {d.liveListings}
                  </span>
                  <span>
                    <Icon name="shield" /> {verificationLabel(business.verificationStatus, d)}
                  </span>
                </div>
              </div>
              <nav aria-label={d.manageNamed.replace('{name}', business.name)}>
                <Link href={`/business/manage/${business.id}`} className="btn btn--primary">
                  {d.manageProfile} <Icon name="arrow" />
                </Link>
                <Link href={`/b/${business.slug}`}>{d.viewPublicPage}</Link>
              </nav>
            </article>
          ))}
        </div>
      ) : (
        <DashboardEmpty
          title={d.businessMapTitle}
          description={d.businessMapBody}
          actionHref="/business/new"
          actionLabel={d.createFreeProfile}
        />
      )}
    </section>
  );
}

function PanelHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="dashboard-panel-head">
      <div>
        <span className="section-kicker">{kicker}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Overview({
  activeAds,
  totalViews,
  savedCount,
  unreadCount,
  listings,
  notifications,
  profile,
  t,
  labels: d,
}: {
  activeAds: number;
  totalViews: number;
  savedCount: number;
  unreadCount: number;
  listings: ListingSummary[];
  notifications: Notification[];
  profile: Profile | null;
  t: ReturnType<typeof getTranslator>;
  labels: Record<string, string>;
}) {
  const stats = [
    { label: d.activeAds, value: activeAds, icon: 'box', note: d.activeAdsNote },
    { label: d.totalViews, value: totalViews, icon: 'chart', note: d.totalViewsNote },
    { label: d.savedAds, value: savedCount, icon: 'heart', note: d.savedAdsNote },
    {
      label: d.unreadMessages,
      value: unreadCount,
      icon: 'message',
      note: d.unreadMessagesNote,
    },
  ];

  return (
    <>
      <section className="dashboard-stats" aria-label={d.accountSummary}>
        {stats.map((stat) => (
          <article key={stat.label}>
            <span className="dashboard-stats__icon">
              <Icon name={stat.icon} />
            </span>
            <strong>{stat.value.toLocaleString('en-IN')}</strong>
            <span>{stat.label}</span>
            <small>{stat.note}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-section">
        <PanelHeader
          kicker={d.yourListings}
          title={d.recentAds}
          description={d.recentAdsBody}
          action={
            <Link href="/dashboard?tab=listings">
              {d.manageAll} <Icon name="arrow" />
            </Link>
          }
        />
        {listings.length ? (
          <div className="dashboard-listings">
            {listings.slice(0, 3).map((listing) => (
              <DashboardListingRow key={listing.id} listing={listing} t={t} labels={d} compact />
            ))}
          </div>
        ) : (
          <DashboardEmpty
            title={d.firstListingTitle}
            description={d.firstListingBody}
            actionHref="/post"
            actionLabel={d.postFreeAd}
          />
        )}
      </section>

      <div className="dashboard-overview-grid">
        <section className="dashboard-section">
          <PanelHeader
            kicker={d.accountReadiness}
            title={d.trustedProfile}
            description={d.trustedProfileBody}
          />
          <div className="dashboard-checklist">
            <div className="is-complete">
              <Icon name="check" />
              <span>
                <strong>{d.verifiedPhone}</strong>
                {d.verifiedPhoneBody}
              </span>
            </div>
            <div className={profile?.email ? 'is-complete' : ''}>
              <Icon name={profile?.email ? 'check' : 'plus'} />
              <span>
                <strong>{d.addEmail}</strong>
                {d.addEmailBody}
              </span>
            </div>
            <div className={profile?.bio ? 'is-complete' : ''}>
              <Icon name={profile?.bio ? 'check' : 'plus'} />
              <span>
                <strong>{d.introduce}</strong>
                {d.introduceBody}
              </span>
            </div>
          </div>
          <Link
            href="/dashboard?tab=profile"
            className="btn btn--outline dashboard-checklist__action"
          >
            {d.completeProfile}
          </Link>
        </section>

        <section className="dashboard-section">
          <PanelHeader
            kicker={d.latestActivity}
            title={d.whatsHappening}
            description={d.activityBody}
            action={
              <Link href="/notifications">
                {d.seeAll} <Icon name="arrow" />
              </Link>
            }
          />
          {notifications.length ? (
            <div className="dashboard-activity">
              {notifications.slice(0, 3).map((notification) => (
                <NotificationRow key={notification.id} notification={notification} labels={d} />
              ))}
            </div>
          ) : (
            <div className="dashboard-quiet">
              <span>
                <Icon name="bell" />
              </span>
              <strong>{d.allQuiet}</strong>
              <p>{d.allQuietBody}</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ListingsPanel({
  listings,
  total,
  t,
  labels: d,
}: {
  listings: ListingSummary[];
  total: number;
  t: ReturnType<typeof getTranslator>;
  labels: Record<string, string>;
}) {
  return (
    <section className="dashboard-section dashboard-section--primary">
      <PanelHeader
        kicker={d.listingManager}
        title={d.navAds}
        description={d.listingCount.replace('{count}', String(total))}
        action={
          <Link href="/post" className="btn btn--primary">
            <Icon name="plus" /> {d.newAd}
          </Link>
        }
      />
      {listings.length ? (
        <div className="dashboard-listings">
          {listings.map((listing) => (
            <DashboardListingRow key={listing.id} listing={listing} t={t} labels={d} />
          ))}
        </div>
      ) : (
        <DashboardEmpty
          title={d.nothingPosted}
          description={d.nothingPostedBody}
          actionHref="/post"
          actionLabel={d.postFirstAd}
        />
      )}
    </section>
  );
}

function SavedPanel({
  listings,
  recentlyViewed,
  labels,
}: {
  listings: ListingSummary[];
  recentlyViewed: ListingSummary[];
  labels: Record<string, string>;
}) {
  return (
    <section className="dashboard-section dashboard-section--primary dashboard-section--library">
      <SavedLibrary initialSaved={listings} recentlyViewed={recentlyViewed} labels={labels} />
    </section>
  );
}

function InboxPanel({
  conversations,
  unreadCount,
  labels: d,
}: {
  conversations: Conversation[];
  unreadCount: number;
  labels: Record<string, string>;
}) {
  return (
    <section className="dashboard-section dashboard-section--primary">
      <PanelHeader
        kicker={d.localConversations}
        title={d.navInbox}
        description={
          unreadCount ? d.unreadWaiting.replace('{count}', String(unreadCount)) : d.inboxBody
        }
      />
      {conversations.length ? (
        <div className="dashboard-inbox">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/chats/${conversation.id}`}
              className={conversation.unreadCount ? 'is-unread' : ''}
            >
              {conversation.listingThumbUrl ? (
                <img src={conversation.listingThumbUrl} alt="" width={54} height={54} />
              ) : (
                <span className="dashboard-inbox__avatar">
                  {conversation.otherPartyName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <strong>{conversation.otherPartyName}</strong>
                <span>{conversation.listingTitle ?? d.localConversation}</span>
                <p>{conversation.lastMessagePreview ?? d.startConversation}</p>
              </div>
              <div className="dashboard-inbox__meta">
                {conversation.lastMessageAt ? (
                  <time>{relativeDate(conversation.lastMessageAt, d)}</time>
                ) : null}
                {conversation.unreadCount ? <strong>{conversation.unreadCount}</strong> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <DashboardEmpty
          title={d.noConversations}
          description={d.noConversationsBody}
          actionHref="/search"
          actionLabel={d.exploreAds}
        />
      )}
      <div className="dashboard-safety-note">
        <Icon name="shield" />
        <span>
          <strong>{d.keepInside}</strong>
          {d.keepInsideBody}
        </span>
      </div>
    </section>
  );
}

function AlertsPanel({
  notifications,
  unreadCount,
  labels: d,
}: {
  notifications: Notification[];
  unreadCount: number;
  labels: Record<string, string>;
}) {
  return (
    <section className="dashboard-section dashboard-section--primary">
      <PanelHeader
        kicker={d.accountActivity}
        title={d.navNotifications}
        description={
          unreadCount ? d.newUpdates.replace('{count}', String(unreadCount)) : d.caughtUp
        }
        action={
          <Link href="/notifications">
            {d.openNotifications} <Icon name="arrow" />
          </Link>
        }
      />
      {notifications.length ? (
        <div className="dashboard-activity dashboard-activity--full">
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} labels={d} />
          ))}
        </div>
      ) : (
        <DashboardEmpty title={d.nothingNew} description={d.nothingNewBody} />
      )}
    </section>
  );
}

function ProfilePanel({
  profile,
  fallbackName,
  labels: d,
  dateLocale,
}: {
  profile: Profile | null;
  fallbackName: string;
  labels: Record<string, string>;
  dateLocale: string;
}) {
  if (!profile) {
    return (
      <section className="dashboard-section dashboard-section--primary">
        <DashboardEmpty title={d.profileUnavailable} description={d.profileUnavailableBody} />
      </section>
    );
  }

  return (
    <section className="dashboard-section dashboard-section--primary">
      <PanelHeader kicker={d.yourIdentity} title={d.navProfile} description={d.profileBody} />
      <div className="dashboard-profile-summary">
        <span aria-hidden="true">
          {(profile.displayName || fallbackName).slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{profile.displayName || fallbackName}</strong>
          <p>
            {d.memberSince} {formatMonthYear(profile.createdAt, dateLocale)}
          </p>
        </div>
        <i>
          <Icon name="shield" /> {d.phoneVerified}
        </i>
      </div>
      <ProfileForm profile={profile} labels={d} />
    </section>
  );
}

function DashboardListingRow({
  listing,
  t,
  labels: d,
  compact = false,
}: {
  listing: ListingSummary;
  t: ReturnType<typeof getTranslator>;
  labels: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <article className="dashboard-listing">
      <Link
        href={`/ad/${listing.slug}`}
        className="dashboard-listing__image"
        aria-label={listing.title}
      >
        {listing.thumbUrl ? (
          <img src={listing.thumbUrl} alt="" width={112} height={84} />
        ) : (
          <span>
            <Icon name="image" />
          </span>
        )}
      </Link>
      <div className="dashboard-listing__content">
        <div className="dashboard-listing__title-row">
          <div>
            <span className={`dashboard-status dashboard-status--${listing.status.toLowerCase()}`}>
              {t(`dashboard.status.${listing.status}`)}
            </span>
            <Link href={`/ad/${listing.slug}`}>{listing.title}</Link>
          </div>
          <strong>
            {listing.price === null
              ? '—'
              : listing.price === 0
                ? d.free
                : formatPrice(listing.price)}
          </strong>
        </div>
        <div className="dashboard-listing__meta">
          <span>
            <Icon name="location" /> {listing.localityName ?? listing.cityName}
          </span>
          <span>
            <Icon name="chart" /> {listing.viewCount} {d.views}
          </span>
          {listing.publishedAt ? (
            <span>
              {d.posted} {relativeDate(listing.publishedAt, d)}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <ListingActions
            listingId={listing.id}
            status={listing.status}
            labels={{
              edit: t('dashboard.action.edit'),
              resumeDraft: t('dashboard.action.resumeDraft'),
              pause: t('dashboard.action.pause'),
              resume: t('dashboard.action.resume'),
              markSold: t('dashboard.action.markSold'),
              republish: t('dashboard.action.republish'),
              delete: t('dashboard.action.delete'),
              deleteConfirm: t('dashboard.action.deleteConfirm'),
              failed: d.actionFailed,
            }}
          />
        ) : null}
      </div>
      {compact ? (
        <Link
          href={`/ad/${listing.slug}`}
          className="dashboard-listing__open"
          aria-label={d.openNamed.replace('{name}', listing.title)}
        >
          <Icon name="arrow" />
        </Link>
      ) : null}
    </article>
  );
}

function NotificationRow({
  notification,
  labels: d,
}: {
  notification: Notification;
  labels: Record<string, string>;
}) {
  return (
    <article className={notification.readAt ? '' : 'is-unread'}>
      <span className="dashboard-activity__icon">
        <Icon name={notification.type.includes('MESSAGE') ? 'message' : 'bell'} />
      </span>
      <div>
        <strong>{notification.title}</strong>
        <p>{notification.body}</p>
        <time>{relativeDate(notification.createdAt, d)}</time>
      </div>
      {!notification.readAt ? <i aria-label={d.unread} /> : null}
    </article>
  );
}

function DashboardEmpty({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="dashboard-empty">
      <img src="/illustrations/empty-neighbourhood.webp" alt="" width={220} height={160} />
      <h3>{title}</h3>
      <p>{description}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="btn btn--primary">
          {actionLabel} <Icon name="arrow" />
        </Link>
      ) : null}
    </div>
  );
}

function relativeDate(value: string, labels: Record<string, string>): string {
  const date = new Date(value);
  const differenceDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (differenceDays === 0) return labels.today;
  if (differenceDays === 1) return labels.yesterday;
  if (differenceDays < 7) return labels.daysAgo.replace('{count}', String(differenceDays));
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatMonthYear(value: string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

function verificationLabel(status: string, labels: Record<string, string>): string {
  if (status === 'VERIFIED') return labels.verified;
  if (status === 'PENDING') return labels.verificationPending;
  return labels.notVerified;
}
