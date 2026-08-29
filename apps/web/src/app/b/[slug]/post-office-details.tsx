import { Icon } from '@/components/icons';
import { CopyCode } from './copy-code';
import type { PostOfficeInfo } from './page';

/**
 * Authoritative India Post block for post-office pages. Every value comes from the government post-office
 * directory, matched by pincode, so it is internally consistent and never a guess:
 *  - `matched` → one verified office: its pincode, type and delivery status are stated outright.
 *  - otherwise → the offices in the pincode, so the reader finds theirs.
 */
export function PostOfficeDetails({ info, place }: { info: PostOfficeInfo; place: string }) {
  const { matched, offices, pincode, areaLabel, officeCount } = info;
  const area = areaLabel ?? place;

  return (
    <section
      className="business-profile-section bank-panel"
      id="post-office"
      aria-labelledby="po-h"
    >
      <div className="bank-panel__head">
        <span className="section-kicker">Post office details</span>
        <span className="bank-source">
          <Icon name="shield" />
          India Post · official directory
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
              <dt>Pincode</dt>
              <dd>
                <CopyCode value={matched.pincode} label="pincode" />
              </dd>
            </div>
            {matched.delivery ? (
              <div className="bank-codes__row">
                <dt>Delivery</dt>
                <dd className="bank-codes__plain">{matched.delivery}</dd>
              </div>
            ) : null}
            {matched.division ? (
              <div className="bank-codes__row">
                <dt>Division</dt>
                <dd className="bank-codes__plain">{matched.division}</dd>
              </div>
            ) : null}
            {matched.circle ? (
              <div className="bank-codes__row">
                <dt>Postal circle</dt>
                <dd className="bank-codes__plain">{matched.circle}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : (
        <>
          <h2 id="po-h" className="bank-panel__title">
            Post offices in pincode {pincode}
            {area ? `, ${area}` : ''}
          </h2>
          <p className="bank-panel__lead">
            Official India Post offices under pincode {pincode}. Each is listed with its type and
            delivery status — find the one you need below.
          </p>
          <div className="bank-branch-table-wrap">
            <table className="bank-branch-table">
              <thead>
                <tr>
                  <th scope="col">Post office</th>
                  <th scope="col">Type</th>
                  <th scope="col">Pincode</th>
                  <th scope="col">Delivery</th>
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
                      <CopyCode value={o.pincode} label="pincode" />
                    </td>
                    <td className="bank-branch-table__svc">{o.delivery ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {officeCount > offices.length ? (
            <p className="bank-panel__more">
              Showing {offices.length} of {officeCount} offices under pincode {pincode}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
