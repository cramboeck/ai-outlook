import { useState } from 'react';
import { X, Sparkles, Loader2, Check, AlertTriangle } from 'lucide-react';
import { CategoryBadge } from '../email/CategoryBadge';
import type { Email, BatchClassificationResult } from '../../types';

interface BatchClassifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  emails: Email[];
  onClassify: (emails: Email[]) => Promise<BatchClassificationResult>;
  onApply: (updates: Array<{ id: string; categories: string[] }>) => Promise<void>;
}

export const BatchClassifyModal = ({
  isOpen,
  onClose,
  emails,
  onClassify,
  onApply,
}: BatchClassifyModalProps) => {
  const [step, setStep] = useState<'select' | 'classifying' | 'review' | 'applying'>('select');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<BatchClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectAll = () => {
    if (selectedEmails.size === emails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(emails.map((e) => e.id)));
    }
  };

  const handleToggleEmail = (id: string) => {
    const newSelection = new Set(selectedEmails);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedEmails(newSelection);
  };

  const handleClassify = async () => {
    setStep('classifying');
    setError(null);

    try {
      const emailsToClassify = emails.filter((e) => selectedEmails.has(e.id));
      const result = await onClassify(emailsToClassify);
      setResults(result);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Klassifizierung fehlgeschlagen');
      setStep('select');
    }
  };

  const handleApply = async () => {
    if (!results) return;

    setStep('applying');
    try {
      const updates = results.results.map((r) => ({
        id: r.id,
        categories: [r.category],
      }));
      await onApply(updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anwenden fehlgeschlagen');
      setStep('review');
    }
  };

  const handleClose = () => {
    setStep('select');
    setSelectedEmails(new Set());
    setResults(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">
            {step === 'select' && 'E-Mails auswählen'}
            {step === 'classifying' && 'Klassifiziere...'}
            {step === 'review' && 'Ergebnisse prüfen'}
            {step === 'applying' && 'Wende an...'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="flex items-center gap-2 p-4 mb-4 bg-error/10 text-error rounded-lg">
              <AlertTriangle className="w-5 h-5" />
              {error}
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-primary hover:text-primary-dark"
                >
                  {selectedEmails.size === emails.length ? 'Keine auswählen' : 'Alle auswählen'}
                </button>
                <span className="text-sm text-text-secondary">
                  {selectedEmails.size} von {emails.length} ausgewählt
                </span>
              </div>

              {emails.map((email) => (
                <label
                  key={email.id}
                  className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedEmails.has(email.id)}
                    onChange={() => handleToggleEmail(email.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">
                      {email.from.emailAddress.name || email.from.emailAddress.address}
                    </p>
                    <p className="text-sm text-text truncate">{email.subject}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === 'classifying' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-text-secondary">Klassifiziere {selectedEmails.size} E-Mails...</p>
            </div>
          )}

          {step === 'review' && results && (
            <div className="space-y-3">
              <div className="text-sm text-text-secondary mb-4">
                {results.results.length} E-Mails klassifiziert in {results.processingTimeMs}ms
              </div>

              {results.results.map((result) => {
                const email = emails.find((e) => e.id === result.id);
                return (
                  <div
                    key={result.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg"
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-sm font-medium text-text truncate">
                        {email?.subject || 'Unbekannt'}
                      </p>
                      <p className="text-xs text-text-secondary truncate">{result.reasoning}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={result.category} size="sm" />
                      <span className="text-xs text-text-secondary">
                        {Math.round(result.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 'applying' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-text-secondary">Wende Kategorien an...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          {step === 'select' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-text-secondary hover:text-text hover:bg-gray-100 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleClassify}
                disabled={selectedEmails.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {selectedEmails.size} E-Mails klassifizieren
              </button>
            </>
          )}

          {step === 'review' && (
            <>
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 text-text-secondary hover:text-text hover:bg-gray-100 rounded-lg transition-colors"
              >
                Zurück
              </button>
              <button
                onClick={handleApply}
                className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-lg hover:bg-success/90 transition-colors"
              >
                <Check className="w-4 h-4" />
                Alle anwenden
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
