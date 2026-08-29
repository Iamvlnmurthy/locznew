import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Icon } from '@/components/icons';
import { apiSafe, SITE_URL } from '@/lib/api';
import { CopyCode } from '../../b/[slug]/copy-code';

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
  const data = await loadIfsc(code);
  if (!data) return { title: 'IFSC code not found', robots: { index: false, follow: false } };
  const b = data.branch;
  const canonical = `${SITE_URL}/ifsc/${b.ifsc}`;
  return {
    title: `${b.bank} ${b.branch} IFSC Code ${b.ifsc}${b.city ? ` — ${title(b.city)}` : ''}`,
    description:
      `IFSC code of ${b.bank}, ${b.branch} branch is ${b.ifsc}${b.micr ? `, MICR ${b.micr}` : ''}. ${b.address ?? ''} Use it for NEFT, RTGS, IMPS and UPI transfers.`.slice(
        0,
        250,
      ),
    keywords: [
      `${b.bank} ${b.branch} IFSC code`,
      b.ifsc,
      `${b.bank} IFSC code ${b.branch}`,
      ...(b.micr ? [`${b.bank} ${b.branch} MICR code`, b.micr] : []),
      ...(b.city ? [`${b.bank} IFSC code ${title(b.city)}`] : []),
      `${b.bank} ${b.branch} branch`,
    ],
    alternates: { canonical },
    openGraph: { title: `${b.bank} ${b.branch} — IFSC ${b.ifsc}`, url: canonical, type: 'website' },
  };
}

export const revalidate = 86400;

export default async function IfscPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await loadIfsc(code);
  if (!data) notFound();
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
        name: `What is the IFSC code of ${b.bank}, ${b.branch} branch?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The IFSC code of ${b.bank}, ${b.branch} branch is ${b.ifsc}${b.micr ? `, and the MICR code is ${b.micr}` : ''}.`,
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

      <nav className="ifsc-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> › </span>
        <Link href="/c/banks-atms">Banks &amp; ATMs</Link>
        <span aria-hidden="true"> › </span>
        <span>{b.bank}</span>
      </nav>

      <header className="ifsc-hero">
        <span className="ifsc-hero__mark" aria-hidden="true">
          <Icon name="bank" />
        </span>
        <div className="ifsc-hero__copy">
          <span className="ifsc-hero__eyebrow">Official bank branch information</span>
          <h1>
            {b.bank}
            <span>{branchName} branch</span>
          </h1>
          <p className="ifsc-hero__place">
            <Icon name="location" />
            {place || 'India'}
          </p>
          {b.address ? <p className="ifsc-hero__address">{b.address}</p> : null}
        </div>
        <aside className="ifsc-hero__code" aria-label={`IFSC code ${b.ifsc}`}>
          <span>IFSC code</span>
          <CopyCode value={b.ifsc} label="IFSC" />
          <p>Copy the code for bank transfers</p>
        </aside>
      </header>

      <section className="ifsc-assurance" aria-label="Information source">
        <span className="ifsc-assurance__icon" aria-hidden="true">
          <Icon name="shield" />
        </span>
        <span>
          <strong>Reserve Bank of India directory</strong>
          <small>Branch and routing information from the official IFSC dataset</small>
        </span>
        <span className="ifsc-assurance__status">
          <i aria-hidden="true" /> Official record
        </span>
      </section>

      <div className="ifsc-content-grid">
        <section className="ifsc-details-card" aria-labelledby="ifsc-details-title">
          <div className="ifsc-section-head">
            <div>
              <span className="section-kicker">Branch information</span>
              <h2 id="ifsc-details-title">Codes and contact details</h2>
            </div>
            <Icon name="bank" />
          </div>
          <dl className="ifsc-facts">
            <div className="ifsc-fact ifsc-fact--code">
              <dt>IFSC code</dt>
              <dd>
                <CopyCode value={b.ifsc} label="IFSC" />
              </dd>
            </div>
            {b.micr ? (
              <div className="ifsc-fact ifsc-fact--code">
                <dt>MICR code</dt>
                <dd>
                  <CopyCode value={b.micr} label="MICR" />
                </dd>
              </div>
            ) : null}
            <div className="ifsc-fact">
              <dt>Bank</dt>
              <dd>{b.bank}</dd>
            </div>
            <div className="ifsc-fact">
              <dt>Branch</dt>
              <dd>{branchName}</dd>
            </div>
            {b.contact ? (
              <div className="ifsc-fact">
                <dt>Contact</dt>
                <dd>
                  {cleanContact ? <a href={`tel:${cleanContact}`}>{b.contact}</a> : b.contact}
                </dd>
              </div>
            ) : null}
            {b.address ? (
              <div className="ifsc-fact ifsc-fact--wide">
                <dt>Branch address</dt>
                <dd>{b.address}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <aside className="ifsc-transfer-card" aria-labelledby="ifsc-transfer-title">
          <span className="ifsc-transfer-card__icon" aria-hidden="true">
            <Icon name="sparkles" />
          </span>
          <span className="section-kicker">Transfer support</span>
          <h2 id="ifsc-transfer-title">Available payment rails</h2>
          {transferServices.length ? (
            <ul className="ifsc-transfer-list" aria-label="Supported transfers">
              {transferServices.map((service) => (
                <li key={service}>
                  <Icon name="check" /> {service}
                </li>
              ))}
            </ul>
          ) : (
            <p>Transfer availability is not listed for this branch.</p>
          )}
          <p className="ifsc-transfer-card__note">
            Confirm the beneficiary name and account number with your bank before transferring.
          </p>
          <Link href="/c/banks-atms" className="ifsc-transfer-card__link">
            Browse banks &amp; ATMs <Icon name="arrow" />
          </Link>
        </aside>
      </div>

      {data.nearby.length ? (
        <section className="ifsc-nearby" aria-labelledby="ifsc-nearby-title">
          <div className="ifsc-section-head">
            <div>
              <span className="section-kicker">Nearby branches</span>
              <h2 id="ifsc-nearby-title">
                Other {b.bank} branches in {b.city ? title(b.city) : place}
              </h2>
            </div>
            <span className="ifsc-nearby__count">{data.nearby.length} listed</span>
          </div>
          <div className="bank-branch-table-wrap">
            <table className="bank-branch-table">
              <thead>
                <tr>
                  <th scope="col">Branch</th>
                  <th scope="col">IFSC</th>
                  <th scope="col">MICR</th>
                </tr>
              </thead>
              <tbody>
                {data.nearby.map((n) => (
                  <tr key={n.ifsc}>
                    <th scope="row" className="bank-branch-table__branch">
                      <Link href={`/ifsc/${n.ifsc}`} className="bank-branch-table__branch-name">
                        {title(n.branch)}
                      </Link>
                      {n.address ? (
                        <span className="bank-branch-table__addr">{n.address}</span>
                      ) : null}
                    </th>
                    <td className="bank-branch-table__micr" data-label="IFSC">
                      {n.ifsc}
                    </td>
                    <td className="bank-branch-table__micr" data-label="MICR">
                      {n.micr ?? '—'}
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
