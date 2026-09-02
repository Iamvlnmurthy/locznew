import { Icon } from '@/components/icons';
import { CopyCode } from './copy-code';
import type { PostOfficeInfo } from './page';

/**
 * Authoritative India Post block for post-office pages. Every value comes from the government post-office
 * directory, matched by pincode, so it is internally consistent and never a guess:
 *  - `matched` → one verified office: its pincode, type and delivery status are stated outright.
 *  - otherwise → the offices in the pincode, so the reader finds theirs.
 */
export function PostOfficeDetails({
  info,
  place,
  labels: l,
}: {
  info: PostOfficeInfo;
  place: string;
  labels: Record<string, string>;
}) {
  const { matched, offices, pincode, areaLabel, officeCount } = info;
  const area = areaLabel ?? place;
  const pin = pincode ?? '—';

  return (
    <section
      className="business-profile-section bank-panel"
      id="post-office"
      aria-labelledby="po-h"
    >
      <div className="bank-panel__head">
        <span className="section-kicker">{l.postOfficeDetails}</span>
        <span className="bank-source">
          <Icon name="shield" />
          {l.indiaPostDirectory}
        </span>
      </div>

      {matched ? (
        <div className="bank-branch-card">
          <div className="bank-branch-card__id">
            <h2 id="po-h" className="bank-branch-card__name">
              {matched.officeName}
              <span className="bank-branch-card__branch"> · {matched.officeType}</span>
            </h2>
            {matched.district || matched.state ? (
              <p className="bank-branch-card__addr">
                {[matched.district, matched.state].filter(Boolean).join(', ')}
              </p>
            ) : null}
          </div>
          <dl className="bank-codes">
            <div className="bank-codes__row">
              <dt>{l.pincode}</dt>
              <dd>
                <CopyCode
                  value={matched.pincode}
                  label={l.pincode}
                  copyLabel={l.copyCode}
                  copiedLabel={l.copied}
                />
              </dd>
            </div>
            {matched.delivery ? (
              <div className="bank-codes__row">
                <dt>{l.delivery}</dt>
                <dd className="bank-codes__plain">{matched.delivery}</dd>
              </div>
            ) : null}
            {matched.division ? (
              <div className="bank-codes__row">
                <dt>{l.division}</dt>
                <dd className="bank-codes__plain">{matched.division}</dd>
              </div>
            ) : null}
            {matched.circle ? (
              <div className="bank-codes__row">
                <dt>{l.postalCircle}</dt>
                <dd className="bank-codes__plain">{matched.circle}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : (
        <>
          <h2 id="po-h" className="bank-panel__title">
            {l.postOfficesTitle.replace('{pincode}', pin).replace('{area}', area)}
          </h2>
          <p className="bank-panel__lead">{l.postOfficesBody.replace('{pincode}', pin)}</p>
          <div className="bank-branch-table-wrap">
            <table className="bank-branch-table">
              <thead>
                <tr>
                  <th scope="col">{l.postOffice}</th>
                  <th scope="col">{l.type}</th>
                  <th scope="col">{l.pincode}</th>
                  <th scope="col">{l.delivery}</th>
                </tr>
              </thead>
              <tbody>
                {offices.map((o) => (
                  <tr key={`${o.officeName}-${o.pincode}`}>
                    <th scope="row" className="bank-branch-table__branch">
                      <span className="bank-branch-table__branch-name">{o.officeName}</span>
                    </th>
                    <td className="bank-branch-table__micr">{o.officeType}</td>
                    <td>
                      <CopyCode
                        value={o.pincode}
                        label={l.pincode}
                        copyLabel={l.copyCode}
                        copiedLabel={l.copied}
                      />
                    </td>
                    <td className="bank-branch-table__svc">{o.delivery ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {officeCount > offices.length ? (
            <p className="bank-panel__more">
              {l.showingOffices
                .replace('{shown}', String(offices.length))
                .replace('{total}', String(officeCount))
                .replace('{pincode}', pin)}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
