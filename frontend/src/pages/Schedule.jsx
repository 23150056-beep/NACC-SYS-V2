import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card, Button, Badge, Input, Select, FormField, Alert, Icon, iconBtn, PAGE } from '../ui';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } });
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PURPOSES = [
  { v: 'pre_assessment', label: 'Pre-Assessment' },
  { v: 'session', label: 'Session' },
  { v: 'follow_up', label: 'Follow-up' },
];
const STATUS_TONE = { scheduled: 'brand', completed: 'success', no_show: 'amber', cancelled: 'neutral' };
const STATUS_COLOR = { scheduled: 'var(--blue-600)', completed: 'var(--success-600)', no_show: 'var(--amber-500)', cancelled: 'var(--text-faint)' };

export default function Schedule() {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.role_name || 'Staff';
  const isPsych = role === 'Psychologist';
  const canBook = ['Administrator', 'Staff', 'Psychologist'].includes(role);
  const [appointments, setAppointments] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [children, setChildren] = useState([]);
  const [psychologists, setPsychologists] = useState([]);
  const [booking, setBooking] = useState(null);
  const [blockForm, setBlockForm] = useState(null);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/appointments/').then((r) => setAppointments(r.data)).catch(() => {});
    api.get('/availability/').then((r) => setBlocks(r.data)).catch(() => {});
    api.get('/children/').then((r) => setChildren(r.data.filter((c) => c.status === 'active'))).catch(() => {});
    if (!isPsych) api.get('/psychologists/').then((r) => setPsychologists(r.data)).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const events = useMemo(() => appointments.map((a) => {
    const start = new Date(a.start);
    return {
      id: a.id,
      title: `${a.child_name} · ${PURPOSES.find((p) => p.v === a.purpose)?.label || a.purpose}`,
      start,
      end: new Date(start.getTime() + (a.duration_minutes || 60) * 60000),
      resource: a,
    };
  }), [appointments]);

  const eventStyleGetter = useCallback((event) => ({
    style: {
      backgroundColor: STATUS_COLOR[event.resource.status] || 'var(--blue-600)',
      borderRadius: 6, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600,
      opacity: event.resource.status === 'cancelled' ? 0.55 : 1,
      textDecoration: event.resource.status === 'cancelled' ? 'line-through' : 'none',
    },
  }), []);

  const myBlocks = isPsych ? blocks.filter((b) => String(b.psychologist) === String(user?.id)) : blocks;

  const book = async (e) => {
    e.preventDefault();
    setError('');
    const startIso = `${booking.date}T${booking.time}:00`;
    try {
      await api.post('/appointments/', {
        child: booking.child, psychologist: booking.psychologist || undefined,
        start: startIso, duration_minutes: booking.duration || 60,
        purpose: booking.purpose, notes: booking.notes || '',
      });
      toast.success('Appointment booked');
      setBooking(null); load();
    } catch (err) {
      const d = err.response?.data;
      setError(d?.start || d?.psychologist || d?.child || JSON.stringify(d || 'Booking failed'));
    }
  };

  const saveBlock = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        weekday: blockForm.mode === 'weekly' ? Number(blockForm.weekday) : null,
        date: blockForm.mode === 'date' ? blockForm.date : null,
        start_time: blockForm.start_time, end_time: blockForm.end_time,
        capacity: Number(blockForm.capacity) || 1,
      };
      if (!isPsych) payload.psychologist = blockForm.psychologist;
      await api.post('/availability/', payload);
      toast.success('Availability added');
      setBlockForm(null); load();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Could not save availability.'));
    }
  };

  const removeBlock = async (b) => {
    if (!window.confirm('Remove this availability block?')) return;
    try { await api.delete(`/availability/${b.id}/`); load(); }
    catch { toast.error('Could not remove the block.'); }
  };

  const setStatus = async (a, actionName) => {
    try {
      await api.post(`/appointments/${a.id}/${actionName}/`);
      toast.success(`Appointment ${actionName === 'no_show' ? 'marked no-show' : actionName + 'd'}`);
      setSel(null); load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Could not update.'); }
  };

  return (
    <div style={{ ...PAGE, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_TONE).map(([k, tone]) => (
            <Badge key={k} tone={tone} size="sm" dot>{k.replace('_', '-')}</Badge>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isPsych && <Button variant="secondary" onClick={() => { setError(''); setBlockForm({ mode: 'weekly', weekday: 0, date: '', start_time: '09:00', end_time: '12:00', capacity: 2 }); }} iconLeft={<Icon name="clock" size={16} />}>Add Availability</Button>}
          {canBook && <Button variant="primary" onClick={() => { setError(''); setBooking({ child: '', psychologist: isPsych ? '' : '', date: '', time: '09:00', purpose: 'session', duration: 60, notes: '' }); }} iconLeft={<Icon name="plus" size={16} />}>Book Appointment</Button>}
        </div>
      </div>

      <Card padding="14px" style={{ marginBottom: 18 }}>
        <div style={{ height: 560 }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            views={['month', 'week', 'day']}
            defaultView="month"
            popup
            eventPropGetter={eventStyleGetter}
            onSelectEvent={(ev) => setSel(ev.resource)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}
          />
        </div>
      </Card>

      <Card eyebrow={isPsych ? 'Your availability' : 'Psychologist availability'} title="Availability blocks" padding="20px">
        {myBlocks.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {isPsych ? 'No availability yet — add the times you accept bookings.' : 'No availability blocks defined yet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myBlocks.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--ink-50)', border: '1px solid var(--border)' }}>
                <Icon name="clock" size={16} style={{ color: 'var(--blue-600)' }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>
                    {b.date || WEEKDAYS[b.weekday]}s · {String(b.start_time).slice(0, 5)}–{String(b.end_time).slice(0, 5)}
                  </span>
                  {!isPsych && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}> — {b.psychologist_name}</span>}
                </div>
                <Badge tone="neutral" size="sm">{b.capacity} slot{b.capacity === 1 ? '' : 's'}</Badge>
                {(isPsych || role === 'Administrator') && (
                  <button title="Remove" onClick={() => removeBlock(b)} style={iconBtn('var(--red-500)')}><Icon name="trash-2" size={14} /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Booking drawer */}
      {booking && (
        <div onClick={() => setBooking(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 70 }}>
          <form onSubmit={book} onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '92%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', background: 'var(--ink-50)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>Book Appointment</div>
            <div className="racco-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{String(error)}</Alert>}
              <FormField label="Child" required>
                <Select value={booking.child} onChange={(e) => setBooking({ ...booking, child: e.target.value })}>
                  <option value="">— Select child —</option>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.fullname}</option>)}
                </Select>
              </FormField>
              {!isPsych && (
                <FormField label="Psychologist" required hint="Bookings must fall inside their availability.">
                  <Select value={booking.psychologist} onChange={(e) => setBooking({ ...booking, psychologist: e.target.value })}>
                    <option value="">— Select psychologist —</option>
                    {psychologists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </FormField>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="Date" required>
                  <Input type="date" value={booking.date} onChange={(e) => setBooking({ ...booking, date: e.target.value })} />
                </FormField>
                <FormField label="Time" required>
                  <Input type="time" value={booking.time} onChange={(e) => setBooking({ ...booking, time: e.target.value })} />
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="Purpose">
                  <Select value={booking.purpose} onChange={(e) => setBooking({ ...booking, purpose: e.target.value })}>
                    {PURPOSES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Duration (min)">
                  <Input type="number" min="15" step="15" value={booking.duration} onChange={(e) => setBooking({ ...booking, duration: e.target.value })} />
                </FormField>
              </div>
              <FormField label="Notes">
                <Input value={booking.notes} onChange={(e) => setBooking({ ...booking, notes: e.target.value })} />
              </FormField>
            </div>
            <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <Button type="submit" variant="primary" fullWidth disabled={!booking.child || !booking.date || (!isPsych && !booking.psychologist)} iconLeft={<Icon name="calendar" size={16} />}>Book</Button>
            </div>
          </form>
        </div>
      )}

      {/* Availability drawer */}
      {blockForm && (
        <div onClick={() => setBlockForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.32)', display: 'flex', justifyContent: 'flex-end', zIndex: 70 }}>
          <form onSubmit={saveBlock} onClick={(e) => e.stopPropagation()} style={{ width: 400, maxWidth: '92%', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', background: 'var(--ink-50)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>Add Availability</div>
            <div className="racco-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <Alert tone="danger" icon={<Icon name="alert-triangle" size={18} />}>{String(error)}</Alert>}
              <FormField label="Repeat">
                <Select value={blockForm.mode} onChange={(e) => setBlockForm({ ...blockForm, mode: e.target.value })}>
                  <option value="weekly">Every week</option>
                  <option value="date">Single date</option>
                </Select>
              </FormField>
              {blockForm.mode === 'weekly' ? (
                <FormField label="Weekday">
                  <Select value={blockForm.weekday} onChange={(e) => setBlockForm({ ...blockForm, weekday: e.target.value })}>
                    {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </Select>
                </FormField>
              ) : (
                <FormField label="Date">
                  <Input type="date" value={blockForm.date} onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })} />
                </FormField>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="From"><Input type="time" value={blockForm.start_time} onChange={(e) => setBlockForm({ ...blockForm, start_time: e.target.value })} /></FormField>
                <FormField label="To"><Input type="time" value={blockForm.end_time} onChange={(e) => setBlockForm({ ...blockForm, end_time: e.target.value })} /></FormField>
              </div>
              <FormField label="Capacity" hint="How many appointments fit in this block per day.">
                <Input type="number" min="1" value={blockForm.capacity} onChange={(e) => setBlockForm({ ...blockForm, capacity: e.target.value })} />
              </FormField>
            </div>
            <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <Button type="submit" variant="primary" fullWidth iconLeft={<Icon name="save" size={16} />}>Save Availability</Button>
            </div>
          </form>
        </div>
      )}

      {/* Appointment detail */}
      {sel && (
        <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,19,29,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '92%', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>{sel.child_name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{new Date(sel.start).toLocaleString()} · {sel.duration_minutes} min</div>
              </div>
              <Badge tone={STATUS_TONE[sel.status]} dot>{sel.status.replace('_', '-')}</Badge>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-body)' }}>
              {PURPOSES.find((p) => p.v === sel.purpose)?.label || sel.purpose} with {sel.psychologist_name || '—'}
              {sel.notes ? ` · ${sel.notes}` : ''}
            </div>
            {sel.status === 'scheduled' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(isPsych || role === 'Administrator') && <Button variant="primary" onClick={() => setStatus(sel, 'complete')} iconLeft={<Icon name="check" size={15} />}>Completed</Button>}
                {(isPsych || role === 'Administrator') && <Button variant="secondary" onClick={() => setStatus(sel, 'no_show')} iconLeft={<Icon name="alert-triangle" size={15} />}>No-show</Button>}
                <Button variant="danger" onClick={() => setStatus(sel, 'cancel')} iconLeft={<Icon name="x" size={15} />}>Cancel</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
