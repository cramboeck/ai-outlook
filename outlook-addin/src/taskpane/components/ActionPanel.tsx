// Action Panel - Shows extracted TODOs/actions from the current email

import { useState } from 'react';

interface EmailData {
  id: string;
  subject: string;
  sender: string;
  body: string;
}

interface ExtractedAction {
  description: string;
  priority: 'high' | 'medium' | 'low';
  type: string;
  deadline?: string;
}

const API_URL = 'http://localhost:7071/api';

const PRIORITY_COLORS: Record<string, string> = {
  high: '#dc2626',
  medium: '#ca8a04',
  low: '#16a34a',
};

const TYPE_ICONS: Record<string, string> = {
  response: '\uD83D\uDCAC',
  task: '\u2705',
  decision: '\uD83E\uDD14',
  meeting: '\uD83D\uDCC5',
  payment: '\uD83D\uDCB0',
};

export function ActionPanel({ email }: { email: EmailData }) {
  const [actions, setActions] = useState<ExtractedAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState(false);

  const extractActions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/extract-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: email.subject,
          body: email.body,
          sender: email.sender,
        }),
      });

      if (!response.ok) throw new Error('Extraktion fehlgeschlagen');
      const result = await response.json();
      setActions(result.actions || []);
      setExtracted(true);
    } catch {
      setActions([]);
      setExtracted(true);
    }
    setLoading(false);
  };

  if (!extracted && !loading) {
    return (
      <button
        onClick={extractActions}
        style={{
          width: '100%',
          padding: '12px',
          background: '#7c3aed',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Aktionen extrahieren
      </button>
    );
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Analysiere...</div>;
  }

  if (actions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
        Keine Aktionen in dieser E-Mail erkannt.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {actions.map((action, i) => (
        <div
          key={i}
          style={{
            padding: '12px',
            background: '#fafafa',
            borderRadius: '6px',
            border: '1px solid #e5e5e5',
            borderLeft: `3px solid ${PRIORITY_COLORS[action.priority] || '#ccc'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px' }}>{TYPE_ICONS[action.type] || '\uD83D\uDCDD'}</span>
            <span style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '8px',
              background: PRIORITY_COLORS[action.priority] + '15',
              color: PRIORITY_COLORS[action.priority],
              fontWeight: 600,
            }}>
              {action.priority === 'high' ? 'Hoch' : action.priority === 'medium' ? 'Mittel' : 'Niedrig'}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#333' }}>{action.description}</div>
          {action.deadline && (
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
              Frist: {action.deadline}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
