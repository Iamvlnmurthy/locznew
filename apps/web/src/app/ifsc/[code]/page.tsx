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
    <div className="container ifsc-page">
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

      <header className="ifsc-head">
        <span className="section-kicker">Bank branch · IFSC</span>
        <h1>
          {b.bank} — {b.branch}
        </h1>
        {place ? <p className="ifsc-head__place">{place}</p> : null}
      </header>

      <section className="business-profile-section bank-panel" aria-label="Banking details">
        <div className="bank-panel__head">
          <span className="section-kicker">Banking details</span>
          <span className="bank-source">
            <Icon name="shield" />
            Reserve Bank of India · IFSC directory
          </span>
        </div>
        <div className="bank-branch-card">
          <div className="bank-branch-card__id">
            <h2 className="bank-branch-card__name">
              {b.bank}
              <span className="bank-branch-card__branch"> · {b.branch} Branch</span>
            </h2>
            {b.address ? <p className="bank-branch-card__addr">{b.address}</p> : null}
          </div>
          <dl className="bank-codes">
            <div className="bank-codes__row">
              <dt>IFSC code</dt>
              <dd>
                <CopyCode value={b.ifsc} label="IFSC" />
              </dd>
            </div>
            {b.micr ? (
              <div className="bank-codes__row">
                <dt>MICR code</dt>
                <dd>
                  <CopyCode value={b.micr} label="MICR" />
                </dd>
              </div>
            ) : null}
            {b.contact ? (
              <div className="bank-codes__row">
                <dt>Contact</dt>
                <dd className="bank-codes__plain">{b.contact}</dd>
              </div>
            ) : null}
            {services(b).length ? (
              <div className="bank-codes__row">
                <dt>Transfers</dt>
                <dd>
                  <ul className="bank-services" aria-label="Supported transfers">
                    {services(b).map((s) => (
                      <li key={s} className="bank-services__chip">
                        {s}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {data.nearby.length ? (
        <section className="business-profile-section bank-panel" aria-label="Other branches">
          <h2 className="bank-panel__title">
            Other {b.bank} branches in {b.city ? title(b.city) : place}
          </h2>
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
                        {n.branch}
                      </Link>
                      {n.address ? (
                        <span className="bank-branch-table__addr">{n.address}</span>
                      ) : null}
                    </th>
                    <td className="bank-branch-table__micr">{n.ifsc}</td>
                    <td className="bank-branch-table__micr">{n.micr ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
