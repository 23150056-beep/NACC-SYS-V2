import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, Button, Badge, Alert, Select, FormField, Icon, iconBtn, PAGE } from '../ui';

const caseRef = (id) => `C-${String(id).padStart(4, '0')}`;
const td = { padding: '10px 14px', fontSize: 13, color: 'var(--text-body)', whiteSpace: 'nowrap' };
const textarea = { width: '100%', resize: 'vertical', padding: '11px 13px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55 };

export default function ChildProgressReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const isPsych = user?.role_name === 'Psychologist';
  const [data, setData] = useState(null);
  const [remarkText, setRemarkText] = useState('');
  const [result, setResult] = useState(null); // add-result drawer
  const [plan, setPlan] = useState(null); // treatment plan drawer
  const [instruments, setInstruments] = useState([]);

  const load = () => api.get(`/reports/child/${id}/`).then((r) => setData(r.data)).catch(() => setData('error'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { if (isPsych) api.get('/instruments/').then((r) => setInstruments(r.data)).catch(() => {}); }, [isPsych]);

  if (data === 'error') return <div style={PAGE}><Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>This report is unavailable.</Alert></div>;
  if (!data) return <div style={PAGE}><div style={{ color: 'var(--text-muted)' }}>Loading report…</div></div>;

  const { child } = data;
  const canWrite = isPsych && String(child.psychologist) === String(user?.id);
  const activePlan = (data.treatment_plans || []).find((p) => p.status === 'active') || (data.treatment_plans || [])[0];

  const addRemark = async () => {
    if (!remarkText.trim()) return;
    try {
      await api.post('/remarks/', { child: Number(id), text: remarkText.trim() });
      setRemarkText(''); load(); toast.success('Remark added');
    } catch (err) { toast.error(err.response?.data?.detail || 'Could not add the remark.'); }
  };

  const saveResult = async () => {
    try {
      await api.post('/result-entries/', {
        child: Number(id), instrument: result.instrument || null,
        summary: result.summary, classification: result.classification,
      });
      setResult(null); load(); toast.success('Result entry saved');
    } catch (err) { toast.error(JSON.stringify(err.response?.data || 'Could not save.')); }
  };

  const savePlan = async () => {
    try {
      if (plan.id) await api.patch(`/treatment-plans/${plan.id}/`, { objectives: plan.objectives, interventions: plan.interventions, status: plan.status, review_date: plan.review_date || null });
      else await api.post('/treatment-plans/', { child: Number(id), objectives: plan.objectives, interventions: plan.interventions, review_date: plan.review_date || null });
      setPlan(null); load(); toast.success('Treatment plan saved');
    } catch (err) { toast.error(JSON.stringify(err.response?.data || 'Could not save.')); }
  };

  const download = async (f) => {
    try {
      const res = await api.get(`/report-files/${f.id}/download/`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = f.original_filename || 'report'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download the file.'); }
  };

  return (
    <div style={PAGE} className="racco-print-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }} className="racco-no-print">
        <Button variant="ghost" onClick={() => navigate('/reports')} iconLeft={<Icon name="arrow-left" size={17} />}>Back to Results</Button>
        <Button variant="secondary" onClick={() => window.print()} iconLeft={<Icon name="printer" size={17} />}>Print / Save PDF</Button>
      </div>

      {/* Profile header */}
      <Card padding="22px" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-strong)' }}>{child.fullname}</div>
            <div className="racco-mono" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{caseRef(child.id)} · {child.case_type || '—'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Psychologist: {child.psychologist_name || '—'} · {[child.barangay, child.municipality, child.province].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Badge tone={child.pre_assessment_status === 'Answered' ? 'success' : 'amber'} dot>Pre-Assessment: {child.pre_assessment_status}</Badge>
            <Badge tone={child.status === 'active' ? 'success' : 'neutral'} dot>{child.status === 'active' ? 'Active' : 'Inactive (Terminated)'}</Badge>
          </div>
        </div>
        {(child.instruments_used || []).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {child.instruments_used.map((t) => <Badge key={t} tone="brand" size="sm">{t}</Badge>)}
          </div>
        )}
      </Card>

      {/* Pre-assessment log */}
      <Card eyebrow="Clinical workflow" title="Pre-assessment log" padding="0" style={{ marginBottom: 18 }}>
        {data.pre_assessments.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: 'var(--text-muted)' }}>No pre-assessments yet.</div>
        ) : (
          <div className="racco-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Status', 'Consent', 'Instrument Titles', 'Psychologist'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.pre_assessments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                    <td style={td}>{p.date}</td>
                    <td style={td}><Badge tone={p.status === 'completed' ? 'success' : 'amber'} size="sm" dot>{p.status.replace('_', ' ')}</Badge></td>
                    <td style={td}>{p.consent ? (p.consent_status || 'linked') : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{(p.instrument_titles || []).join(', ') || '—'}</td>
                    <td style={td}>{p.psychologist_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Result entries */}
      <Card eyebrow="Findings" title="Result entries (manual)" padding="0" style={{ marginBottom: 18 }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end' }} className="racco-no-print">
          {canWrite && <Button variant="primary" onClick={() => setResult({ instrument: '', summary: '', classification: '' })} iconLeft={<Icon name="plus" size={15} />}>Add Result Entry</Button>}
        </div>
        {data.result_entries.length === 0 ? (
          <div style={{ padding: '0 18px 18px', fontSize: 13, color: 'var(--text-muted)' }}>No result entries yet — the psychologist records findings here after paper administration.</div>
        ) : (
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.result_entries.map((r) => (
              <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14, background: 'var(--ink-50)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{r.instrument_title || 'General findings'}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {r.classification && <Badge tone="brand" size="sm">{r.classification}</Badge>}
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{r.date}</span>
                  </div>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--text-body)', margin: 0, lineHeight: 1.6 }}>{r.summary}</p>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>Entered by {r.entered_by_name || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Uploaded reports */}
      <Card eyebrow="Documents" title="Psychological reports" padding="0" style={{ marginBottom: 18 }}>
        {data.reports.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: 'var(--text-muted)' }}>No uploaded reports. Upload from Results &amp; Reports.</div>
        ) : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.reports.map((f) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--ink-50)' }}>
                <Icon name="file-text" size={18} style={{ color: 'var(--blue-600)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_filename}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{f.report_type}{f.coverage ? ` · ${f.coverage}` : ''} · {f.author_name || '—'} · {(f.created_at || '').slice(0, 10)}</div>
                </div>
                <Button variant="ghost" onClick={() => download(f)} iconLeft={<Icon name="download" size={15} />} className="racco-no-print">Download</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Treatment plan + problems, side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, marginBottom: 18 }}>
        <Card eyebrow="Care" title="Treatment plan" padding="20px">
          {activePlan ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Badge tone={activePlan.status === 'active' ? 'success' : 'neutral'} size="sm" dot>{activePlan.status}</Badge>
                {activePlan.review_date && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Review {activePlan.review_date}</span>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Objectives</div>
              <p style={{ fontSize: 13.5, color: 'var(--text-strong)', margin: '4px 0 10px', lineHeight: 1.55 }}>{activePlan.objectives}</p>
              {activePlan.interventions && (<>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Interventions</div>
                <p style={{ fontSize: 13.5, color: 'var(--text-body)', margin: '4px 0 0', lineHeight: 1.55 }}>{activePlan.interventions}</p>
              </>)}
              {canWrite && <div style={{ marginTop: 12 }} className="racco-no-print"><Button variant="secondary" onClick={() => setPlan({ ...activePlan })} iconLeft={<Icon name="pencil" size={15} />}>Edit plan</Button></div>}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>No treatment plan yet.</div>
              {canWrite && <Button variant="primary" onClick={() => setPlan({ objectives: '', interventions: '', status: 'active', review_date: '' })} iconLeft={<Icon name="plus" size={15} />} className="racco-no-print">Create plan</Button>}
            </div>
          )}
        </Card>

        <Card eyebrow="Watchlist" title="Problems encountered" padding="20px">
          {data.problems.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No problems logged.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.problems.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: p.resolved ? 'var(--success-50)' : 'var(--ink-50)', border: '1px solid var(--border)' }}>
                  <Icon name={p.resolved ? 'check-circle-2' : 'alert-triangle'} size={15} style={{ color: p.resolved ? 'var(--success-600)' : 'var(--amber-500)' }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-strong)', textDecoration: p.resolved ? 'line-through' : 'none', opacity: p.resolved ? 0.7 : 1 }}>{p.description}</span>
                  {p.category && <Badge tone="neutral" size="sm">{p.category}</Badge>}
                  {canWrite && !p.resolved && (
                    <button title="Mark resolved" className="racco-no-print" style={iconBtn('var(--success-600)')}
                      onClick={async () => { try { await api.patch(`/problems/${p.id}/`, { resolved: true }); load(); } catch { toast.error('Could not update.'); } }}>
                      <Icon name="check" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Remarks log */}
      <Card eyebrow="Progress log" title="Psychological remark notes" padding="20px">
        {canWrite && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: data.remarks.length ? 18 : 0 }} className="racco-no-print">
            <textarea value={remarkText} onChange={(e) => setRemarkText(e.target.value)} rows={3} placeholder="Add a dated remark for this child…" style={textarea} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={addRemark} iconLeft={<Icon name="plus" size={16} />} disabled={!remarkText.trim()}>Add remark</Button>
            </div>
          </div>
        )}
        {data.remarks.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No remarks yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.remarks.map((n) => (
              <div key={n.id} style={{ borderLeft: '3px solid var(--blue-200)', paddingLeft: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{n.date} · {n.author_name || '—'}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-strong)', margin: '4px 0 0' }}>{n.text}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Alert disclaimer title="Note." style={{ marginTop: 18 }}>All clinical findings are the licensed psychologist&apos;s own professional judgment.</Alert>

      {/* Add-result drawer */}
      {result && (
        <div onClick={() => setResult(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 70 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '92%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>Add result entry</div>
            <FormField label="Instrument (title)">
              <Select value={result.instrument} onChange={(e) => setResult({ ...result, instrument: e.target.value })}>
                <option value="">— General / none —</option>
                {instruments.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
              </Select>
            </FormField>
            <FormField label="Findings summary" required>
              <textarea value={result.summary} onChange={(e) => setResult({ ...result, summary: e.target.value })} rows={7} style={textarea} placeholder="Findings in your own words…" />
            </FormField>
            <FormField label="Classification (your own words)">
              <textarea value={result.classification} onChange={(e) => setResult({ ...result, classification: e.target.value })} rows={2} style={textarea} />
            </FormField>
            <Button variant="primary" onClick={saveResult} disabled={!result.summary.trim()} iconLeft={<Icon name="save" size={16} />}>Save entry</Button>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Manual input only — the system never computes scores.</div>
          </div>
        </div>
      )}

      {/* Treatment plan drawer */}
      {plan && (
        <div onClick={() => setPlan(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 70 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '92%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>{plan.id ? 'Edit treatment plan' : 'New treatment plan'}</div>
            <FormField label="Objectives" required>
              <textarea value={plan.objectives} onChange={(e) => setPlan({ ...plan, objectives: e.target.value })} rows={5} style={textarea} />
            </FormField>
            <FormField label="Interventions">
              <textarea value={plan.interventions} onChange={(e) => setPlan({ ...plan, interventions: e.target.value })} rows={5} style={textarea} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {plan.id && (
                <FormField label="Status">
                  <Select value={plan.status} onChange={(e) => setPlan({ ...plan, status: e.target.value })}>
                    <option value="active">Active</option><option value="completed">Completed</option><option value="revised">Revised</option>
                  </Select>
                </FormField>
              )}
              <FormField label="Review date">
                <input type="date" value={plan.review_date || ''} onChange={(e) => setPlan({ ...plan, review_date: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: 14 }} />
              </FormField>
            </div>
            <Button variant="primary" onClick={savePlan} disabled={!plan.objectives.trim()} iconLeft={<Icon name="save" size={16} />}>Save plan</Button>
          </div>
        </div>
      )}
    </div>
  );
}
