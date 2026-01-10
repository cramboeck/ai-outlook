import { formatDistanceToNow } from '../../utils/date';
import { Paperclip, Star, Reply } from 'lucide-react';
import { CategoryBadge } from './CategoryBadge';
import type { Email } from '../../types';

interface EmailCardProps {
  email: Email;
  isSelected?: boolean;
  onSelect?: (email: Email) => void;
  onClassify?: (email: Email) => void;
  onReply?: (email: Email) => void;
}

export const EmailCard = ({ email, isSelected, onSelect, onClassify, onReply }: EmailCardProps) => {
  const isUncategorized = email.categories.length === 0;

  return (
    <div
      onClick={() => onSelect?.(email)}
      className={`
        email-item bg-white border rounded-lg p-4 cursor-pointer transition-all
        ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-gray-300'}
        ${!email.isRead ? 'border-l-4 border-l-primary' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Sender */}
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm truncate ${!email.isRead ? 'font-semibold text-text' : 'text-text-secondary'}`}>
              {email.from.emailAddress.name || email.from.emailAddress.address}
            </span>
            {email.importance === 'high' && (
              <Star className="w-4 h-4 text-warning fill-warning" />
            )}
            {email.hasAttachments && (
              <Paperclip className="w-4 h-4 text-text-secondary" />
            )}
          </div>

          {/* Subject */}
          <h3 className={`email-subject text-base truncate mb-1 ${!email.isRead ? 'font-medium text-text' : 'text-text'}`}>
            {email.subject || '(Kein Betreff)'}
          </h3>

          {/* Preview */}
          <p className="email-preview text-sm text-text-secondary line-clamp-2">
            {email.bodyPreview}
          </p>

          {/* Categories & Actions */}
          <div className="flex items-center gap-2 mt-3">
            {email.categories.map((cat) => (
              <CategoryBadge key={cat} category={cat} size="sm" />
            ))}
            {isUncategorized && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClassify?.(email);
                }}
                className="text-xs text-primary hover:text-primary-dark font-medium"
              >
                + Kategorisieren
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReply?.(email);
              }}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary font-medium ml-auto"
            >
              <Reply className="w-3 h-3" />
              KI-Antwort
            </button>
          </div>
        </div>

        {/* Time */}
        <div className="text-xs text-text-secondary whitespace-nowrap">
          {formatDistanceToNow(email.receivedDateTime)}
        </div>
      </div>
    </div>
  );
};
