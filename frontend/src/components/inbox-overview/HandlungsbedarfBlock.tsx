import { AlertCircle, ExternalLink } from 'lucide-react';
import type { CategorizedMail } from '../../services/inboxCategorizer';
import { formatDate } from '../../utils/inboxFormat';

interface HandlungsbedarfBlockProps {
  mails: CategorizedMail[];
}

export const HandlungsbedarfBlock = ({ mails }: HandlungsbedarfBlockProps) => {
  if (mails.length === 0) return null;

  return (
    <section
      aria-labelledby="handlungsbedarf-heading"
      className="border border-orange-300 dark:border-orange-800/60 bg-orange-50 dark:bg-orange-950/30 rounded-xl overflow-hidden"
    >
      <header className="px-4 py-3 flex items-center gap-2 border-b border-orange-200 dark:border-orange-900/60">
        <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        <h2
          id="handlungsbedarf-heading"
          className="text-base font-semibold text-orange-900 dark:text-orange-100"
        >
          Das solltest du dir anschauen
        </h2>
        <span className="ml-auto text-sm text-orange-700 dark:text-orange-300 font-medium">
          {mails.length}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-text-secondary bg-orange-100/60 dark:bg-orange-900/30">
            <tr>
              <th className="px-4 py-2 font-medium w-32">Datum</th>
              <th className="px-4 py-2 font-medium hidden sm:table-cell">Absender</th>
              <th className="px-4 py-2 font-medium">Betreff</th>
            </tr>
          </thead>
          <tbody>
            {mails.map((m) => (
              <tr
                key={m.id}
                className="border-t border-orange-200/60 dark:border-orange-900/40 hover:bg-orange-100/50 dark:hover:bg-orange-900/20"
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
                    <span className="truncate max-w-[32rem]">{m.subject || '(kein Betreff)'}</span>
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                  </a>
                  {m.actionHint && (
                    <span className="ml-2 inline-block text-xs text-orange-800 dark:text-orange-200 bg-orange-200/70 dark:bg-orange-900/60 px-1.5 py-0.5 rounded">
                      {m.actionHint}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
