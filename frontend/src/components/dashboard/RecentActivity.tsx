import { formatDistanceToNow } from '../../utils/date';
import { CategoryBadge } from '../email/CategoryBadge';
import type { Email } from '../../types';

interface RecentActivityProps {
  emails: Email[];
  maxItems?: number;
}

export const RecentActivity = ({ emails, maxItems = 5 }: RecentActivityProps) => {
  // Show recently categorized emails
  const recentlyCategorized = emails
    .filter((e) => e.categories.length > 0)
    .slice(0, maxItems);

  if (recentlyCategorized.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-text mb-4">Letzte Aktivitäten</h3>
        <p className="text-text-secondary text-sm">Noch keine kategorisierten E-Mails.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-semibold text-text">Letzte Aktivitäten</h3>
      </div>
      <div className="divide-y divide-border">
        {recentlyCategorized.map((email) => (
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
