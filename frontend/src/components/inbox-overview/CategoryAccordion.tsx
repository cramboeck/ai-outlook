import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import type { CategoryBucket } from '../../services/inboxCategorizer';
import { formatDate } from '../../utils/inboxFormat';

interface CategoryAccordionProps {
  bucket: CategoryBucket;
  openId: string | null;
  onToggle: (id: string) => void;
}

export const CategoryAccordion = ({ bucket, openId, onToggle }: CategoryAccordionProps) => {
  const open = openId === bucket.rule.id;
  const [visibleCount, setVisibleCount] = useState(50);

  // Wenn ein anderes Fach den Fokus bekommt, unser eigenes wieder zusammenklappen.
  useEffect(() => {
    if (!open) setVisibleCount(50);
  }, [open]);

  const visibleMails = bucket.mails.slice(0, visibleCount);
  const hasMore = bucket.mails.length > visibleMails.length;

  return (
    <section
      id={`category-${bucket.rule.id}`}
      className="border border-border rounded-xl overflow-hidden bg-white dark:bg-slate-900"
    >
      <button
        type="button"
        onClick={() => onToggle(bucket.rule.id)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-text-secondary flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0" />
        )}
        <span
          className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
          style={{ backgroundColor: bucket.rule.colorHex }}
        />
        <span className="font-medium text-text">
          {bucket.rule.emoji} {bucket.rule.label}
        </span>
        <span className="ml-1 text-sm text-text-secondary">{bucket.mails.length}</span>
        <span className="ml-3 text-sm text-text-secondary truncate hidden md:inline">
          — {bucket.rule.description}
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Top-Absender */}
          {bucket.topSenders.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/40 border-b border-border">
              <div className="text-xs text-text-secondary mb-2">Haeufigste Absender</div>
              <div className="flex flex-wrap gap-2">
                {bucket.topSenders.map((s) => (
                  <span
                    key={s.address}
                    className="text-xs px-2 py-1 bg-white dark:bg-slate-900 border border-border rounded-full text-text"
                    title={s.address}
                  >
                    {s.name}
                    <span className="ml-1 text-text-secondary">· {s.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tabelle */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-text-secondary bg-gray-50/60 dark:bg-slate-800/30">
                <tr>
                  <th className="px-4 py-2 font-medium w-32">Datum</th>
                  <th className="px-4 py-2 font-medium hidden sm:table-cell">Absender</th>
                  <th className="px-4 py-2 font-medium">Betreff</th>
                </tr>
              </thead>
              <tbody>
                {visibleMails.map((m) => (
                  <tr
                    key={m.id}
                    className="border-t border-border hover:bg-gray-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-2 text-text-secondary whitespace-nowrap">
                      {formatDate(m.receivedDateTime)}
                    </td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      <div className="truncate max-w-[16rem]">
                        {m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'unbekannt'}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <a
                        href={m.webLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text hover:text-primary inline-flex items-center gap-1"
                      >
                        <span className="truncate max-w-[32rem]">
                          {m.subject || '(kein Betreff)'}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="px-4 py-3 text-center border-t border-border">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + 100)}
                className="text-sm text-primary hover:underline"
              >
                Weitere 100 anzeigen ({bucket.mails.length - visibleCount} verbleibend)
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
