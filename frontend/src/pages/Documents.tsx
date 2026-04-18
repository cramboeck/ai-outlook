import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Receipt,
  ShoppingCart,
  FileSignature,
  Send,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  X,
  ExternalLink,
  Mail,
  Paperclip,
  Download,
  Eye,
  Pencil,
  Save,
  Zap,
} from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { graphScopes, sharepointScopes } from '../config/msalConfig';

// Build a description string from document data
function buildDescription(type: string, data: DetectedDocument['document_data']): string {
  const labels: Record<string, string> = { invoice: 'Rechnung', order: 'Bestellung', contract: 'Vertrag', receipt: 'Quittung' };
  const parts = [labels[type] || 'Dokument'];
  if (data.vendor) parts.push(`von ${data.vendor}`);
  if (data.amount) parts.push(`- ${data.amount} ${data.currency || 'EUR'}`);
  if (data.invoiceNumber) parts.push(`(Nr. ${data.invoiceNumber})`);
  return parts.join(' ');
}
import { api } from '../services/apiClient';
import { initGraphClient, getDocumentAttachments, getEmailAttachments, getEmailAttachmentContent, getEmailWithBody, type EmailAttachment } from '../services/graphService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DetectedDocument {
  id: string;
  email_id: string;
  email_subject: string;
  action_type: string;
  description: string;
  document_type: 'invoice' | 'order' | 'contract' | 'receipt';
  document_data: {
    vendor?: string;
    amount?: string;
    invoiceNumber?: string;
    orderNumber?: string;
    date?: string;
    currency?: string;
  };
  status: 'open' | 'in_progress' | 'done' | 'dismissed';
  forwarded_to?: string;
  created_at: string;
}

interface Integration {
  id: string;
  name: string;
  type: 'sharepoint' | 'sevdesk' | 'datev' | 'webhook';
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Rechnung',
  order: 'Bestellung',
  contract: 'Vertrag',
  receipt: 'Quittung',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  invoice: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  order: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  contract: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  receipt: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

const DOC_TYPE_ICONS: Record<string, typeof FileText> = {
  invoice: Receipt,
  order: ShoppingCart,
  contract: FileSignature,
  receipt: FileText,
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Zur Freigabe',
  in_progress: 'In Bearbeitung',
  approved: 'Freigegeben',
  done: 'Weitergeleitet',
  dismissed: 'Verworfen',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  dismissed: 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400',
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  open: Clock,
  in_progress: Loader2,
  approved: CheckCircle2,
  done: CheckCircle2,
  dismissed: XCircle,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Documents() {
  const { instance, accounts } = useMsal();
  const [documents, setDocuments] = useState<DetectedDocument[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    docId: string;
    integrationId?: string;
    integrationName?: string;
    type: 'forward' | 'dismiss';
  } | null>(null);

  const [filters, setFilters] = useState({
    document_type: '',
    status: '',
    search: '',
    date_from: '',
    date_to: '',
  });

  // Detail panel
  const [selectedDoc, setSelectedDoc] = useState<DetectedDocument | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [emailBody, setEmailBody] = useState<string>('');
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [editingData, setEditingData] = useState<DetectedDocument['document_data'] | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // AI extraction
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiStep, setAiStep] = useState<string>('');
  const [aiSteps, setAiSteps] = useState<Array<{ label: string; status: 'pending' | 'active' | 'done' | 'error' }>>([]);

  const pageSize = 20;

  // ---- Data fetching -------------------------------------------------------

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('type', 'document');
      if (filters.document_type) params.set('document_type', filters.document_type);
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));

      const data = await api.get<{ items: DetectedDocument[]; total: number }>(
        `/actions?${params}`,
      );
      // Parse JSON strings from DB (SQLite stores JSONB as TEXT)
      const items = (data.items ?? []).map((item: any) => ({
        ...item,
        document_data: typeof item.document_data === 'string'
          ? JSON.parse(item.document_data || '{}') : (item.document_data || {}),
        forwarded_to: typeof item.forwarded_to === 'string'
          ? (() => { try { return JSON.parse(item.forwarded_to); } catch { return item.forwarded_to; } })()
          : item.forwarded_to,
      }));
      setDocuments(items);
      setTotal(data.total ?? items.length);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError('Dokumente konnten nicht geladen werden.');
    }
    setLoading(false);
  }, [page, filters]);

  const fetchIntegrations = useCallback(async () => {
    try {
      const raw = await api.get<Integration[] | { items: Integration[] }>('/integrations');
      const items = Array.isArray(raw) ? raw : (raw as any).items ?? [];
      setIntegrations(items.filter((i: Integration) => i.enabled));
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // ---- Actions -------------------------------------------------------------

  // Open detail panel for a document
  const openDetail = async (doc: DetectedDocument) => {
    setSelectedDoc(doc);
    setEditingData(null);
    setEmailBody('');
    setAttachments([]);

    if (!doc.email_id || accounts.length === 0) return;

    setDetailLoading(true);
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        ...graphScopes,
        account: accounts[0],
      });
      initGraphClient(tokenResponse.accessToken);

      // Load email body and attachments in parallel
      const [emailData, atts] = await Promise.all([
        getEmailWithBody(doc.email_id).catch(() => null),
        getEmailAttachments(doc.email_id).catch(() => []),
      ]);

      if (emailData?.body?.content) {
        setEmailBody(emailData.body.content);
      }
      setAttachments(atts);
    } catch (err) {
      console.warn('Could not load email details:', err);
    }
    setDetailLoading(false);
  };

  // Save edited document data
  const saveDocumentData = async () => {
    if (!selectedDoc || !editingData) return;
    setSavingEdit(true);
    try {
      await api.patch(`/actions/${selectedDoc.id}`, {
        description: buildDescription(selectedDoc.document_type, editingData),
        document_data: editingData,
      });
      setSelectedDoc({ ...selectedDoc, document_data: editingData });
      setDocuments(prev => prev.map(d =>
        d.id === selectedDoc.id ? { ...d, document_data: editingData } : d
      ));
      setEditingData(null);
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSavingEdit(false);
  };

  // KI-Analyse: Extract document data from PDF attachment via Ollama
  const runAiExtraction = async () => {
    if (!selectedDoc) return;
    setAiExtracting(true);

    const steps = [
      { label: 'PDF-Anhang wird geladen...', status: 'active' as const },
      { label: 'Dokument wird an KI gesendet...', status: 'pending' as const },
      { label: 'Felder werden extrahiert...', status: 'pending' as const },
      { label: 'Ergebnis wird verarbeitet...', status: 'pending' as const },
    ];
    setAiSteps([...steps]);
    setAiStep('PDF wird geladen...');

    try {
      // Step 1: Fetch PDF attachment
      let attachment: { name: string; contentType: string; contentBytes: string } | null = null;
      if (selectedDoc.email_id && accounts.length > 0) {
        try {
          const tokenResponse = await instance.acquireTokenSilent({
            ...graphScopes,
            account: accounts[0],
          });
          initGraphClient(tokenResponse.accessToken);
          const atts = await getEmailAttachments(selectedDoc.email_id);
          const pdf = atts.find(a => a.contentType?.includes('pdf') || a.name?.endsWith('.pdf'));
          if (pdf) {
            const fullAtt = await getEmailAttachmentContent(selectedDoc.email_id, pdf.id);
            attachment = {
              name: fullAtt.name || pdf.name || 'document.pdf',
              contentType: fullAtt.contentType || pdf.contentType || 'application/pdf',
              contentBytes: fullAtt.contentBytes || '',
            };
          }
        } catch (err) {
          console.warn('Could not fetch attachment:', err);
        }
      }

      steps[0].status = 'done';
      steps[1].status = 'active';
      setAiSteps([...steps]);
      setAiStep('Dokument wird an KI gesendet...');

      // Step 2+3: Send to backend AI extraction
      const result = await api.post<{
        extracted: any;
        model: string;
        processingTimeMs: number;
      }>('/process-extract-document', {
        attachment: attachment || undefined,
        email_subject: selectedDoc.email_subject,
        email_sender: selectedDoc.email_sender,
        existing_data: selectedDoc.document_data,
      });

      steps[1].status = 'done';
      steps[2].status = 'done';
      steps[3].status = 'active';
      setAiSteps([...steps]);
      setAiStep(`KI-Modell: ${result.model} (${result.processingTimeMs}ms)`);

      // Step 4: Map extracted data to editing fields
      const extracted = result.extracted;
      const newData = {
        ...(selectedDoc.document_data || {}),
        vendor: extracted.vendor || selectedDoc.document_data?.vendor || '',
        amount: extracted.amount != null ? String(extracted.amount) : (selectedDoc.document_data?.amount || ''),
        netAmount: extracted.netAmount != null ? String(extracted.netAmount) : '',
        taxRate: extracted.taxRate != null ? String(extracted.taxRate) : '',
        taxAmount: extracted.taxAmount != null ? String(extracted.taxAmount) : '',
        currency: extracted.currency || selectedDoc.document_data?.currency || 'EUR',
        invoiceNumber: extracted.invoiceNumber || selectedDoc.document_data?.invoiceNumber || '',
        orderNumber: extracted.orderNumber || selectedDoc.document_data?.orderNumber || '',
        date: extracted.date || '',
        dueDate: extracted.dueDate || '',
        iban: extracted.iban || '',
        bic: extracted.bic || '',
        items: extracted.items || [],
        notes: extracted.notes || '',
      };

      steps[3].status = 'done';
      setAiSteps([...steps]);
      setAiStep(`Fertig - ${Object.values(newData).filter(v => v && v !== '').length} Felder erkannt`);

      // Auto-open editing with AI-extracted values
      setEditingData(newData);

      // Keep the animation visible for a moment
      await new Promise(r => setTimeout(r, 1500));

    } catch (err) {
      console.error('AI extraction failed:', err);
      const failedIdx = steps.findIndex(s => s.status === 'active');
      if (failedIdx >= 0) steps[failedIdx].status = 'error';
      setAiSteps([...steps]);
      setAiStep(`Fehler: ${err instanceof Error ? err.message : 'KI-Analyse fehlgeschlagen'}`);
      await new Promise(r => setTimeout(r, 3000));
    }

    setAiExtracting(false);
    setAiSteps([]);
  };

  // Download attachment via Graph API
  const downloadAttachment = async (att: EmailAttachment) => {
    if (!selectedDoc?.email_id || accounts.length === 0) return;
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        ...graphScopes,
        account: accounts[0],
      });
      initGraphClient(tokenResponse.accessToken);

      const { getEmailAttachmentContent } = await import('../services/graphService');
      const full = await getEmailAttachmentContent(selectedDoc.email_id, att.id);
      if (full.contentBytes) {
        const blob = new Blob(
          [Uint8Array.from(atob(full.contentBytes), c => c.charCodeAt(0))],
          { type: att.contentType }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Preview attachment in new tab
  const previewAttachment = async (att: EmailAttachment) => {
    if (!selectedDoc?.email_id || accounts.length === 0) return;
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        ...graphScopes,
        account: accounts[0],
      });
      initGraphClient(tokenResponse.accessToken);

      const { getEmailAttachmentContent } = await import('../services/graphService');
      const full = await getEmailAttachmentContent(selectedDoc.email_id, att.id);
      if (full.contentBytes) {
        const blob = new Blob(
          [Uint8Array.from(atob(full.contentBytes), c => c.charCodeAt(0))],
          { type: att.contentType }
        );
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('Preview failed:', err);
    }
  };

  // Try to fetch email attachment (PDF) via Graph API
  const fetchAttachment = async (emailId: string): Promise<{ name: string; contentType: string; contentBytes: string } | null> => {
    if (!emailId || accounts.length === 0) return null;
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        ...graphScopes,
        account: accounts[0],
      });
      initGraphClient(tokenResponse.accessToken);
      const attachments = await getDocumentAttachments(emailId);
      if (attachments.length > 0 && attachments[0].contentBytes) {
        return {
          name: attachments[0].name,
          contentType: attachments[0].contentType,
          contentBytes: attachments[0].contentBytes,
        };
      }
    } catch (err) {
      console.warn('Could not fetch email attachment:', err);
    }
    return null;
  };

  // Forward to a specific integration
  const handleForward = async (docId: string, integrationId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    setForwardingId(docId);
    setConfirmAction(null);
    try {
      // Try to get the PDF attachment from the email
      const attachment = await fetchAttachment(doc.email_id);

      // Get Graph access token with SharePoint scopes (needed for SharePoint forward)
      let accessToken: string | undefined;
      try {
        if (accounts[0]) {
          try {
            const tokenResp = await instance.acquireTokenSilent({
              scopes: sharepointScopes.scopes,
              account: accounts[0],
            });
            accessToken = tokenResp.accessToken;
          } catch {
            // Fallback to regular scopes
            const tokenResp = await instance.acquireTokenSilent({
              scopes: graphScopes.scopes,
              account: accounts[0],
            });
            accessToken = tokenResp.accessToken;
          }
        }
      } catch { /* ignore - not all integrations need it */ }

      await api.post(`/integrations/${integrationId}/forward`, {
        email_id: doc.email_id,
        email_subject: doc.email_subject,
        document_data: doc.document_data,
        action_id: doc.id,
        attachment: attachment || undefined,
        access_token: accessToken,
      });
      await fetchDocuments();
    } catch (err) {
      console.error('Forward failed:', err);
      setError('Weiterleitung fehlgeschlagen. Bitte erneut versuchen.');
    }
    setForwardingId(null);
  };

  // Freigabe-Workflow: Approve → auto-forward to ALL matching integrations
  const handleApprove = async (docId: string) => {
    setForwardingId(docId);
    setConfirmAction(null);
    try {
      // Try to get the PDF attachment from the email
      const doc = documents.find(d => d.id === docId);
      const attachment = doc?.email_id ? await fetchAttachment(doc.email_id) : null;

      // Get Graph access token for SharePoint forwarding
      let accessToken: string | undefined;
      try {
        if (accounts[0]) {
          try {
            const tokenResp = await instance.acquireTokenSilent({
              scopes: sharepointScopes.scopes,
              account: accounts[0],
            });
            accessToken = tokenResp.accessToken;
          } catch {
            const tokenResp = await instance.acquireTokenSilent({
              scopes: graphScopes.scopes,
              account: accounts[0],
            });
            accessToken = tokenResp.accessToken;
          }
        }
      } catch { /* ignore */ }

      const result = await api.patch<any>(`/actions/${docId}/status`, {
        status: 'approved',
        attachment: attachment || undefined,
        access_token: accessToken,
      });
      if (result?._forwardResults) {
        const successCount = result._forwardResults.filter((r: any) => r.success).length;
        const totalCount = result._forwardResults.length;
        if (successCount > 0) {
          setError(null);
        } else if (totalCount > 0) {
          setError(`Freigabe erfolgreich, aber Weiterleitung fehlgeschlagen (${totalCount} Integrationen).`);
        }
      }
      await fetchDocuments();
    } catch (err) {
      console.error('Approve failed:', err);
      setError('Freigabe fehlgeschlagen. Bitte erneut versuchen.');
    }
    setForwardingId(null);
  };

  const handleDismiss = async (docId: string) => {
    setForwardingId(docId);
    setConfirmAction(null);
    try {
      await api.patch(`/actions/${docId}`, { status: 'dismissed' });
      await fetchDocuments();
    } catch (err) {
      console.error('Dismiss failed:', err);
      setError('Aktion fehlgeschlagen. Bitte erneut versuchen.');
    }
    setForwardingId(null);
  };

  // ---- Helpers -------------------------------------------------------------

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const stats = {
    total: total || documents.length,
    invoices: documents.filter((d) => d.document_type === 'invoice').length,
    orders: documents.filter((d) => d.document_type === 'order').length,
    forwarded: documents.filter((d) => d.status === 'done').length,
  };

  const totalPages = Math.ceil(total / pageSize);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Dokumente</h1>
          <p className="text-text-secondary text-sm mt-1">
            Erkannte Dokumente aus eingehenden E-Mails
          </p>
        </div>
        <button
          onClick={() => {
            fetchDocuments();
            fetchIntegrations();
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-bg-secondary rounded-lg hover:bg-border transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Aktualisieren
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
            <FileText className="w-4 h-4" />
            Erkannte Dokumente
          </div>
          <div className="text-2xl font-bold text-text">{stats.total}</div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
            <Receipt className="w-4 h-4" />
            Rechnungen
          </div>
          <div className="text-2xl font-bold text-text">{stats.invoices}</div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
            <ShoppingCart className="w-4 h-4" />
            Bestellungen
          </div>
          <div className="text-2xl font-bold text-text">{stats.orders}</div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
            <Send className="w-4 h-4" />
            Weitergeleitet
          </div>
          <div className="text-2xl font-bold text-text">{stats.forwarded}</div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Betreff suchen..."
            value={filters.search}
            onChange={(e) => {
              setFilters((f) => ({ ...f, search: e.target.value }));
              setPage(0);
            }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg-secondary text-text"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-secondary" />
          <select
            value={filters.document_type}
            onChange={(e) => {
              setFilters((f) => ({ ...f, document_type: e.target.value }));
              setPage(0);
            }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg-secondary text-text"
          >
            <option value="">Alle Dokumenttypen</option>
            {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <select
          value={filters.status}
          onChange={(e) => {
            setFilters((f) => ({ ...f, status: e.target.value }));
            setPage(0);
          }}
          className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg-secondary text-text"
        >
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-text-secondary" />
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => {
              setFilters((f) => ({ ...f, date_from: e.target.value }));
              setPage(0);
            }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg-secondary text-text"
          />
          <span className="text-text-secondary text-sm">bis</span>
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => {
              setFilters((f) => ({ ...f, date_to: e.target.value }));
              setPage(0);
            }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg-secondary text-text"
          />
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl border border-border shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold text-text">
              {confirmAction.type === 'forward'
                ? (confirmAction.integrationId ? 'Dokument weiterleiten?' : 'Dokument freigeben?')
                : 'Dokument verwerfen?'}
            </h3>
            <p className="text-sm text-text-secondary">
              {confirmAction.type === 'forward'
                ? (confirmAction.integrationId
                    ? `Dieses Dokument wird an "${confirmAction.integrationName}" weitergeleitet.`
                    : `Dieses Dokument wird freigegeben und automatisch an alle konfigurierten Integrationen weitergeleitet (${confirmAction.integrationName}).`)
                : 'Dieses Dokument wird als verworfen markiert.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border bg-bg-secondary hover:bg-border transition-colors text-text"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === 'forward') {
                    if (confirmAction.integrationId) {
                      handleForward(confirmAction.docId, confirmAction.integrationId);
                    } else {
                      handleApprove(confirmAction.docId);
                    }
                  } else {
                    handleDismiss(confirmAction.docId);
                  }
                }}
                className={`px-4 py-2 text-sm rounded-lg text-white transition-colors ${
                  confirmAction.type === 'forward'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirmAction.type === 'forward'
                  ? (confirmAction.integrationId ? 'Weiterleiten' : 'Freigeben & Weiterleiten')
                  : 'Verwerfen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Table */}
      <div className="bg-bg-secondary rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-text-secondary">
                <th className="text-left p-3 font-medium">Typ</th>
                <th className="text-left p-3 font-medium">E-Mail-Betreff</th>
                <th className="text-left p-3 font-medium">Lieferant</th>
                <th className="text-left p-3 font-medium">Nummer</th>
                <th className="text-right p-3 font-medium">Betrag</th>
                <th className="text-left p-3 font-medium">Datum</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="p-3"><div className="animate-pulse h-4 w-6 bg-gray-200 rounded" /></td>
                      <td className="p-3"><div className="animate-pulse h-5 w-20 bg-gray-200 rounded-full" /></td>
                      <td className="p-3"><div className="animate-pulse h-4 w-48 bg-gray-200 rounded" /></td>
                      <td className="p-3"><div className="animate-pulse h-4 w-28 bg-gray-200 rounded" /></td>
                      <td className="p-3"><div className="animate-pulse h-4 w-20 bg-gray-200 rounded" /></td>
                      <td className="p-3 text-right"><div className="animate-pulse h-4 w-16 bg-gray-200 rounded ml-auto" /></td>
                      <td className="p-3"><div className="animate-pulse h-4 w-20 bg-gray-200 rounded" /></td>
                      <td className="p-3"><div className="animate-pulse h-5 w-16 bg-gray-200 rounded-full" /></td>
                    </tr>
                  ))}
                </>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-16 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center">
                        <FileText className="w-10 h-10 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-text mb-1">
                          Noch keine Dokumente erkannt
                        </h3>
                        <p className="text-text-secondary text-sm max-w-md">
                          Sobald E-Mails mit Rechnungen, Bestellungen oder Vertraegen verarbeitet werden,
                          erscheinen die erkannten Dokumente hier automatisch.
                        </p>
                      </div>
                      <button
                        onClick={() => window.location.href = '/inbox'}
                        className="mt-2 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
                      >
                        Posteingang oeffnen
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                documents.map((doc) => {
                  const DocIcon = DOC_TYPE_ICONS[doc.document_type] || FileText;
                  const StatusIcon = STATUS_ICONS[doc.status] || Clock;
                  const isProcessing = forwardingId === doc.id;
                  const canAct = doc.status === 'open' || doc.status === 'in_progress';

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => openDetail(doc)}
                      className="border-b border-border hover:bg-bg transition-colors cursor-pointer"
                    >
                      {/* Document type */}
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            DOC_TYPE_COLORS[doc.document_type] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          <DocIcon className="w-3.5 h-3.5" />
                          {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                        </span>
                      </td>

                      {/* Email subject */}
                      <td
                        className="p-3 max-w-[220px] truncate text-text"
                        title={doc.email_subject}
                      >
                        {doc.email_subject || '-'}
                      </td>

                      {/* Vendor */}
                      <td className="p-3 text-text">
                        {doc.document_data?.vendor || '-'}
                      </td>

                      {/* Number (invoice or order) */}
                      <td className="p-3 text-text font-mono text-xs">
                        {doc.document_data?.invoiceNumber ||
                          doc.document_data?.orderNumber ||
                          '-'}
                      </td>

                      {/* Amount */}
                      <td className="p-3 text-right text-text font-mono">
                        {doc.document_data?.amount
                          ? `${doc.document_data.amount} ${doc.document_data.currency || 'EUR'}`
                          : '-'}
                      </td>

                      {/* Date */}
                      <td className="p-3 text-text-secondary whitespace-nowrap">
                        {doc.document_data?.date || formatDate(doc.created_at)}
                      </td>

                      {/* Status */}
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[doc.status] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {STATUS_LABELS[doc.status] || doc.status}
                        </span>
                        {doc.forwarded_to && (() => {
                          try {
                            const fwd = typeof doc.forwarded_to === 'string'
                              ? JSON.parse(doc.forwarded_to) : doc.forwarded_to;
                            if (Array.isArray(fwd) && fwd.length > 0) {
                              const names = fwd.map((f: any) => f.integration_name || f.integration_type).join(', ');
                              return (
                                <span className="block text-xs text-text-secondary mt-0.5 truncate max-w-[140px]" title={names}>
                                  an {names}
                                </span>
                              );
                            }
                          } catch { /* ignore parse errors */ }
                          return null;
                        })()}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin text-text-secondary inline-block" />
                        ) : canAct ? (
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Freigeben Button - forwards to ALL configured integrations */}
                            {integrations.length > 0 && (
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    docId: doc.id,
                                    type: 'forward',
                                    integrationName: integrations.map(i => i.name).join(', '),
                                  })
                                }
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors font-medium"
                                title={`Freigeben und weiterleiten an: ${integrations.map(i => i.name).join(', ')}`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Freigeben
                              </button>
                            )}
                            {/* Einzelne Weiterleitung (falls User nur an bestimmte Integration will) */}
                            {integrations.length > 1 && integrations.map((integration) => (
                              <button
                                key={integration.id}
                                onClick={() =>
                                  setConfirmAction({
                                    docId: doc.id,
                                    integrationId: integration.id,
                                    integrationName: integration.name,
                                    type: 'forward',
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-primary/30 text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                title={`Nur an ${integration.name} weiterleiten`}
                              >
                                <Send className="w-3 h-3" />
                                {integration.name}
                              </button>
                            ))}
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  docId: doc.id,
                                  type: 'dismiss',
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-border text-text-secondary hover:bg-border rounded-lg transition-colors"
                              title="Verwerfen"
                            >
                              <XCircle className="w-3 h-3" />
                              Verwerfen
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-text-secondary">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <span className="text-sm text-text-secondary">
              {total} Dokumente - Seite {page + 1} von {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-bg disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-bg disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Document Detail Slide-Over                                           */}
      {/* ------------------------------------------------------------------- */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedDoc(null)} />

          {/* Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-card border-l border-border shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-card border-b border-border p-5 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                {(() => {
                  const DocIcon = DOC_TYPE_ICONS[selectedDoc.document_type] || FileText;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${DOC_TYPE_COLORS[selectedDoc.document_type] || 'bg-gray-100 text-gray-800'}`}>
                      <DocIcon className="w-3.5 h-3.5" />
                      {DOC_TYPE_LABELS[selectedDoc.document_type] || selectedDoc.document_type}
                    </span>
                  );
                })()}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedDoc.status]}`}>
                  {STATUS_LABELS[selectedDoc.status]}
                </span>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="p-1.5 rounded-lg hover:bg-bg-secondary transition-colors">
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Email Info */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-text">{selectedDoc.email_subject || 'Kein Betreff'}</h3>
                <div className="flex items-center gap-3 text-sm text-text-secondary">
                  <Mail className="w-4 h-4" />
                  <span>Email-ID: {selectedDoc.email_id || '-'}</span>
                  {selectedDoc.email_id && (
                    <a
                      href={`https://outlook.office.com/mail/inbox/id/${encodeURIComponent(selectedDoc.email_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      In Outlook oeffnen
                    </a>
                  )}
                </div>
                <div className="text-xs text-text-secondary">
                  Erkannt am {formatDate(selectedDoc.created_at)}
                </div>
              </div>

              {/* Document Data - View/Edit */}
              <div className="bg-bg-secondary rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-text">Dokumentdaten</h4>
                  {!editingData && !aiExtracting && selectedDoc.status === 'open' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={runAiExtraction}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gradient-to-r from-purple-600 to-blue-500 text-white hover:from-purple-700 hover:to-blue-600 rounded-lg transition-all shadow-sm"
                      >
                        <Zap className="w-3 h-3" />
                        KI-Analyse
                      </button>
                      <button
                        onClick={() => setEditingData({ ...selectedDoc.document_data })}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        Bearbeiten
                      </button>
                    </div>
                  )}
                </div>

                {/* AI Extraction Animation */}
                {aiExtracting && (
                  <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-lg border border-purple-500/30 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse flex items-center justify-center">
                          <Zap className="w-4 h-4 text-white" />
                        </div>
                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-ping opacity-20" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-purple-300">KI-Dokumentenanalyse</div>
                        <div className="text-xs text-purple-400/70">qwen2.5:14b via Ollama</div>
                      </div>
                    </div>

                    <div className="space-y-2 pl-2">
                      {aiSteps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-xs">
                          {step.status === 'done' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          ) : step.status === 'active' ? (
                            <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin shrink-0" />
                          ) : step.status === 'error' ? (
                            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-gray-600 shrink-0" />
                          )}
                          <span className={
                            step.status === 'done' ? 'text-green-400' :
                            step.status === 'active' ? 'text-purple-300 font-medium' :
                            step.status === 'error' ? 'text-red-400' :
                            'text-gray-500'
                          }>
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {aiStep && (
                      <div className="text-xs text-purple-400/80 font-mono bg-black/20 rounded px-2 py-1.5 flex items-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                        {aiStep}
                      </div>
                    )}
                  </div>
                )}

                {editingData ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">Lieferant</label>
                        <input
                          type="text"
                          value={editingData.vendor || ''}
                          onChange={e => setEditingData({ ...editingData, vendor: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">Rechnungsnummer</label>
                        <input
                          type="text"
                          value={editingData.invoiceNumber || editingData.orderNumber || ''}
                          onChange={e => setEditingData({ ...editingData, invoiceNumber: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">Betrag (brutto)</label>
                        <input
                          type="text"
                          value={editingData.amount || ''}
                          onChange={e => setEditingData({ ...editingData, amount: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text"
                          placeholder="z.B. 119.00"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">Waehrung</label>
                        <select
                          value={editingData.currency || 'EUR'}
                          onChange={e => setEditingData({ ...editingData, currency: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text"
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                          <option value="CHF">CHF</option>
                          <option value="GBP">GBP</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">Rechnungsdatum</label>
                        <input
                          type="date"
                          value={editingData.date || ''}
                          onChange={e => setEditingData({ ...editingData, date: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">USt-Satz (%)</label>
                        <select
                          value={(editingData as any).taxRate || '19'}
                          onChange={e => setEditingData({ ...editingData, taxRate: e.target.value } as any)}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text"
                        >
                          <option value="19">19% (Standard)</option>
                          <option value="7">7% (Ermaessigt)</option>
                          <option value="0">0% (Steuerfrei)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">Nettobetrag</label>
                        <input
                          type="text"
                          value={(editingData as any).netAmount || ''}
                          onChange={e => setEditingData({ ...editingData, netAmount: e.target.value } as any)}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text"
                          placeholder="z.B. 100.00"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">Faelligkeitsdatum</label>
                        <input
                          type="date"
                          value={(editingData as any).dueDate || ''}
                          onChange={e => setEditingData({ ...editingData, dueDate: e.target.value } as any)}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">IBAN</label>
                        <input
                          type="text"
                          value={(editingData as any).iban || ''}
                          onChange={e => setEditingData({ ...editingData, iban: e.target.value } as any)}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text font-mono text-xs"
                          placeholder="DE..."
                        />
                      </div>
                    </div>
                    {/* Items from AI extraction */}
                    {(editingData as any).items?.length > 0 && (
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">Positionen</label>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {(editingData as any).items.map((item: any, i: number) => (
                            <div key={i} className="text-xs bg-bg rounded px-2 py-1 border border-border flex justify-between">
                              <span className="text-text">{item.description || item}</span>
                              {item.total && <span className="text-text-secondary font-mono">{item.total} {editingData.currency || 'EUR'}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Notes from AI */}
                    {(editingData as any).notes && (
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">KI-Hinweise</label>
                        <div className="text-xs text-text-secondary bg-bg rounded px-2 py-1.5 border border-border">
                          {(editingData as any).notes}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={saveDocumentData}
                        disabled={savingEdit}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                      >
                        {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Speichern
                      </button>
                      <button
                        onClick={() => setEditingData(null)}
                        className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-bg transition-colors text-text-secondary"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                    <div>
                      <span className="text-text-secondary text-xs block mb-0.5">Lieferant</span>
                      <div className="text-text font-medium">{selectedDoc.document_data?.vendor || '-'}</div>
                    </div>
                    <div>
                      <span className="text-text-secondary text-xs block mb-0.5">Rechnungsnummer</span>
                      <div className="text-text font-mono text-xs">
                        {selectedDoc.document_data?.invoiceNumber || selectedDoc.document_data?.orderNumber || '-'}
                      </div>
                    </div>
                    <div>
                      <span className="text-text-secondary text-xs block mb-0.5">Betrag (brutto)</span>
                      <div className="text-text font-semibold font-mono text-base">
                        {selectedDoc.document_data?.amount
                          ? `${selectedDoc.document_data.amount} ${selectedDoc.document_data.currency || 'EUR'}`
                          : '-'}
                      </div>
                    </div>
                    <div>
                      <span className="text-text-secondary text-xs block mb-0.5">USt-Satz</span>
                      <div className="text-text">{(selectedDoc.document_data as any)?.taxRate ? `${(selectedDoc.document_data as any).taxRate}%` : '19%'}</div>
                    </div>
                    <div>
                      <span className="text-text-secondary text-xs block mb-0.5">Rechnungsdatum</span>
                      <div className="text-text">{selectedDoc.document_data?.date || '-'}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-text flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Anhaenge
                  {detailLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                </h4>
                {attachments.length > 0 ? (
                  <div className="space-y-2">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border">
                        <FileText className="w-5 h-5 text-text-secondary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-text font-medium truncate">{att.name}</div>
                          <div className="text-xs text-text-secondary">
                            {att.contentType} - {(att.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {att.contentType === 'application/pdf' && (
                            <button
                              onClick={() => previewAttachment(att)}
                              className="p-1.5 rounded hover:bg-bg transition-colors text-primary"
                              title="Vorschau"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => downloadAttachment(att)}
                            className="p-1.5 rounded hover:bg-bg transition-colors text-text-secondary"
                            title="Herunterladen"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !detailLoading ? (
                  <div className="text-sm text-text-secondary p-3 bg-bg-secondary rounded-lg border border-border text-center">
                    Keine Anhaenge gefunden
                  </div>
                ) : null}
              </div>

              {/* Email Preview */}
              {emailBody && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-text flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    E-Mail Inhalt
                  </h4>
                  <div
                    className="bg-bg-secondary rounded-lg border border-border p-4 text-sm text-text max-h-80 overflow-y-auto prose prose-sm dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: emailBody }}
                  />
                </div>
              )}

              {/* Forwarded info */}
              {selectedDoc.forwarded_to && (() => {
                try {
                  const fwd = typeof selectedDoc.forwarded_to === 'string'
                    ? JSON.parse(selectedDoc.forwarded_to) : selectedDoc.forwarded_to;
                  if (Array.isArray(fwd) && fwd.length > 0) {
                    return (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-text">Weiterleitungen</h4>
                        <div className="space-y-1">
                          {fwd.map((f: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs bg-green-50 dark:bg-green-900/20 rounded px-3 py-2 border border-green-200 dark:border-green-800">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                              <span className="text-green-700 dark:text-green-300 font-medium">{f.integration_name || f.integration_type}</span>
                              {f.document_url && (
                                <a
                                  href={f.document_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline ml-1"
                                  title="Im externen System oeffnen"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {f.document_id ? `#${f.document_id}` : f.voucher_id ? `Beleg #${f.voucher_id}` : 'Oeffnen'}
                                </a>
                              )}
                              <span className="text-green-600/60 dark:text-green-400/60 ml-auto">
                                {f.timestamp ? new Date(f.timestamp).toLocaleString('de-DE') : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                } catch { /* ignore */ }
                return null;
              })()}

              {/* Action Buttons */}
              {(selectedDoc.status === 'open' || selectedDoc.status === 'in_progress') && (
                <div className="flex items-center gap-3 pt-4 border-t border-border">
                  {integrations.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedDoc(null);
                        setConfirmAction({
                          docId: selectedDoc.id,
                          type: 'forward',
                          integrationName: integrations.map(i => i.name).join(', '),
                        });
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors font-medium"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Freigeben & Weiterleiten
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedDoc(null);
                      setConfirmAction({
                        docId: selectedDoc.id,
                        type: 'dismiss',
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm border border-border text-text-secondary hover:bg-bg-secondary rounded-lg transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Verwerfen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
