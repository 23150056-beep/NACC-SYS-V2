import React, { useState } from 'react';
import { Button, Icon, hoverLift } from '../ui';

const FACES = ['😞', '😕', '😐', '🙂', '😄'];

export default function RespondentSurvey({ questions, childName = '', initial = {}, onComplete, onExit }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState(initial || {});

  const total = questions.length;
  const done = idx >= total;
  const q = questions[idx];
  const firstName = (childName || '').split(' ')[0];

  const choose = (val) => {
    setAnswers((a) => ({ ...a, [q.id]: val }));
    setTimeout(() => setIdx((i) => i + 1), 220);
  };
  const back = () => setIdx((i) => Math.max(0, i - 1));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'linear-gradient(160deg, var(--blue-50), var(--surface))', display: 'flex', flexDirection: 'column', animation: 'racco-fade-in var(--dur-base) var(--ease-out)' }}>
      <button onClick={onExit} title="Exit" aria-label="Exit survey" style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Icon name="x" size={16} /> Exit
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', maxWidth: 720, margin: '0 auto', width: '100%' }}>
        {done ? (
          <div style={{ animation: 'racco-pop-in var(--dur-base) var(--ease-out)' }}>
            <div style={{ fontSize: 64 }}>🎉</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color: 'var(--blue-700)', margin: '10px 0' }}>All done!</h1>
            <p style={{ fontSize: 17, color: 'var(--text-muted)', marginBottom: 26 }}>Thank you{firstName ? `, ${firstName}` : ''}! You answered every question. 🌟</p>
            <Button variant="primary" onClick={() => onComplete(answers)} iconRight={<Icon name="arrow-right" size={18} />}>Finish</Button>
          </div>
        ) : (
          <>
            {idx === 0 && <p style={{ fontSize: 18, color: 'var(--text-muted)', marginBottom: 8 }}>Hi {firstName || 'there'}! 👋 Let's answer some questions together.</p>}
            <div style={{ display: 'flex', gap: 7, marginBottom: 22 }}>
              {questions.map((_, i) => (
                <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < idx ? 'var(--success-500)' : i === idx ? 'var(--blue-600)' : 'var(--ink-200)', transition: 'var(--transition-base)' }} />
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-faint)', marginBottom: 10 }}>Question {idx + 1} of {total}</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.3, marginBottom: 30, maxWidth: 620 }}>{q.question_text}</h1>
            <Choices question={q} value={answers[q.id]} onChoose={choose} />
            {idx > 0 && <button onClick={back} style={{ marginTop: 28, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="arrow-left" size={16} /> Back</button>}
          </>
        )}
      </div>
    </div>
  );
}

function Choices({ question, value, onChoose }) {
  const type = question.question_type;
  const big = (on) => ({ cursor: 'pointer', borderRadius: 'var(--radius-xl)', border: `2.5px solid ${on ? 'var(--blue-600)' : 'var(--border-strong)'}`, background: on ? 'var(--blue-50)' : 'var(--surface)', transition: 'var(--transition-base)', boxShadow: on ? 'var(--shadow-brand)' : 'var(--shadow-xs)' });

  if (type === 'rating_scale') {
    return (
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        {FACES.map((face, i) => {
          const n = String(i + 1); const on = value === n;
          return (
            <button key={n} onClick={() => onChoose(n)} {...hoverLift()} style={{ ...big(on), width: 92, height: 104, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 40, transform: on ? 'scale(1.12)' : 'none', transition: 'var(--transition-base)' }}>{face}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: on ? 'var(--blue-700)' : 'var(--text-faint)' }}>{n}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const opts = type === 'yes_no' ? [['👍', 'Yes'], ['👎', 'No']] : (question.options || []).map((o) => [null, o]);
  if (opts.length === 0) {
    return <TextChoice value={value} onChoose={onChoose} />;
  }
  const wide = type === 'yes_no';
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 560 }}>
      {opts.map(([emoji, label]) => {
        const on = value === label;
        return (
          <button key={label} onClick={() => onChoose(label)} {...hoverLift()} style={{ ...big(on), padding: wide ? '20px 36px' : '16px 24px', minWidth: wide ? 150 : 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 19, color: on ? 'var(--blue-700)' : 'var(--text-strong)' }}>
            {emoji && <span style={{ fontSize: 30 }}>{emoji}</span>}{label}
          </button>
        );
      })}
    </div>
  );
}

function TextChoice({ value, onChoose }) {
  const [txt, setTxt] = useState(value || '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Type your answer" style={{ width: '100%', maxWidth: 460, padding: '14px 16px', borderRadius: 'var(--radius-lg)', border: '2px solid var(--border-strong)', fontSize: 18, textAlign: 'center' }} />
      <Button variant="primary" onClick={() => onChoose(txt)} disabled={!txt.trim()} iconRight={<Icon name="arrow-right" size={16} />}>Next</Button>
    </div>
  );
}
