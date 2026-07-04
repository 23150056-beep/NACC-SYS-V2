import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { Card, StatCard, Button, Badge, Icon, PAGE } from '../ui';

const RANGES = ['weekly', 'monthly', 'yearly'];
const EMPTY = { total: 0, children: 0, avg_score: null, avg_confidence: null, by_classification: {}, by_priority: {}, per_psychologist: [], trend: [], attention: [] };

export default function AgencySummary() {
  const [range, setRange] = useState('monthly');
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/reports/summary/?range=${range}`).then((r) => setData(r.data)).catch(() => setData(EMPTY));
  }, [range]);

  const downloadCsv = async () => {
    try {
      const res = await api.get(`/reports/summary/?range=${range}&export=csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `agency-summary-${range}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { /* ignore */ }
  };

  const d = data || EMPTY;
  const trend = (d.trend || []).map((t) => ({ bucket: t.bucket, count: t.count }));

  return (
    <div style={PAGE} className="racco-print-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--ink-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: 3 }} className="racco-no-print">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)} style={{ padding: '6px 16px', borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, textTransform: 'capitalize', background: range === r ? 'var(--blue-600)' : 'transparent', color: range === r ? '#fff' : 'var(--text-muted)', transition: 'var(--transition-base)' }}>{r}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }} className="racco-no-print">
          <Button variant="secondary" onClick={downloadCsv} iconLeft={<Icon name="download" size={17} />}>CSV</Button>
          <Button variant="secondary" onClick={() => window.print()} iconLeft={<Icon name="printer" size={17} />}>Print / Save PDF</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Assessments" value={d.total} tone="brand" icon={<Icon name="clipboard-check" size={18} />} />
        <StatCard label="Children Assessed" value={d.children} tone="success" icon={<Icon name="users" size={18} />} />
        <StatCard label="Avg Score" value={d.avg_score ?? '—'} tone="amber" icon={<Icon name="activity" size={18} />} />
        <StatCard label="Avg Confidence" value={d.avg_confidence != null ? `${d.avg_confidence}%` : '—'} tone="brand" icon={<Icon name="gauge" size={18} />} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 20, marginBottom: 20 }}>
        <Card eyebrow="Assessments over time" title="Trend" padding="20px">
          {trend.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No assessments in this period.</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--blue-600)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card eyebrow="Outcomes" title="By classification" padding="20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(d.by_classification).length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</div>}
            {Object.entries(d.by_classification).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--ink-50)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-strong)' }}>{k}</span>
                <span className="racco-mono" style={{ fontWeight: 700, color: 'var(--blue-600)' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card eyebrow="Clinical team" title="Per-psychologist activity" padding="0" style={{ marginBottom: 20 }}>
        <div className="racco-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
              {['Psychologist', 'Assessments', 'Case mix'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.per_psychologist.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 16, color: 'var(--text-faint)', fontSize: 13 }}>No assessments in this period.</td></tr>
              ) : d.per_psychologist.map((p) => (
                <tr key={p.name} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{p.name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-body)' }}>{p.count}</td>
                  <td style={{ padding: '10px 14px' }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{Object.entries(p.classes).map(([k, v]) => <Badge key={k} tone="neutral">{k} · {v}</Badge>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card eyebrow="Follow-up" title="Children needing attention" padding="20px">
        {d.attention.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>None flagged this period.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.attention.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 'var(--radius-md)', background: 'var(--red-50)', border: '1px solid var(--red-100)' }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{c.child}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{c.case_type} · score {c.score ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
