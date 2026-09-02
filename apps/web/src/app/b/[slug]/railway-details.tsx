import { Icon } from '@/components/icons';
import { CopyCode } from './copy-code';
import type { RailwayInfo } from './page';

/**
 * Railway-station block: the station code (the stable, searchable fact) and the trains that serve it.
 * Only stable facts — code, train number, name and route — are shown; schedule times are omitted so the
 * page never presents a stale timing as current.
 */
export function RailwayDetails({
  info,
  labels: l,
}: {
  info: RailwayInfo;
  labels: Record<string, string>;
}) {
  const { stationCode, stationName, trains, trainCount } = info;
  return (
    <section className="business-profile-section bank-panel" id="railway" aria-labelledby="rail-h">
      <div className="bank-panel__head">
        <span className="section-kicker">{l.stationDetails}</span>
        <span className="bank-source">
          <Icon name="shield" />
          {l.railwayTimetable}
        </span>
      </div>

      <div className="bank-branch-card">
        <div className="bank-branch-card__id">
          <h2 id="rail-h" className="bank-branch-card__name">
            {stationName}
            <span className="bank-branch-card__branch"> · {l.railwayStation}</span>
          </h2>
        </div>
        <dl className="bank-codes">
          <div className="bank-codes__row">
            <dt>{l.stationCode}</dt>
            <dd>
              <CopyCode
                value={stationCode}
                label={l.stationCode}
                copyLabel={l.copyCode}
                copiedLabel={l.copied}
              />
            </dd>
          </div>
          <div className="bank-codes__row">
            <dt>{l.trains}</dt>
            <dd className="bank-codes__plain">
              {l.trainsCount.replace('{count}', String(trainCount))}
            </dd>
          </div>
        </dl>
      </div>

      {trains.length ? (
        <>
          <h3 className="bank-panel__title" style={{ marginTop: '20px', fontSize: '1.05rem' }}>
            {l.trainsServing.replace('{station}', stationName)}
          </h3>
          <div className="bank-branch-table-wrap">
            <table className="bank-branch-table">
              <thead>
                <tr>
                  <th scope="col">{l.train}</th>
                  <th scope="col">{l.name}</th>
                  <th scope="col">{l.route}</th>
                </tr>
              </thead>
              <tbody>
                {trains.map((t) => (
                  <tr key={t.number}>
                    <th scope="row" className="bank-branch-table__micr">
                      {t.number}
                    </th>
                    <td className="bank-branch-table__branch">
                      <span className="bank-branch-table__branch-name">{t.name}</span>
                    </td>
                    <td>
                      {t.from && t.to ? (
                        <span className="bank-branch-table__addr" style={{ maxWidth: 'none' }}>
                          {t.from} → {t.to}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {trainCount > trains.length ? (
            <p className="bank-panel__more">
              {l.showingTrains
                .replace('{shown}', String(trains.length))
                .replace('{total}', String(trainCount))}{' '}
              {l.checkLive}
            </p>
          ) : (
            <p className="bank-panel__more">{l.checkLive}</p>
          )}
        </>
      ) : null}
    </section>
  );
}
