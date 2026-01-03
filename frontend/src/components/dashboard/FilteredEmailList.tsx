import { X } from 'lucide-react';
import { CategoryBadge } from '../email/CategoryBadge';
import { formatDistanceToNow } from '../../utils/date';
import type { Email, SmartView } from '../../types';

interface FilteredEmailListProps {
  emails: Email[];
  view: SmartView;
  onClose: () => void;
  onEmailClick?: (email: Email) => void;
}

export const FilteredEmailList = ({
  emails,
  view,
  onClose,
  onEmailClick,
}: FilteredEmailListProps) => {
  return (
    <div className="bg-white border-2 border-primary/30 rounded-xl overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-6 py-4 bg-primary/5 border-b border-primary/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{view.icon}</span>
          <div>
            <h3 className="text-lg font-semibold text-text">{view.name}</h3>
            <p className="text-sm text-text-secondary">{emails.length} E-Mails</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-text-secondary" />
        </button>
      </div>

      {/* Email List */}
      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {emails.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            Keine E-Mails in dieser Ansicht
          </div>
        ) : (
          emails.slice(0, 20).map((email) => (
            <div
              key={email.id}
              onClick={() => onEmailClick?.(email)}
              className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {!email.isRead && (
                      <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                    )}
                    <p className="font-medium text-text truncate">{email.subject}</p>
                  </div>
                  <p className="text-sm text-text-secondary truncate">
                    {email.from.emailAddress.name || email.from.emailAddress.address}
                  </p>
                  <p className="text-xs text-text-secondary mt-1 line-clamp-1">
                    {email.bodyPreview}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="text-xs text-text-secondary whitespace-nowrap">
                    {formatDistanceToNow(email.receivedDateTime)}
                  </span>
                  {email.categories.length > 0 && (
                    <CategoryBadge category={email.categories[0]} size="sm" />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {emails.length > 20 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-border text-center">
          <span className="text-sm text-text-secondary">
            + {emails.length - 20} weitere E-Mails
          </span>
        </div>
      )}
    </div>
  );
};
