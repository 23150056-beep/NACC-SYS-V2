import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Card, Button, Badge, Input, FormField, Switch, Icon, PAGE } from '../ui';
import { useToast } from '../context/ToastContext';

export default function Settings() {
  const toast = useToast();
  const [agency, setAgency] = useState('St. Joseph Orphanage');
  const [threshold, setThreshold] = useState(80);
  const [sync, setSync] = useState(true);
  const [override, setOverride] = useState(true);

  useEffect(() => {
    api.get('/analysis-settings/')
      .then((r) => { setThreshold(r.data.min_confidence_threshold); setOverride(r.data.require_override_on_low_confidence); })
      .catch(() => {});
  }, []);

  const saveConfig = async () => {
    try {
      await api.put('/analysis-settings/', {
        min_confidence_threshold: threshold,
        require_override_on_low_confidence: override,
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.status === 403
        ? 'Only an Administrator can change these settings.'
        : 'Could not save settings. Please try again.');
    }
  };

  return (
    <div style={{ ...PAGE, maxWidth: 760 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Card eyebrow="Agency" title="Configuration" padding="22px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormField label="RCPC"><Input value={agency} onChange={(e) => setAgency(e.target.value)} /></FormField>
            <FormField label="NACC API Endpoint" hint="Managed by the national office.">
              <Input value="https://api.nacc.gov.ph/v1/sync" disabled trailing={<Badge tone="success" size="sm">PROD</Badge>} />
            </FormField>
            <Switch checked={sync} onChange={setSync} label="Auto-sync signed reports to NACC" />
          </div>
        </Card>

        <Card eyebrow="AI Engine" title="Assessment Support" padding="22px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>Minimum confidence threshold</span>
                <span className="racco-mono" style={{ fontWeight: 600, color: 'var(--blue-600)' }}>{threshold}%</span>
              </div>
              <input type="range" min="50" max="99" value={threshold} onChange={(e) => setThreshold(+e.target.value)} style={{ width: '100%', accentColor: 'var(--blue-600)' }} />
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8, background: 'var(--ink-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '9px 12px', lineHeight: 1.5 }}>
                Results below <strong>{threshold}%</strong> confidence are flagged for mandatory practitioner override before saving.
              </p>
            </div>
            <Switch checked={override} onChange={setOverride} label="Require manual override on low-confidence results" />
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={saveConfig} iconLeft={<Icon name="save" size={17} />}>Save Configuration</Button>
        </div>
      </div>
    </div>
  );
}
