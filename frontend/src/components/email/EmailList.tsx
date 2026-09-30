import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Filter } from 'lucide-react';
import { EmailCard } from './EmailCard';
import type { Email } from '../../types';
import { getEmailStatusBatch } from '../../services/emailStatusService';
import type { EmailStatus } from '../../services/emailStatusService';

interface EmailListProps {
  emails: Email[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onEmailSelect?: (email: Email) => void;
  onClassify?: (email: Email) => void;
  onReply?: (email: Email) => void;
  selectedEmailId?: string;
}

type FilterType = 'all' | 'uncategorized' | 'categorized' | 'action' | 'forwarded';

export const EmailList = ({
  emails,
  isLoading,
  onRefresh,
  onEmailSelect,
  onClassify,
  onReply,
  selectedEmailId,
}: EmailListProps) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [statuses, setStatuses] = useState<Record<string, EmailStatus>>({});

  // Batch-fetch workflow status for all currently-displayed emails. Runs
  // whenever the id list changes so switching folders or refetching inbox
  // refreshes indicators without extra trips when the list is unchanged.
  const emailIdsKey = useMemo(
    () => emails.map(e => e.id).join('|'),
    [emails]
  );
  useEffect(() => {
    if (emails.length === 0) {
      setStatuses({});
      return;
    }
    let cancelled = false;
    getEmailStatusBatch(emails.map(e => e.id))
      .then(data => { if (!cancelled) setStatuses(data); })
      .catch(() => { /* silent; badges simply stay empty */ });
    return () => { cancelled = true; };
  }, [emailIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEmails = emails.filter((email) => {
    if (filter === 'uncategorized') return email.categories.length === 0;
    if (filter === 'categorized') return email.categories.length > 0;
    if (filter === 'action') return statuses[email.id]?.hasAction === true;
    if (filter === 'forwarded') return statuses[email.id]?.forwarded === true;
    return true;
  });

  const uncategorizedCount = emails.filter((e) => e.categories.length === 0).length;
  const actionCount = emails.filter(e => statuses[e.id]?.hasAction === true).length;
  const forwardedCount = emails.filter(e => statuses[e.id]?.forwarded === true).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-secondary" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">Alle E-Mails ({emails.length})</option>
            <option value="uncategorized">Unkategorisiert ({uncategorizedCount})</option>
            <option value="categorized">Kategorisiert ({emails.length - uncategorizedCount})</option>
            <option value="action">Mit offener Aufgabe ({actionCount})</option>
            <option value="forwarded">Weitergeleitet ({forwardedCount})</option>
          </select>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {/* Email List */}
      {isLoading && emails.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredEmails.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <p>Keine E-Mails gefunden</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEmails.map((email) => (
            <EmailCard
              key={email.id}
              email={email}
              isSelected={email.id === selectedEmailId}
              onSelect={onEmailSelect}
              onClassify={onClassify}
              onReply={onReply}
              status={statuses[email.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
};
