import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { Card, Button, Badge, Input, Select, FormField, Alert, EmptyState, Avatar, Icon, PAGE } from '../ui';

const STEPS = ['Child', 'Consent', 'Interview', 'Instruments', 'Problems', 'Complete'];

const textarea = { width: '100%', resize: 'vertical', padding: '11px 13px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55 };

export default function PreAssessment() {
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [children, setChildren] = useState([]);
  const [child, setChild] = useState(null);
  const [pa, setPa] = useState(null); // the in-progress PreAssessment
  const [consents, setConsents] = useState([]);
  const [consentTemplates, setConsentTemplates] = useState([]);
  const [interviewTemplates, setInterviewTemplates] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [problems, setProblems] = useState([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/children/').then((r) => setChildren(r.data.filter((c) => c.status === 'active'))).catch(() => {});
    api.get('/form-templates/?type=consent').then((r) => setConsentTemplates(r.data)).catch(() => {});
    api.get('/form-templates/?type=clinical_interview').then((r) => setInterviewTemplates(r.data)).catch(() => {});
    api.get('/instruments/').then((r) => setInstruments(r.data)).catch(() => {});
  }, []);

  const goToStep = (i) => { if (i <= maxStep) setStep(i); };

  const advanceTo = (i) => { setMaxStep((m) => Math.max(m, Math.floor(i))); setStep(i); };

  const resumeStepFor = (data) => {
    if (!data.consent) return 1;
    if (!data.interview) return 2;
    if ((data.instruments || []).length === 0) return 3;
    return 4;
  };

  const start = async (c) => {
    setError('');
    try {
      const { data } = await api.post('/pre-assessments/', { child: c.id });
      setChild(c); setPa(data);
      setSelectedInstruments(data.instruments || []);
      setNotes(data.notes || '');
      const existing = await api.get(`/consents/?child=${c.id}`);
      setConsents(existing.data);
      advanceTo(resumeStepFor(data));
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not start the pre-assessment.');
    }
  };

  const patchPa = async (patch) => {
    const { data } = await api.patch(`/pre-assessments/${pa.id}/`, patch);
    setPa(data);
    return data;
  };

  const linkConsent = async (consentId) => {
    setError('');
    try { await patchPa({ consent: consentId }); advanceTo(2); }
    catch (err) { setError(JSON.stringify(err.response?.data || 'Could not link consent.')); }
  };

  const saveInstruments = async () => {
    setError('');
    if (selectedInstruments.length === 0) { setError('Select at least one instrument title.'); return; }
    try { await patchPa({ instruments: selectedInstruments }); advanceTo(4); }
    catch (err) { setError(JSON.stringify(err.response?.data || 'Could not save instruments.')); }
  };

  const complete = async () => {
    setError('');
    try {
      if (notes.trim()) await patchPa({ notes: notes.trim() });
      const { data } = await api.post(`/pre-assessments/${pa.id}/complete/`);
      setPa(data);
      toast.success('Pre-assessment completed');
      advanceTo(5);
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Could not complete.'));
    }
  };

  return (
    <div style={{ ...PAGE, maxWidth: 860 }}>
      {/* Step rail — click any visited step to look back at it */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => {
          const reachable = i <= maxStep && i < 5;
          return (
            <div key={s} onClick={() => reachable && goToStep(i)} title={reachable ? `Go to ${s}` : undefined}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12.5, fontWeight: 700, cursor: reachable ? 'pointer' : 'default', background: i === step ? 'var(--blue-600)' : i < step ? 'var(--success-50)' : 'var(--ink-50)', color: i === step ? '#fff' : i < step ? 'var(--success-600)' : 'var(--text-muted)', border: `1px solid ${i === step ? 'var(--blue-600)' : i < step ? 'var(--success-100)' : 'var(--border)'}` }}>
              {i < step ? <Icon name="check" size={13} /> : <span className="racco-mono" style={{ fontSize: 11 }}>{i + 1}</span>}
              {s}
            </div>
          );
        })}
      </div>

      {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />} style={{ marginBottom: 14 }}>{error}</Alert>}

      {step === 0 && (
        <Card eyebrow="Step 1" title="Select a child" padding="22px">
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
            Start a guided pre-assessment for one of your assigned children.
          </p>
          {children.length === 0 ? (
            <EmptyState icon={<Icon name="users" size={24} />} title="No assigned children" description="Ask the administrator or staff to assign children to you." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {children.map((c) => (
                <button key={c.id} onClick={() => start(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', transition: 'var(--transition-base)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--blue-50)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface)')}>
                  <Avatar name={c.fullname} tone="brand" size="sm" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{c.fullname}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.case_type || 'No case type'} · Pre-assessment: {c.pre_assessment_status}</div>
                  </div>
                  <Badge tone={c.pre_assessment_status === 'Answered' ? 'success' : 'amber'} size="sm">{c.pre_assessment_status}</Badge>
                  <Icon name="chevron-right" size={16} style={{ color: 'var(--text-faint)' }} />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === 1 && (
        <ConsentStep child={child} consents={consents} templates={consentTemplates}
          onLinked={linkConsent} onRefresh={async () => {
            const r = await api.get(`/consents/?child=${child.id}`); setConsents(r.data);
          }} setError={setError} />
      )}

      {step === 2 && (
        <InterviewStep child={child} templates={interviewTemplates} setError={setError}
          onDone={async (interviewId) => {
            try {
              if (interviewId) await patchPa({ interview: interviewId });
              advanceTo(3);
            } catch (err) { setError(JSON.stringify(err.response?.data || 'Could not link interview.')); }
          }} />
      )}

      {step === 3 && (
        <Card eyebrow="Step 4" title="Select instrument titles" padding="22px">
          <Alert disclaimer style={{ marginBottom: 14 }} title="Paper administration.">
            Instruments are administered offline using the psychologist&apos;s own printed materials. The system records titles only.
          </Alert>
          {instruments.length === 0 ? (
            <EmptyState icon={<Icon name="clipboard-pen" size={24} />} title="Your catalog is empty" description="Add instrument titles under Pre-Assessment Instruments first." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {instruments.map((i) => {
                const on = selectedInstruments.includes(i.id);
                return (
                  <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 'var(--radius-lg)', border: `1px solid ${on ? 'var(--blue-400)' : 'var(--border)'}`, background: on ? 'var(--blue-50)' : 'var(--surface)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} style={{ accentColor: 'var(--blue-600)' }}
                      onChange={() => setSelectedInstruments((s) => on ? s.filter((x) => x !== i.id) : [...s, i.id])} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{i.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{[i.publisher, i.age_range && `ages ${i.age_range}`].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <Badge tone="neutral" size="sm">{i.category}</Badge>
                  </label>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="primary" onClick={saveInstruments} disabled={selectedInstruments.length === 0} iconLeft={<Icon name="check" size={16} />}>Save & continue</Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <ProblemsStep child={child} problems={problems} setProblems={setProblems} setError={setError} onNext={() => advanceTo(4.5)} />
      )}
      {step === 4.5 && (
        <Card eyebrow="Step 6" title="Review & complete" padding="22px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {[['Child', child?.fullname],
              ['Consent', pa?.consent ? `Linked (${pa.consent_status || 'signed'})` : 'Missing'],
              ['Clinical interview', pa?.interview ? 'Recorded' : 'Skipped'],
              ['Instruments', (pa?.instrument_titles || []).join(', ') || selectedInstruments.length + ' selected'],
              ['Problems logged', String(problems.length)]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingBottom: 10, borderBottom: '1px solid var(--ink-100)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 13.5, color: 'var(--text-strong)', fontWeight: 700, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
          <FormField label="Session notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} style={textarea} placeholder="Observations during the session…" />
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <Button variant="primary" onClick={complete} iconLeft={<Icon name="check-circle-2" size={16} />}>Mark completed</Button>
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card padding="28px">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', background: 'var(--success-50)', color: 'var(--success-600)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="check-circle-2" size={28} /></span>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--text-strong)' }}>Pre-assessment completed</div>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '8px 0 20px' }}>
              {child?.fullname}&apos;s profile now shows “Answered” with the instrument titles used.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <Button variant="secondary" onClick={() => { setStep(0); setMaxStep(0); setPa(null); setChild(null); setSelectedInstruments([]); setProblems([]); setNotes(''); api.get('/children/').then((r) => setChildren(r.data.filter((c) => c.status === 'active'))); }}>Start another</Button>
              <Button variant="primary" onClick={() => navigate(`/report/child/${child.id}`)}>Open child report</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function ConsentStep({ child, consents, templates, onLinked, onRefresh, setError }) {
  const [mode, setMode] = useState(consents.length ? 'existing' : 'new');
  const [form, setForm] = useState({ template: '', signer_name: '', signer_relationship: '', status: 'signed' });
  const signed = useMemo(() => consents.filter((c) => c.status === 'signed'), [consents]);

  const recordNew = async () => {
    setError('');
    if (!form.signer_name.trim()) { setError('Enter the signer’s name.'); return; }
    try {
      const { data } = await api.post('/consents/', {
        child: child.id, template: form.template || null,
        signer_name: form.signer_name, signer_relationship: form.signer_relationship,
        status: form.status,
      });
      await onRefresh();
      if (data.status === 'signed') onLinked(data.id);
      else setError('Consent recorded but not signed — a signed consent is required to complete the pre-assessment.');
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Could not record consent.'));
    }
  };

  return (
    <Card eyebrow="Step 2" title={`Consent — ${child.fullname}`} padding="22px">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
        Verify a consent already on file or record the paper consent collected from the guardian.
      </p>
      <div style={{ display: 'inline-flex', gap: 4, background: 'var(--ink-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: 3, marginBottom: 16 }}>
        {[['existing', `On file (${signed.length})`], ['new', 'Record new']].map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)} style={{ padding: '6px 14px', borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, background: mode === k ? 'var(--blue-600)' : 'transparent', color: mode === k ? '#fff' : 'var(--text-muted)' }}>{label}</button>
        ))}
      </div>

      {mode === 'existing' ? (
        signed.length === 0 ? (
          <EmptyState icon={<Icon name="file-text" size={24} />} title="No signed consent on file" description="Record the consent you collected on paper." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signed.map((c) => (
              <button key={c.id} onClick={() => onLinked(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                <Icon name="file-text" size={18} style={{ color: 'var(--blue-600)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{c.signer_name || 'Consent'} {c.signer_relationship ? `(${c.signer_relationship})` : ''}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.date} · {c.template_title || 'no template'}</div>
                </div>
                <Badge tone="success" size="sm" dot>Signed</Badge>
              </button>
            ))}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormField label="Consent form template" hint="Your agency-authored consent form.">
            <Select value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
              <option value="">— None / generic —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title} (v{t.version})</option>)}
            </Select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Signer name" required><Input value={form.signer_name} onChange={(e) => setForm({ ...form, signer_name: e.target.value })} /></FormField>
            <FormField label="Relationship to child"><Input value={form.signer_relationship} onChange={(e) => setForm({ ...form, signer_relationship: e.target.value })} placeholder="e.g. Foster mother" /></FormField>
          </div>
          <FormField label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="signed">Signed</option>
              <option value="pending">Pending</option>
              <option value="declined">Declined</option>
            </Select>
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={recordNew} iconLeft={<Icon name="save" size={16} />}>Record consent & continue</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function InterviewStep({ child, templates, onDone, setError }) {
  const [templateId, setTemplateId] = useState('');
  const [answers, setAnswers] = useState({});
  const tpl = templates.find((t) => String(t.id) === String(templateId));

  const save = async () => {
    setError('');
    try {
      const { data } = await api.post('/interviews/', {
        child: child.id, template: templateId || null, answers,
      });
      onDone(data.id);
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Could not save the interview.'));
    }
  };

  return (
    <Card eyebrow="Step 3" title="Clinical interview" padding="22px">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
        Record the answers to your own Clinical Interview form, or skip if not conducted today.
      </p>
      <FormField label="Interview form template">
        <Select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setAnswers({}); }}>
          <option value="">— Select template —</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.title} (v{t.version})</option>)}
        </Select>
      </FormField>
      {tpl && (tpl.fields || []).map((f) => (
        <FormField key={f.label} label={f.label}>
          {f.field_type === 'long_text' ? (
            <textarea value={answers[f.label] || ''} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })} rows={3} style={textarea} />
          ) : f.field_type === 'date' ? (
            <Input type="date" value={answers[f.label] || ''} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })} />
          ) : f.field_type === 'yes_no' ? (
            <Select value={answers[f.label] || ''} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })}>
              <option value="">—</option><option>Yes</option><option>No</option>
            </Select>
          ) : f.field_type === 'choice' ? (
            <Select value={answers[f.label] || ''} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })}>
              <option value="">—</option>
              {(f.options || []).map((o) => <option key={o}>{o}</option>)}
            </Select>
          ) : (
            <Input value={answers[f.label] || ''} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })} />
          )}
        </FormField>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
        <Button variant="ghost" onClick={() => onDone(null)}>Skip for now</Button>
        <Button variant="primary" onClick={save} disabled={!templateId} iconLeft={<Icon name="save" size={16} />}>Save interview & continue</Button>
      </div>
    </Card>
  );
}

function ProblemsStep({ child, problems, setProblems, setError, onNext }) {
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('');

  const add = async () => {
    if (!desc.trim()) return;
    setError('');
    try {
      const { data } = await api.post('/problems/', { child: child.id, description: desc.trim(), category: cat.trim() });
      setProblems([...problems, data]);
      setDesc(''); setCat('');
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Could not log the problem.'));
    }
  };

  return (
    <Card eyebrow="Step 5" title="Problems encountered" padding="22px">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
        Log the problems observed in {child.fullname} during this session (optional).
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, marginBottom: 14 }}>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Problem description…" />
        <Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Category (optional)" />
        <Button variant="secondary" onClick={add} disabled={!desc.trim()} iconLeft={<Icon name="plus" size={16} />}>Add</Button>
      </div>
      {problems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {problems.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--radius-md)', background: 'var(--ink-50)', border: '1px solid var(--border)' }}>
              <Icon name="alert-triangle" size={15} style={{ color: 'var(--amber-500)' }} />
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-strong)' }}>{p.description}</span>
              {p.category && <Badge tone="neutral" size="sm">{p.category}</Badge>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={onNext} iconLeft={<Icon name="chevron-right" size={16} />}>Continue to review</Button>
      </div>
    </Card>
  );
}
