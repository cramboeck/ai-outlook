// Metadata Prefill Modal
//
// Opens before a Quick-Forward when the target integration has a user-editable
// metadata schema (today: SharePoint's metadata_columns). Shows every column
// as an input, prefills the fields that a prior AI run already extracted
// (vendor, amount, invoiceNumber, …), leaves user-only fields (customer,
// project, costCenter) empty for manual entry.
//
// Submit hands the merged document_data back to the caller, which passes it
// straight to the /forward endpoint — where it gets mapped onto SharePoint
// columns via the integration's metadata_columns config.

import { useEffect, useState } from 'react';
import { X, Loader2, Send, Sparkles, AlertCircle } from 'lucide-react';
import { getForwardPrefill } from '../../services/quickForwardService';
import type { Integration } from '../../services/quickForwardService';

interface Props {
  integration: Integration;
  emailId: string;
  emailSubject: string;
  onSubmit: (documentData: Record<string, unknown>) => void;
  onClose: () => void;
}

// Human-readable labels for fields the AI usually extracts. Used when the
// integration's column mapping uses one of these standard keys.
const FIELD_HINT: Record<string, string> = {
  vendor: 'Lieferant / Absender',
  amount: 'Betrag',
  currency: 'Währung',
  invoiceNumber: 'Rechnungsnummer',
  orderNumber: 'Bestellnummer',
  date: 'Datum',
  dueDate: 'Fälligkeit',
  iban: 'IBAN',
  taxRate: 'USt-Satz (%)',
  customer: 'Kunde',
  project: 'Projekt',
  costCenter: 'Kostenstelle',
};

export const MetadataPrefillModal = ({
  integration,
  emailId,
  emailSubject,
  onSubmit,
  onClose,
}: Props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getForwardPrefill(integration.id, emailId)
      .then(data => {
        if (cancelled) return;
        setColumns(data.metadata_columns ?? {});
        // Convert prefilled values to strings for form inputs
        const initial: Record<string, string> = {};
        const fromAi: Record<string, string> = {};
        for (const key of Object.keys(data.metadata_columns ?? {})) {
          const raw = data.prefill?.[key];
          const asStr = raw == null ? '' : String(raw);
          initial[key] = asStr;
          if (asStr) fromAi[key] = asStr;
        }
        setValues(initial);
        setPrefilled(fromAi);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [integration.id, emailId]);

  const columnKeys = Object.keys(columns);
  const hasSchema = columnKeys.length > 0;

  const handleSubmit = () => {
    // Strip empty values so the backend mapper doesn't overwrite existing
    // columns with blanks.
    const payload: Record<string, unknown> = {};
    for (const key of columnKeys) {
      const v = (values[key] ?? '').trim();
      if (v.length > 0) payload[key] = v;
    }
    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Metadaten ergänzen</h2>
              <p className="text-sm text-text-secondary truncate max-w-md">
                An <strong>{integration.name}</strong> · {emailSubject}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/40 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-text-secondary">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && !hasSchema && (
            <div className="py-6 text-center text-sm text-text-secondary">
              Für diese Integration sind keine Metadaten-Spalten konfiguriert.
              <br />
              Klick auf „Senden" schickt nur die Datei.
            </div>
          )}

          {!loading && !error && hasSchema && (
            <>
              <div className="text-xs text-text-secondary">
                <Sparkles className="w-3 h-3 inline mr-1 text-primary" />
                Mit einem Funken-Symbol markierte Felder wurden bereits von der KI extrahiert. Alle anderen bitte manuell ergänzen.
              </div>
              {columnKeys.map(key => {
                const columnLabel = columns[key];
                const hint = FIELD_HINT[key];
                const wasAutoFilled = prefilled[key] !== undefined;
                return (
                  <div key={key}>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1">
                      <span>{columnLabel}</span>
                      {wasAutoFilled && <Sparkles className="w-3 h-3 text-primary" />}
                      {hint && hint !== columnLabel && (
                        <span className="text-text-secondary/60">· {hint}</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={values[key] ?? ''}
                      onChange={(e) => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                      placeholder={wasAutoFilled ? '' : 'Manuell eintragen…'}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-secondary hover:text-text hover:bg-gray-200 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !!error}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Senden
          </button>
        </div>
      </div>
    </div>
  );
};
