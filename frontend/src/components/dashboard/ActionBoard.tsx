import { useState } from 'react';
import { Loader2, Sparkles, Calendar, ExternalLink } from 'lucide-react';
import type { Email } from '../../types';
import { extractActions, getPriorityColor, getTypeIcon, getTypeLabel } from '../../services/actionService';
import type { ExtractedAction } from '../../services/actionService';
import { prepareBodyForClassification } from '../../services/classifyService';

interface ActionBoardProps {
  emails: Email[];
  onEmailClick?: (emailId: string) => void;
}

export const ActionBoard = ({ emails, onEmailClick }: ActionBoardProps) => {
  const [actions, setActions] = useState<ExtractedAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasExtracted, setHasExtracted] = useState(false);

  const handleExtractActions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Nur kategorisierte E-Mails mit "Aktion erforderlich", "Dringend", "Meeting", "Finanzen"
      const relevantEmails = emails.filter((e) =>
        e.categories.some((c) =>
          ['Aktion erforderlich', 'Dringend', 'Meeting', 'Finanzen'].includes(c)
        )
      );

      if (relevantEmails.length === 0) {
        setActions([]);
        setHasExtracted(true);
        return;
      }

      // Max 20 Emails
      const emailsToProcess = relevantEmails.slice(0, 20).map((e) => ({
        id: e.id,
        subject: e.subject,
        body: prepareBodyForClassification(
          e.body?.content || e.bodyPreview,
          e.body?.contentType || 'text'
        ),
        sender: e.from.emailAddress.address,
        receivedDateTime: e.receivedDateTime,
      }));

      const result = await extractActions(emailsToProcess);
      setActions(result.actions);
      setHasExtracted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Extrahieren');
    } finally {
      setIsLoading(false);
    }
  };

  // Nicht genug relevante Emails
  const relevantCount = emails.filter((e) =>
    e.categories.some((c) =>
      ['Aktion erforderlich', 'Dringend', 'Meeting', 'Finanzen'].includes(c)
    )
  ).length;

  if (relevantCount === 0 && !hasExtracted) {
    return (
      <div className="bg-white border border-border rounded-xl p-6 text-center">
        <span className="text-4xl mb-3 block">📋</span>
        <h3 className="font-semibold text-text mb-1">Keine aktionsrelevanten Mails</h3>
        <p className="text-sm text-text-secondary">
          Kategorisiere zuerst E-Mails, um Aktionen zu extrahieren
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <span>📋</span> Action Board
          </h2>
          <p className="text-sm text-text-secondary">
            {hasExtracted
              ? `${actions.length} Aktionen erkannt`
              : `${relevantCount} relevante Mails`}
          </p>
        </div>
        {!hasExtracted && (
          <button
            onClick={handleExtractActions}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Aktionen erkennen
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 text-sm">{error}</div>
      )}

      {isLoading ? (
        <div className="p-8 text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-text-secondary">Analysiere E-Mails mit KI...</p>
        </div>
      ) : hasExtracted && actions.length === 0 ? (
        <div className="p-8 text-center">
          <span className="text-4xl mb-3 block">✨</span>
          <h3 className="font-semibold text-text">Keine Aktionen gefunden</h3>
          <p className="text-sm text-text-secondary">
            Die analysierten E-Mails enthalten keine konkreten Handlungsaufforderungen
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {actions.map((action, index) => {
            const email = emails.find((e) => e.id === action.emailId);
            return (
              <div
                key={index}
                className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onEmailClick?.(action.emailId)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getTypeIcon(action.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(
                          action.priority
                        )}`}
                      >
                        {action.priority === 'high'
                          ? 'Hoch'
                          : action.priority === 'medium'
                          ? 'Mittel'
                          : 'Niedrig'}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {getTypeLabel(action.type)}
                      </span>
                    </div>
                    <p className="font-medium text-text">{action.action}</p>
                    {email && (
                      <p className="text-sm text-text-secondary truncate mt-1">
                        Von: {email.from.emailAddress.name} - {email.subject}
                      </p>
                    )}
                    {action.deadline && (
                      <div className="flex items-center gap-1 mt-2 text-sm text-orange-600">
                        <Calendar className="w-3 h-3" />
                        <span>Deadline: {new Date(action.deadline).toLocaleDateString('de-DE')}</span>
                      </div>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-text-secondary flex-shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
