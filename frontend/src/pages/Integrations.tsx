import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Cloud,
  Receipt,
  Calculator,
  Globe,
  FileBox,
  RefreshCw,
  Pencil,
  Trash2,
  Zap,
  PlugZap,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowRightLeft,
} from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { graphScopes, sharepointScopes } from '../config/msalConfig';
import { api } from '../services/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Integration {
  id: string;
  tenant_id: string;
  name: string;
  type: 'sharepoint' | 'sevdesk' | 'datev' | 'webhook' | 'paperless';
  config: Record<string, string>;
  enabled: boolean;
  auto_forward_rules: string[];
  forward_count: number;
  last_forwarded_at: string | null;
  created_at: string;
}

type IntegrationType = Integration['type'];

interface ForwardCondition {
  field: string;
  operator: string;
  value: string;
}

interface FormData {
  name: string;
  type: IntegrationType;
  config: Record<string, string>;
  enabled: boolean;
  auto_forward_rules: string[];
  forward_conditions: ForwardCondition[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_META: Record<IntegrationType, { label: string; icon: typeof Cloud; color: string }> = {
  sharepoint: {
    label: 'SharePoint',
    icon: Cloud,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  sevdesk: {
    label: 'sevDesk',
    icon: Receipt,
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  datev: {
    label: 'DATEV',
    icon: Calculator,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  },
  webhook: {
    label: 'Webhook',
    icon: Globe,
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  },
  paperless: {
    label: 'Paperless-ngx',
    icon: FileBox,
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
};

const CONFIG_FIELDS: Record<IntegrationType, { key: string; label: string; placeholder: string; type?: string; required?: boolean }[]> = {
  sharepoint: [
    { key: 'site_url', label: 'Site-URL', placeholder: 'https://tenant.sharepoint.com/sites/...', required: true },
    { key: 'library_name', label: 'Bibliothek', placeholder: 'Dokumente', required: true },
    { key: 'folder_path', label: 'Ordnerpfad', placeholder: '/Rechnungen/Eingang' },
  ],
  sevdesk: [
    { key: 'api_token', label: 'API-Token', placeholder: 'Ihr sevDesk API-Token', type: 'password', required: true },
    { key: 'contact_id', label: 'Kontakt-ID (optional)', placeholder: '12345' },
  ],
  datev: [
    { key: 'client_number', label: 'Mandantennummer', placeholder: '12345', required: true },
    { key: 'consultant_number', label: 'Beraternummer', placeholder: '67890', required: true },
    { key: 'api_key', label: 'API-Key', placeholder: 'Ihr DATEV API-Key', type: 'password', required: true },
  ],
  webhook: [
    { key: 'url', label: 'Webhook-URL', placeholder: 'https://xxx.webhook.office.com/... oder https://example.com/webhook', required: true },
    { key: 'format', label: 'Format', placeholder: 'teams' },
    { key: 'method', label: 'HTTP-Methode', placeholder: 'POST' },
    { key: 'headers', label: 'Headers (JSON)', placeholder: '{"Authorization": "Bearer ..."}' },
    { key: 'secret', label: 'Webhook-Secret', placeholder: 'Optionaler HMAC-Secret', type: 'password' },
  ],
  paperless: [
    { key: 'base_url', label: 'Server-URL', placeholder: 'http://192.168.1.100:8000', required: true },
    { key: 'api_token', label: 'API-Token', placeholder: 'Paperless-ngx API Token', type: 'password', required: true },
    { key: 'default_correspondent', label: 'Standard-Korrespondent (optional)', placeholder: 'z.B. Lieferant XY' },
    { key: 'default_document_type', label: 'Standard-Dokumenttyp (optional)', placeholder: 'z.B. Rechnung' },
    { key: 'default_tags', label: 'Standard-Tags (optional)', placeholder: 'z.B. email,automatisch' },
  ],
};

const METADATA_FIELDS: { key: string; label: string; group?: string }[] = [
  // KI-extrahierte Felder (kommen aus document_data nach "Analysieren")
  { key: 'vendor', label: 'Lieferant', group: 'KI' },
  { key: 'amount', label: 'Betrag', group: 'KI' },
  { key: 'invoiceNumber', label: 'Rechnungsnummer', group: 'KI' },
  { key: 'orderNumber', label: 'Bestellnummer', group: 'KI' },
  { key: 'date', label: 'Datum', group: 'KI' },
  { key: 'dueDate', label: 'Fälligkeitsdatum', group: 'KI' },
  { key: 'currency', label: 'Währung', group: 'KI' },
  { key: 'iban', label: 'IBAN', group: 'KI' },
  { key: 'taxRate', label: 'USt-Satz', group: 'KI' },
  { key: 'documentType', label: 'Dokumenttyp', group: 'KI' },
  // Manuell vom User im Quick-Forward-Modal gepflegte Felder
  { key: 'customer', label: 'Kunde', group: 'Manuell' },
  { key: 'project', label: 'Projekt', group: 'Manuell' },
  { key: 'costCenter', label: 'Kostenstelle', group: 'Manuell' },
  { key: 'department', label: 'Abteilung', group: 'Manuell' },
  { key: 'reference', label: 'Referenz', group: 'Manuell' },
];

const CONDITION_FIELDS: { key: string; label: string; numeric?: boolean }[] = [
  { key: 'amount', label: 'Betrag', numeric: true },
  { key: 'vendor', label: 'Lieferant' },
  { key: 'invoiceNumber', label: 'Rechnungsnummer' },
  { key: 'date', label: 'Datum' },
  { key: 'taxRate', label: 'Steuersatz', numeric: true },
  { key: 'currency', label: 'Währung' },
  { key: 'iban', label: 'IBAN' },
];

const OPERATORS: { key: string; label: string; numeric?: boolean }[] = [
  { key: 'eq', label: 'ist gleich' },
  { key: 'neq', label: 'ist nicht gleich' },
  { key: 'contains', label: 'enthält' },
  { key: 'startsWith', label: 'beginnt mit' },
  { key: 'gt', label: 'größer als', numeric: true },
  { key: 'lt', label: 'kleiner als', numeric: true },
  { key: 'gte', label: 'mindestens', numeric: true },
  { key: 'lte', label: 'höchstens', numeric: true },
];

const DOCUMENT_TYPES: { key: string; label: string }[] = [
  { key: 'invoice', label: 'Rechnung' },
  { key: 'order', label: 'Bestellung' },
  { key: 'contract', label: 'Vertrag' },
  { key: 'receipt', label: 'Beleg' },
];

const EMPTY_FORM: FormData = {
  name: '',
  type: 'sharepoint',
  config: {},
  enabled: true,
  auto_forward_rules: [],
  forward_conditions: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusInfo(integration: Integration): { label: string; className: string; Icon: typeof CheckCircle2 } {
  if (!integration.enabled) {
    return { label: 'Deaktiviert', className: 'text-gray-500', Icon: XCircle };
  }
  // If never forwarded, treat as "connected" if enabled
  if (integration.forward_count > 0 || integration.last_forwarded_at) {
    return { label: 'Verbunden', className: 'text-green-600 dark:text-green-400', Icon: CheckCircle2 };
  }
  return { label: 'Bereit', className: 'text-yellow-600 dark:text-yellow-400', Icon: AlertTriangle };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Integrations() {
  const { instance, accounts } = useMsal();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test connection
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  // Debug panel
  const [debugData, setDebugData] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ items: Integration[] } | Integration[]>('/integrations');
      const raw = Array.isArray(data) ? data : (data as any).items || [];
      // Parse auto_forward_rules from JSON string; normalize V2 objects to arrays for card display
      const items = raw.map((item: any) => {
        let rules = item.auto_forward_rules;
        if (typeof rules === 'string') {
          try { rules = JSON.parse(rules); } catch { rules = []; }
        }
        // V2 format: extract document_types for display
        if (rules && !Array.isArray(rules) && typeof rules === 'object') {
          rules = rules.document_types || [];
        }
        return {
          ...item,
          auto_forward_rules: Array.isArray(rules) ? rules : [],
          forward_count: item.forward_count || 0,
        };
      });
      setIntegrations(items);
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
      setError('Integrationen konnten nicht geladen werden.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // ---------------------------------------------------------------------------
  // CRUD handlers
  // ---------------------------------------------------------------------------

  function openCreateModal() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, config: {} });
    setFormError(null);
    setModalOpen(true);
  }

  async function openEditModal(integration: Integration) {
    setEditingId(integration.id);
    setFormError(null);
    setModalOpen(true);

    // Fetch full integration data (including config) from the detail endpoint
    try {
      const full = await api.get<any>(`/integrations/${integration.id}`);
      const config = typeof full.config === 'string' ? JSON.parse(full.config) : (full.config || {});
      let rules = full.auto_forward_rules || [];
      if (typeof rules === 'string') {
        try { rules = JSON.parse(rules); } catch { rules = []; }
      }

      // Parse V2 rules format: { document_types: [...], conditions: [...] }
      let docTypes: string[] = [];
      let conditions: ForwardCondition[] = [];
      if (Array.isArray(rules)) {
        docTypes = rules;
      } else if (rules && typeof rules === 'object') {
        docTypes = rules.document_types || [];
        conditions = (rules.conditions || []).map((c: any) => ({
          field: c.field || 'amount',
          operator: c.operator || 'gt',
          value: String(c.value ?? ''),
        }));
      }

      setForm({
        name: full.name || integration.name,
        type: full.type || integration.type,
        config,
        enabled: full.enabled ?? integration.enabled,
        auto_forward_rules: docTypes,
        forward_conditions: conditions,
      });
    } catch (err) {
      console.error('Failed to load integration details:', err);
      setForm({
        name: integration.name,
        type: integration.type,
        config: {},
        enabled: integration.enabled,
        auto_forward_rules: Array.isArray(integration.auto_forward_rules) ? [...integration.auto_forward_rules] : [],
        forward_conditions: [],
      });
      setFormError('Konfigurationsdaten konnten nicht geladen werden.');
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError('Bitte geben Sie einen Namen ein.');
      return;
    }

    const requiredFields = CONFIG_FIELDS[form.type].filter(f => f.required);
    for (const field of requiredFields) {
      if (!form.config[field.key]?.trim()) {
        setFormError(`Pflichtfeld "${field.label}" ist leer.`);
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      // Build auto_forward_rules: V2 object if conditions exist, V1 array otherwise
      const autoForwardRules = form.forward_conditions.length > 0
        ? {
            document_types: form.auto_forward_rules,
            conditions: form.forward_conditions.map(c => ({
              field: c.field,
              operator: c.operator,
              value: CONDITION_FIELDS.find(cf => cf.key === c.field)?.numeric ? parseFloat(c.value) || c.value : c.value,
            })),
          }
        : form.auto_forward_rules;

      const payload = {
        name: form.name.trim(),
        type: form.type,
        config: form.config,
        enabled: form.enabled,
        auto_forward_rules: autoForwardRules,
      };

      if (editingId) {
        await api.patch(`/integrations/${editingId}`, payload);
      } else {
        await api.post('/integrations', payload);
      }

      setModalOpen(false);
      await fetchIntegrations();
    } catch (err) {
      console.error('Failed to save integration:', err);
      setFormError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/integrations/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchIntegrations();
    } catch (err) {
      console.error('Failed to delete integration:', err);
    }
    setDeleting(false);
  }

  async function handleTest(integration: Integration) {
    setTestingId(integration.id);
    setTestResult(null);
    try {
      // For SharePoint, we need to pass the Graph access token
      let body: any = {};
      if (integration.type === 'sharepoint') {
        try {
          const account = accounts[0];
          if (account) {
            // First try silent with SharePoint scopes
            try {
              const tokenResp = await instance.acquireTokenSilent({
                scopes: sharepointScopes.scopes,
                account,
              });
              body.access_token = tokenResp.accessToken;
            } catch {
              // Silent failed - need consent via popup
              const tokenResp = await instance.acquireTokenPopup({
                scopes: sharepointScopes.scopes,
              });
              body.access_token = tokenResp.accessToken;
            }
          }
        } catch (tokenErr) {
          setTestResult({
            id: integration.id,
            ok: false,
            message: 'SharePoint-Token konnte nicht abgerufen werden. Bitte Popup erlauben.',
          });
          setTestingId(null);
          return;
        }
      }

      const result = await api.post<{ success: boolean; message?: string }>(
        `/integrations/${integration.id}/test`,
        body,
      );
      setTestResult({
        id: integration.id,
        ok: result.success,
        message: result.message || (result.success ? 'Verbindung erfolgreich' : 'Verbindungstest fehlgeschlagen'),
      });
    } catch (err) {
      setTestResult({
        id: integration.id,
        ok: false,
        message: err instanceof Error ? err.message : 'Verbindungstest fehlgeschlagen',
      });
    }
    setTestingId(null);
    // Auto-clear after 8 seconds
    setTimeout(() => setTestResult(r => (r?.id === integration.id ? null : r)), 8000);
  }

  async function handleDebug(integration: Integration) {
    setDebugLoading(true);
    setDebugData(null);
    try {
      const data = await api.get<any>(`/integrations/${integration.id}/debug`);
      setDebugData(data);
    } catch (err) {
      setDebugData({ error: err instanceof Error ? err.message : 'Debug fehlgeschlagen' });
    }
    setDebugLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  function updateConfig(key: string, value: string | Record<string, string>) {
    setForm(f => ({ ...f, config: { ...f.config, [key]: value } }));
  }

  function toggleForwardRule(docType: string) {
    setForm(f => {
      const rules = f.auto_forward_rules.includes(docType)
        ? f.auto_forward_rules.filter(r => r !== docType)
        : [...f.auto_forward_rules, docType];
      return { ...f, auto_forward_rules: rules };
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">Integrationen</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchIntegrations}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-bg-secondary rounded-lg hover:bg-border transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white hover:bg-primary-dark rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neue Integration
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && integrations.length === 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="animate-pulse w-10 h-10 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="animate-pulse h-4 w-1/3 bg-gray-200 rounded" />
                  <div className="animate-pulse h-3 w-1/2 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="animate-pulse h-3 w-full bg-gray-200 rounded" />
              <div className="animate-pulse h-3 w-4/5 bg-gray-200 rounded" />
              <div className="flex gap-2 pt-2">
                <div className="animate-pulse h-6 w-16 bg-gray-200 rounded-full" />
                <div className="animate-pulse h-6 w-20 bg-gray-200 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && integrations.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <PlugZap className="w-16 h-16 text-text-secondary mb-4 opacity-40" />
          <h2 className="text-lg font-semibold text-text mb-2">Keine Integrationen konfiguriert</h2>
          <p className="text-text-secondary text-sm max-w-md mb-6">
            Verbinden Sie Ihr Dokumentenmanagementsystem, um Dokumente automatisch weiterzuleiten.
            SharePoint, sevDesk, DATEV und benutzerdefinierte Webhooks werden unterstuetzt.
          </p>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white hover:bg-primary-dark rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Erste Integration hinzufuegen
          </button>
        </div>
      )}

      {/* Integration cards */}
      {integrations.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map(integration => {
            const meta = TYPE_META[integration.type];
            const IconComp = meta.icon;
            const status = statusInfo(integration);
            const StatusIcon = status.Icon;
            const isTestingThis = testingId === integration.id;
            const thisTestResult = testResult?.id === integration.id ? testResult : null;

            return (
              <div
                key={integration.id}
                className="bg-card rounded-xl border border-border p-5 flex flex-col gap-4 transition-shadow hover:shadow-md"
              >
                {/* Top row: icon, name, type badge */}
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${meta.color}`}>
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-text truncate">{integration.name}</h3>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium ${status.className}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.label}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-text-secondary">
                    <ArrowRightLeft className="w-3 h-3 inline mr-1" />
                    {integration.forward_count} Weiterleitungen
                  </div>
                  <div className="text-text-secondary text-right">
                    {integration.last_forwarded_at
                      ? formatDate(integration.last_forwarded_at)
                      : 'Noch nie verwendet'}
                  </div>
                </div>

                {/* Auto-forward rules */}
                {integration.auto_forward_rules.length > 0 && (
                  <div>
                    <span className="text-xs text-text-secondary">Auto-Weiterleitung:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {integration.auto_forward_rules.map(rule => (
                        <span
                          key={rule}
                          className="inline-flex px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-text-secondary"
                        >
                          {DOCUMENT_TYPES.find(d => d.key === rule)?.label || rule}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Test result banner */}
                {thisTestResult && (
                  <div
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                      thisTestResult.ok
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {thisTestResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {thisTestResult.message}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-border mt-auto">
                  <button
                    onClick={() => handleTest(integration)}
                    disabled={isTestingThis}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-text rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    {isTestingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    Testen
                  </button>
                  <button
                    onClick={() => openEditModal(integration)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-text rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => handleDebug(integration)}
                    disabled={debugLoading}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                  >
                    {debugLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Debug
                  </button>
                  <button
                    onClick={() => setDeleteTarget(integration)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Loeschen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Debug Panel */}
      {debugData && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Debug-Info
            </h3>
            <button
              onClick={() => setDebugData(null)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4 text-text-secondary" />
            </button>
          </div>

          {debugData.error ? (
            <div className="text-sm text-red-600">{debugData.error}</div>
          ) : (
            <>
              {/* Connection status */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-bg rounded-lg p-3 border border-border">
                  <div className="text-text-secondary text-xs mb-1">Verbindung</div>
                  <div className={`font-medium ${debugData.connection?.success ? 'text-green-600' : 'text-red-600'}`}>
                    {debugData.connection?.success ? 'Verbunden' : 'Fehler'}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">{debugData.connection?.message}</div>
                  {debugData.connection?.base_url && (
                    <div className="text-xs text-text-secondary mt-1 font-mono">{debugData.connection.base_url}</div>
                  )}
                </div>
                <div className="bg-bg rounded-lg p-3 border border-border">
                  <div className="text-text-secondary text-xs mb-1">Integration Status</div>
                  <div className="text-sm font-medium text-text">{debugData.integration?.status || '-'}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    {debugData.integration?.forward_count || 0} Weiterleitungen
                  </div>
                  {debugData.integration?.last_error && (
                    <div className="text-xs text-red-500 mt-1">{debugData.integration.last_error}</div>
                  )}
                </div>
              </div>

              {/* Remote documents (Paperless) */}
              {debugData.remote_documents?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-text-secondary mb-2">
                    Paperless Dokumente ({debugData.remote_document_count || debugData.remote_documents.length} gesamt)
                  </h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {debugData.remote_documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center gap-2 text-xs bg-bg rounded px-2 py-1.5 border border-border">
                        <span className="text-text-secondary font-mono">#{doc.id}</span>
                        <span className="text-text flex-1 truncate">{doc.title}</span>
                        <span className="text-text-secondary">{doc.added ? new Date(doc.added).toLocaleDateString('de-DE') : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Forwarded actions */}
              {debugData.forwarded_actions?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-text-secondary mb-2">Weitergeleitete Aktionen</h4>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {debugData.forwarded_actions.map((action: any) => (
                      <div key={action.id} className="flex items-center gap-2 text-xs bg-bg rounded px-2 py-1.5 border border-border">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${action.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                          {action.status}
                        </span>
                        <span className="text-text flex-1 truncate">{action.email_subject || '-'}</span>
                        <span className="text-text-secondary">{action.document_type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent forward audit events */}
              {debugData.recent_forwards?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-text-secondary mb-2">Letzte Forward-Events (Audit)</h4>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {debugData.recent_forwards.map((evt: any) => (
                      <div key={evt.id} className="flex items-center gap-2 text-xs bg-bg rounded px-2 py-1.5 border border-border">
                        <span className="text-text flex-1 truncate">{evt.email_subject || evt.email_id}</span>
                        <span className="text-text-secondary">
                          {evt.created_at ? new Date(evt.created_at).toLocaleString('de-DE') : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No data */}
              {(!debugData.remote_documents?.length && !debugData.forwarded_actions?.length && !debugData.recent_forwards?.length) && (
                <div className="text-sm text-text-secondary text-center py-4">
                  Keine Weiterleitungen oder Remote-Dokumente gefunden.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Add / Edit Modal                                                     */}
      {/* ------------------------------------------------------------------- */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-text">
                {editingId ? 'Integration bearbeiten' : 'Neue Integration'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-5">
              {/* Name */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. SharePoint Rechnungsarchiv"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-bg text-text focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-colors"
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">Typ</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(TYPE_META) as IntegrationType[]).map(t => {
                    const meta = TYPE_META[t];
                    const Icon = meta.icon;
                    const selected = form.type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, type: t, config: {} }))}
                        disabled={!!editingId}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border bg-bg text-text-secondary hover:bg-gray-100 dark:hover:bg-gray-700'
                        } ${editingId ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <Icon className="w-4 h-4" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic config fields */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">Konfiguration</label>
                <div className="space-y-3">
                  {CONFIG_FIELDS[form.type].map(field => (
                    <div key={field.key}>
                      <label className="text-xs text-text-secondary mb-1 block">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      {field.key === 'format' ? (
                        <select
                          value={form.config[field.key] || 'auto'}
                          onChange={e => updateConfig(field.key, e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-bg text-text focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-colors"
                        >
                          <option value="auto">Auto-Erkennung</option>
                          <option value="teams">Microsoft Teams (Adaptive Card)</option>
                          <option value="json">Standard JSON</option>
                        </select>
                      ) : field.key === 'headers' ? (
                        <textarea
                          value={form.config[field.key] || ''}
                          onChange={e => updateConfig(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          rows={3}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-bg text-text font-mono text-xs focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-colors"
                        />
                      ) : field.key === 'method' ? (
                        <select
                          value={form.config[field.key] || 'POST'}
                          onChange={e => updateConfig(field.key, e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-bg text-text focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-colors"
                        >
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                        </select>
                      ) : (
                        <input
                          type={field.type || 'text'}
                          value={form.config[field.key] || ''}
                          onChange={e => updateConfig(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-bg text-text focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-colors"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* SharePoint metadata columns mapping */}
              {form.type === 'sharepoint' && (
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-2 block">
                    Metadaten-Spalten (SharePoint → Dokumentfelder)
                  </label>
                  <p className="text-xs text-text-secondary/70 mb-3">
                    Ordne MailSort-Felder den SharePoint-Spalten zu. Die Spalten müssen in der SharePoint-Bibliothek existieren.
                  </p>
                  <div className="space-y-2">
                    {Object.entries((form.config.metadata_columns as Record<string, string>) || {}).map(([dataField, spColumn], idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={dataField}
                          onChange={e => {
                            const cols = { ...(form.config.metadata_columns as Record<string, string> || {}) };
                            const val = cols[dataField];
                            delete cols[dataField];
                            cols[e.target.value] = val;
                            updateConfig('metadata_columns', cols as any);
                          }}
                          className="flex-1 px-3 py-2 border border-border rounded-lg bg-bg text-text text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                        >
                          {METADATA_FIELDS.map(mf => (
                            <option key={mf.key} value={mf.key}>{mf.label}</option>
                          ))}
                        </select>
                        <span className="text-text-secondary text-xs">→</span>
                        <input
                          type="text"
                          value={spColumn}
                          onChange={e => {
                            const cols = { ...(form.config.metadata_columns as Record<string, string> || {}) };
                            cols[dataField] = e.target.value;
                            updateConfig('metadata_columns', cols as any);
                          }}
                          placeholder="SharePoint-Spaltenname"
                          className="flex-1 px-3 py-2 border border-border rounded-lg bg-bg text-text text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cols = { ...(form.config.metadata_columns as Record<string, string> || {}) };
                            delete cols[dataField];
                            updateConfig('metadata_columns', cols as any);
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const cols = { ...(form.config.metadata_columns as Record<string, string> || {}) };
                        // Find first unused field
                        const usedFields = Object.keys(cols);
                        const nextField = METADATA_FIELDS.find(mf => !usedFields.includes(mf.key));
                        if (nextField) {
                          cols[nextField.key] = nextField.label;
                          updateConfig('metadata_columns', cols as any);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Spalte hinzufügen
                    </button>
                  </div>
                </div>
              )}

              {/* Auto-forward rules */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Auto-Weiterleitung nach Dokumenttyp
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {DOCUMENT_TYPES.map(dt => (
                    <label
                      key={dt.key}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={form.auto_forward_rules.includes(dt.key)}
                        onChange={() => toggleForwardRule(dt.key)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-text">{dt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Forward conditions editor */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1 block">
                  Zusätzliche Bedingungen
                </label>
                <p className="text-xs text-text-secondary/70 mb-3">
                  Alle Bedingungen müssen zutreffen (UND-Verknüpfung). Ohne Bedingungen wird nur nach Dokumenttyp gefiltert.
                </p>
                <div className="space-y-2">
                  {form.forward_conditions.map((cond, idx) => {
                    const fieldDef = CONDITION_FIELDS.find(f => f.key === cond.field);
                    const availableOps = fieldDef?.numeric
                      ? OPERATORS
                      : OPERATORS.filter(o => !o.numeric);
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        <select
                          value={cond.field}
                          onChange={e => {
                            const updated = [...form.forward_conditions];
                            updated[idx] = { ...updated[idx], field: e.target.value };
                            // Reset operator if incompatible
                            const newFieldDef = CONDITION_FIELDS.find(f => f.key === e.target.value);
                            if (!newFieldDef?.numeric && ['gt','lt','gte','lte'].includes(updated[idx].operator)) {
                              updated[idx].operator = 'contains';
                            }
                            setForm(f => ({ ...f, forward_conditions: updated }));
                          }}
                          className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-lg bg-bg text-text text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                        >
                          {CONDITION_FIELDS.map(cf => (
                            <option key={cf.key} value={cf.key}>{cf.label}</option>
                          ))}
                        </select>
                        <select
                          value={cond.operator}
                          onChange={e => {
                            const updated = [...form.forward_conditions];
                            updated[idx] = { ...updated[idx], operator: e.target.value };
                            setForm(f => ({ ...f, forward_conditions: updated }));
                          }}
                          className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-lg bg-bg text-text text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                        >
                          {availableOps.map(op => (
                            <option key={op.key} value={op.key}>{op.label}</option>
                          ))}
                        </select>
                        <input
                          type={fieldDef?.numeric ? 'number' : 'text'}
                          value={cond.value}
                          onChange={e => {
                            const updated = [...form.forward_conditions];
                            updated[idx] = { ...updated[idx], value: e.target.value };
                            setForm(f => ({ ...f, forward_conditions: updated }));
                          }}
                          placeholder={fieldDef?.numeric ? '1000' : 'Wert...'}
                          className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-lg bg-bg text-text text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = form.forward_conditions.filter((_, i) => i !== idx);
                            setForm(f => ({ ...f, forward_conditions: updated }));
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        forward_conditions: [
                          ...f.forward_conditions,
                          { field: 'amount', operator: 'gt', value: '' },
                        ],
                      }));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Bedingung hinzufügen
                  </button>
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-secondary">Aktiviert</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Form error */}
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-text rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Speichern' : 'Erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Delete confirmation modal                                            */}
      {/* ------------------------------------------------------------------- */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-sm shadow-xl">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-50 dark:bg-red-900/20">
                  <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-text">Integration loeschen?</h3>
              </div>
              <p className="text-sm text-text-secondary">
                Die Integration <strong className="text-text">{deleteTarget.name}</strong> wird
                unwiderruflich geloescht. Alle Auto-Weiterleitungsregeln gehen verloren.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-text rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Loeschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
