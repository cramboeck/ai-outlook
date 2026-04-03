// Quick Classify - Categorize the current email with one click

import { useState } from 'react';

interface EmailData {
  id: string;
  subject: string;
  sender: string;
  body: string;
  hasAttachments: boolean;
}

interface Classification {
  category: string;
  confidence: number;
  reasoning: string;
  urgency?: string;
}

const API_URL = 'http://localhost:7071/api';

export function QuickClassify({ email }: { email: EmailData }) {
  const [classification, setClassification] = useState<Classification | null>(null);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classify = async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Use Office SSO token exchange instead of direct call
      const response = await fetch(`${API_URL}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: email.subject,
          body: email.body,
          sender: email.sender,
        }),
      });

      if (!response.ok) throw new Error('Klassifizierung fehlgeschlagen');
      const result = await response.json();
      setClassification(result);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const applyCategory = async () => {
    if (!classification) return;
    // TODO: Apply category via Graph API using Office context
    setApplied(true);
  };

  const urgencyColors: Record<string, string> = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#16a34a',
  };

  return (
    <div>
      {!classification && !loading && (
        <button
          onClick={classify}
          style={{
            width: '100%',
            padding: '12px',
            background: '#0078d4',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          E-Mail kategorisieren
        </button>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
          Analysiere E-Mail...
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: '#ffeef0', color: '#d32f2f', borderRadius: '4px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {classification && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Category */}
          <div style={{ padding: '16px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Kategorie</div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{classification.category}</div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <span style={{ fontSize: '12px', color: '#666' }}>
                Konfidenz: <strong>{(classification.confidence * 100).toFixed(0)}%</strong>
              </span>
              {classification.urgency && (
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: urgencyColors[classification.urgency] + '20',
                  color: urgencyColors[classification.urgency],
                  fontWeight: 600,
                }}>
                  {classification.urgency === 'critical' ? 'Kritisch' :
                   classification.urgency === 'high' ? 'Hoch' :
                   classification.urgency === 'medium' ? 'Mittel' : 'Niedrig'}
                </span>
              )}
            </div>
          </div>

          {/* Reasoning */}
          <div style={{ fontSize: '13px', color: '#555', padding: '0 4px' }}>
            {classification.reasoning}
          </div>

          {/* Apply Button */}
          {!applied ? (
            <button
              onClick={applyCategory}
              style={{
                width: '100%',
                padding: '10px',
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Kategorie anwenden
            </button>
          ) : (
            <div style={{ textAlign: 'center', padding: '10px', color: '#16a34a', fontWeight: 600, fontSize: '13px' }}>
              Kategorie angewendet
            </div>
          )}

          {/* Re-classify */}
          <button
            onClick={() => { setClassification(null); setApplied(false); }}
            style={{
              width: '100%',
              padding: '8px',
              background: 'transparent',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Erneut klassifizieren
          </button>
        </div>
      )}
    </div>
  );
}
