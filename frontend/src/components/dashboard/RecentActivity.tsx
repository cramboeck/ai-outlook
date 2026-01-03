import { formatDistanceToNow } from '../../utils/date';
import { CategoryBadge } from '../email/CategoryBadge';
import type { Email } from '../../types';

interface RecentActivityProps {
  emails: Email[];
  maxItems?: number;
  title?: string;
}

export const RecentActivity = ({ emails, maxItems = 5, title }: RecentActivityProps) => {
  const displayTitle = title || 'Letzte Aktivitäten';

  // Show recently categorized emails (or all if filtered by smart view)
  const displayEmails = title
    ? emails.slice(0, maxItems) // Zeige alle wenn gefiltert
    : emails.filter((e) => e.categories.length > 0).slice(0, maxItems);

  if (displayEmails.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-text mb-4">{displayTitle}</h3>
        <p className="text-text-secondary text-sm">Keine E-Mails gefunden.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-semibold text-text">{displayTitle}</h3>
      </div>
      <div className="divide-y divide-border">
        {displayEmails.map((email) => (
          <div key={email.id} className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{email.subject}</p>
              <p className="text-xs text-text-secondary">
                {email.from.emailAddress.name || email.from.emailAddress.address}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <CategoryBadge category={email.categories[0]} size="sm" />
              <span className="text-xs text-text-secondary whitespace-nowrap">
                {formatDistanceToNow(email.receivedDateTime)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
