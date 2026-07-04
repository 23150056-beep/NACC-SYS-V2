import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, Button, Badge, Alert, Select, FormField, Icon, iconBtn, PAGE } from '../ui';

const TRAJ = {
  improving: { label: 'Improving', icon: 'trending-down', color: 'var(--success-600)', bg: 'var(--success-50)' },
  worsening: { label: 'Worsening', icon: 'trending-up', color: 'var(--red-600)', bg: 'var(--red-50)' },
  stable: { label: 'Stable', icon: 'minus', color: 'var(--blue-600)', bg: 'var(--blue-50)' },
  baseline: { label: 'Baseline', icon: 'flag', color: 'var(--text-muted)', bg: 'var(--ink-50)' },
};
const caseRef = (id) => `C-${String(id).padStart(4, '0')}`;
const td = { padding: '10px 14px', fontSize: 13, color: 'var(--text-body)', whiteSpace: 'nowrap' };
const CLASSIFICATIONS = ['Trauma / Stressor-related', 'Behavioral / Conduct', 'Adjustment Disorder', 'Normal Development'];

export default function ChildProgressReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const isPsych = user?.role_name === 'Psychologist';
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);

  const canWrite = ['Administrator', 'Psychologist'].includes(user?.role_name);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');

  const loadNotes = () => api.get(`/progress-notes/?child=${id}`).then((r) => setNotes(r.data)).catch(() => {});
  useEffect(() => { loadNotes(); /* eslint-disable-next-line */ }, [id]);

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      await api.post('/progress-notes/', { child: Number(id), text: noteText.trim() });
      setNoteText(''); loadNotes(); toast.success('Progress note added');
    } catch (err) { toast.error(err.response?.data?.detail || 'Could not add note.'); }
  };
  const deleteNote = async (noteId) => {
    if (!window.confirm('Delete this progress note?')) return;
    try { await api.delete(`/progress-notes/${noteId}/`); loadNotes(); toast.success('Note deleted'); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not delete.'); }
  };

  const [goals, setGoals] = useState([]);
  const [goalText, setGoalText] = useState('');

  const loadGoals = () => api.get(`/goals/?child=${id}`).then((r) => setGoals(r.data)).catch(() => {});
  useEffect(() => { loadGoals(); /* eslint-disable-next-line */ }, [id]);

  const addGoal = async () => {
    if (!goalText.trim()) return;
    try { await api.post('/goals/', { child: Number(id), text: goalText.trim() }); setGoalText(''); loadGoals(); toast.success('Goal added'); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not add goal.'); }
  };
  const toggleGoal = async (g) => {
    try { await api.patch(`/goals/${g.id}/`, { status: g.status === 'met' ? 'ongoing' : 'met' }); loadGoals(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not update goal.'); }
  };
  const deleteGoal = async (goalId) => {
    if (!window.confirm('Delete this goal?')) return;
    try { await api.delete(`/goals/${goalId}/`); loadGoals(); toast.success('Goal deleted'); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not delete.'); }
  };

  const load = () => api.get(`/reports/child/${id}/`).then((r) => setData(r.data)).catch(() => setData('error'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (data === 'error') return <div style={PAGE}><Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>This report is unavailable.</Alert></div>;
  if (!data) return <div style={PAGE}><div style={{ color: 'var(--text-muted)' }}>Loading report…</div></div>;

  const { child } = data;
  const rows = data.assessments;
  const traj = TRAJ[data.trajectory] || TRAJ.baseline;
  const chart = rows.filter((a) => a.result && a.result.behavioral_score != null)
    .map((a) => ({ date: a.assessment_date, score: Number(a.result.behavioral_score) }));
  const latest = rows[rows.length - 1];

  const saveEdit = async () => {
    try {
      await api.patch(`/assessments/${edit.id}/`, { notes: edit.notes, classification: edit.classification });
      toast.success('Assessment updated'); setEdit(null); load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Could not update.'); }
  };
  const finalize = async (a) => {
    if (!window.confirm('Finalize & submit to NACC? This permanently locks the assessment.')) return;
    try { await api.post(`/assessments/${a.id}/finalize/`); toast.success('Assessment finalized'); load(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not finalize.'); }
  };

  return (
    <div style={PAGE} className="racco-print-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }} className="racco-no-print">
        <Button variant="ghost" onClick={() => navigate('/report')} iconLeft={<Icon name="arrow-left" size={17} />}>Back to Results</Button>
        <Button variant="secondary" onClick={() => window.print()} iconLeft={<Icon name="printer" size={17} />}>Print / Save PDF</Button>
      </div>

      <Card padding="22px" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-strong)' }}>{child.fullname}</div>
            <div className="racco-mono" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{caseRef(child.id)} · {child.case_type || '—'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Psychologist: {child.psychologist_name || '—'} · {[child.barangay, child.municipality, child.province].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 'var(--radius-pill)', background: traj.bg, color: traj.color, fontWeight: 800, fontSize: 14 }}>
            <Icon name={traj.icon} size={18} /> {traj.label}
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
          {rows.length} assessment(s) on file{latest ? ` · latest ${latest.assessment_date}` : ''}
        </div>
      </Card>

      <Card eyebrow="Behavioral score over time" title="Trajectory" padding="20px" style={{ marginBottom: 18 }}>
        {chart.length < 2 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Need at least two scored assessments to chart a trend.</div>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceArea y1={0} y2={34} fill="#16a34a" fillOpacity={0.06} />
                <ReferenceArea y1={34} y2={67} fill="#d97706" fillOpacity={0.06} />
                <ReferenceArea y1={67} y2={100} fill="#dc2626" fillOpacity={0.06} />
                <Line type="monotone" dataKey="score" stroke="var(--blue-600)" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card eyebrow="History" title="Assessment timeline" padding="0" style={{ marginBottom: 18 }}>
        <div className="racco-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
              {['Date', 'Instrument', 'Classification', 'Score', 'Priority', 'By', ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                  <td style={td}>{a.assessment_date}</td>
                  <td style={td}>{a.questionnaire_title || '—'}</td>
                  <td style={td}>{a.result?.classification || a.classification || '—'}</td>
                  <td style={td}>{a.result?.behavioral_score ?? '—'}</td>
                  <td style={td}>{a.result?.priority_level || '—'}</td>
                  <td style={td}>{a.psychologist_name}</td>
                  <td style={td}>
                    {isPsych && (a.is_locked
                      ? <Badge tone="neutral" dot>Finalized</Badge>
                      : (
                        <div style={{ display: 'flex', gap: 6 }} className="racco-no-print">
                          <button title="Edit notes/classification" onClick={() => setEdit({ id: a.id, notes: a.notes || '', classification: a.classification || CLASSIFICATIONS[3] })} style={iconBtn('var(--blue-600)')}><Icon name="pencil" size={14} /></button>
                          <button title="Finalize & lock" onClick={() => finalize(a)} style={iconBtn('var(--success-600)')}><Icon name="lock" size={14} /></button>
                        </div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {latest && (
        <Card eyebrow="Latest assessment" title={latest.assessment_date} padding="20px">
          {latest.result?.recommendation_text && <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-body)', margin: '0 0 10px' }}>{latest.result.recommendation_text}</p>}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Psychologist&apos;s notes</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-strong)', margin: '4px 0 0' }}>{latest.notes || '—'}</p>
        </Card>
      )}

      <Card eyebrow="Treatment goals" title="Goals" padding="20px" style={{ marginTop: 18 }}>
        {canWrite && (
          <div style={{ display: 'flex', gap: 10, marginBottom: goals.length ? 16 : 0 }} className="racco-no-print">
            <input value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="Add a treatment goal…"
              style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: 14 }} />
            <Button variant="primary" onClick={addGoal} iconLeft={<Icon name="plus" size={16} />} disabled={!goalText.trim()}>Add</Button>
          </div>
        )}
        {goals.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No goals set yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {goals.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--ink-50)', border: '1px solid var(--border)' }}>
                <button title={g.status === 'met' ? 'Mark ongoing' : 'Mark met'} disabled={!canWrite} onClick={() => toggleGoal(g)}
                  className="racco-no-print" style={{ ...iconBtn(g.status === 'met' ? 'var(--success-600)' : 'var(--text-faint)'), cursor: canWrite ? 'pointer' : 'default' }}>
                  <Icon name={g.status === 'met' ? 'check-circle-2' : 'circle'} size={18} />
                </button>
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-strong)', textDecoration: g.status === 'met' ? 'line-through' : 'none', opacity: g.status === 'met' ? 0.7 : 1 }}>{g.text}</span>
                <Badge tone={g.status === 'met' ? 'success' : 'neutral'} size="sm">{g.status === 'met' ? 'Met' : 'Ongoing'}</Badge>
                {canWrite && <button title="Delete goal" onClick={() => deleteGoal(g.id)} className="racco-no-print" style={iconBtn('var(--red-500)')}><Icon name="trash-2" size={14} /></button>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card eyebrow="Progress log" title="Session notes" padding="20px" style={{ marginTop: 18 }}>
        {canWrite && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: notes.length ? 18 : 0 }} className="racco-no-print">
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Add a dated progress note for this child…"
              style={{ width: '100%', resize: 'vertical', padding: '11px 13px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={addNote} iconLeft={<Icon name="plus" size={16} />} disabled={!noteText.trim()}>Add note</Button>
            </div>
          </div>
        )}
        {notes.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No progress notes yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {notes.map((n) => (
              <div key={n.id} style={{ borderLeft: '3px solid var(--blue-200)', paddingLeft: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{n.date} · {n.author_name || '—'}</div>
                  {canWrite && <button title="Delete note" onClick={() => deleteNote(n.id)} className="racco-no-print" style={iconBtn('var(--red-500)')}><Icon name="trash-2" size={14} /></button>}
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-strong)', margin: '4px 0 0' }}>{n.text}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Alert disclaimer title="Note." style={{ marginTop: 18 }}>Decision support, not a diagnosis — the licensed psychologist makes all determinations.</Alert>

      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 70, animation: 'racco-fade-in var(--dur-base) var(--ease-out)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '92%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, animation: 'racco-slide-left var(--dur-slow) var(--ease-out)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>Edit assessment</div>
            <FormField label="Classification">
              <Select value={edit.classification} onChange={(e) => setEdit({ ...edit, classification: e.target.value })}>
                {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </FormField>
            <FormField label="Psychologist's notes">
              <textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={9} style={{ width: '100%', resize: 'vertical', padding: '11px 13px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55 }} />
            </FormField>
            <Button variant="primary" onClick={saveEdit} iconLeft={<Icon name="save" size={16} />}>Save changes</Button>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Edits are logged. The AI score and analysis cannot be changed.</div>
          </div>
        </div>
      )}
    </div>
  );
}
