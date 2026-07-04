import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useActivity } from '../context/ActivityContext';
import { Card, Button, Badge, Input, Select, FormField, Avatar, SeverityBadge, Alert, EmptyState, Icon, iconBtn, hoverLift, PAGE } from '../ui';
import { useToast } from '../context/ToastContext';
import { CASE_TYPES, SURRENDERED_BY, PROVINCES, MUNICIPALITIES, BARANGAYS } from '../config/caseData';

// NOTE: clinical severity is not yet tracked on the backend (Child.status is the
// active/archived soft-delete flag). Until assessments are wired, we derive a
// stable placeholder severity from the record id so the design's triage filters
// and badges remain meaningful in the demo.
function deriveSeverity(id) {
  return ['standard', 'moderate', 'high'][(Number(id) * 7) % 3];
}
function ageFrom(birth) {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}
// Adviser-optimized age groups: Child 1-12, Teen 13-17.
function ageGroup(age) {
  if (age == null) return null;
  if (age <= 12) return 'Child';
  if (age <= 17) return 'Teen';
  return 'Adult';
}
function caseRef(id) {
  return `C-${String(id).padStart(4, '0')}`;
}

const EMPTY = { fullname: '', birth_date: '', gender: '', province: '', municipality: '', barangay: '', case_type: '', surrendered_by: '', psychologist: '', assignee_sees_history: true };

export default function Children() {
  const { user } = useAuth();
  const { refresh: refreshActivity } = useActivity();
  const toast = useToast();
  const canManage = ['Administrator', 'Staff'].includes(user?.role_name);
  const [children, setChildren] = useState([]);
  const [psychologists, setPsychologists] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const [status, setStatus] = useState('all');
  const [sel, setSel] = useState(null); // detail drawer record
  const [form, setForm] = useState(null); // add/edit drawer
  const [error, setError] = useState('');

  const load = () => {
    api.get('/children/').then((r) => setChildren(r.data));
    // Active psychologists + current caseload (admin/staff endpoint — also lets Staff assign).
    api.get('/psychologists/').then((r) => setPsychologists(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const setQ = (v) => setSearchParams(v ? { q: v } : {}, { replace: true });

  const rows = useMemo(() => children.map((c) => ({
    ...c,
    severity: deriveSeverity(c.id),
    age: ageFrom(c.birth_date),
    group: ageGroup(ageFrom(c.birth_date)),
    ref: caseRef(c.id),
  })), [children]);

  const counts = { all: rows.length, high: 0, moderate: 0, standard: 0 };
  rows.forEach((c) => { counts[c.severity] = (counts[c.severity] || 0) + 1; });

  // Adviser: improve alphabetical sorting throughout the system.
  const visible = rows
    .filter((c) => c.fullname.toLowerCase().includes(q.toLowerCase()) || c.ref.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => status === 'all' || c.severity === status)
    .sort((a, b) => a.fullname.localeCompare(b.fullname, undefined, { sensitivity: 'base' }));

  const STATUS_FILTERS = [
    { key: 'all', label: 'All' }, { key: 'high', label: 'High' },
    { key: 'moderate', label: 'Moderate' }, { key: 'standard', label: 'Standard' },
  ];
  const dotColor = { high: 'var(--red-500)', moderate: 'var(--amber-500)', standard: 'var(--success-500)' };
  const td = { padding: '11px 16px', fontSize: 13, color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  const openCreate = () => { setError(''); setForm({ ...EMPTY }); };
  const openEdit = (c) => { setError(''); setForm({ ...EMPTY, ...c, psychologist: c.psychologist || '', _origPsychologist: c.psychologist || '' }); };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    const payload = { ...form };
    delete payload.severity; delete payload.age; delete payload.group; delete payload.ref; delete payload.psychologist_name; delete payload.guardian_name; delete payload._origPsychologist;
    if (!payload.psychologist) payload.psychologist = null;
    if (!payload.birth_date) delete payload.birth_date;
    try {
      if (form.id) await api.put(`/children/${form.id}/`, payload);
      else await api.post('/children/', payload);
      toast.success(form.id ? 'Record updated' : 'Record added');
      setForm(null);
      load();
      refreshActivity();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Save failed'));
      toast.error('Could not save the record. Please try again.');
    }
  };

  const archive = async (c) => {
    if (!window.confirm(`Archive ${c.fullname}?`)) return;
    try {
      await api.post(`/children/${c.id}/archive/`);
      toast.success(`${c.fullname} archived`);
      setSel(null);
      load();
      refreshActivity();
    } catch (err) {
      toast.error('Could not archive the record.');
    }
  };

  return (
    <div style={{ ...PAGE, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 320, maxWidth: '100%' }}>
          <Input placeholder="Search by name or case ID…" value={q} onChange={(e) => setQ(e.target.value)} leading={<Icon name="search" size={16} />} />
        </div>
        {canManage
          ? <Button variant="primary" onClick={openCreate} iconLeft={<Icon name="plus" size={17} />}>Add Record</Button>
          : <Badge tone="neutral" dot>Read-only for {user?.role_name}s</Badge>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Filter children by status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((f) => {
            const on = status === f.key;
            return (
              <button key={f.key} role="tab" aria-selected={on} onClick={() => setStatus(f.key)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', cursor: 'pointer', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, border: `1px solid ${on ? 'var(--blue-500)' : 'var(--border)'}`, background: on ? 'var(--blue-50)' : 'var(--surface)', color: on ? 'var(--blue-700)' : 'var(--text-body)', transition: 'var(--transition-base)' }}>
                {dotColor[f.key] && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor[f.key] }} />}
                {f.label}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: on ? 'var(--blue-600)' : 'var(--text-faint)' }}>{counts[f.key] || 0}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Showing <strong style={{ color: 'var(--text-strong)' }}>{visible.length}</strong> of {rows.length} children
        </div>
      </div>

      {canManage && psychologists.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14, padding: '10px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="racco-eyebrow" style={{ fontSize: 10, color: 'var(--text-muted)' }}>Psychologist caseload</span>
          {psychologists.map((p) => (
            <span key={p.id} title={`${p.name}: ${p.caseload} active case${p.caseload === 1 ? '' : 's'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 11px', borderRadius: 'var(--radius-pill)', background: 'var(--ink-50)', border: '1px solid var(--border)', fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{p.name}</span>
              <span className="racco-mono" style={{ fontWeight: 800, color: p.caseload >= 5 ? 'var(--red-600)' : 'var(--blue-600)' }}>{p.caseload}</span>
            </span>
          ))}
        </div>
      )}

      <Card padding="0">
        {visible.length === 0 ? (
          <EmptyState icon={<Icon name="folder-search" size={24} />} title="No records found" description="Try a different name, case ID, or status filter." />
        ) : (
          <div className="racco-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Child', 'Gender / Age', 'Case Type', 'Psychologist', 'Status', canManage ? 'Actions' : ''].filter(Boolean).map((h) => (
                    <th key={h} scope="col" style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} tabIndex={0} role="button" aria-label={`${c.fullname}, case ${c.ref}. Open details.`}
                    onClick={() => setSel(c)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(c); } }}
                    style={{ borderBottom: '1px solid var(--ink-100)', cursor: 'pointer', transition: 'background var(--dur-fast) var(--ease-out)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--blue-50)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <Avatar name={c.fullname} tone="brand" size="sm" />
                        <div style={{ minWidth: 0, maxWidth: 200 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--blue-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.fullname}</div>
                          <div className="racco-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.ref}</div>
                        </div>
                      </div>
                    </td>
                    <td style={td}>{c.gender || '—'} {c.age != null ? `· ${c.age} (${c.group})` : ''}</td>
                    <td style={td}>{c.case_type || '—'}</td>
                    <td style={td}>
                      {c.psychologist_name
                        ? c.psychologist_name
                        : canManage
                          ? (
                            <button title={`Assign a psychologist to ${c.fullname}`} aria-label={`Assign psychologist to ${c.fullname}`}
                              onClick={(e) => { e.stopPropagation(); openEdit(c); }} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: '1px dashed var(--blue-300)', background: 'var(--blue-50)', color: 'var(--blue-700)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'var(--transition-base)' }}>
                              <Icon name="user-plus" size={13} /> Assign
                            </button>
                          )
                          : '—'}
                    </td>
                    <td style={{ padding: '11px 16px' }}><SeverityBadge level={c.severity} size="sm" /></td>
                    {canManage && (
                      <td style={{ padding: '11px 16px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button title="Edit record" aria-label={`Edit ${c.fullname}`} onClick={() => openEdit(c)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--blue-600)')}><Icon name="pencil" size={15} /></button>
                          <button title="Archive record" aria-label={`Archive ${c.fullname}`} onClick={() => archive(c)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--red-500)')}><Icon name="archive" size={15} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {sel && <ChildDrawer child={sel} canManage={canManage} onEdit={() => { openEdit(sel); setSel(null); }} onArchive={() => archive(sel)} onClose={() => setSel(null)} />}
      {form && <ChildForm form={form} setForm={setForm} psychologists={psychologists} error={error} onSubmit={save} onClose={() => setForm(null)} />}
    </div>
  );
}

function ChildDrawer({ child, canManage, onEdit, onArchive, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const location = [child.barangay, child.municipality, child.province].filter(Boolean).join(', ') || child.address || '—';
  const fields = [
    ['Gender', child.gender || '—'],
    ['Age', child.age != null ? `${child.age} years old (${child.group})` : '—'],
    ['Case Type', child.case_type || '—'],
    ['Assigned Psychologist', child.psychologist_name || '—'],
    ['Surrendered By', child.surrendered_by || '—'],
    ['Location', location],
  ];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 60, animation: 'racco-fade-in var(--dur-base) var(--ease-out)' }}>
      <div role="dialog" aria-modal="true" aria-label={`Case record for ${child.fullname}`} onClick={(e) => e.stopPropagation()} style={{ width: 400, maxWidth: '90%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'racco-slide-left var(--dur-slow) var(--ease-out)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--ink-50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={child.fullname} tone="brand" size="lg" />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>{child.fullname}</div>
              <div className="racco-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{child.ref}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close panel" title="Close" {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--text-muted)')}><Icon name="x" size={17} /></button>
        </div>
        <div className="racco-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><SeverityBadge level={child.severity} /></div>
          {fields.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingBottom: 12, borderBottom: '1px solid var(--ink-100)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{k}</span>
              <span style={{ fontSize: 13.5, color: 'var(--text-strong)', fontWeight: 700, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
        {canManage && (
          <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={onEdit} iconLeft={<Icon name="pencil" size={16} />}>Edit</Button>
            <Button variant="danger" fullWidth onClick={onArchive} iconLeft={<Icon name="archive" size={16} />}>Archive</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChildForm({ form, setForm, psychologists, error, onSubmit, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const isEdit = !!form.id;
  // Cascading location pickers; clear children when a parent changes.
  const munis = MUNICIPALITIES[form.province] || [];
  const brgys = BARANGAYS[form.municipality] || [];
  const fieldLabel = { fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 70, animation: 'racco-fade-in var(--dur-base) var(--ease-out)' }}>
      <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '92%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'racco-slide-left var(--dur-slow) var(--ease-out)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--ink-50)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>{isEdit ? 'Edit Record' : 'Add Record'}</div>
          <button type="button" onClick={onClose} aria-label="Close" {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--text-muted)')}><Icon name="x" size={17} /></button>
        </div>
        <div className="racco-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{error}</Alert>}
          {/* Child name is not editable once a record exists (adviser). */}
          {isEdit ? (
            <div>
              <div style={{ ...fieldLabel, marginBottom: 6 }}>Full Name</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', borderRadius: 'var(--radius-md)', background: 'var(--ink-50)', border: '1px solid var(--border)', color: 'var(--text-strong)', fontWeight: 700, fontSize: 14 }}>
                {form.fullname}
                <Icon name="lock" size={13} style={{ color: 'var(--text-faint)', marginLeft: 'auto' }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 5 }}>The child&apos;s name cannot be changed after the record is created.</div>
            </div>
          ) : (
            <FormField label="Full Name" required>
              <Input value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} required />
            </FormField>
          )}
          <FormField label="Birth Date">
            <Input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </FormField>
          <FormField label="Gender">
            <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">—</option><option>Male</option><option>Female</option>
            </Select>
          </FormField>
          <FormField label="Province">
            <Select value={form.province || ''} onChange={(e) => setForm({ ...form, province: e.target.value, municipality: '', barangay: '' })}>
              <option value="">— Select province —</option>
              {PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </FormField>
          <FormField label="Municipality / City">
            <Select value={form.municipality || ''} disabled={!form.province} onChange={(e) => setForm({ ...form, municipality: e.target.value, barangay: '' })}>
              <option value="">{form.province ? '— Select municipality —' : 'Select a province first'}</option>
              {munis.map((mn) => <option key={mn}>{mn}</option>)}
            </Select>
          </FormField>
          <FormField label="Barangay">
            <Select value={form.barangay || ''} disabled={!form.municipality} onChange={(e) => setForm({ ...form, barangay: e.target.value })}>
              <option value="">{form.municipality ? '— Select barangay —' : 'Select a municipality first'}</option>
              {brgys.map((b) => <option key={b}>{b}</option>)}
            </Select>
          </FormField>
          <FormField label="Case Type">
            <Select value={form.case_type || ''} onChange={(e) => setForm({ ...form, case_type: e.target.value })}>
              <option value="">— Select case type —</option>
              {CASE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormField label="Who Surrendered the Child">
            <Select value={form.surrendered_by || ''} onChange={(e) => setForm({ ...form, surrendered_by: e.target.value })}>
              <option value="">— Select —</option>
              {SURRENDERED_BY.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="Assign Psychologist">
            <Select value={form.psychologist || ''} onChange={(e) => setForm({ ...form, psychologist: e.target.value })}>
              <option value="">— Unassigned —</option>
              {psychologists.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.caseload} case{p.caseload === 1 ? '' : 's'}</option>)}
            </Select>
          </FormField>
          {isEdit && form.psychologist && String(form.psychologist) !== String(form._origPsychologist) && (
            <div style={{ padding: '11px 13px', borderRadius: 'var(--radius-md)', background: 'var(--blue-50)', border: '1px solid var(--blue-200)' }}>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--text-strong)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.assignee_sees_history !== false} onChange={(e) => setForm({ ...form, assignee_sees_history: e.target.checked })} style={{ marginTop: 2, accentColor: 'var(--blue-600)' }} />
                <span>Carry this child&apos;s assessment history to the new psychologist (they&apos;ll see prior assessments). Uncheck to give them a fresh start.</span>
              </label>
            </div>
          )}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
          <Button type="submit" variant="primary" fullWidth iconLeft={<Icon name="save" size={16} />}>Save Record</Button>
        </div>
      </form>
    </div>
  );
}
