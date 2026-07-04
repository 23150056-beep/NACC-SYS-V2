import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, FormField, Input, Alert, Icon } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 'login' = sign-in form, 'forgot' = request reset, 'reset' = set new password
  const [view, setView] = useState('login');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u?.first_name || u?.fullname || 'there'}`);
      navigate('/');
    } catch (err) {
      setError('Invalid username or password.');
      toast.error('Sign-in failed. Check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  // Forgot Password: in production this triggers a NACC-issued reset email/SMS.
  const requestReset = (e) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Enter your username (email) first.'); return; }
    toast.success('A reset link has been sent to your registered email. Set a new password below.');
    setView('reset');
  };

  // Reset Password: after resetting, the user logs in with the NEW password.
  const submitReset = (e) => {
    e.preventDefault();
    setError('');
    if (newPass.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPass !== confirmPass) { setError('Passwords do not match.'); return; }
    toast.success('Password reset. Please log in with your new password.');
    setPassword('');
    setNewPass(''); setConfirmPass('');
    setView('login');
  };

  return (
    <div className="racco-sky-wash" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
      <div style={{ width: 880, maxWidth: '100%', display: 'grid', gridTemplateColumns: '1.05fr 1fr', background: 'var(--surface)', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
        {/* Brand panel */}
        <div style={{ background: 'linear-gradient(155deg, var(--blue-700), var(--blue-600) 60%, var(--blue-800))', color: '#fff', padding: '40px 38px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden', minHeight: 480 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 100% 0%, rgba(255,172,42,0.22), transparent 55%)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/racco-seal.jpg" alt="NACC seal" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', boxShadow: 'var(--shadow-md)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.1 }}>National Authority for Child Care</div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600, letterSpacing: '0.02em' }}>NACC – Regional Alternative Childcare Office 1</div>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, lineHeight: 1.1 }}>
              In The Best Interests<br />of the Child
            </div>
            <p style={{ marginTop: 12, fontSize: 14, opacity: 0.85, lineHeight: 1.6, maxWidth: 320 }}>
              Behavioral Assessment &amp; Counseling Support System
            </p>
          </div>
        </div>

        {/* Form panel */}
        <div style={{ padding: '40px 38px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>
            {view === 'login' ? 'Log in to your account' : view === 'forgot' ? 'Forgot your password?' : 'Set a new password'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {view === 'login' ? 'Enter your agency credentials to continue.'
              : view === 'forgot' ? 'Enter your username and we will send a reset link.'
              : 'Choose a new password, then log in with it.'}
          </p>

          {view === 'login' && (
            <form onSubmit={submit} style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{error}</Alert>}
              <FormField label="Username">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@racco1.gov.ph" leading={<Icon name="user" size={16} />} required autoFocus />
              </FormField>
              <FormField label="Password">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" leading={<Icon name="lock" size={16} />} required />
              </FormField>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6 }}>
                <button type="button" onClick={() => { setError(''); setView('forgot'); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, color: 'var(--blue-600)' }}>Forgot password?</button>
              </div>
              <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy} iconRight={busy ? null : <Icon name="arrow-right" size={18} />}>
                {busy ? 'Logging in…' : 'Log In'}
              </Button>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={requestReset} style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{error}</Alert>}
              <FormField label="Username">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@racco1.gov.ph" leading={<Icon name="user" size={16} />} required autoFocus />
              </FormField>
              <Button type="submit" variant="primary" size="lg" fullWidth iconRight={<Icon name="mail" size={18} />}>Send Reset Link</Button>
              <button type="button" onClick={() => { setError(''); setView('login'); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, color: 'var(--text-muted)' }}>← Back to log in</button>
            </form>
          )}

          {view === 'reset' && (
            <form onSubmit={submitReset} style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{error}</Alert>}
              <FormField label="New Password">
                <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="••••••••" leading={<Icon name="lock" size={16} />} required autoFocus />
              </FormField>
              <FormField label="Confirm New Password">
                <Input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="••••••••" leading={<Icon name="lock-keyhole" size={16} />} required />
              </FormField>
              <Button type="submit" variant="primary" size="lg" fullWidth iconRight={<Icon name="check" size={18} />}>Reset Password</Button>
              <button type="button" onClick={() => { setError(''); setView('login'); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, color: 'var(--text-muted)' }}>← Back to log in</button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
