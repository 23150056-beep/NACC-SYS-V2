import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { useActivity } from '../context/ActivityContext';
import { Card, Button, Alert, Input, Select, FormField, Avatar, RoleBadge, EmptyState, Icon, iconBtn, hoverLift, PAGE } from '../ui';
import { useToast } from '../context/ToastContext';

const EMPTY = { email: '', first_name: '', last_name: '', middle_initial: '', contact_details: '', role: '', password: '' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const { refresh: refreshActivity } = useActivity();
  const toast = useToast();

  const load = () => api.get('/users/').then((r) => setUsers(r.data));
  useEffect(() => {
    load();
    api.get('/roles/').then((r) => setRoles(r.data));
  }, []);

  const openCreate = () => { setError(''); setForm({ ...EMPTY }); };
  const openEdit = (u) => { setError(''); setForm({ ...EMPTY, ...u, password: '' }); };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form };
      delete payload.role_name; delete payload.fullname;
      if (!payload.password) delete payload.password;
      if (form.id) await api.put(`/users/${form.id}/`, payload);
      else await api.post('/users/', payload);
      toast.success(form.id ? 'User updated' : 'User added');
      setForm(null);
      load();
      refreshActivity();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Save failed'));
      toast.error('Could not save the user. Please try again.');
    }
  };

  const archive = async (u) => {
    if (!window.confirm(`Deactivate ${u.fullname || u.email}?`)) return;
    try {
      await api.post(`/users/${u.id}/archive/`);
      toast.success(`${u.fullname || u.email} deactivated`);
      load();
      refreshActivity();
    } catch (err) {
      toast.error('Could not deactivate the user.');
    }
  };

  const toneFor = (role) => (role === 'Administrator' ? 'brand' : role === 'Psychologist' ? 'red' : 'amber');

  return (
    <div style={{ ...PAGE, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button variant="primary" onClick={openCreate} iconLeft={<Icon name="user-plus" size={17} />}>Add User</Button>
      </div>

      <Card padding="0">
        {users.length === 0 ? (
          <EmptyState icon={<Icon name="users" size={24} />} title="No users yet" description="Add agency accounts to get started." />
        ) : (
          <div className="racco-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Email', 'Contact', 'Role', 'Actions'].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--ink-100)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <Avatar name={u.fullname || u.username || u.email} tone={toneFor(u.role_name)} size="sm" />
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{u.fullname || u.username}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-body)' }} className="racco-mono">{u.email}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }} className="racco-mono">{u.contact_details || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>{u.role_name ? <RoleBadge role={u.role_name} /> : '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button title="Edit user" aria-label={`Edit ${u.fullname || u.email}`} onClick={() => openEdit(u)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--blue-600)')}><Icon name="pencil" size={15} /></button>
                        <button title="Deactivate user" aria-label={`Deactivate ${u.fullname || u.email}`} onClick={() => archive(u)} {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--red-500)')}><Icon name="user-x" size={15} /></button>
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
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '92%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'racco-slide-left var(--dur-slow) var(--ease-out)' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--ink-50)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>{form.id ? 'Edit User' : 'Add User'}</div>
              <button type="button" onClick={() => setForm(null)} aria-label="Close" {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })} style={iconBtn('var(--text-muted)')}><Icon name="x" size={17} /></button>
            </div>
            <div className="racco-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{error}</Alert>}
              {[['first_name', 'First Name'], ['middle_initial', 'Middle Initial'], ['last_name', 'Last Name'], ['email', 'Email'], ['contact_details', 'Contact Details']].map(([k, label]) => (
                <FormField key={k} label={label}>
                  <Input value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} type={k === 'email' ? 'email' : 'text'} />
                </FormField>
              ))}
              {/* A role cannot be changed once assigned (adviser). */}
              {form.id && form.role ? (
                <FormField label="Role" hint="A role cannot be changed once it has been assigned.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 13px', borderRadius: 'var(--radius-md)', background: 'var(--ink-50)', border: '1px solid var(--border)', color: 'var(--text-strong)', fontWeight: 700, fontSize: 14 }}>
                    {form.role_name || roles.find((r) => String(r.id) === String(form.role))?.role_name || '—'}
                    <Icon name="lock" size={13} style={{ color: 'var(--text-faint)', marginLeft: 'auto' }} />
                  </div>
                </FormField>
              ) : (
                <FormField label="Role">
                  <Select value={form.role || ''} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="">— Select role —</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.role_name}</option>)}
                  </Select>
                </FormField>
              )}
              <FormField label={form.id ? 'Password (leave blank to keep)' : 'Password'}>
                <Input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </FormField>
            </div>
            <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <Button type="submit" variant="primary" fullWidth iconLeft={<Icon name="save" size={16} />}>Save User</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
