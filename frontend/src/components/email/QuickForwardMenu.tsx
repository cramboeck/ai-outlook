// Quick-Forward Menu
//
// Dropdown attached to a toolbar button in EmailDetail. Lists the tenant's
// active integrations and lets the user send the current email straight to
// one — bypassing the AI analysis pipeline. Useful when the user already
// knows where the email belongs (e.g. every invoice from this vendor goes
// to sevDesk + Paperless, no classification needed).

import { useEffect, useRef, useState } from 'react';
import {
  Send,
  ChevronDown,
  Loader2,
  Check,
  AlertCircle,
  FileText,
  Receipt,
  FolderOpen,
  Webhook,
  ExternalLink,
} from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import type { Email } from '../../types';
import {
  fetchActiveIntegrations,
  forwardEmailToIntegration,
} from '../../services/quickForwardService';
import type { Integration, ForwardOutcome } from '../../services/quickForwardService';
import { MetadataPrefillModal } from './MetadataPrefillModal';

// Integrations that want a metadata preview/confirm step before the forward
// is actually sent. Today: SharePoint (metadata_columns). Extend the set when
// other integrations grow user-editable schemas.
const INTEGRATIONS_WITH_PREFILL: Integration['type'][] = ['sharepoint'];

interface Props {
  email: Email;
}

const TYPE_ICON: Record<Integration['type'], React.ComponentType<{ className?: string }>> = {
  sharepoint: FolderOpen,
  sevdesk: Receipt,
  paperless: FileText,
  webhook: Webhook,
  datev: Receipt,
};

const TYPE_LABEL: Record<Integration['type'], string> = {
  sharepoint: 'SharePoint',
  sevdesk: 'sevDesk',
  paperless: 'Paperless',
  webhook: 'Webhook / Teams',
  datev: 'DATEV',
};

type RowState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'success'; outcome: ForwardOutcome }
  | { status: 'error'; message: string };

export const QuickForwardMenu = ({ email }: Props) => {
  const { instance, accounts } = useMsal();
  const [open, setOpen] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [pendingIntegration, setPendingIntegration] = useState<Integration | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // Load integrations lazily on first open
  useEffect(() => {
    if (!open || integrations !== null) return;
    setLoading(true);
    setLoadError(null);
    fetchActiveIntegrations()
      .then(setIntegrations)
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Laden fehlgeschlagen'))
      .finally(() => setLoading(false));
  }, [open, integrations]);

  // Reset row states when a different email is opened
  useEffect(() => {
    setRowStates({});
  }, [email.id]);

  // Actually dispatch the forward. `documentData` is optional — set when the
  // user went through the metadata prefill modal.
  const dispatchForward = async (
    integration: Integration,
    documentData?: Record<string, unknown>
  ) => {
    if (!accounts[0]) {
      setRowStates(prev => ({ ...prev, [integration.id]: { status: 'error', message: 'Nicht angemeldet' } }));
      return;
    }
    setRowStates(prev => ({ ...prev, [integration.id]: { status: 'sending' } }));
    const outcome = await forwardEmailToIntegration(
      instance,
      accounts[0],
      email,
      integration.id,
      integration.type,
      documentData
    );
    setRowStates(prev => ({
      ...prev,
      [integration.id]: outcome.success
        ? { status: 'success', outcome }
        : { status: 'error', message: outcome.message },
    }));
  };

  // Entry point — may open the prefill modal first.
  const handleForward = async (integration: Integration) => {
    if (INTEGRATIONS_WITH_PREFILL.includes(integration.type)) {
      setPendingIntegration(integration);
      return;
    }
    await dispatchForward(integration);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-gray-100 transition-colors"
        title="Direkt an eine konfigurierte Integration senden (ohne KI-Analyse)"
      >
        <Send className="w-4 h-4" />
        Schnell senden
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {pendingIntegration && (
        <MetadataPrefillModal
          integration={pendingIntegration}
          emailId={email.id}
          emailSubject={email.subject}
          onClose={() => setPendingIntegration(null)}
          onSubmit={(documentData) => {
            const target = pendingIntegration;
            setPendingIntegration(null);
            setOpen(false);
            void dispatchForward(target, documentData);
          }}
        />
      )}

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-gray-50">
            <div className="text-sm font-semibold text-text">Schnell weiterleiten</div>
            <div className="text-xs text-text-secondary">
              Direkt senden — ohne neue KI-Analyse. Bereits extrahierte Metadaten
              (Lieferant, Betrag, Rechnungsnr.) werden automatisch mitgesendet.
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8 text-text-secondary">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}

            {loadError && (
              <div className="flex items-start gap-2 m-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{loadError}</span>
              </div>
            )}

            {integrations && integrations.length === 0 && !loading && (
              <div className="p-6 text-center text-sm text-text-secondary">
                Keine aktiven Integrationen konfiguriert.
                <div className="mt-2">
                  <a href="/integrations" className="text-primary hover:underline">
                    Jetzt einrichten →
                  </a>
                </div>
              </div>
            )}

            {integrations && integrations.map(integration => {
              const Icon = TYPE_ICON[integration.type] ?? FileText;
              const state = rowStates[integration.id] ?? { status: 'idle' as const };
              return (
                <div key={integration.id} className="border-b border-border last:border-b-0">
                  <button
                    onClick={() => state.status === 'idle' && handleForward(integration)}
                    disabled={state.status === 'sending' || state.status === 'success'}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left disabled:cursor-not-allowed"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text truncate">{integration.name}</div>
                      <div className="text-xs text-text-secondary">{TYPE_LABEL[integration.type]}</div>
                    </div>
                    <div className="flex-shrink-0">
                      {state.status === 'idle' && <Send className="w-4 h-4 text-text-secondary" />}
                      {state.status === 'sending' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                      {state.status === 'success' && <Check className="w-4 h-4 text-emerald-600" />}
                      {state.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                    </div>
                  </button>

                  {/* Status detail row */}
                  {state.status === 'success' && (
                    <div className="px-4 py-2 bg-emerald-50 border-t border-emerald-100 text-xs text-emerald-800 flex items-center justify-between gap-2">
                      <span className="truncate">{state.outcome.message}</span>
                      {state.outcome.file_url && (
                        <a
                          href={state.outcome.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium flex-shrink-0"
                        >
                          Öffnen <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                  {state.status === 'error' && (
                    <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-800">
                      {state.message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
