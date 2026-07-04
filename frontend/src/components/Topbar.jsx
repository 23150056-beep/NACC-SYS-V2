import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar, Icon, ROLE_META, hoverLift, hoverTint } from '../ui';
import { useActivity } from '../context/ActivityContext';

const SCREEN_TITLES = {
  '/': ['Dashboard', 'Regional overview of cases & activity'],
  '/children': ['Records', 'Child profiles, assigned psychologist & case status'],
  '/assessment': ['Assessment', 'Assessment instrument, AI analysis & clinical notes'],
  '/questionnaires': ['Assessment Instruments', 'Build & manage assessment instruments'],
  '/report': ['Assessment Results', 'Shared counseling outcomes for continuity of care'],
  '/users': ['User Management', 'Accounts & roles'],
  '/settings': ['System Settings', 'Agency configuration & AI engine'],
};

export const ACTION_META = {
  created: { icon: 'plus', color: 'var(--success-500)' },
  updated: { icon: 'pencil', color: 'var(--blue-500)' },
  archived: { icon: 'archive', color: 'var(--red-500)' },
  login: { icon: 'log-in', color: 'var(--amber-500)' },
};
const NOTIF_TABS = [
  { key: 'all', label: 'All' },
  { key: 'record', label: 'Records' },
  { key: 'user', label: 'Users' },
  { key: 'security', label: 'Security' },
];
export function eventText(e) {
  if (e.action === 'login') return 'Signed in';
  const verb = e.action === 'created' ? 'Added' : e.action === 'updated' ? 'Edited' : 'Archived';
  const type = (e.entity_type || '').toLowerCase();
  return `${verb} ${type}${e.entity_label ? ` ${e.entity_label}` : ''}`.trim();
}
export function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role_name || 'Staff';
  const name = user?.fullname || user?.username || 'User';
  const [title, sub] = SCREEN_TITLES[location.pathname] || ['', ''];

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const { events, unreadCount, markSeen } = useActivity();
  const [notifTab, setNotifTab] = useState('all');
  const unread = unreadCount;
  const shownEvents = events.filter((e) => notifTab === 'all' || e.category === notifTab);
  // Role-aware notification tabs: psychologists only see their own (All); staff see
  // the case stream (All/Records); admin sees every category.
  const notifTabs = role === 'Administrator' ? NOTIF_TABS
    : role === 'Staff' ? NOTIF_TABS.filter((t) => ['all', 'record'].includes(t.key))
    : NOTIF_TABS.filter((t) => t.key === 'all');

  const handleLogout = () => { logout(); navigate('/login'); };

  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setNotifOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [notifOpen]);

  return (
    <header style={{ height: 'var(--topbar-h)', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, padding: '0 26px', flex: 'none' }}>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setNotifOpen((o) => { const next = !o; if (next) markSeen(); return next; })} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={notifOpen} aria-haspopup="true"
            {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })}
            style={{ position: 'relative', background: notifOpen ? 'var(--blue-50)' : 'var(--ink-50)', border: `1px solid ${notifOpen ? 'var(--blue-200)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', width: 40, height: 40, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: notifOpen ? 'var(--blue-600)' : 'var(--text-body)', transition: 'var(--transition-base)' }}
          >
            <Icon name="bell" size={18} />
            {unread > 0 && <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: 'var(--red-500)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--surface)', fontFamily: 'var(--font-mono)' }}>{unread}</span>}
          </button>
          {notifOpen && (
            <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 340, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', zIndex: 80, overflow: 'hidden', animation: 'racco-pop-in var(--dur-base) var(--ease-out)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--text-strong)' }}>Notifications</span>
                <span className="racco-eyebrow" style={{ fontSize: 10 }}>{unread} new</span>
              </div>
              <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                {notifTabs.map((t) => {
                  const on = notifTab === t.key;
                  return (
                    <button key={t.key} onClick={() => setNotifTab(t.key)} style={{ flex: 1, padding: '5px 6px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11.5, background: on ? 'var(--blue-50)' : 'transparent', color: on ? 'var(--blue-700)' : 'var(--text-muted)', transition: 'var(--transition-base)' }}>{t.label}</button>
                  );
                })}
              </div>
              <div className="racco-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {shownEvents.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>No activity yet.</div>
                ) : shownEvents.map((n, i) => {
                  const meta = ACTION_META[n.action] || ACTION_META.created;
                  return (
                    <div
                      key={n.id ?? i} role="menuitem"
                      style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 11, padding: '12px 16px', borderBottom: i < shownEvents.length - 1 ? '1px solid var(--ink-100)' : 'none' }}
                    >
                      <span style={{ width: 26, height: 26, borderRadius: '50%', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink-50)', color: meta.color }}>
                        <Icon name={meta.icon} size={14} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--text-strong)', fontWeight: 600, lineHeight: 1.4 }}>{eventText(n)}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{n.actor_label} · {timeAgo(n.created_at)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => { setNotifOpen(false); navigate('/'); }} {...hoverTint('var(--blue-50)')} style={{ width: '100%', padding: '11px 16px', background: 'var(--ink-50)', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, color: 'var(--blue-600)', transition: 'background var(--dur-fast)' }}>View all activity</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 14, borderLeft: '1px solid var(--border)' }}>
          <Avatar name={name} tone={(ROLE_META[role] || ROLE_META.Staff).tone} size="sm" />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{role}</div>
          </div>
        </div>

        <button
          onClick={handleLogout} title="Log out" aria-label="Log out"
          {...hoverLift({ lift: -1, shadow: 'var(--shadow-md)' })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 13px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--ink-50)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, color: 'var(--text-body)', transition: 'var(--transition-base)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red-500)'; e.currentTarget.style.borderColor = 'var(--red-200)'; e.currentTarget.style.background = 'var(--red-50)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-body)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--ink-50)'; }}
        >
          <Icon name="log-out" size={16} /> Log Out
        </button>
      </div>
    </header>
  );
}
