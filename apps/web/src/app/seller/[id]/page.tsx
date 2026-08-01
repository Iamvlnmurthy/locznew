import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icons';
import { getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getLocale } from '@/lib/session';

interface SellerProfile {
  id: string;
  displayName: string;
  bio: string | null;
  memberSince: string;
  publishedListings: number;
  soldListings: number;
  responseRate: number | null;
  medianResponseMinutes: number | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const profile = await apiSafe<SellerProfile>(`/users/${(await params).id}/profile`);
  return {
    title: profile?.displayName ?? 'Seller profile',
    robots: profile ? undefined : { index: false, follow: false },
  };
}

export default async function SellerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const profile = await apiSafe<SellerProfile>(`/users/${encodeURIComponent(id)}/profile`);
  if (!profile) notFound();
  const m = getMessageGroup(locale, 'sellerProfile');

  return (
    <main className="section seller-profile-page">
      <div className="container container--narrow">
        <Link href="/search" className="detail__back">
          <Icon name="arrowLeft" /> {m.back}
        </Link>
        <section className="panel seller-profile-hero">
          <span className="detail__avatar seller-profile-hero__avatar" aria-hidden="true">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="section-kicker">{m.kicker}</span>
          <h1>{profile.displayName}</h1>
          <p>
            {m.memberSince.replace(
              '{date}',
              new Date(profile.memberSince).toLocaleDateString(`${locale}-IN`, {
                month: 'long',
                year: 'numeric',
              }),
            )}
          </p>
          {profile.bio ? <p className="seller-profile-hero__bio">{profile.bio}</p> : null}
        </section>

        <section className="seller-profile-stats" aria-label={m.activity}>
          <article className="panel">
            <Icon name="box" />
            <strong>{profile.publishedListings}</strong>
            <span>{m.liveAds}</span>
          </article>
          <article className="panel">
            <Icon name="check" />
            <strong>{profile.soldListings}</strong>
            <span>{m.sold}</span>
          </article>
          {profile.responseRate !== null ? (
            <article className="panel">
              <Icon name="message" />
              <strong>{Math.round(profile.responseRate)}%</strong>
              <span>{m.responseRate}</span>
            </article>
          ) : null}
          {profile.medianResponseMinutes !== null ? (
            <article className="panel">
              <Icon name="clock" />
              <strong>{Math.round(profile.medianResponseMinutes)}</strong>
              <span>{m.responseMinutes}</span>
            </article>
          ) : null}
        </section>

        <p className="seller-profile-privacy">
          <Icon name="shield" /> {m.privacy}
        </p>
      </div>
    </main>
  );
}
