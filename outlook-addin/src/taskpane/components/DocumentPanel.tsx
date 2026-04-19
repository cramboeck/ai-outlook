// Document Panel
//
// Real flow:
//   1. "Dokument erkennen" fetches the primary PDF attachment via Office.js
//      and POSTs it to /process/extract-document. Result populates the card.
//   2. The tenant's active integrations are loaded once on mount so every
//      button corresponds to a real integration configured by the user
//      (no more hardcoded forward_sharepoint / forward_sevdesk strings).
//   3. Clicking an integration fetches the attachment again and POSTs to
//      /integrations/:id/forward with the extracted document_data.
//
// All API errors bubble into a per-row status badge. Lade-Spinner während
// jedes Calls.

import { useEffect, useState } from 'react';
import { apiCall } from '../../services/officeAuth';
import { fetchFirstPdfAttachment } from '../../services/officeAttachments';

interface EmailData {
  id: string;
  subject: string;
  sender: string;
  body: string;
  hasAttachments: boolean;
}

interface DocumentInfo {
  type: 'invoice' | 'order' | 'contract' | 'receipt' | 'none';
  confidence?: number;
  vendor?: string;
  amount?: number;
  netAmount?: number;
  taxRate?: number;
  currency?: string;
  invoiceNumber?: string;
  orderNumber?: string;
  date?: string;
  dueDate?: string;
  iban?: string;
  notes?: string;
}

interface Integration {
  id: string;
  type: 'sharepoint' | 'sevdesk' | 'datev' | 'paperless' | 'webhook';
  name: string;
  enabled: boolean;
}

type ForwardState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'success'; message: string; url?: string }
  | { status: 'error'; message: string };

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Rechnung',
  order: 'Bestellung',
  contract: 'Vertrag',
  receipt: 'Beleg',
  none: 'Kein Dokument',
};

const DOC_TYPE_ICONS: Record<string, string> = {
  invoice: '\uD83D\uDCCB',
  order: '\uD83D\uDCE6',
  contract: '\uD83D\uDCDD',
  receipt: '\uD83E\uDDFE',
  none: '\u2139\uFE0F',
};

const INTEGRATION_ICONS: Record<Integration['type'], string> = {
  sharepoint: '\uD83D\uDCC1',
  sevdesk: '\uD83D\uDCCA',
  paperless: '\uD83D\uDCC4',
  datev: '\uD83C\uDFE2',
  webhook: '\uD83D\uDD17',
};

const INTEGRATION_COLORS: Record<Integration['type'], string> = {
  sharepoint: '#0078d4',
  sevdesk: '#00a651',
  paperless: '#8b5cf6',
  datev: '#003d7d',
  webhook: '#666666',
};

export function DocumentPanel({ email }: { email: EmailData }) {
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(false);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false);
  const [forwardStates, setForwardStates] = useState<Record<string, ForwardState>>({});

  // Load the tenant's integrations once per mount.
  useEffect(() => {
    let cancelled = false;
    apiCall<{ items: Integration[] }>('/integrations')
      .then(data => {
        if (cancelled) return;
        setIntegrations((data.items ?? []).filter(i => i.enabled));
      })
      .catch(err => {
        if (!cancelled) console.warn('Integrationen laden fehlgeschlagen:', err);
      })
      .finally(() => !cancelled && setIntegrationsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset detection + forward state when the user switches emails.
  useEffect(() => {
    setDocument(null);
    setDetected(false);
    setDetectError(null);
    setForwardStates({});
  }, [email.id]);

  const detectDocument = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const attachment = await fetchFirstPdfAttachment().catch(() => null);

      const result = await apiCall<{ extracted: DocumentInfo }>(
        '/extract-document',
        {
          method: 'POST',
          body: {
            attachment: attachment ?? undefined,
            email_subject: email.subject,
            email_sender: email.sender,
          },
        }
      );
      setDocument(result.extracted ?? null);
      setDetected(true);
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : 'Erkennung fehlgeschlagen');
      setDetected(true);
    } finally {
      setDetecting(false);
    }
  };

  const forwardTo = async (integration: Integration) => {
    setForwardStates(prev => ({ ...prev, [integration.id]: { status: 'sending' } }));
    try {
      const attachment = await fetchFirstPdfAttachment().catch(() => null);

      const res = await apiCall<{
        success?: boolean;
        message?: string;
        file_url?: string;
        document_id?: number;
      }>(`/integrations/${encodeURIComponent(integration.id)}/forward`, {
        method: 'POST',
        body: {
          email_id: email.id,
          email_subject: email.subject,
          document_data: document ?? undefined,
          attachment: attachment ?? undefined,
        },
      });

      if (res.success === false) {
        setForwardStates(prev => ({
          ...prev,
          [integration.id]: { status: 'error', message: res.message || 'Fehler' },
        }));
      } else {
        setForwardStates(prev => ({
          ...prev,
          [integration.id]: {
            status: 'success',
            message: res.message || `An ${integration.name} gesendet`,
            url: res.file_url,
          },
        }));
      }
    } catch (err) {
      setForwardStates(prev => ({
        ...prev,
        [integration.id]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Weiterleitung fehlgeschlagen',
        },
      }));
    }
  };

  // --- Render ---

  if (!detected && !detecting) {
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

  if (detecting) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
        <div style={{ marginBottom: '6px' }}>Pruefe auf Dokumente...</div>
        <div style={{ fontSize: '11px', color: '#999' }}>
          PDF wird extrahiert & analysiert
        </div>
      </div>
    );
  }

  if (detectError) {
    return (
      <div style={{ padding: '12px', background: '#ffeef0', color: '#d32f2f', borderRadius: '4px', fontSize: '13px' }}>
        {detectError}
        <button
          onClick={() => {
            setDetected(false);
            setDetectError(null);
          }}
          style={{
            display: 'block',
            marginTop: '8px',
            padding: '6px 12px',
            border: '1px solid #d32f2f',
            borderRadius: '4px',
            background: '#fff',
            color: '#d32f2f',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!document || document.type === 'none') {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
        Kein Geschaeftsdokument erkannt.
        <button
          onClick={() => setDetected(false)}
          style={{
            display: 'block',
            margin: '12px auto',
            padding: '8px 16px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '12px',
          }}
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
            {document.confidence != null && (
              <div style={{ fontSize: '11px', color: '#666' }}>
                Konfidenz: {(document.confidence * 100).toFixed(0)}%
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
          {document.vendor && (
            <div><span style={{ color: '#888' }}>Lieferant:</span> {document.vendor}</div>
          )}
          {document.amount != null && (
            <div>
              <span style={{ color: '#888' }}>Betrag:</span> {document.amount} {document.currency || 'EUR'}
            </div>
          )}
          {document.invoiceNumber && (
            <div><span style={{ color: '#888' }}>Rechnungsnr.:</span> {document.invoiceNumber}</div>
          )}
          {document.orderNumber && (
            <div><span style={{ color: '#888' }}>Bestellnr.:</span> {document.orderNumber}</div>
          )}
          {document.date && (
            <div><span style={{ color: '#888' }}>Datum:</span> {document.date}</div>
          )}
          {document.dueDate && (
            <div><span style={{ color: '#888' }}>Faellig:</span> {document.dueDate}</div>
          )}
          {document.taxRate != null && (
            <div><span style={{ color: '#888' }}>USt:</span> {document.taxRate}%</div>
          )}
          {document.iban && (
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#888' }}>IBAN:</span> {document.iban}
            </div>
          )}
        </div>
      </div>

      {/* Integrations */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>
          An Integration weiterleiten
        </div>

        {!integrationsLoaded && (
          <div style={{ fontSize: '12px', color: '#999', padding: '8px' }}>Lade Integrationen…</div>
        )}

        {integrationsLoaded && integrations.length === 0 && (
          <div style={{ fontSize: '12px', color: '#999', padding: '8px' }}>
            Keine aktiven Integrationen. Bitte im Web-Client unter „Integrationen" anlegen.
          </div>
        )}

        {integrations.map(integration => {
          const state = forwardStates[integration.id] ?? { status: 'idle' };
          const color = INTEGRATION_COLORS[integration.type] || '#666';
          const icon = INTEGRATION_ICONS[integration.type] || '\uD83D\uDD17';
          return (
            <div key={integration.id} style={{ marginBottom: '8px' }}>
              <button
                onClick={() => state.status === 'idle' && forwardTo(integration)}
                disabled={state.status === 'sending' || state.status === 'success'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 12px',
                  background: state.status === 'sending' ? '#f5f5f5' : '#fff',
                  border: `1px solid ${color}40`,
                  borderRadius: '6px',
                  cursor: state.status === 'idle' ? 'pointer' : 'default',
                  fontSize: '13px',
                  color,
                  fontWeight: 500,
                  textAlign: 'left',
                }}
              >
                <span>{icon}</span>
                <span style={{ flex: 1 }}>
                  {state.status === 'sending' ? 'Wird gesendet...' : integration.name}
                </span>
                {state.status === 'success' && <span>{'\u2713'}</span>}
                {state.status === 'error' && <span>{'\u26A0\uFE0F'}</span>}
              </button>

              {state.status === 'success' && (
                <div style={{
                  padding: '6px 10px',
                  marginTop: '2px',
                  background: '#f0fdf4',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#065f46',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span>{state.message}</span>
                  {state.url && (
                    <a
                      href={state.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#065f46', fontWeight: 600 }}
                    >
                      Oeffnen →
                    </a>
                  )}
                </div>
              )}
              {state.status === 'error' && (
                <div style={{
                  padding: '6px 10px',
                  marginTop: '2px',
                  background: '#fef2f2',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#991b1b',
                }}>
                  {state.message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
