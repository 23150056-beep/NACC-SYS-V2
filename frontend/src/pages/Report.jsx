import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, Button, Badge, Alert, Input, Select, FormField, EmptyState, Icon, PAGE } from '../ui';

function caseRef(id) { return `C-${String(id).padStart(4, '0')}`; }

const REPORT_TYPES = [
  { v: 'initial', label: 'Initial Evaluation' },
  { v: 'progress', label: 'Progress Report' },
  { v: 'final', label: 'Final Report' },
  { v: 'other', label: 'Other' },
];

export default function Report() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const role = user?.role_name || 'Staff';
  const isPsych = role === 'Psychologist';
  const isStaffOrAdmin = ['Administrator', 'Staff'].includes(role);
  const [tab, setTab] = useState('results');
  const [entries, setEntries] = useState([]);
  const [files, setFiles] = useState([]);
  const [caseStudies, setCaseStudies] = useState([]);
  const [children, setChildren] = useState([]);
  const [q, setQ] = useState('');
  const [upload, setUpload] = useState(null); // upload drawer state (report or case study)
  const [error, setError] = useState('');

  const load = () => {
    api.get('/result-entries/').then((r) => setEntries(r.data)).catch(() => {});
    api.get('/report-files/').then((r) => setFiles(r.data)).catch(() => {});
    api.get('/case-studies/').then((r) => setCaseStudies(r.data)).catch(() => {});
    api.get('/children/').then((r) => setChildren(r.data.filter((c) => c.status === 'active'))).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const visibleEntries = useMemo(() => entries
    .filter((e) => (e.child_name || '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), [entries, q]);
  const visibleFiles = useMemo(() => files
    .filter((f) => (f.child_name || '').toLowerCase().includes(q.toLowerCase())), [files, q]);
  const visibleCaseStudies = useMemo(() => caseStudies
    .filter((f) => (f.child_name || '').toLowerCase().includes(q.toLowerCase())), [caseStudies, q]);

  const download = async (f) => {
    try {
      const res = await api.get(`/report-files/${f.id}/download/`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = f.original_filename || 'report'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download the file.'); }
  };

  const exportCsv = () => {
    const rows = [['Child', 'Case', 'Instrument', 'Classification', 'Date', 'Entered by'],
      ...visibleEntries.map((e) => [e.child_name, caseRef(e.child), e.instrument_title || '', e.classification || '', e.date, e.entered_by_name || ''])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'result-entries.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const doUpload = async (e) => {
    e.preventDefault();
    setError('');
    if (!upload.child || !upload.fileObj) { setError('Choose a child and a file.'); return; }
    const fd = new FormData();
    fd.append('child', upload.child);
    fd.append('file', upload.fileObj);
    if (upload.kind === 'case_study') {
      fd.append('description', upload.coverage || '');
    } else {
      fd.append('report_type', upload.report_type);
      fd.append('coverage', upload.coverage || '');
    }
    try {
      await api.post(upload.kind === 'case_study' ? '/case-studies/' : '/report-files/',
        fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(upload.kind === 'case_study' ? 'Case study uploaded' : 'Report uploaded');
      setUpload(null); load();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Upload failed'));
    }
  };

  const downloadCaseStudy = async (f) => {
    try {
      const res = await api.get(`/case-studies/${f.id}/download/`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = f.original_filename || 'case-study'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download the file.'); }
  };

  const th = { textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' };
  const td = { padding: '12px 16px', fontSize: 13, color: 'var(--text-body)' };

  return (
    <div style={{ ...PAGE, position: 'relative' }} className="racco-print-area">
      <Alert tone="info" icon={<Icon name="users" size={18} />} style={{ marginBottom: 16 }} title="Results & reports" className="racco-no-print">
        Manual result entries and uploaded psychological reports across the caseload. Each psychologist keeps her own report format.
      </Alert>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }} className="racco-no-print">
        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--ink-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: 3 }}>
          {[['results', `Result Entries (${entries.length})`], ['files', `Reports (${files.length})`], ['case-studies', `Case Studies (${caseStudies.length})`]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '6px 16px', borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, background: tab === k ? 'var(--blue-600)' : 'transparent', color: tab === k ? '#fff' : 'var(--text-muted)' }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 240 }}>
            <Input placeholder="Search by child…" value={q} onChange={(e) => setQ(e.target.value)} leading={<Icon name="search" size={16} />} />
          </div>
          {tab === 'results' && <Button variant="secondary" onClick={exportCsv} iconLeft={<Icon name="download" size={16} />}>CSV</Button>}
          <Button variant="secondary" onClick={() => window.print()} iconLeft={<Icon name="printer" size={16} />}>Print</Button>
          {isPsych && <Button variant="primary" onClick={() => { setError(''); setUpload({ kind: 'report', child: '', report_type: 'progress', coverage: '', fileObj: null }); }} iconLeft={<Icon name="file-up" size={16} />}>Upload Report</Button>}
          {isStaffOrAdmin && <Button variant="primary" onClick={() => { setError(''); setUpload({ kind: 'case_study', child: '', coverage: '', fileObj: null }); }} iconLeft={<Icon name="folder-heart" size={16} />}>Upload Case Study</Button>}
        </div>
      </div>

      {tab === 'results' ? (
        <Card padding="0">
          {visibleEntries.length === 0 ? (
            <EmptyState icon={<Icon name="folder-search" size={24} />} title="No result entries yet" description="Psychologists record findings from the per-child report page." />
          ) : (
            <div className="racco-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Child', 'Instrument', 'Classification', 'Date', 'Entered By', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {visibleEntries.map((e) => (
                    <tr key={e.id} tabIndex={0} role="button" onClick={() => navigate(`/report/child/${e.child}`)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') navigate(`/report/child/${e.child}`); }}
                      style={{ borderBottom: '1px solid var(--ink-100)', cursor: 'pointer' }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--blue-50)')}
                      onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--blue-700)' }}>{e.child_name}</div>
                        <div className="racco-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{caseRef(e.child)}</div>
                      </td>
                      <td style={td}>{e.instrument_title || '—'}</td>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{e.classification || '—'}</td>
                      <td style={td}>{e.date}</td>
                      <td style={td}>{e.entered_by_name || '—'}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--text-faint)' }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : tab === 'files' ? (
        <Card padding="0">
          {visibleFiles.length === 0 ? (
            <EmptyState icon={<Icon name="file-text" size={24} />} title="No reports uploaded yet" description="Psychologists upload their reports in their own format." />
          ) : (
            <div className="racco-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Child', 'File', 'Type', 'Coverage', 'Uploaded By', 'Date', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {visibleFiles.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{f.child_name}</div>
                        <div className="racco-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{caseRef(f.child)}</div>
                      </td>
                      <td style={td}>{f.original_filename}</td>
                      <td style={td}><Badge tone="brand" size="sm">{REPORT_TYPES.find((t) => t.v === f.report_type)?.label || f.report_type}</Badge></td>
                      <td style={td}>{f.coverage || '—'}</td>
                      <td style={td}>{f.author_name || '—'}</td>
                      <td style={td}>{(f.created_at || '').slice(0, 10)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Button variant="ghost" onClick={() => download(f)} iconLeft={<Icon name="download" size={15} />}>Download</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card padding="0">
          {visibleCaseStudies.length === 0 ? (
            <EmptyState icon={<Icon name="folder-heart" size={24} />} title="No case studies yet" description="Social workers upload the official case study at intake." />
          ) : (
            <div className="racco-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Child', 'File', 'Description', 'Uploaded By', 'Date', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {visibleCaseStudies.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{f.child_name}</div>
                        <div className="racco-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{caseRef(f.child)}</div>
                      </td>
                      <td style={td}>{f.original_filename}</td>
                      <td style={td}>{f.description || '—'}</td>
                      <td style={td}>{f.uploaded_by_name || '—'}</td>
                      <td style={td}>{(f.created_at || '').slice(0, 10)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Button variant="ghost" onClick={() => downloadCaseStudy(f)} iconLeft={<Icon name="download" size={15} />}>Download</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {upload && (
        <div onClick={() => setUpload(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 70, animation: 'racco-fade-in var(--dur-base) var(--ease-out)' }}>
          <form onSubmit={doUpload} onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '92%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'racco-slide-left var(--dur-slow) var(--ease-out)' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', background: 'var(--ink-50)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>
              {upload.kind === 'case_study' ? 'Upload Case Study' : 'Upload Psychological Report'}
            </div>
            <div className="racco-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{error}</Alert>}
              <FormField label="Child" required>
                <Select value={upload.child} onChange={(e) => setUpload({ ...upload, child: e.target.value })}>
                  <option value="">— Select child —</option>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.fullname}</option>)}
                </Select>
              </FormField>
              <FormField label={upload.kind === 'case_study' ? 'Case study file (PDF / Word)' : 'Report file (PDF / Word)'} required hint={upload.kind === 'case_study' ? "The child's official case study document." : 'Your own report, in your own format.'}>
                <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setUpload({ ...upload, fileObj: e.target.files?.[0] || null })}
                  style={{ fontSize: 13, fontFamily: 'var(--font-sans)' }} />
              </FormField>
              {upload.kind !== 'case_study' && (
                <FormField label="Report type">
                  <Select value={upload.report_type} onChange={(e) => setUpload({ ...upload, report_type: e.target.value })}>
                    {REPORT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </Select>
                </FormField>
              )}
              <FormField label={upload.kind === 'case_study' ? 'Description' : 'Session / date coverage'}>
                <Input value={upload.coverage} onChange={(e) => setUpload({ ...upload, coverage: e.target.value })} placeholder={upload.kind === 'case_study' ? 'e.g. Intake case study' : 'e.g. Sessions 1-3, Jan-Mar 2026'} />
              </FormField>
            </div>
            <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <Button type="submit" variant="primary" fullWidth iconLeft={<Icon name="file-up" size={16} />}>Upload</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
