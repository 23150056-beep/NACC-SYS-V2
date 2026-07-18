import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useActivity } from '../context/ActivityContext';
import { Card, Button, Badge, Input, Select, EmptyState, Avatar, Icon, iconBtn, hoverLift, PAGE } from '../ui';
import { TERMINATION_REASONS } from '../config/caseData';

const caseRef = (id) => `C-${String(id).padStart(4, '0')}`;

// Admin + Staff archive of terminated cases (route-gated in App.jsx —
// psychologists have no access to this page by product decision 2026-07-18;
// they keep seeing their own terminated cases in Records as before).
export default function Archive() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { refresh: refreshActivity } = useActivity();
  const isAdmin = user?.role_name === 'Administrator';
  const [children, setChildren] = useState([]);
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');
  const [reopening, setReopening] = useState(null); // record pending confirm

  const load = () => api.get('/children/?include_archived=true')
    .then((r) => setChildren(r.data.filter((c) => c.status === 'inactive')));
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => children
    .filter((c) => c.fullname.toLowerCase().includes(q.toLowerCase())
      || caseRef(c.id).toLowerCase().includes(q.toLowerCase()))
    .filter((c) => !reason || c.termination?.reason_category === reason)
    .sort((a, b) => String(b.termination?.date || '').localeCompare(String(a.termination?.date || ''))),
  [children, q, reason]);

  const reopen = async (c) => {
    try {
      await api.post(`/children/${c.id}/reopen/`);
      toast.success(`${c.fullname}'s case is active again — previous records retained`);
      setReopening(null);
      load();
      refreshActivity();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not reopen the case.');
    }
  };

  const th = { textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' };
  const td = { padding: '12px 16px', fontSize: 13, color: 'var(--text-body)', verticalAlign: 'top' };

  return (
    <div style={{ ...PAGE, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 320, maxWidth: '100%' }}>
          <Input placeholder="Search by name or case ID…" value={q} onChange={(e) => setQ(e.target.value)} leading={<Icon name="search" size={16} />} />
        </div>
        <div style={{ width: 240 }}>
          <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Filter by termination reason">
            <option value="">All termination reasons</option>
            {TERMINATION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <div style={{ flex: 1 }} />
        <Badge tone="neutral" size="lg" dot>{rows.length} terminated {rows.length === 1 ? 'case' : 'cases'}</Badge>
      </div>

      <Card padding="0">
        {rows.length === 0 ? (
          <EmptyState icon={<Icon name="archive" size={24} />} title="No terminated cases"
            description={children.length === 0 ? 'Terminated cases will appear here with their reason and details.' : 'No cases match the current search or reason filter.'} />
        ) : (
          <div className="racco-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Child', 'Case Type', 'Terminated On', 'Reason', 'Terminated By', 'Note', 'Actions'].map((h) => (
                    <th key={h} scope="col" style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <Avatar name={c.fullname} tone="neutral" size="sm" />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{c.fullname}</div>
                          <div className="racco-mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{caseRef(c.id)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.case_type || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }} className="racco-mono">{c.termination?.date || '—'}</td>
                    <td style={td}>{c.termination?.reason_category
                      ? <Badge tone="amber" size="sm" dot>{c.termination.reason_category}</Badge> : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.termination?.terminated_by || '—'}</td>
                    <td style={{ ...td, maxWidth: 260 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={c.termination?.note || ''}>
                        {c.termination?.note || '—'}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button title="View full record" aria-label={`View ${c.fullname}'s record`} onClick={() => navigate(`/report/child/${c.id}`)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--blue-600)')}><Icon name="eye" size={15} /></button>
                        {isAdmin && (
                          <button title="Reopen case" aria-label={`Reopen ${c.fullname}'s case`} onClick={() => setReopening(c)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--success-600)')}><Icon name="rotate-ccw" size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {reopening && (
        <div onClick={() => setReopening(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, animation: 'racco-fade-in var(--dur-base) var(--ease-out)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '92%', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>Reopen {reopening.fullname}&apos;s case?</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
              The case returns to <strong>Active · Pre-Assessment</strong>. All previous
              records, assessments, and the termination history are retained.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" fullWidth onClick={() => setReopening(null)}>Cancel</Button>
              <Button variant="primary" fullWidth onClick={() => reopen(reopening)} iconLeft={<Icon name="rotate-ccw" size={16} />}>Reopen Case</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
