import { useState } from 'react';
import { X, Send, Loader2, Paperclip, Sparkles } from 'lucide-react';
import { sendEmail, replyToEmail } from '../../services/graphService';
import type { Email } from '../../types';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  replyTo?: Email;
  replyAll?: boolean;
  onSent?: () => void;
}

export const ComposeModal = ({
  isOpen,
  onClose,
  replyTo,
  replyAll = false,
  onSent,
}: ComposeModalProps) => {
  const [to, setTo] = useState(replyTo ? replyTo.from.emailAddress.address : '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` : ''
  );
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCc, setShowCc] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!to.trim()) {
      setError('Bitte gib einen Empfänger ein');
      return;
    }

    if (!subject.trim()) {
      setError('Bitte gib einen Betreff ein');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      if (replyTo) {
        // Reply to existing email
        await replyToEmail(replyTo.id, body, replyAll);
      } else {
        // New email
        const toAddresses = to.split(/[,;]/).map((e) => e.trim()).filter(Boolean);
        const ccAddresses = cc ? cc.split(/[,;]/).map((e) => e.trim()).filter(Boolean) : undefined;

        await sendEmail(toAddresses, subject, body, {
          cc: ccAddresses,
          bodyType: 'html',
        });
      }

      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (body.trim() || subject.trim()) {
      if (confirm('E-Mail verwerfen?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {replyTo ? (replyAll ? 'Allen antworten' : 'Antworten') : 'Neue E-Mail'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* To */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-sm font-medium text-text-secondary">An:</label>
              {!showCc && (
                <button
                  onClick={() => setShowCc(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Cc hinzufügen
                </button>
              )}
            </div>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="empfaenger@beispiel.de"
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={!!replyTo}
            />
          </div>

          {/* Cc */}
          {showCc && (
            <div>
              <label className="text-sm font-medium text-text-secondary">Cc:</label>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@beispiel.de"
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
              />
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="text-sm font-medium text-text-secondary">Betreff:</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Betreff eingeben..."
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
            />
          </div>

          {/* Body */}
          <div className="flex-1">
            <label className="text-sm font-medium text-text-secondary">Nachricht:</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Deine Nachricht..."
              rows={12}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1 resize-none font-mono text-sm"
            />
          </div>

          {/* Original message for reply */}
          {replyTo && (
            <div className="border-t border-border pt-4">
              <p className="text-xs text-text-secondary mb-2">
                Am {new Date(replyTo.receivedDateTime).toLocaleString('de-DE')} schrieb{' '}
                {replyTo.from.emailAddress.name}:
              </p>
              <div className="text-sm text-text-secondary bg-gray-50 p-3 rounded-lg border-l-4 border-gray-300 max-h-32 overflow-y-auto">
                {replyTo.bodyPreview}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              disabled
              className="p-2 text-text-secondary hover:bg-gray-100 rounded-lg transition-colors opacity-50 cursor-not-allowed"
              title="Anhänge (bald verfügbar)"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              disabled
              className="p-2 text-text-secondary hover:bg-gray-100 rounded-lg transition-colors opacity-50 cursor-not-allowed"
              title="KI-Unterstützung (bald verfügbar)"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-text-secondary hover:bg-gray-100 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || !to.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Senden...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Senden
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
