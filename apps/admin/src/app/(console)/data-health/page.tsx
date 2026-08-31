import { api } from '@/lib/api';

interface Coverage {
  sources: Array<{
    id: string;
    name: string;
    recordsCreated: number;
    health: string;
    runnable: boolean;
    attributionRequired: boolean;
  }>;
  businesses: { total: number; byClaimStatus: Record<string, number> };
  topCities: Array<{ name: string; count: number }>;
  topCategories: Array<{ name: string; count: number }>;
}

const card: React.CSSProperties = {
  border: '1px solid var(--border, #e4e4e7)',
  borderRadius: 12,
  padding: 16,
  background: 'var(--surface, #fff)',
};
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--border, #eee)' };

export default async function DataHealthPage() {
  const data = await api<Coverage>('/admin/data-sources/health').catch(() => null);
  if (!data) {
    return (
      <div style={{ display: 'grid', gap: 20 }}>
        <header>
          <h1 style={{ margin: 0 }}>Data health</h1>
        </header>
        <div className="alert alert--error" role="alert">
          We could not load data-source health. Check the API connection and your permission.
        </div>
      </div>
    );
  }
  const claimed = data.businesses?.byClaimStatus?.['CLAIMED'] ?? 0;
  const unclaimed = data.businesses?.byClaimStatus?.['UNCLAIMED'] ?? 0;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <header>
        <h1 style={{ margin: 0 }}>Data health</h1>
        <p style={{ color: 'var(--muted, #71717a)', marginTop: 4 }}>
          Local inventory coverage and external-source status (see docs/DATA_ENGINE_PLAN.md).
        </p>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {[
          { label: 'Businesses', value: data.businesses.total },
          { label: 'Claimed', value: claimed },
          { label: 'Unclaimed', value: unclaimed },
          { label: 'Sources', value: data.sources.length },
        ].map((s) => (
          <div key={s.label} style={{ ...card, minWidth: 150, flex: '1 1 150px' }}>
            <strong style={{ fontSize: 26 }}>{s.value.toLocaleString()}</strong>
            <div style={{ color: 'var(--muted, #71717a)', fontSize: 13 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Top cities</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {data.topCities.map((c) => (
                <tr key={c.name}>
                  <td style={td}>{c.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Top categories</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {data.topCategories.map((c) => (
                <tr key={c.name}>
                  <td style={td}>{c.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Data sources</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Source</th>
              <th style={{ ...th, textAlign: 'right' }}>Records</th>
              <th style={th}>Health</th>
              <th style={th}>Runnable</th>
              <th style={th}>Attribution</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.id}>
                <td style={td}>{s.name}</td>
                <td style={{ ...td, textAlign: 'right' }}>{s.recordsCreated.toLocaleString()}</td>
                <td style={td}>{s.health}</td>
                <td style={td}>{s.runnable ? 'Yes' : 'No'}</td>
                <td style={td}>{s.attributionRequired ? 'Required' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
