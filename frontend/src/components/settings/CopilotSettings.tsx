// Copilot Premium Settings
//
// Controls the has_copilot_license flag for the current tenant and shows
// backend capability info (whether the On-Behalf-Of flow is configured).
// The actual draft generation UX lives in ReplyModal; this surface is
// purely for enabling the feature once the infrastructure is in place.

import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { api } from '../../services/apiClient';

interface TenantMeResponse {
  tenant: {
    id: string;
    has_copilot_license?: boolean;
  };
  capabilities?: {
    copilotObo?: boolean;
  };
}

export const CopilotSettings = () => {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [oboConfigured, setOboConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<TenantMeResponse>('/tenants/me')
      .then(data => {
        if (cancelled) return;
        setEnabled(!!data.tenant?.has_copilot_license);
        setOboConfigured(!!data.capabilities?.copilotObo);
      })
      .catch(() => {/* silent; fallback to disabled */})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const toggle = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const next = !enabled;
      await api.patch('/tenants/copilot-license', { enabled: next });
      setEnabled(next);
      setMessage({
        type: 'success',
        text: next
          ? 'Copilot aktiviert. Context-Aware Drafts werden ab sofort erzeugt.'
          : 'Copilot deaktiviert. Es werden keine neuen Context-Drafts mehr generiert.',
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Umschalten fehlgeschlagen',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text flex items-center gap-2">
              Microsoft 365 Copilot
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-semibold uppercase tracking-wide">
                Premium
              </span>
            </h2>
            <p className="text-sm text-text-secondary">
              Context-Aware Drafts mit Teams / SharePoint / OneDrive Grounding
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Lade Einstellungen…
          </div>
        ) : !oboConfigured ? (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Backend noch nicht konfiguriert.</strong>
              <p className="mt-1">
                Es fehlen <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">AZURE_CLIENT_SECRET</code> und{' '}
                <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">AZURE_TENANT_ID</code> im Backend.
                Siehe <code className="font-mono text-xs">SETUP.md</code> für die Einrichtung.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-text">
                  Context-Aware Drafts aktivieren
                </label>
                <p className="text-xs text-text-secondary mt-1">
                  Wenn aktiviert, werden für E-Mails, die eine Antwort erfordern,
                  zusätzlich zum Standard-Entwurf auch Drafts mit Teams- und
                  SharePoint-Kontext erzeugt. Benötigt eine M365 Copilot Lizenz
                  für die Nutzer dieses Tenants.
                </p>
              </div>
              <button
                onClick={toggle}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  enabled ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-gray-300'
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {message && (
              <div
                className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                  message.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {message.type === 'success' ? (
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {enabled && (
              <div className="pt-2 border-t border-border text-xs text-text-secondary space-y-1">
                <p>
                  <strong>So funktioniert's:</strong> Bei E-Mails mit Handlungsbedarf
                  ruft MailSort im Namen des Users <code className="font-mono bg-gray-100 px-1 rounded">/copilot/retrieval</code> auf
                  (OBO-Flow) und synthetisiert daraus einen Entwurf mit Quellenangaben.
                </p>
                <p>Sichtbar beim Klick auf „Antworten" — als Indigo-Panel im Reply-Modal.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
