import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Icon } from '@/components/icons';
import { apiSafe, SITE_URL } from '@/lib/api';
import { CopyCode } from '../../b/[slug]/copy-code';
import { getMessageGroup } from '@/i18n';
import { getLocale, localizedAlternates } from '@/lib/session';

interface Branch {
  ifsc: string;
  bank: string;
  branch: string;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  micr: string | null;
  contact: string | null;
  neft: boolean;
  rtgs: boolean;
  imps: boolean;
  upi: boolean;
}
interface IfscResult {
  branch: Branch;
  nearby: Branch[];
}

const loadIfsc = cache(async (code: string): Promise<IfscResult | null> => {
  return apiSafe<IfscResult>(`/banks/ifsc/${encodeURIComponent(code.toUpperCase())}`, {
    revalidate: 86400,
  });
});

function title(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function services(b: Branch): string[] {
  return [
    ['NEFT', b.neft],
    ['RTGS', b.rtgs],
    ['IMPS', b.imps],
    ['UPI', b.upi],
  ]
    .filter(([, on]) => on)
    .map(([n]) => n as string);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const [data, locale] = await Promise.all([loadIfsc(code), getLocale()]);
  const n = getMessageGroup(locale, 'ifscUi');
  if (!data) return { title: n.notFound, robots: { index: false, follow: false } };
  const b = data.branch;
  const canonical = `${SITE_URL}/ifsc/${b.ifsc}`;
  const city = b.city ? title(b.city) : n.india;
  return {
    title: n.metaTitle
      .replace('{bank}', b.bank)
      .replace('{branch}', title(b.branch))
      .replace('{ifsc}', b.ifsc)
      .replace('{city}', city),
    description: n.metaDescription
      .replace('{bank}', b.bank)
      .replace('{branch}', title(b.branch))
      .replace('{ifsc}', b.ifsc)
      .replace('{address}', b.address ?? ''),
    keywords: [
      `${b.bank} ${b.branch} IFSC code`,
      b.ifsc,
      `${b.bank} IFSC code ${b.branch}`,
      ...(b.micr ? [`${b.bank} ${b.branch} MICR code`, b.micr] : []),
      ...(b.city ? [`${b.bank} IFSC code ${title(b.city)}`] : []),
      `${b.bank} ${b.branch} branch`,
    ],
    alternates: await localizedAlternates(`/ifsc/${b.ifsc}`),
    openGraph: { title: `${b.bank} ${b.branch} — IFSC ${b.ifsc}`, url: canonical, type: 'website' },
  };
}

export const revalidate = 86400;

export default async function IfscPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [data, locale] = await Promise.all([loadIfsc(code), getLocale()]);
  if (!data) notFound();
  const n = getMessageGroup(locale, 'ifscUi');
  const b = data.branch;
  const place = [b.district && title(b.district), b.state && title(b.state)]
    .filter(Boolean)
    .join(', ');
  const branchName = title(b.branch);
  const transferServices = services(b);
  const cleanContact = b.contact?.replace(/[^0-9+]/g, '');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BankOrCreditUnion',
    name: `${b.bank} — ${b.branch}`,
    branchCode: b.ifsc,
    ...(b.address ? { address: { '@type': 'PostalAddress', streetAddress: b.address } } : {}),
    ...(b.contact ? { telephone: b.contact } : {}),
    areaServed: b.city ? title(b.city) : undefined,
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: n.faqQuestion.replace('{bank}', b.bank).replace('{branch}', branchName),
        acceptedAnswer: {
          '@type': 'Answer',
          text: (b.micr ? n.faqAnswerMicr : n.faqAnswer)
            .replace('{bank}', b.bank)
            .replace('{branch}', branchName)
            .replace('{ifsc}', b.ifsc)
            .replace('{micr}', b.micr ?? ''),
        },
      },
    ],
  };

  return (
    <main className="container ifsc-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }}
      />

      <nav className="ifsc-crumbs" aria-label={n.breadcrumb}>
        <Link href="/">{n.home}</Link>
        <span aria-hidden="true"> › </span>
        <Link href="/c/banks-atms">{n.banksAtms}</Link>
        <span aria-hidden="true"> › </span>
        <span>{b.bank}</span>
      </nav>

      <header className="ifsc-hero">
        <span className="ifsc-hero__mark" aria-hidden="true">
          <Icon name="bank" />
        </span>
        <div className="ifsc-hero__copy">
          <span className="ifsc-hero__eyebrow">{n.officialInformation}</span>
          <h1>
            {b.bank}
            <span>{n.branchSuffix.replace('{branch}', branchName)}</span>
          </h1>
          <p className="ifsc-hero__place">
            <Icon name="location" />
            {place || n.india}
          </p>
          {b.address ? <p className="ifsc-hero__address">{b.address}</p> : null}
        </div>
        <aside className="ifsc-hero__code" aria-label={`${n.ifscCode} ${b.ifsc}`}>
          <span>{n.ifscCode}</span>
          <CopyCode value={b.ifsc} label="IFSC" copyLabel={n.copyCode} copiedLabel={n.copied} />
          <p>{n.copyForTransfers}</p>
        </aside>
      </header>

      <section className="ifsc-assurance" aria-label={n.informationSource}>
        <span className="ifsc-assurance__icon" aria-hidden="true">
          <Icon name="shield" />
        </span>
        <span>
          <strong>{n.sourceTitle}</strong>
          <small>{n.sourceBody}</small>
        </span>
        <span className="ifsc-assurance__status">
          <i aria-hidden="true" /> {n.officialRecord}
        </span>
      </section>

      <div className="ifsc-content-grid">
        <section className="ifsc-details-card" aria-labelledby="ifsc-details-title">
          <div className="ifsc-section-head">
            <div>
              <span className="section-kicker">{n.branchInformation}</span>
              <h2 id="ifsc-details-title">{n.codesContact}</h2>
            </div>
            <Icon name="bank" />
          </div>
          <dl className="ifsc-facts">
            <div className="ifsc-fact ifsc-fact--code">
              <dt>{n.ifscCode}</dt>
              <dd>
                <CopyCode
                  value={b.ifsc}
                  label="IFSC"
                  copyLabel={n.copyCode}
                  copiedLabel={n.copied}
                />
              </dd>
            </div>
            {b.micr ? (
              <div className="ifsc-fact ifsc-fact--code">
                <dt>{n.micrCode}</dt>
                <dd>
                  <CopyCode
                    value={b.micr}
                    label="MICR"
                    copyLabel={n.copyCode}
                    copiedLabel={n.copied}
                  />
                </dd>
              </div>
            ) : null}
            <div className="ifsc-fact">
              <dt>{n.bank}</dt>
              <dd>{b.bank}</dd>
            </div>
            <div className="ifsc-fact">
              <dt>{n.branch}</dt>
              <dd>{branchName}</dd>
            </div>
            {b.contact ? (
              <div className="ifsc-fact">
                <dt>{n.contact}</dt>
                <dd>
                  {cleanContact ? <a href={`tel:${cleanContact}`}>{b.contact}</a> : b.contact}
                </dd>
              </div>
            ) : null}
            {b.address ? (
              <div className="ifsc-fact ifsc-fact--wide">
                <dt>{n.branchAddress}</dt>
                <dd>{b.address}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <aside className="ifsc-transfer-card" aria-labelledby="ifsc-transfer-title">
          <span className="ifsc-transfer-card__icon" aria-hidden="true">
            <Icon name="sparkles" />
          </span>
          <span className="section-kicker">{n.transferSupport}</span>
          <h2 id="ifsc-transfer-title">{n.paymentRails}</h2>
          {transferServices.length ? (
            <ul className="ifsc-transfer-list" aria-label={n.supportedTransfers}>
              {transferServices.map((service) => (
                <li key={service}>
                  <Icon name="check" /> {service}
                </li>
              ))}
            </ul>
          ) : (
            <p>{n.transferUnavailable}</p>
          )}
          <p className="ifsc-transfer-card__note">{n.transferNote}</p>
          <Link href="/c/banks-atms" className="ifsc-transfer-card__link">
            {n.browseBanks} <Icon name="arrow" />
          </Link>
        </aside>
      </div>

      {data.nearby.length ? (
        <section className="ifsc-nearby" aria-labelledby="ifsc-nearby-title">
          <div className="ifsc-section-head">
            <div>
              <span className="section-kicker">{n.nearbyBranches}</span>
              <h2 id="ifsc-nearby-title">
                {n.otherBranches
                  .replace('{bank}', b.bank)
                  .replace('{place}', b.city ? title(b.city) : place)}
              </h2>
            </div>
            <span className="ifsc-nearby__count">
              {n.listed.replace('{count}', String(data.nearby.length))}
            </span>
          </div>
          <div className="bank-branch-table-wrap">
            <table className="bank-branch-table">
              <thead>
                <tr>
                  <th scope="col">{n.branch}</th>
                  <th scope="col">IFSC</th>
                  <th scope="col">MICR</th>
                </tr>
              </thead>
              <tbody>
                {data.nearby.map((nearbyBranch) => (
                  <tr key={nearbyBranch.ifsc}>
                    <th scope="row" className="bank-branch-table__branch">
                      <Link
                        href={`/ifsc/${nearbyBranch.ifsc}`}
                        className="bank-branch-table__branch-name"
                      >
                        {title(nearbyBranch.branch)}
                      </Link>
                      {nearbyBranch.address ? (
                        <span className="bank-branch-table__addr">{nearbyBranch.address}</span>
                      ) : null}
                    </th>
                    <td className="bank-branch-table__micr" data-label="IFSC">
                      {nearbyBranch.ifsc}
                    </td>
                    <td className="bank-branch-table__micr" data-label="MICR">
                      {nearbyBranch.micr ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
