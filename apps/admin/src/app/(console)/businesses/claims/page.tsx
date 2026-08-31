import type { Paginated } from '@locz/shared-types';
import { ApiRequestError, api } from '@/lib/api';
import { getAdminQueueCopy, type AdminQueueCopy, type AdminQueueLocale } from '@/lib/queue-copy';
import { ConsoleIcon } from '../../console-icon';
import { VerificationDecision } from '../verification-decision';
import { ClaimDecision } from './claim-decision';

export const dynamic = 'force-dynamic';

interface BusinessClaimItem {
  id: string;
  evidence: string;
  contactPhone: string | null;
  proposedScale: string;
  offeringProposed: string;
  latitude: number | string | null;
  longitude: number | string | null;
  locationAccuracyM: number | null;
  matchedSignals: string[];
  autoApproved: boolean;
  createdAt: string;
  business: {
    id: string;
    name: string;
    slug: string;
    primaryPhone: string | null;
    sourceName: string | null;
  };
  claimant: {
    id: string;
    displayName: string | null;
    phoneE164: string | null;
    email: string | null;
  };
}

const CLAIM_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export default async function BusinessClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const [{ page: rawPage, status: rawStatus }, { copy, locale }] = await Promise.all([
    searchParams,
    getAdminQueueCopy(),
  ]);
  const page = Math.max(1, Number(rawPage ?? '1') || 1);
  const status = (CLAIM_STATUSES as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as string)
    : 'PENDING';
  let queue: Paginated<BusinessClaimItem>;
  try {
    queue = await api<Paginated<BusinessClaimItem>>(
      `/businesses/claims/queue?status=${status}&page=${page}&limit=20`,
    );
  } catch (error) {
    return (
      <>
        <header className="page-header">
          <div>
            <span className="page-eyebrow">{copy.claimsKicker}</span>
            <h1>{copy.claimsTitle}</h1>
          </div>
        </header>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError ? error.message : copy.loadError}
        </div>
      </>
    );
  }

  return (
    <div className="claim-review-page">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">{copy.claimsKicker}</span>
          <h1>{copy.claimsTitle}</h1>
          <p>{copy.claimsBody}</p>
        </div>
        <div className="claim-review-count">
          <strong>{queue.meta.total}</strong>
          {status === 'PENDING'
            ? copy.waiting.replace('{count}', String(queue.meta.total))
            : status === 'APPROVED'
              ? 'approved'
              : 'rejected'}
        </div>
      </header>
      <form className="business-review-filters" action="/businesses/claims" method="get">
        <label className="visually-hidden" htmlFor="claim-status">
          Claim status
        </label>
        <select id="claim-status" name="status" defaultValue={status}>
          <option value="PENDING">Waiting for review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <button type="submit" className="btn btn--primary">
          Apply
        </button>
      </form>
      {queue.items.length ? (
        <div className="claim-review-list">
          {queue.items.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} copy={copy} locale={locale} status={status} />
          ))}
        </div>
      ) : (
        <div className="card empty">
          <ConsoleIcon name="shield" size={36} />
          <h2>{status === 'PENDING' ? copy.emptyTitle : `No ${status.toLowerCase()} claims`}</h2>
          <p>{status === 'PENDING' ? copy.emptyBody : 'Nothing to show for this filter.'}</p>
        </div>
      )}
      {queue.meta.totalPages > 1 ? (
        <nav
          className="claim-review-pagination"
          aria-label={copy.pageOf
            .replace('{page}', String(queue.meta.page))
            .replace('{total}', String(queue.meta.totalPages))}
        >
          {page > 1 ? (
            <a
              className="btn btn--ghost"
              href={`/businesses/claims?status=${status}&page=${page - 1}`}
            >
              ← {copy.previous}
            </a>
          ) : (
            <span />
          )}
          <span>
            {copy.pageOf
              .replace('{page}', String(queue.meta.page))
              .replace('{total}', String(queue.meta.totalPages))}
          </span>
          {queue.meta.hasNextPage ? (
            <a
              className="btn btn--ghost"
              href={`/businesses/claims?status=${status}&page=${page + 1}`}
            >
              {copy.next} →
            </a>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function ClaimCard({
  claim,
  copy,
  locale,
  status,
}: {
  claim: BusinessClaimItem;
  copy: AdminQueueCopy;
  locale: AdminQueueLocale;
  status: string;
}) {
  const scale =
    claim.proposedScale === 'INDIVIDUAL_SHOP'
      ? copy.scaleShop
      : claim.proposedScale === 'HOME_BUSINESS'
        ? copy.scaleHome
        : claim.proposedScale === 'ENTERPRISE'
          ? copy.scaleEnterprise
          : copy.unknown;
  const offering =
    claim.offeringProposed === 'PRODUCTS'
      ? copy.products
      : claim.offeringProposed === 'SERVICES'
        ? copy.services
        : claim.offeringProposed === 'BOTH'
          ? copy.both
          : copy.unknown;
  return (
    <article className="claim-review-card">
      <header>
        <span className="claim-review-logo">{claim.business.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <span className="page-eyebrow">{copy.business}</span>
          <h2>{claim.business.name}</h2>
          <p>{claim.business.sourceName ?? copy.source}</p>
        </div>
        <a href={`https://locz.in/b/${claim.business.slug}`} target="_blank" rel="noreferrer">
          {copy.openProfile} <ConsoleIcon name="arrow" size={14} />
        </a>
      </header>
      <div className="claim-review-grid">
        <section>
          <span>{copy.evidence}</span>
          <blockquote>{claim.evidence}</blockquote>
        </section>
        <dl>
          <div>
            <dt>{copy.claimant}</dt>
            <dd>{claim.claimant.displayName ?? copy.unknown}</dd>
          </div>
          <div>
            <dt>{copy.phone}</dt>
            <dd>{claim.contactPhone ?? claim.claimant.phoneE164 ?? copy.noContact}</dd>
          </div>
          <div>
            <dt>{copy.email}</dt>
            <dd>{claim.claimant.email ?? copy.noContact}</dd>
          </div>
          <div>
            <dt>{copy.submitted}</dt>
            <dd>
              {new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : `${locale}-IN`, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(claim.createdAt))}
            </dd>
          </div>
        </dl>
      </div>
      <div className="claim-review-signals">
        <span>
          <strong>{copy.setup}</strong>
          {scale}
        </span>
        <span>
          <strong>{copy.offering}</strong>
          {offering}
        </span>
        <span>
          <strong>{copy.matchedSignals}</strong>
          {claim.matchedSignals.length ? claim.matchedSignals.join(', ') : copy.noSignals}
        </span>
        <span>
          <strong>{copy.location}</strong>
          {claim.locationAccuracyM !== null
            ? copy.accurateTo.replace('{metres}', String(claim.locationAccuracyM))
            : copy.locationMissing}
        </span>
        {claim.autoApproved ? (
          <span className="is-ready">
            <ConsoleIcon name="shield" size={14} />
            {copy.auto}
          </span>
        ) : null}
      </div>
      {status === 'PENDING' ? (
        <ClaimDecision claimId={claim.id} copy={copy} />
      ) : status === 'APPROVED' ? (
        <VerificationDecision businessId={claim.business.id} />
      ) : null}
    </article>
  );
}
