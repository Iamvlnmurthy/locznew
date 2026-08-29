import { Icon } from '@/components/icons';
import { CopyCode } from './copy-code';
import type { BankingInfo, BankBranch } from './page';

/** The RTGS/NEFT/etc. a branch supports, as labelled chips (bank-level facts, never invented). */
function ServiceChips({ b }: { b: BankBranch }) {
  const services = [
    ['NEFT', b.neft],
    ['RTGS', b.rtgs],
    ['IMPS', b.imps],
    ['UPI', b.upi],
  ].filter(([, on]) => on) as Array<[string, boolean]>;
  if (!services.length) return null;
  return (
    <ul className="bank-services" aria-label="Supported transfers">
      {services.map(([name]) => (
        <li key={name} className="bank-services__chip">
          {name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Authoritative banking block for bank/ATM pages. Every value here comes from the RBI IFSC directory,
 * so it is internally consistent and never a guess:
 *  - `matched` → one verified branch: its IFSC is stated outright.
 *  - otherwise → the bank's branches in the area, so the reader finds their own exact IFSC.
 */
export function BankingDetails({ banking, place }: { banking: BankingInfo; place: string }) {
  const { matched, branches, bankName, areaLabel, branchCount } = banking;
  const area = areaLabel ?? place;

  return (
    <section
      className="business-profile-section bank-panel"
      id="banking"
      aria-labelledby="banking-h"
    >
      <div className="bank-panel__head">
        <span className="section-kicker">Banking details</span>
        <span className="bank-source">
          <Icon name="shield" />
          Reserve Bank of India · IFSC directory
        </span>
      </div>

      {matched ? (
        <div className="bank-branch-card">
          <div className="bank-branch-card__id">
            <h2 id="banking-h" className="bank-branch-card__name">
              {matched.bank}
              <span className="bank-branch-card__branch"> · {matched.branch} Branch</span>
            </h2>
            {matched.address ? <p className="bank-branch-card__addr">{matched.address}</p> : null}
          </div>

          <dl className="bank-codes">
            <div className="bank-codes__row">
              <dt>IFSC code</dt>
              <dd>
                <CopyCode value={matched.ifsc} label="IFSC" />
              </dd>
            </div>
            {matched.micr ? (
              <div className="bank-codes__row">
                <dt>MICR code</dt>
                <dd>
                  <CopyCode value={matched.micr} label="MICR" />
                </dd>
              </div>
            ) : null}
            {matched.contact ? (
              <div className="bank-codes__row">
                <dt>Contact</dt>
                <dd className="bank-codes__plain">{matched.contact}</dd>
              </div>
            ) : null}
            <div className="bank-codes__row">
              <dt>Transfers</dt>
              <dd>
                <ServiceChips b={matched} />
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <>
          <h2 id="banking-h" className="bank-panel__title">
            {bankName} IFSC codes in {area}
          </h2>
          <p className="bank-panel__lead">
            Find the exact IFSC and MICR for your {bankName} branch in {area}. Each code below is
            from the official RBI directory — copy the one that matches your branch.
          </p>
          <div className="bank-branch-table-wrap">
            <table className="bank-branch-table">
              <thead>
                <tr>
                  <th scope="col">Branch</th>
                  <th scope="col">IFSC</th>
                  <th scope="col">MICR</th>
                  <th scope="col" className="bank-branch-table__svc">
                    Transfers
                  </th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.ifsc}>
                    <th scope="row" className="bank-branch-table__branch">
                      <span className="bank-branch-table__branch-name">{b.branch}</span>
                      {b.address ? (
                        <span className="bank-branch-table__addr">{b.address}</span>
                      ) : null}
                    </th>
                    <td>
                      <CopyCode value={b.ifsc} label="IFSC" />
                    </td>
                    <td className="bank-branch-table__micr">{b.micr ?? '—'}</td>
                    <td className="bank-branch-table__svc">
                      <ServiceChips b={b} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {branchCount > branches.length ? (
            <p className="bank-panel__more">
              Showing {branches.length} of {branchCount} {bankName} branches in {area}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
