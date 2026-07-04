import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useActivity } from '../context/ActivityContext';
import { Card, Button, Alert, Select, FormField, ProgressSteps, Icon, PAGE, hoverLift } from '../ui';
import { useToast } from '../context/ToastContext';
import RespondentSurvey from '../components/RespondentSurvey';

function caseRef(id) { return `C-${String(id).padStart(4, '0')}`; }

const CLASSIFICATIONS = ['Trauma / Stressor-related', 'Behavioral / Conduct', 'Adjustment Disorder', 'Normal Development'];

// Adviser: automatically determine Session Type from the assessment instrument.
// Heuristic on the instrument's title/description until a dedicated field exists.
function deriveSessionType(form) {
  if (!form) return 'Intake / Baseline';
  const t = `${form.title || ''} ${form.description || ''}`.toLowerCase();
  if (/(incident|crisis|trauma|follow.?up|abuse)/.test(t)) return 'Incident Follow-up';
  if (/(check.?in|monitor|wellbeing|emotion|routine|weekly|monthly)/.test(t)) return 'Regular Check-in';
  return 'Intake / Baseline';
}

export default function Assessment() {
  const { refresh: refreshActivity } = useActivity();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [children, setChildren] = useState([]);
  const [forms, setForms] = useState([]); // active questionnaires
  const [child, setChild] = useState('');
  const [formId, setFormId] = useState('');
  const [stype, setStype] = useState('Intake / Baseline');
  const [answers, setAnswers] = useState({}); // { [questionId]: answerText }
  const [cls, setCls] = useState('Normal Development');
  const [notes, setNotes] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [kiosk, setKiosk] = useState(false);
  const [respondentMode, setRespondentMode] = useState('staff');
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [override, setOverride] = useState(false);

  useEffect(() => {
    api.get('/children/').then((r) => setChildren(r.data)).catch(() => {});
    api.get('/active-questionnaires/').then((r) => setForms(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== 4 || !form) return;
    setAnalysis(null); setAnalyzing(true); setOverride(false);
    api.post('/assessments/analyze/', {
      questionnaire: form.id,
      responses: questions.map((q) => ({ question: q.id, answer: String(answers[q.id]) })),
    }).then((r) => setAnalysis(r.data)).catch(() => {}).finally(() => setAnalyzing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const childObj = children.find((c) => String(c.id) === String(child));
  const form = forms.find((f) => String(f.id) === String(formId));
  const questions = form?.questions || [];
  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] != null && answers[q.id] !== '');

  const next = () => setStep((s) => Math.min(4, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    setError('');
    try {
      await api.post('/assessments/', {
        child: Number(child),
        questionnaire: form.id,
        assessment_type: stype,
        classification: cls,
        notes,
        respondent_mode: respondentMode,
        responses: questions.map((q) => ({ question: q.id, answer: String(answers[q.id]) })),
        override_acknowledged: override,
      });
      toast.success('Assessment signed & saved');
      setSent(true);
      refreshActivity();
      setTimeout(() => {
        setSent(false); setStep(1); setChild(''); setFormId(''); setAnswers({}); setNotes(''); setRespondentMode('staff'); setAnalysis(null);
      }, 2600);
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'override_required') {
        setError(`Confidence ${data.confidence}% is below the ${data.threshold}% threshold — tick the override box to proceed.`);
      } else {
        setError(typeof data === 'string' ? data : JSON.stringify(data || 'Submit failed'));
      }
      toast.error(data?.code === 'override_required' ? 'Low-confidence result needs override' : 'Could not save the assessment');
    }
  };

  const setAnswer = (qid, val) => setAnswers((a) => ({ ...a, [qid]: val }));

  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <Button variant="secondary" onClick={() => navigate('/report')} iconLeft={<Icon name="clipboard-check" size={17} />}>View Results</Button>
        </div>
        <Card padding="28px">
          <div style={{ marginBottom: 26 }}>
            <ProgressSteps steps={['Select Child', 'Instrument', 'Responses', 'Review & Sign']} current={step} />
          </div>

          {step === 1 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Select a child for assessment</h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 18 }}>Children with an active record appear here.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {children.length === 0 && <Alert tone="info" icon={<Icon name="info" size={18} />}>No child records available yet. Add children under Records first.</Alert>}
                {children.map((c) => (
                  <button key={c.id} onClick={() => setChild(String(c.id))} {...hoverLift()} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--radius-lg)', background: String(child) === String(c.id) ? 'var(--blue-50)' : 'var(--surface)', border: `1.5px solid ${String(child) === String(c.id) ? 'var(--blue-500)' : 'var(--border)'}`, transition: 'var(--transition-base)' }}>
                    <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--ink-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flex: 'none' }}><Icon name="user" size={19} /></span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5, color: 'var(--text-strong)' }}>{c.fullname}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}><span className="racco-mono">{caseRef(c.id)}</span>{c.case_type ? ` · ${c.case_type}` : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, marginBottom: 18 }}>Choose an assessment instrument</h2>
              {forms.length === 0
                ? <Alert tone="warning" icon={<Icon name="alert-triangle" size={18} />}>No published instruments yet. Create and publish one under <strong>Assessment Instruments</strong> first.</Alert>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <FormField label="Assessment Instrument">
                      <Select value={formId} onChange={(e) => { const f = forms.find((x) => String(x.id) === e.target.value); setFormId(e.target.value); setAnswers({}); setStype(deriveSessionType(f)); }}>
                        <option value="">— Select —</option>
                        {forms.map((f) => <option key={f.id} value={f.id}>{f.title}{f.age_group ? ` (${f.age_group})` : ''}</option>)}
                      </Select>
                    </FormField>
                    <FormField label="Session Type" hint="Determined automatically from the instrument.">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 13px', borderRadius: 'var(--radius-md)', background: 'var(--ink-50)', border: '1px solid var(--border)', color: 'var(--text-strong)', fontWeight: 700, fontSize: 14 }}>
                        <Icon name="sparkles" size={15} style={{ color: 'var(--blue-600)' }} />
                        {form ? stype : '—'}
                      </div>
                    </FormField>
                  </div>
                )}
              {form && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>{questions.length} question(s){form.description ? ` · ${form.description}` : ''}</div>}
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, marginBottom: 4 }}>{form?.title || 'Instrument'}</h2>
                  <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Answer each item based on the session, or hand the device to the child.</p>
                </div>
                <Button variant="secondary" onClick={() => setKiosk(true)} iconLeft={<Icon name="smile" size={17} />}>Hand to child</Button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ background: 'var(--ink-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 11 }}>{i + 1}. {q.question_text}</p>
                    <QuestionInput question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />} style={{ marginBottom: 14 }}>{error}</Alert>}

              {childObj && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>For <strong style={{ color: 'var(--text-strong)' }}>{childObj.fullname}</strong> · <span className="racco-mono">{caseRef(childObj.id)}</span> · {form?.title} · {stype}</p>}

              <AnalysisPanel analyzing={analyzing} analysis={analysis} />

              <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div className="racco-eyebrow" style={{ fontSize: 10, padding: '10px 14px', background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>Responses reviewed</div>
                <div style={{ padding: '4px 14px' }}>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: i < questions.length - 1 ? '1px solid var(--ink-100)' : 'none' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{i + 1}. {q.question_text}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{answers[q.id] || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {analysis?.flagged && (
                <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--red-50)', border: '1px solid var(--red-100)' }}>
                  <p style={{ fontSize: 12.5, color: 'var(--red-700)', margin: '0 0 8px', lineHeight: 1.5 }}>
                    This result is below the minimum confidence threshold ({analysis.min_confidence_threshold}%). Review it before signing.
                  </p>
                  <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-strong)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue-600)' }} />
                    <span>I have reviewed this low-confidence result and accept responsibility for the assessment.</span>
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <FormField label="Practitioner classification">
                  <Select value={cls} onChange={(e) => setCls(e.target.value)}>
                    {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </FormField>
                <FormField label="Detailed psychologist's assessment" required hint="Required before the assessment can be signed.">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Observations, behavioral patterns, recommended interventions…" style={{ width: '100%', resize: 'vertical', padding: '12px 13px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-strong)', outline: 'none', lineHeight: 1.55 }} />
                </FormField>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
            <Button variant="ghost" disabled={step === 1} onClick={back} iconLeft={<Icon name="arrow-left" size={17} />}>Back</Button>
            {step < 4
              ? <Button variant="primary" onClick={next} disabled={(step === 1 && !child) || (step === 2 && !formId) || (step === 3 && !allAnswered)} iconRight={<Icon name="arrow-right" size={17} />}>Next Step</Button>
              : <Button variant="primary" disabled={!notes.trim() || sent || (analysis?.flagged && !override)} onClick={submit} iconLeft={<Icon name="pen-line" size={17} />}>Sign &amp; Submit to NACC</Button>}
          </div>
        </Card>
      </div>
      {kiosk && (
        <RespondentSurvey
          questions={questions}
          childName={childObj?.fullname}
          initial={answers}
          onComplete={(a) => { setAnswers(a); setRespondentMode('child'); setKiosk(false); setStep(4); }}
          onExit={() => setKiosk(false)}
        />
      )}
    </div>
  );
}

function QuestionInput({ question, value, onChange }) {
  const type = question.question_type;
  const pill = (label, on) => ({
    padding: '8px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
    fontWeight: 700, fontSize: 13, border: `1.5px solid ${on ? 'var(--blue-600)' : 'var(--border-strong)'}`,
    background: on ? 'var(--blue-600)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-body)', transition: 'var(--transition-base)',
  });
  if (type === 'rating_scale') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(String(n))} {...hoverLift({ shadow: 'var(--shadow-md)' })} style={{ ...pill(String(n), value === String(n)), width: 40, height: 40, borderRadius: '50%', padding: 0 }}>{n}</button>
        ))}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginLeft: 6 }}><span>Never</span><span>Always</span></div>
      </div>
    );
  }
  const opts = type === 'yes_no' ? ['Yes', 'No'] : (question.options || []);
  if (opts.length === 0) {
    return <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Answer" style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: 14 }} />;
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {opts.map((o) => <button key={o} onClick={() => onChange(o)} {...hoverLift({ shadow: 'var(--shadow-md)' })} style={pill(o, value === o)}>{o}</button>)}
    </div>
  );
}

const TRIAGE_TONE = {
  'Normal': { bg: 'var(--success-50)', line: 'var(--success-100)', fg: 'var(--success-700)' },
  'Needs Monitoring': { bg: 'var(--warning-50)', line: 'var(--warning-100)', fg: 'var(--warning-700)' },
  'Needs Counseling Attention': { bg: 'var(--red-50)', line: 'var(--red-100)', fg: 'var(--red-700)' },
};

function AnalysisPanel({ analyzing, analysis }) {
  const tone = TRIAGE_TONE[analysis?.classification] || TRIAGE_TONE['Needs Monitoring'];
  return (
    <div style={{ background: analysis ? tone.bg : 'var(--ink-50)', border: `1px solid ${analysis ? tone.line : 'var(--border-strong)'}`, borderRadius: 'var(--radius-xl)', padding: 22, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name="sparkles" size={18} style={{ color: analysis ? tone.fg : 'var(--text-faint)' }} />
        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-strong)' }}>AI-generated assessment summary</span>
      </div>
      {analyzing && <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>Analyzing responses…</p>}
      {!analyzing && !analysis && <p style={{ fontSize: 13.5, color: 'var(--text-faint)', margin: 0 }}>Analysis unavailable — record your clinical judgment below.</p>}
      {!analyzing && analysis && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: tone.fg }}>{analysis.classification}</span>
            {analysis.behavioral_score != null && <span className="racco-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Score {analysis.behavioral_score} / 100</span>}
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>based on {analysis.scored_count} of {analysis.total_count} items</span>
            {analysis.confidence != null && (
              <span className="racco-mono" style={{ fontSize: 12.5, fontWeight: 700, color: analysis.flagged ? 'var(--red-700)' : 'var(--text-strong)' }}>
                Confidence {analysis.confidence}%
              </span>
            )}
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-body)', lineHeight: 1.6, margin: '0 0 8px' }}>{analysis.recommendation_text}</p>
          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: tone.fg }}>Priority: {analysis.priority_level}</span>
        </div>
      )}
    </div>
  );
}
