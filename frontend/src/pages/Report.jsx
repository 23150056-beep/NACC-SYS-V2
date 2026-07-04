import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, Alert, Input, EmptyState, Icon, PAGE } from '../ui';

function caseRef(id) { return `C-${String(id).padStart(4, '0')}`; }

export default function Report() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role_name || 'Staff';
  const staff = role === 'Staff';
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => { api.get('/assessments/').then((r) => setItems(r.data)).catch(() => {}); }, []);

  const rows = useMemo(() => items.map((a) => ({
    id: a.id,
    childId: a.child,
    name: a.child_name,
    ref: caseRef(a.child),
    caseType: a.child_case_type || '—',
    psychologist: a.psychologist_name || '—',
    date: a.assessment_date,
    nextSession: a.next_session || null,
    cls: a.classification || '—',
    notes: a.notes || '',
  })), [items]);

  // Adviser: improve alphabetical sorting throughout the system.
  const visible = rows
    .filter((r) => (r.name || '').toLowerCase().includes(q.toLowerCase()) || r.ref.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  const td = { padding: '12px 16px', fontSize: 13, color: 'var(--text-body)', whiteSpace: 'nowrap' };

  return (
    <div style={{ ...PAGE, position: 'relative' }}>
      {staff ? (
        <Alert tone="info" icon={<Icon name="eye" size={18} />} style={{ marginBottom: 18 }} title="Read-only view">
          As Staff, you can view session outcomes for case coordination; clinical findings are recorded by the psychologists.
        </Alert>
      ) : (
        <Alert tone="info" icon={<Icon name="users" size={18} />} style={{ marginBottom: 16 }} title="Session records">
          Completed sessions and the psychologist&apos;s findings appear here. Open a child&apos;s row for the full report.
        </Alert>
      )}

      {!staff && (
        <div style={{ width: 340, maxWidth: '100%', marginBottom: 14 }}>
          <Input placeholder="Search results by child name or case ID…" value={q} onChange={(e) => setQ(e.target.value)} leading={<Icon name="search" size={16} />} />
        </div>
      )}

      <Card padding="0">
        {visible.length === 0 ? (
          <EmptyState icon={<Icon name="folder-search" size={24} />} title="No sessions yet" description="Completed sessions will appear here once they are recorded." />
        ) : (
          <div className="racco-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
              <thead>
                <tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Child', 'Case Type', 'Classification', 'Psychologist', 'Next Session', staff ? null : ''].filter((h) => h !== null).map((h, i) => (
                    <th key={i} scope="col" style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const open = () => navigate(`/report/child/${r.childId}`);
                  return (
                    <tr key={r.id} tabIndex={0} role="button" aria-label={`View ${r.name}'s progress report`}
                      onClick={open}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
                      style={{ borderBottom: '1px solid var(--ink-100)', cursor: 'pointer', transition: 'background var(--dur-fast) var(--ease-out)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--blue-50)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: staff ? 'var(--text-strong)' : 'var(--blue-700)', whiteSpace: 'nowrap' }}>{r.name}</div>
                        <div className="racco-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.ref}</div>
                      </td>
                      <td style={td}>{r.caseType}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{r.cls}</td>
                      <td style={td}>{r.psychologist}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.nextSession || '—'}</td>
                      {!staff && <td style={{ padding: '12px 16px', textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--text-faint)' }} /></td>}
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
