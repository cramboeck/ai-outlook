import { useState } from 'react';
import { Reply, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from '../../utils/date';
import { sanitizeHtml } from '../../utils/sanitize';
import { CategoryBadge } from '../email/CategoryBadge';
import { ReplyModal } from '../email/ReplyModal';
import { getEmailWithBody, replyToEmail, deleteEmail } from '../../services/graphService';
import type { Email } from '../../types';

interface RecentActivityProps {
  emails: Email[];
  maxItems?: number;
  title?: string;
  onRefresh?: () => void;
}

export const RecentActivity = ({ emails, maxItems = 10, title, onRefresh }: RecentActivityProps) => {
  const displayTitle = title || 'Letzte Aktivitäten';
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [fullEmail, setFullEmail] = useState<Email | null>(null);
  const [isLoadingBody, setIsLoadingBody] = useState(false);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [replyEmail, setReplyEmail] = useState<Email | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Show recently categorized emails (or all if filtered by smart view)
  const displayEmails = title
    ? emails.slice(0, maxItems) // Zeige alle wenn gefiltert
    : emails.filter((e) => e.categories.length > 0).slice(0, maxItems);

  const handleEmailClick = async (email: Email) => {
    if (expandedEmailId === email.id) {
      setExpandedEmailId(null);
      setFullEmail(null);
      return;
    }

    setExpandedEmailId(email.id);
    setIsLoadingBody(true);
    try {
      const full = await getEmailWithBody(email.id);
      setFullEmail(full);
    } catch (err) {
      console.error('Failed to load email body:', err);
    } finally {
      setIsLoadingBody(false);
    }
  };

  const handleReplyClick = async (email: Email, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const full = fullEmail?.id === email.id ? fullEmail : await getEmailWithBody(email.id);
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
      // Fallback to mailto
      const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/<[^>]*>/g, ''))}`;
      window.open(mailtoUrl, '_blank');
    }
  };

  const handleDeleteClick = async (email: Email, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`E-Mail "${email.subject}" wirklich löschen?`)) return;

    setDeletingId(email.id);
    try {
      await deleteEmail(email.id);
      if (expandedEmailId === email.id) {
        setExpandedEmailId(null);
        setFullEmail(null);
      }
      onRefresh?.();
    } catch (err) {
      console.error('Failed to delete email:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (displayEmails.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-text mb-4">{displayTitle}</h3>
        <p className="text-text-secondary text-sm">Keine E-Mails gefunden.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-xl border border-border">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text">{displayTitle}</h3>
          <span className="text-sm text-text-secondary">{displayEmails.length} E-Mails</span>
        </div>
        <div className="divide-y divide-border">
          {displayEmails.map((email) => (
            <div key={email.id}>
              {/* Email Row */}
              <div
                className={`px-6 py-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                  expandedEmailId === email.id ? 'bg-gray-50' : ''
                }`}
                onClick={() => handleEmailClick(email)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm truncate ${!email.isRead ? 'font-semibold text-text' : 'font-medium text-text'}`}>
                      {email.subject || '(Kein Betreff)'}
                    </p>
                    {email.hasAttachments && (
                      <span className="text-xs text-text-secondary">📎</span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary truncate">
                    {email.from.emailAddress.name || email.from.emailAddress.address}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {email.categories[0] && (
                    <CategoryBadge category={email.categories[0]} size="sm" />
                  )}
                  <span className="text-xs text-text-secondary whitespace-nowrap">
                    {formatDistanceToNow(email.receivedDateTime)}
                  </span>
                  {expandedEmailId === email.id ? (
                    <ChevronUp className="w-4 h-4 text-text-secondary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-secondary" />
                  )}
                </div>
              </div>

              {/* Expanded Email Detail */}
              {expandedEmailId === email.id && (
                <div className="px-6 py-4 bg-gray-50 border-t border-border">
                  {isLoadingBody ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                  ) : fullEmail ? (
                    <div>
                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 mb-4">
                        <button
                          onClick={(e) => handleReplyClick(email, e)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors"
                        >
                          <Reply className="w-4 h-4" />
                          Antworten
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(email, e)}
                          disabled={deletingId === email.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {deletingId === email.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          Löschen
                        </button>
                      </div>

                      {/* Email Body Preview */}
                      <div className="bg-card rounded-lg border border-border p-4 max-h-64 overflow-y-auto">
                        <div
                          className="email-content text-sm text-text"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(fullEmail.body?.content || fullEmail.bodyPreview || ''),
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-text-secondary text-sm">E-Mail konnte nicht geladen werden.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
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
