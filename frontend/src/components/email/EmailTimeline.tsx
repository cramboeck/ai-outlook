// Email Timeline
//
// Vertical event history for a single email, rendered as a collapsible
// sidebar inside EmailDetail. Reads the existing /api/audit/email/:id
// endpoint so nothing new needs to be persisted — every processing_log
// row the backend already writes turns into a row here.
//
// Each event gets an icon, relative timestamp, a one-liner summary and a
// click-through link when one is embedded (integration file_url).

import { useEffect, useState } from 'react';
import {
  Clock,
  Sparkles,
  Shield,
  Zap,
  CheckCircle2,
  Send,
  ExternalLink,
  AlertTriangle,
  Brain,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from '../../utils/date';
import { getEmailTimeline } from '../../services/emailStatusService';
import type { TimelineEvent } from '../../services/emailStatusService';

interface Props {
  emailId: string;
  /** Reload trigger — bump when the email changes / after actions complete. */
  reloadKey?: number;
}

const EVENT_META: Record<TimelineEvent['event_type'], {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
}> = {
  classification: { icon: Sparkles, color: 'text-indigo-600 bg-indigo-50 border-indigo-200', label: 'Klassifiziert' },
  rule_match: { icon: Shield, color: 'text-violet-600 bg-violet-50 border-violet-200', label: 'Regel gematcht' },
  rule_dry_run: { icon: Shield, color: 'text-gray-500 bg-gray-50 border-gray-200', label: 'Regel (Dry-Run)' },
  action_extracted: { icon: Zap, color: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Aufgabe erkannt' },
  action_applied: { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Aufgabe erledigt' },
  user_override: { icon: RefreshCw, color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Vom User korrigiert' },
  email_moved: { icon: Send, color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Verschoben' },
  email_deleted: { icon: AlertTriangle, color: 'text-red-600 bg-red-50 border-red-200', label: 'Gelöscht' },
  document_forwarded: { icon: Send, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Weitergeleitet' },
  copilot_draft_generated: { icon: Brain, color: 'text-purple-600 bg-purple-50 border-purple-200', label: 'Copilot-Draft' },
  error: { icon: AlertTriangle, color: 'text-red-600 bg-red-50 border-red-200', label: 'Fehler' },
};

function summariseEvent(e: TimelineEvent): { primary: string; secondary?: string; link?: string; linkLabel?: string } {
  switch (e.event_type) {
    case 'classification':
      return {
        primary: e.category ? `Kategorie: ${e.category}` : 'Klassifizierung',
        secondary: e.reasoning ?? undefined,
      };
    case 'rule_match':
    case 'rule_dry_run':
      return {
        primary: e.rule_name ?? 'Regel',
        secondary: e.category ? `→ ${e.category}` : undefined,
      };
    case 'action_extracted': {
      const action = e.metadata?.action as { description?: string } | undefined;
      return { primary: action?.description ?? 'Aufgabe aus KI' };
    }
    case 'document_forwarded': {
      const meta = e.metadata as Record<string, unknown> | null;
      const type = (meta?.integrationType as string) ?? (meta?.integration_type as string) ?? 'Integration';
      const name = (meta?.integrationName as string) ?? (meta?.integration_name as string);
      return {
        primary: `An ${name ?? type} gesendet`,
        link: (meta?.file_url as string) ?? (meta?.document_url as string),
        linkLabel: 'Öffnen',
      };
    }
    case 'copilot_draft_generated': {
      const meta = e.metadata as Record<string, unknown> | null;
      const citations = Number(meta?.citationCount ?? 0);
      return {
        primary: 'Context-Aware Draft erzeugt',
        secondary: citations > 0 ? `${citations} Quellen` : undefined,
      };
    }
    case 'error':
      return { primary: (e.metadata?.error as string) ?? 'Fehler' };
    default:
      return { primary: EVENT_META[e.event_type].label };
  }
}

export const EmailTimeline = ({ emailId, reloadKey }: Props) => {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEmailTimeline(emailId)
      .then(data => {
        if (!cancelled) {
          // Backend returns ASC. Newest-first is more natural for an audit UI.
          setEvents([...data].reverse());
        }
      })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [emailId, reloadKey]);

  const eventCount = events?.length ?? 0;

  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-text-secondary" />
          <span className="text-sm font-semibold text-text">Verlauf</span>
          {eventCount > 0 && (
            <span className="text-xs text-text-secondary">({eventCount})</span>
          )}
        </div>
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-secondary" />
        )}
      </button>

      {!collapsed && (
        <div className="p-4">
          {loading && (
            <div className="text-sm text-text-secondary text-center py-4">Lade Verlauf…</div>
          )}
          {!loading && events && events.length === 0 && (
            <div className="text-sm text-text-secondary text-center py-4">
              Noch keine Ereignisse — klassifiziere oder analysiere die E-Mail, um den Verlauf zu starten.
            </div>
          )}
          {!loading && events && events.length > 0 && (
            <ol className="relative border-l-2 border-gray-200 ml-2 space-y-3">
              {events.map(event => {
                const meta = EVENT_META[event.event_type] ?? EVENT_META.error;
                const Icon = meta.icon;
                const summary = summariseEvent(event);
                return (
                  <li key={event.id} className="pl-4 relative">
                    <span
                      className={`absolute -left-[11px] top-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full border ${meta.color}`}
                    >
                      <Icon className="w-3 h-3" />
                    </span>
                    <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      {meta.label}
                      <span className="ml-2 font-normal normal-case text-xs text-text-secondary/70">
                        {formatDistanceToNow(event.created_at)}
                      </span>
                    </div>
                    <div className="text-sm text-text mt-0.5">{summary.primary}</div>
                    {summary.secondary && (
                      <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                        {summary.secondary}
                      </div>
                    )}
                    {summary.link && (
                      <a
                        href={summary.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-dark mt-1"
                      >
                        {summary.linkLabel ?? 'Öffnen'}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
};
