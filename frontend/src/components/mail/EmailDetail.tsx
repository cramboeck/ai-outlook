import { useState, useEffect } from 'react';
import { sanitizeHtml } from '../../utils/sanitize';
import { QuickForwardMenu } from '../email/QuickForwardMenu';
import { EmailTimeline } from '../email/EmailTimeline';
import {
  X,
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Paperclip,
  Sparkles,
  ScanSearch,
  Loader2,
  User,
  Calendar,
  Star,
  Wand2,
} from 'lucide-react';
import type { Email } from '../../types';
import { getEmailWithBody, markEmailAsRead, deleteEmail } from '../../services/graphService';
import { FolderSuggestion } from './FolderSuggestion';

interface EmailDetailProps {
  email: Email;
  onClose: () => void;
  onReply: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onClassify?: (email: Email) => void;
  onAnalyze?: (email: Email) => void;
  onSuggestRule?: (email: Email) => void;
  isAnalyzing?: boolean;
  onDelete?: () => void;
  onMoved?: () => void;
  showFolderSuggestion?: boolean;
}

export const EmailDetail = ({
  email,
  onClose,
  onReply,
  onReplyAll,
  onForward,
  onClassify,
  onAnalyze,
  onSuggestRule,
  isAnalyzing = false,
  onDelete,
  onMoved,
  showFolderSuggestion = true,
}: EmailDetailProps) => {
  const [fullEmail, setFullEmail] = useState<Email | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFullEmail();
  }, [email.id]);

  const loadFullEmail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const emailWithBody = await getEmailWithBody(email.id);
      setFullEmail(emailWithBody);

      // Mark as read if unread
      if (!email.isRead) {
        await markEmailAsRead(email.id, true);
      }
    } catch (err) {
      setError('E-Mail konnte nicht geladen werden');
      console.error('Error loading email:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('E-Mail wirklich löschen?')) {
      try {
        await deleteEmail(email.id);
        onDelete?.();
        onClose();
      } catch (err) {
        console.error('Error deleting email:', err);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      'Dringend': 'bg-red-100 text-red-700',
      'Aktion erforderlich': 'bg-orange-100 text-orange-700',
      'Zur Info': 'bg-blue-100 text-blue-700',
      'Meeting': 'bg-purple-100 text-purple-700',
      'Finanzen': 'bg-green-100 text-green-700',
      'Intern': 'bg-gray-100 text-gray-700',
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onReply(fullEmail || email)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            <Reply className="w-4 h-4" />
            Antworten
          </button>
          {onReplyAll && (
            <button
              onClick={() => onReplyAll(fullEmail || email)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ReplyAll className="w-4 h-4" />
            </button>
          )}
          {onForward && (
            <button
              onClick={() => onForward(fullEmail || email)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Forward className="w-4 h-4" />
            </button>
          )}
          {onClassify && (
            <button
              onClick={() => onClassify(fullEmail || email)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              KI
            </button>
          )}
          {onSuggestRule && (
            <button
              onClick={() => onSuggestRule(fullEmail || email)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-violet-400 text-violet-600 rounded-lg hover:bg-violet-50 transition-colors"
              title="KI schlägt eine Regel vor, die ähnliche E-Mails zukünftig automatisch verarbeitet"
            >
              <Wand2 className="w-4 h-4" />
              Regel
            </button>
          )}
          <QuickForwardMenu email={fullEmail || email} />
          {onAnalyze && (
            <button
              onClick={() => onAnalyze(fullEmail || email)}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-emerald-500 text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
              title="Vollständige Analyse: Kategorie, Aufgaben & Dokumente erkennen"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
              Analysieren
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="p-2 text-text-secondary hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Löschen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Folder Suggestion - Only show for inbox emails that aren't categorized */}
      {showFolderSuggestion && !isLoading && fullEmail && email.categories.length === 0 && (
        <FolderSuggestion
          email={email}
          onMoved={() => {
            onMoved?.();
            onClose();
          }}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-red-500">
          {error}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Subject & Categories */}
          <div className="px-6 py-4 border-b border-border">
            <h1 className="text-xl font-semibold text-text mb-2">
              {email.subject || '(Kein Betreff)'}
            </h1>
            {email.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {email.categories.map((category) => (
                  <span
                    key={category}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(category)}`}
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sender Info */}
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text">
                      {email.from.emailAddress.name || email.from.emailAddress.address}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {email.from.emailAddress.address}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-text-secondary">
                    <Calendar className="w-4 h-4" />
                    {formatDate(email.receivedDateTime)}
                  </div>
                </div>
                <p className="text-sm text-text-secondary mt-1">
                  An: mich
                </p>
              </div>
            </div>

            {/* Attachments indicator */}
            {email.hasAttachments && (
              <div className="flex items-center gap-2 mt-3 text-sm text-text-secondary">
                <Paperclip className="w-4 h-4" />
                <span>Diese E-Mail enthält Anhänge</span>
              </div>
            )}

            {/* Importance */}
            {email.importance === 'high' && (
              <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
                <Star className="w-4 h-4 fill-current" />
                <span>Hohe Priorität</span>
              </div>
            )}
          </div>

          {/* Email Body */}
          <div className="px-6 py-4">
            {fullEmail?.body ? (
              fullEmail.body.contentType === 'html' ? (
                <div
                  className="prose prose-sm max-w-none email-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(fullEmail.body.content) }}
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm text-text">
                  {fullEmail.body.content}
                </pre>
              )
            ) : (
              <p className="text-text-secondary">{email.bodyPreview}</p>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="px-6 pb-6">
            <EmailTimeline emailId={email.id} />
          </div>
        </div>
      )}

      {/* Footer with quick reply */}
      <div className="border-t border-border p-4 bg-gray-50">
        <button
          onClick={() => onReply(fullEmail || email)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-border rounded-lg text-text-secondary hover:border-primary hover:text-primary transition-colors"
        >
          <Reply className="w-4 h-4" />
          Klicken zum Antworten...
        </button>
      </div>
    </div>
  );
};
