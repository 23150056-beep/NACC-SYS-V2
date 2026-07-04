import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, Input, SeverityBadge, EmptyState, Icon, hoverLift, PAGE } from '../ui';

// Trajectory presentation (mirrors the TRAJ map in ChildProgressReport.jsx).
const TRAJ = {
  improving: { label: 'Improving', icon: 'trending-down', color: 'var(--success-600)', bg: 'var(--success-50)' },
  worsening: { label: 'Worsening', icon: 'trending-up', color: 'var(--red-600)', bg: 'var(--red-50)' },
  stable: { label: 'Stable', icon: 'minus', color: 'var(--blue-600)', bg: 'var(--blue-50)' },
  baseline: { label: 'Baseline', icon: 'flag', color: 'var(--text-muted)', bg: 'var(--ink-50)' },
};
// Classification -> severity badge level (mirrors the TRIAGE map in Report.jsx).
const TRIAGE = {
  'Normal': 'standard',
  'Needs Monitoring': 'moderate',
  'Needs Counseling Attention': 'high',
};
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'improving', label: 'Improving' },
  { key: 'worsening', label: 'Worsening' },
  { key: 'stable', label: 'Stable' },
];

export default function Monitoring() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [traj, setTraj] = useState('all');

  useEffect(() => {
    api.get('/reports/monitoring/').then((r) => setRows(r.data)).catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const c = { all: rows.length, improving: 0, worsening: 0, stable: 0 };
    rows.forEach((r) => { if (c[r.trajectory] != null) c[r.trajectory] += 1; });
    return c;
  }, [rows]);

  const visible = useMemo(() => rows
    .filter((r) => (r.child_name || '').toLowerCase().includes(q.toLowerCase())
      || (r.case_ref || '').toLowerCase().includes(q.toLowerCase()))
    .filter((r) => traj === 'all' || r.trajectory === traj)
    .sort((a, b) => (a.child_name || '').localeCompare(b.child_name || '', undefined, { sensitivity: 'base' })),
    [rows, q, traj]);

  const td = { padding: '11px 16px', fontSize: 13, color: 'var(--text-body)', whiteSpace: 'nowrap' };

  const TrajPill = ({ value }) => {
    const t = TRAJ[value] || TRAJ.baseline;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: t.bg, color: t.color, fontWeight: 800, fontSize: 12 }}>
        <Icon name={t.icon} size={14} /> {t.label}
      </span>
    );
  };

  return (
    <div style={{ ...PAGE, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 340, maxWidth: '100%' }}>
          <Input placeholder="Search by child name or case ID…" value={q} onChange={(e) => setQ(e.target.value)} leading={<Icon name="search" size={16} />} />
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Showing <strong style={{ color: 'var(--text-strong)' }}>{visible.length}</strong> of {rows.length} children
        </div>
      </div>

      <div role="tablist" aria-label="Filter by trajectory" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map((f) => {
          const on = traj === f.key;
          return (
            <button key={f.key} role="tab" aria-selected={on} onClick={() => setTraj(f.key)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', cursor: 'pointer', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, border: `1px solid ${on ? 'var(--blue-500)' : 'var(--border)'}`, background: on ? 'var(--blue-50)' : 'var(--surface)', color: on ? 'var(--blue-700)' : 'var(--text-body)', transition: 'var(--transition-base)' }}>
              {f.label}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: on ? 'var(--blue-600)' : 'var(--text-faint)' }}>{counts[f.key] || 0}</span>
            </button>
          );
        })}
      </div>

      <Card padding="0">
        {visible.length === 0 ? (
          <EmptyState icon={<Icon name="folder-search" size={24} />} title="No children to monitor" description="Try a different name, case ID, or trajectory filter." />
        ) : (
          <div className="racco-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
              <thead>
                <tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Child', 'Case Type', 'Psychologist', 'Trajectory', 'Latest', 'Score', 'Last Assessment', 'Assessments'].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const level = TRIAGE[r.latest_classification];
                  const open = () => navigate(`/report/child/${r.child_id}`);
                  return (
                    <tr key={r.child_id} tabIndex={0} role="button" aria-label={`Open ${r.child_name}'s progress report`}
                      onClick={open}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
                      style={{ borderBottom: '1px solid var(--ink-100)', cursor: 'pointer', transition: 'background var(--dur-fast) var(--ease-out)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--blue-50)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--blue-700)', whiteSpace: 'nowrap' }}>{r.child_name}</div>
                        <div className="racco-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.case_ref}</div>
                      </td>
                      <td style={td}>{r.case_type || '—'}</td>
                      <td style={td}>{r.psychologist_name || '—'}</td>
                      <td style={{ padding: '11px 16px' }}><TrajPill value={r.trajectory} /></td>
                      <td style={{ padding: '11px 16px' }}>{level ? <SeverityBadge level={level} size="sm" /> : <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                      <td style={td}>{r.latest_score != null ? r.latest_score : '—'}</td>
                      <td style={td}>{r.last_assessment_date || '—'}</td>
                      <td style={td}>{r.assessment_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
