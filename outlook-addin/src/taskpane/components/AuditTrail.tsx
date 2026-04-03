// Audit Trail - Mini timeline showing processing history for the current email

import { useState, useEffect } from 'react';
import { apiCall } from '../../services/officeAuth';

interface LogEntry {
  id: string;
  event_type: string;
  source: string;
  category?: string;
  confidence?: number;
  rule_name?: string;
  created_at: string;
}

const EVENT_ICONS: Record<string, string> = {
  classification: '\uD83C\uDFF7\uFE0F',
  rule_match: '\u2699\uFE0F',
  action_extracted: '\u2705',
  user_override: '\u270D\uFE0F',
  email_moved: '\uD83D\uDCC1',
  document_forwarded: '\uD83D\uDCE4',
  error: '\u274C',
};

const EVENT_LABELS: Record<string, string> = {
  classification: 'Klassifiziert',
  rule_match: 'Regel-Match',
  action_extracted: 'Aktion erkannt',
  user_override: 'Manuell geaendert',
  email_moved: 'Verschoben',
  document_forwarded: 'Weitergeleitet',
  error: 'Fehler',
};

export function AuditTrail({ emailId }: { emailId: string }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuditTrail();
  }, [emailId]);

  const loadAuditTrail = async () => {
    setLoading(true);
    try {
      const data = await apiCall<{ timeline: LogEntry[] }>(`/audit/email/${encodeURIComponent(emailId)}`);
      setEntries(data.timeline || []);
    } catch {
      // Silently fail - audit trail is informational
    }
    setLoading(false);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Laden...</div>;
  }

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
        Noch keine Verarbeitungshistorie fuer diese E-Mail.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '20px' }}>
      {/* Timeline line */}
      <div style={{
        position: 'absolute',
        left: '8px',
        top: '4px',
        bottom: '4px',
        width: '2px',
        background: '#e5e5e5',
      }} />

      {entries.map((entry, i) => (
        <div key={entry.id} style={{
          position: 'relative',
          paddingBottom: i < entries.length - 1 ? '16px' : '0',
        }}>
          {/* Timeline dot */}
          <div style={{
            position: 'absolute',
            left: '-16px',
            top: '2px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: '#fff',
            border: '2px solid #0078d4',
            fontSize: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }} />

          <div style={{ fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{EVENT_ICONS[entry.event_type] || '\uD83D\uDD35'}</span>
              <span style={{ fontWeight: 600, color: '#333' }}>
                {EVENT_LABELS[entry.event_type] || entry.event_type}
              </span>
              <span style={{ color: '#999', fontSize: '11px' }}>
                {formatTime(entry.created_at)}
              </span>
            </div>
            <div style={{ color: '#666', marginTop: '2px', paddingLeft: '22px' }}>
              {entry.category && <span>Kategorie: {entry.category}</span>}
              {entry.confidence != null && <span> ({(entry.confidence * 100).toFixed(0)}%)</span>}
              {entry.rule_name && <span>Regel: {entry.rule_name}</span>}
              <span style={{
                marginLeft: '6px',
                fontSize: '10px',
                padding: '1px 4px',
                borderRadius: '4px',
                background: entry.source === 'ai' ? '#dbeafe' : entry.source === 'rule' ? '#dcfce7' : '#f3f4f6',
                color: entry.source === 'ai' ? '#1d4ed8' : entry.source === 'rule' ? '#166534' : '#666',
              }}>
                {entry.source === 'ai' ? 'KI' : entry.source === 'rule' ? 'Regel' : entry.source}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
