// Document Panel - Detect invoices/orders and show DMS forward buttons

import { useState } from 'react';

interface EmailData {
  id: string;
  subject: string;
  sender: string;
  body: string;
  hasAttachments: boolean;
}

interface DocumentInfo {
  type: 'invoice' | 'order' | 'contract' | 'receipt';
  confidence: number;
  extractedData: {
    vendor?: string;
    amount?: number;
    currency?: string;
    invoiceNumber?: string;
    orderNumber?: string;
    dueDate?: string;
  };
  suggestedActions: string[];
}

const API_URL = 'http://localhost:7071/api';

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Rechnung',
  order: 'Bestellung',
  contract: 'Vertrag',
  receipt: 'Beleg',
};

const DOC_TYPE_ICONS: Record<string, string> = {
  invoice: '\uD83D\uDCCB',
  order: '\uD83D\uDCE6',
  contract: '\uD83D\uDCDD',
  receipt: '\uD83E\uDDFE',
};

const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  forward_sharepoint: { label: 'An SharePoint', icon: '\uD83D\uDCC1', color: '#0078d4' },
  forward_sevdesk: { label: 'An sevDesk', icon: '\uD83D\uDCCA', color: '#00a651' },
  forward_datev: { label: 'An DATEV', icon: '\uD83C\uDFE2', color: '#003d7d' },
  archive: { label: 'Archivieren', icon: '\uD83D\uDCE5', color: '#666' },
};

export function DocumentPanel({ email }: { email: EmailData }) {
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState(false);
  const [forwarding, setForwarding] = useState<string | null>(null);

  const detectDocument = async () => {
    setLoading(true);
    try {
      // TODO: Call document detection endpoint via authenticated API
      // For now, simulate with classify endpoint
      setDocument(null);
      setDetected(true);
    } catch {
      setDetected(true);
    }
    setLoading(false);
  };

  const forwardTo = async (action: string) => {
    setForwarding(action);
    try {
      // TODO: Call /api/integrations/:id/forward
      await new Promise(r => setTimeout(r, 1000)); // Simulate
    } catch {
      // Handle error
    }
    setForwarding(null);
  };

  if (!detected && !loading) {
    return (
      <button
        onClick={detectDocument}
        style={{
          width: '100%',
          padding: '12px',
          background: '#059669',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Dokument erkennen
      </button>
    );
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Pruefe auf Dokumente...</div>;
  }

  if (!document) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
        Kein Geschaeftsdokument erkannt.
        <button
          onClick={() => setDetected(false)}
          style={{ display: 'block', margin: '12px auto', padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '12px' }}
        >
          Erneut pruefen
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Document Info */}
      <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }}>{DOC_TYPE_ICONS[document.type]}</span>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>{DOC_TYPE_LABELS[document.type]}</div>
            <div style={{ fontSize: '11px', color: '#666' }}>
              Konfidenz: {(document.confidence * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Extracted Data */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
          {document.extractedData.vendor && (
            <div><span style={{ color: '#888' }}>Lieferant:</span> {document.extractedData.vendor}</div>
          )}
          {document.extractedData.amount != null && (
            <div><span style={{ color: '#888' }}>Betrag:</span> {document.extractedData.amount} {document.extractedData.currency || 'EUR'}</div>
          )}
          {document.extractedData.invoiceNumber && (
            <div><span style={{ color: '#888' }}>Rechnungsnr.:</span> {document.extractedData.invoiceNumber}</div>
          )}
          {document.extractedData.dueDate && (
            <div><span style={{ color: '#888' }}>Faellig:</span> {document.extractedData.dueDate}</div>
          )}
        </div>
      </div>

      {/* DMS Forward Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {document.suggestedActions.map(action => {
          const config = ACTION_LABELS[action];
          if (!config) return null;
          return (
            <button
              key={action}
              onClick={() => forwardTo(action)}
              disabled={forwarding === action}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 12px',
                background: forwarding === action ? '#f5f5f5' : '#fff',
                border: `1px solid ${config.color}40`,
                borderRadius: '6px',
                cursor: forwarding === action ? 'wait' : 'pointer',
                fontSize: '13px',
                color: config.color,
                fontWeight: 500,
              }}
            >
              <span>{config.icon}</span>
              {forwarding === action ? 'Wird gesendet...' : config.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
