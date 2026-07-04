import React, { useState } from 'react';
import { Card, Button, Badge, Input, FormField, Switch, Icon, PAGE } from '../ui';
import { useToast } from '../context/ToastContext';

export default function Settings() {
  const toast = useToast();
  const [agency, setAgency] = useState('St. Joseph Orphanage');
  const [sync, setSync] = useState(true);

  const saveConfig = () => {
    // Agency fields are display-only for now; server-backed settings
    // (AI feature flags, Ollama endpoint) arrive with the AI layer.
    toast.success('Settings saved');
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

        <Card eyebrow="AI Assistance" title="Local AI Layer" padding="22px">
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            AI-assisted summaries and document intelligence run on a local model and are
            configured here once the AI layer is enabled. Every AI feature is optional —
            the system is fully functional with AI switched off.
          </p>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={saveConfig} iconLeft={<Icon name="save" size={17} />}>Save Configuration</Button>
        </div>
      </div>
    </div>
  );
}
