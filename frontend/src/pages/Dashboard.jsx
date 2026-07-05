import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { Card, StatCard, Button, Badge, Icon, ROLE_META, PAGE } from '../ui';
import api from '../api/client';
import { useActivity } from '../context/ActivityContext';
import { eventText, timeAgo } from '../components/Topbar';

const EMPTY = {
  census: { active: 0, inactive: 0, by_case_type: {}, by_case_status: {} },
  total_children: 0, unassessed: 0, pending_pre_assessments: 0,
  today_schedule: [], availability_today: [], intake_vs_termination: [],
  trend: [], per_psychologist: [], by_case_type: {}, care_gaps: [],
  counseling_per_psychologist: [],
};
const PURPOSE_LABEL = { pre_assessment: 'Pre-Assessment', session: 'Session', follow_up: 'Follow-up' };
const GAP_TONE = { danger: 'var(--red-500)', warning: 'var(--amber-500)', info: 'var(--blue-400)' };

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role_name || 'Staff';
  const isPsychologist = role === 'Psychologist';
  const m = ROLE_META[role] || ROLE_META.Staff;
  const [stats, setStats] = useState(EMPTY);
  const { events } = useActivity();
  const feed = events.slice(0, 5);

  useEffect(() => {
    api.get('/reports/dashboard/?range=monthly').then((r) => setStats({ ...EMPTY, ...r.data })).catch(() => setStats(EMPTY));
  }, []);

  const census = stats.census || EMPTY.census;
  const caseMix = Object.entries(census.by_case_type || {});
  const sessionsThisPeriod = (stats.trend || []).reduce((sum, t) => sum + t.count, 0);
  const gaps = (stats.care_gaps || []).slice(0, 8);

  const actions = [
    { label: 'Records', icon: 'folder-heart', variant: 'secondary', to: '/children', roles: ['Administrator', 'Psychologist', 'Staff'] },
    { label: 'Start Pre-Assessment', icon: 'clipboard-list', variant: 'primary', to: '/pre-assessment', roles: ['Psychologist'] },
    { label: 'Calendar', icon: 'calendar', variant: 'secondary', to: '/schedule', roles: ['Administrator', 'Psychologist', 'Staff'] },
    { label: 'Agency Summary', icon: 'bar-chart-3', variant: 'primary', to: '/reports/summary', roles: ['Administrator', 'Staff'] },
  ].filter((a) => a.roles.includes(role));

  return (
    <div style={PAGE}>
      {/* Quick actions */}
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

      {/* Today's schedule strip (athena scheduling-tile pattern) */}
      <Card eyebrow="Today" title="Schedule" padding="18px" style={{ marginBottom: 20 }}>
        {stats.today_schedule.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No appointments today.</div>
        ) : (
          <div className="racco-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {stats.today_schedule.map((a) => (
              <button key={a.id} onClick={() => navigate('/schedule')}
                style={{ flex: 'none', width: 190, textAlign: 'left', padding: '12px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: a.status === 'completed' ? 'var(--success-50)' : 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="racco-mono" style={{ fontWeight: 800, fontSize: 14, color: 'var(--blue-700)' }}>{a.time}</span>
                  <Badge tone={a.status === 'completed' ? 'success' : a.status === 'no_show' ? 'amber' : 'brand'} size="sm">{a.status.replace('_', '-')}</Badge>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.child_name}{a.age != null ? `, ${a.age}` : ''}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{PURPOSE_LABEL[a.purpose] || a.purpose}{!isPsychologist && a.psychologist ? ` · ${a.psychologist}` : ''}</div>
              </button>
            ))}
          </div>
        )}
        {stats.availability_today.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="racco-eyebrow" style={{ fontSize: 10 }}>Available today</span>
            {stats.availability_today.map((b, i) => (
              <Badge key={i} tone="success" size="sm" dot>{b.psychologist} · {b.start}–{b.end}</Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Census stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label={isPsychologist ? 'My Active Cases' : 'Active Children'} value={census.active} tone="success" icon={<Icon name="users" size={18} />} />
        <StatCard label="In Counseling" value={(census.by_case_status || {}).counseling || 0} tone="brand" icon={<Icon name="heart-pulse" size={18} />} hint={`${(census.by_case_status || {}).pre_assessment || 0} in pre-assessment`} />
        <StatCard label="Inactive (Terminated)" value={census.inactive} tone="brand" icon={<Icon name="archive" size={18} />} />
        <StatCard label="Pending Pre-Assessments" value={stats.pending_pre_assessments} tone="amber" icon={<Icon name="loader" size={18} />} hint={stats.unassessed ? `${stats.unassessed} not yet assessed` : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 20, marginBottom: 20 }}>
        <Card eyebrow="Census" title="Intake vs. termination" padding="20px">
          {stats.intake_vs_termination.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No intake activity yet.</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={stats.intake_vs_termination}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="intake" name="Intake" fill="var(--blue-600)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="terminations" name="Terminations" fill="var(--amber-500)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {caseMix.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {caseMix.map(([type, n]) => <Badge key={type} tone="success" size="sm" dot>Active · {type} — {n}</Badge>)}
            </div>
          )}
        </Card>

        <Card eyebrow="Follow-up needed" title="Care-gap alerts" padding="20px">
          {gaps.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success-600)' }}>
              <Icon name="check-circle-2" size={16} /> No gaps detected.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gaps.map((g, i) => (
                <button key={i} onClick={() => navigate(`/report/child/${g.child_id}`)}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: '9px 11px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--blue-50)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface)')}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flex: 'none', background: GAP_TONE[g.severity] || 'var(--blue-400)' }} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 12.5, color: 'var(--text-strong)' }}>{g.child_name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{g.message}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }}>
        <Card eyebrow="Clinical team" title="Sessions by psychologist" padding="20px">
          {(stats.per_psychologist || []).length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No completed sessions yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.per_psychologist.map((p) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 'var(--radius-md)', background: 'var(--ink-50)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{p.name}</span>
                  <span className="racco-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-600)' }}>{p.count}</span>
                </div>
              ))}
            </div>
          )}
          {(stats.counseling_per_psychologist || []).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div className="racco-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Cases in counseling</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {stats.counseling_per_psychologist.map((p) => (
                  <Badge key={p.name} tone="brand" size="sm" dot>{p.name} · {p.count}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card eyebrow="Live" title="Activity Feed" padding="20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {feed.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>No recent activity.</div>
            ) : feed.map((a, i) => (
              <div key={a.id ?? i} style={{ display: 'flex', gap: 11, padding: '10px 0', borderBottom: i < feed.length - 1 ? '1px solid var(--ink-100)' : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flex: 'none', background: a.action === 'archived' ? 'var(--red-500)' : a.action === 'created' ? 'var(--success-500)' : a.action === 'login' ? 'var(--amber-500)' : 'var(--blue-500)' }} />
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 600, lineHeight: 1.4 }}>{eventText(a)}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{a.actor_label} · {timeAgo(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
