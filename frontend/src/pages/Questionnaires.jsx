import React, { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { useActivity } from '../context/ActivityContext';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Badge, Input, Select, FormField, Alert, EmptyState, Icon, iconBtn, hoverLift, PAGE } from '../ui';
import { useToast } from '../context/ToastContext';

const TYPES = [
  { v: 'rating_scale', label: 'Rating scale (1–5)' },
  { v: 'yes_no', label: 'Yes / No' },
  { v: 'multiple_choice', label: 'Multiple choice' },
  { v: 'emotion', label: 'Emotion-based' },
];
const HAS_OPTIONS = (t) => t === 'multiple_choice' || t === 'emotion';
const STATUS_TONE = { draft: 'neutral', active: 'success', archived: 'amber' };
const blankQuestion = (order) => ({ question_text: '', question_type: 'rating_scale', options: [], concern_direction: 'higher', concern_options: [], order });
const blankForm = () => ({ title: '', age_group: '', description: '', status: 'draft', owner: '', questions: [blankQuestion(1)] });

export default function Questionnaires() {
  const { refresh: refreshActivity } = useActivity();
  const { user } = useAuth();
  const isAdmin = user?.role_name === 'Administrator';
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [psychologists, setPsychologists] = useState([]);
  const [form, setForm] = useState(null);
  const [banner, setBanner] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get('/questionnaires/').then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => {
    load();
    // Admins assign an owning psychologist when creating an instrument.
    if (isAdmin) api.get('/users/').then((r) => setPsychologists(r.data.filter((u) => u.role_name === 'Psychologist'))).catch(() => {});
  }, [isAdmin]);

  const openCreate = () => { setError(''); setBanner(''); setForm(blankForm()); };
  const openEdit = (qn) => {
    setError(''); setBanner('');
    api.get(`/questionnaires/${qn.id}/`).then((r) => setForm({
      ...r.data,
      questions: (r.data.questions.length ? r.data.questions : [blankQuestion(1)]).map((q) => ({ ...q, options: q.options || [], concern_direction: q.concern_direction || 'higher', concern_options: q.concern_options || [] })),
    }));
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/questionnaires/extract/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm({
        title: data.title || '', age_group: data.age_group || '', description: '', status: 'draft',
        questions: (data.questions.length ? data.questions : [blankQuestion(1)]).map((q) => ({ ...q, options: q.options || [], concern_direction: q.concern_direction || 'higher', concern_options: q.concern_options || [] })),
      });
      setBanner(`Imported ${data.questions.length} question(s) from “${file.name}”. Review and fix each one before publishing.`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const setQuestion = (i, patch) => setForm((f) => ({ ...f, questions: f.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) }));
  const addQuestion = () => setForm((f) => ({ ...f, questions: [...f.questions, blankQuestion(f.questions.length + 1)] }));
  const removeQuestion = (i) => setForm((f) => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));
  const move = (i, dir) => setForm((f) => {
    const qs = [...f.questions]; const j = i + dir;
    if (j < 0 || j >= qs.length) return f;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    return { ...f, questions: qs.map((q, idx) => ({ ...q, order: idx + 1 })) };
  });

  const save = async (publish) => {
    setError('');
    const payload = {
      title: form.title, age_group: form.age_group, description: form.description,
      status: publish ? 'active' : (form.status === 'archived' ? 'draft' : form.status),
      questions: form.questions
        .filter((q) => q.question_text.trim())
        .map((q, i) => ({ question_text: q.question_text, question_type: q.question_type, options: HAS_OPTIONS(q.question_type) ? q.options : [], concern_direction: q.concern_direction || 'higher', concern_options: HAS_OPTIONS(q.question_type) ? (q.concern_options || []) : [], order: i + 1 })),
    };
    if (isAdmin) payload.owner = form.owner || null;
    if (!payload.title.trim()) { setError('Title is required.'); return; }
    if (payload.questions.length === 0) { setError('Add at least one question.'); return; }
    if (isAdmin && !form.owner) { setError('Select the owning psychologist.'); return; }
    try {
      if (form.id) await api.put(`/questionnaires/${form.id}/`, payload);
      else await api.post('/questionnaires/', payload);
      toast.success(publish ? 'Questionnaire published' : (form.id ? 'Questionnaire updated' : 'Questionnaire created'));
      setForm(null); load(); refreshActivity();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Save failed'));
      toast.error('Could not save the questionnaire. Please try again.');
    }
  };

  const archive = async (qn) => {
    if (!window.confirm(`Archive “${qn.title}”?`)) return;
    try {
      await api.post(`/questionnaires/${qn.id}/archive/`);
      toast.success(`“${qn.title}” archived`);
      load(); refreshActivity();
    } catch (err) {
      toast.error('Could not archive the questionnaire.');
    }
  };

  return (
    <div style={{ ...PAGE, position: 'relative' }}>
      <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" onChange={onUpload} style={{ display: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Build a questionnaire by hand, or digitize a paper instrument.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} iconLeft={<Icon name={busy ? 'loader' : 'file-up'} size={17} />}>{busy ? 'Reading…' : 'Digitize from paper'}</Button>
          <Button variant="primary" onClick={openCreate} iconLeft={<Icon name="plus" size={17} />}>New Questionnaire</Button>
        </div>
      </div>

      {error && !form && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />} style={{ marginBottom: 14 }}>{error}</Alert>}

      <Card padding="0">
        {items.length === 0 ? (
          <EmptyState icon={<Icon name="clipboard-pen" size={24} />} title="No questionnaires yet" description="Create one, or upload a paper instrument to digitize it." />
        ) : (
          <div className="racco-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Title', 'Age Group', 'Questions', ...(isAdmin ? ['Owner'] : []), 'Status', 'Actions'].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((qn) => (
                  <tr key={qn.id} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{qn.title}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-body)' }}>{qn.age_group || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{qn.questions?.length ?? 0}</td>
                    {isAdmin && <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-body)' }}>{qn.owner_name || '—'}</td>}
                    <td style={{ padding: '12px 16px' }}><Badge tone={STATUS_TONE[qn.status] || 'neutral'} dot>{qn.status}</Badge></td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button title="Edit" aria-label={`Edit ${qn.title}`} onClick={() => openEdit(qn)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--blue-600)')}><Icon name="pencil" size={15} /></button>
                        <button title="Archive" aria-label={`Archive ${qn.title}`} onClick={() => archive(qn)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--red-500)')}><Icon name="archive" size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {form && (
        <div onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 70, animation: 'racco-fade-in var(--dur-base) var(--ease-out)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '94%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'racco-slide-left var(--dur-slow) var(--ease-out)' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--ink-50)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>{form.id ? 'Edit Questionnaire' : 'New Questionnaire'}</div>
              <button type="button" onClick={() => setForm(null)} aria-label="Close" {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--text-muted)')}><Icon name="x" size={17} /></button>
            </div>

            <div className="racco-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {banner && <Alert tone="warning" icon={<Icon name="sparkles" size={18} />}>{banner}</Alert>}
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{error}</Alert>}
              <FormField label="Title" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="Age Group"><Input value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })} placeholder="e.g. 5-8" /></FormField>
                <FormField label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="active">Active</option></Select></FormField>
              </div>
              <FormField label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
              {isAdmin && (
                <FormField label="Owner (psychologist)" required>
                  <Select value={form.owner || ''} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
                    <option value="">— Select psychologist —</option>
                    {psychologists.map((p) => <option key={p.id} value={p.id}>{p.fullname || p.username}</option>)}
                  </Select>
                </FormField>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <div className="racco-eyebrow" style={{ fontSize: 11 }}>Questions ({form.questions.length})</div>
                <Button variant="ghost" onClick={addQuestion} iconLeft={<Icon name="plus" size={15} />}>Add</Button>
              </div>

              {form.questions.map((q, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 12, background: 'var(--ink-50)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', paddingTop: 9 }}>{i + 1}</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Input value={q.question_text} onChange={(e) => setQuestion(i, { question_text: e.target.value })} placeholder="Question text" />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Select value={q.question_type} onChange={(e) => setQuestion(i, { question_type: e.target.value })}>
                          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                        </Select>
                      </div>
                      {HAS_OPTIONS(q.question_type) && (
                        <Input value={(q.options || []).join(', ')} onChange={(e) => setQuestion(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Options, comma-separated" />
                      )}
                      {q.question_type === 'rating_scale' && (
                        <Select value={q.concern_direction || 'higher'} onChange={(e) => setQuestion(i, { concern_direction: e.target.value })}>
                          <option value="higher">Concern = higher ratings</option>
                          <option value="lower">Concern = lower ratings</option>
                        </Select>
                      )}
                      {q.question_type === 'yes_no' && (
                        <Select value={q.concern_direction || 'higher'} onChange={(e) => setQuestion(i, { concern_direction: e.target.value })}>
                          <option value="higher">Concern answer: Yes</option>
                          <option value="lower">Concern answer: No</option>
                        </Select>
                      )}
                      {HAS_OPTIONS(q.question_type) && (
                        <Input value={(q.concern_options || []).join(', ')} onChange={(e) => setQuestion(i, { concern_options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Concerning options (comma-separated, must match options)" />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button title="Move up" onClick={() => move(i, -1)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--text-muted)', 28)}><Icon name="chevron-up" size={14} /></button>
                      <button title="Move down" onClick={() => move(i, 1)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--text-muted)', 28)}><Icon name="chevron-down" size={14} /></button>
                      <button title="Remove" onClick={() => removeQuestion(i)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--red-500)', 28)}><Icon name="trash-2" size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <Button variant="secondary" fullWidth onClick={() => save(false)} iconLeft={<Icon name="save" size={16} />}>Save draft</Button>
              <Button variant="primary" fullWidth onClick={() => save(true)} iconLeft={<Icon name="check" size={16} />}>Publish</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
