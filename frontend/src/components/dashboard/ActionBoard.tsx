import { useState, useEffect, useCallback } from 'react';
import { Loader2, Sparkles, Calendar, Reply, Trash2, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { Email } from '../../types';
import { extractActions, getPriorityColor, getTypeIcon, getTypeLabel } from '../../services/actionService';
import type { ExtractedAction } from '../../services/actionService';
import { prepareBodyForClassification } from '../../services/classifyService';
import { getEmailWithBody, replyToEmail, deleteEmail } from '../../services/graphService';
import { ReplyModal } from '../email/ReplyModal';
import {
  getCachedActions,
  cacheActions,
  removeEmailFromActionCache,
} from '../../services/actionCacheService';

interface ActionBoardProps {
  emails: Email[];
  onEmailClick?: (emailId: string) => void;
  onRefresh?: () => void;
}

export const ActionBoard = ({ emails, onRefresh }: ActionBoardProps) => {
  const [actions, setActions] = useState<ExtractedAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasExtracted, setHasExtracted] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);

  // Email detail state
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [emailCache, setEmailCache] = useState<Map<string, Email>>(new Map());
  const [isLoadingBody, setIsLoadingBody] = useState(false);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [replyEmail, setReplyEmail] = useState<Email | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Get relevant emails
  const relevantEmails = emails.filter((e) =>
    e.categories.some((c) =>
      ['Aktion erforderlich', 'Dringend', 'Meeting', 'Finanzen'].includes(c)
    )
  );
  const relevantEmailIds = relevantEmails.map((e) => e.id);

  // Load cached actions on mount/when emails change
  useEffect(() => {
    if (relevantEmailIds.length === 0) return;

    const cached = getCachedActions(relevantEmailIds);
    if (cached && cached.length > 0) {
      // Filter out actions for emails that no longer exist
      const validActions = cached.filter((a) =>
        emails.some((e) => e.id === a.emailId)
      );
      if (validActions.length > 0) {
        setActions(validActions);
        setHasExtracted(true);
        setIsFromCache(true);
      }
    }
  }, [emails.length]); // Re-check when email count changes

  const handleExtractActions = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    setIsFromCache(false);

    try {
      if (relevantEmails.length === 0) {
        setActions([]);
        setHasExtracted(true);
        return;
      }

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedActions(relevantEmailIds);
        if (cached && cached.length > 0) {
          setActions(cached);
          setHasExtracted(true);
          setIsFromCache(true);
          return;
        }
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

      // Cache the results
      cacheActions(relevantEmailIds, result.actions);

      setActions(result.actions);
      setHasExtracted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Extrahieren');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshActions = () => {
    handleExtractActions(true);
  };

  const handleActionClick = useCallback(async (action: ExtractedAction) => {
    if (expandedEmailId === action.emailId) {
      setExpandedEmailId(null);
      return;
    }

    setExpandedEmailId(action.emailId);

    // Check if already cached
    if (emailCache.has(action.emailId)) {
      return;
    }

    setIsLoadingBody(true);
    try {
      const full = await getEmailWithBody(action.emailId);
      setEmailCache((prev) => new Map(prev).set(action.emailId, full));
    } catch (err) {
      console.error('Failed to load email body:', err);
    } finally {
      setIsLoadingBody(false);
    }
  }, [expandedEmailId, emailCache]);

  const getFullEmail = (emailId: string): Email | null => {
    return emailCache.get(emailId) || null;
  };

  const handleReplyClick = async (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let full = emailCache.get(emailId);
      if (!full) {
        full = await getEmailWithBody(emailId);
        setEmailCache((prev) => new Map(prev).set(emailId, full!));
      }
      setReplyEmail(full);
      setIsReplyModalOpen(true);
    } catch (err) {
      console.error('Failed to load email for reply:', err);
    }
  };

  const handleSendReply = async (to: string, subject: string, body: string) => {
    if (!replyEmail) return;
    try {
      await replyToEmail(replyEmail.id, body, false);
      setIsReplyModalOpen(false);
      setReplyEmail(null);
      onRefresh?.();
    } catch (err) {
      console.error('Failed to send reply:', err);
      const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/<[^>]*>/g, ''))}`;
      window.open(mailtoUrl, '_blank');
    }
  };

  const handleDeleteClick = async (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const email = emails.find((em) => em.id === emailId);
    if (!confirm(`E-Mail "${email?.subject}" wirklich löschen?`)) return;

    setDeletingId(emailId);
    try {
      await deleteEmail(emailId);
      // Remove action from list and cache
      setActions((prev) => prev.filter((a) => a.emailId !== emailId));
      removeEmailFromActionCache(emailId);
      if (expandedEmailId === emailId) {
        setExpandedEmailId(null);
      }
      // Remove from email cache
      setEmailCache((prev) => {
        const next = new Map(prev);
        next.delete(emailId);
        return next;
      });
      onRefresh?.();
    } catch (err) {
      console.error('Failed to delete email:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (relevantEmails.length === 0 && !hasExtracted) {
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
    <>
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text flex items-center gap-2">
              <span>📋</span> Action Board
            </h2>
            <p className="text-sm text-text-secondary">
              {hasExtracted
                ? `${actions.length} Aktionen${isFromCache ? ' (gecached)' : ''}`
                : `${relevantEmails.length} relevante Mails`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasExtracted && (
              <button
                onClick={handleRefreshActions}
                disabled={isLoading}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Aktionen neu laden"
              >
                <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            {!hasExtracted && (
              <button
                onClick={() => handleExtractActions(false)}
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
              const isExpanded = expandedEmailId === action.emailId;
              const fullEmail = getFullEmail(action.emailId);

              return (
                <div key={`${action.emailId}-${index}`}>
                  <div
                    className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                      isExpanded ? 'bg-gray-50' : ''
                    }`}
                    onClick={() => handleActionClick(action)}
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
                            Von: {email.from.emailAddress.name || email.from.emailAddress.address} - {email.subject}
                          </p>
                        )}
                        {action.deadline && (
                          <div className="flex items-center gap-1 mt-2 text-sm text-orange-600">
                            <Calendar className="w-3 h-3" />
                            <span>Deadline: {new Date(action.deadline).toLocaleDateString('de-DE')}</span>
                          </div>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-text-secondary flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-text-secondary flex-shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Email Detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-gray-50">
                      {isLoadingBody && !fullEmail ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 text-primary animate-spin" />
                        </div>
                      ) : fullEmail ? (
                        <div>
                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 mb-4">
                            <button
                              onClick={(e) => handleReplyClick(action.emailId, e)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors"
                            >
                              <Reply className="w-4 h-4" />
                              Antworten
                            </button>
                            <button
                              onClick={(e) => handleDeleteClick(action.emailId, e)}
                              disabled={deletingId === action.emailId}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              {deletingId === action.emailId ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                              Löschen
                            </button>
                          </div>

                          {/* Email Body Preview */}
                          <div className="bg-white rounded-lg border border-border p-4 max-h-64 overflow-y-auto">
                            <div
                              className="email-content text-sm text-text"
                              dangerouslySetInnerHTML={{
                                __html: fullEmail.body?.content || fullEmail.bodyPreview || 'Kein Inhalt verfügbar',
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="py-4">
                          <p className="text-text-secondary text-sm">E-Mail konnte nicht geladen werden.</p>
                          <button
                            onClick={() => handleActionClick(action)}
                            className="text-sm text-primary hover:text-primary-dark mt-2"
                          >
                            Erneut versuchen
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {replyEmail && (
        <ReplyModal
          isOpen={isReplyModalOpen}
          onClose={() => {
            setIsReplyModalOpen(false);
            setReplyEmail(null);
          }}
          email={replyEmail}
          onSendReply={handleSendReply}
        />
      )}
    </>
  );
};
