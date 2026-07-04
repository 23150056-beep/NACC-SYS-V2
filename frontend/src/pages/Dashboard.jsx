import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, StatCard, Button, Badge, Icon, ROLE_META, PAGE } from '../ui';
import api from '../api/client';
import { useActivity } from '../context/ActivityContext';
import { eventText, timeAgo } from '../components/Topbar';

const EMPTY = { total_children: 0, by_status: { attention: 0, monitoring: 0, normal: 0 }, unassessed: 0, trend: [], per_psychologist: [], by_case_type: {} };

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role_name || 'Staff';
  const isPsychologist = role === 'Psychologist';
  const m = ROLE_META[role] || ROLE_META.Staff;
  const [range, setRange] = useState('monthly');
  const [stats, setStats] = useState(EMPTY);
  const [caseloads, setCaseloads] = useState([]);
  const { events } = useActivity();
  const feed = events.slice(0, 6);

  useEffect(() => {
    api.get(`/reports/dashboard/?range=${range}`).then((r) => setStats(r.data || EMPTY)).catch(() => setStats(EMPTY));
  }, [range]);

  useEffect(() => {
    // Psychologist caseload (active assigned children) for admin/staff workload balancing.
    if (!isPsychologist) api.get('/psychologists/').then((r) => setCaseloads(r.data)).catch(() => setCaseloads([]));
  }, [isPsychologist]);

  const s = stats.by_status || EMPTY.by_status;
  const series = (stats.trend || []).map((t) => ({ m: t.bucket, v: t.count }));
  const max = Math.max(1, ...series.map((t) => t.v));
  const caseMix = Object.entries(stats.by_case_type || {}).filter(([k]) => k && k !== '—');
  const myMix = isPsychologist ? Object.entries((stats.per_psychologist || [])[0]?.classes || {}) : [];

  const actions = [
    { label: 'Records', icon: 'folder-heart', variant: 'secondary', to: '/children', roles: ['Administrator', 'Psychologist', 'Staff'] },
    { label: 'New Assessment', icon: 'clipboard-list', variant: 'primary', to: '/assessment', roles: ['Psychologist'] },
    { label: 'Agency Summary', icon: 'bar-chart-3', variant: 'primary', to: '/reports/summary', roles: ['Administrator', 'Staff'] },
    { label: 'View Results', icon: 'heart-pulse', variant: 'secondary', to: '/report', roles: ['Administrator', 'Psychologist', 'Staff'] },
  ].filter((a) => a.roles.includes(role));

  return (
    <div style={PAGE}>
      {/* Quick actions — at the top of the dashboard (adviser). */}
      <Card padding="20px" accent={m.color} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: m.soft, color: m.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="sparkles" size={22} /></span>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)' }}>Quick actions for {role}s</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Jump straight to what your role handles most.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {actions.map((a) => (
              <Button key={a.label} variant={a.variant} onClick={() => navigate(a.to)} iconLeft={<Icon name={a.icon} size={17} />}>{a.label}</Button>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Needs Counseling Attention" value={s.attention} tone="red" icon={<Icon name="heart-pulse" size={18} />} />
        <StatCard label="Needs Monitoring" value={s.monitoring} tone="amber" icon={<Icon name="loader" size={18} />} />
        <StatCard label="Normal / Stable" value={s.normal} tone="success" icon={<Icon name="check-circle-2" size={18} />} />
        <StatCard label={isPsychologist ? 'My Children' : 'Total Children'} value={stats.total_children} tone="brand" icon={<Icon name="users" size={18} />} hint={stats.unassessed ? `${stats.unassessed} not yet assessed` : 'Active records'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 20 }}>
        <Card padding="22px">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div className="racco-eyebrow" style={{ fontSize: 10 }}>Assessment activity</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--text-strong)' }}>Assessments over time</div>
            </div>
            <div style={{ display: 'inline-flex', gap: 4, background: 'var(--ink-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: 3 }}>
              {['weekly', 'monthly', 'yearly'].map((r) => {
                const on = range === r;
                return (
                  <button key={r} onClick={() => setRange(r)} style={{ padding: '5px 12px', borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12, textTransform: 'capitalize', background: on ? 'var(--blue-600)' : 'transparent', color: on ? '#fff' : 'var(--text-muted)', transition: 'var(--transition-base)' }}>{r}</button>
                );
              })}
            </div>
          </div>
          {series.length === 0 ? (
            <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No assessments in this period yet.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 190, paddingTop: 12 }}>
              {series.map((t) => (
                <div key={t.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{t.v}</div>
                  <div style={{ width: '100%', maxWidth: 46, height: `${(t.v / max) * 100}%`, minHeight: 4, background: 'linear-gradient(180deg, var(--blue-500), var(--blue-600))', borderRadius: '6px 6px 0 0', transition: 'height var(--dur-slow) var(--ease-out)' }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-body)', whiteSpace: 'nowrap' }}>{t.m}</div>
                </div>
              ))}
            </div>
          )}
          {caseMix.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div className="racco-eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>Case mix</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {caseMix.map(([type, n]) => <Badge key={type} tone="neutral">{n} {type}</Badge>)}
              </div>
            </div>
          )}
        </Card>

        {isPsychologist ? (
          <Card eyebrow="Your caseload" title="Cases You Handle" padding="20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myMix.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>No assessments recorded yet.</div>
              ) : myMix.map(([type, n]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 'var(--radius-md)', background: 'var(--ink-50)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{type}</span>
                  <span className="racco-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-600)' }}>{n}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card eyebrow="Live" title="Activity Feed" padding="20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {feed.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>No recent activity.</div>
              ) : feed.map((a, i) => (
                <div key={a.id ?? i} style={{ display: 'flex', gap: 11, padding: '11px 0', borderBottom: i < feed.length - 1 ? '1px solid var(--ink-100)' : 'none' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flex: 'none', background: a.action === 'archived' ? 'var(--red-500)' : a.action === 'created' ? 'var(--success-500)' : a.action === 'login' ? 'var(--amber-500)' : 'var(--blue-500)' }} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 600, lineHeight: 1.4 }}>{eventText(a)}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{a.actor_label} · {timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {!isPsychologist && caseloads.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Card eyebrow="Workload" title="Psychologist Caseload" padding="20px">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {caseloads.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--ink-50)', border: `1px solid ${p.caseload >= 5 ? 'var(--red-200)' : 'var(--border)'}` }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{p.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: p.caseload >= 5 ? 'var(--red-600)' : 'var(--blue-600)' }}>
                    {p.caseload}<span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 11.5, color: 'var(--text-muted)' }}>case{p.caseload === 1 ? '' : 's'}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!isPsychologist && (
        <div style={{ marginTop: 20 }}>
          <Card eyebrow="Clinical team" title="Case Types by Psychologist" padding="20px">
            {(stats.per_psychologist || []).length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No assessment activity yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {stats.per_psychologist.map((p) => (
                  <div key={p.name} style={{ padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--ink-50)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginBottom: 8 }}>{p.name} · {p.count}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {Object.entries(p.classes).map(([type, n]) => <Badge key={type} tone="neutral">{type} · {n}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
