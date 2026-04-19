// Small workflow-status indicator row shown on each EmailCard.
// Gives a one-glance answer to "what has already happened with this email?":
//   ⚡ open action    🔒 rule matched    ✓ forwarded to integration
//   🤖 AI-classified
// Hover tooltip explains each icon so the meaning is discoverable.

import { Zap, Shield, CheckCircle2, Sparkles } from 'lucide-react';
import type { EmailStatus } from '../../services/emailStatusService';

interface Props {
  status?: EmailStatus;
  /** Dim classified marker when email is already displaying a category badge. */
  hideClassified?: boolean;
}

const URGENCY_COLOR: Record<string, string> = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-emerald-600 bg-emerald-50 border-emerald-200',
};

export const EmailStatusBadges = ({ status, hideClassified }: Props) => {
  if (!status) return null;

  const items: React.ReactNode[] = [];

  if (status.hasAction) {
    const urgencyClass = status.urgency ? URGENCY_COLOR[status.urgency] ?? '' : '';
    items.push(
      <span
        key="action"
        title={`Offene Aufgabe${status.urgency ? ` (Priorität: ${status.urgency})` : ''}`}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${urgencyClass || 'text-amber-700 bg-amber-50 border-amber-200'}`}
      >
        <Zap className="w-3 h-3" />
        Aufgabe
      </span>
    );
  }

  if (status.forwarded) {
    items.push(
      <span
        key="forwarded"
        title="Bereits an eine Integration weitergeleitet"
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold text-emerald-700 bg-emerald-50 border-emerald-200"
      >
        <CheckCircle2 className="w-3 h-3" />
        Forwarded
      </span>
    );
  }

  if (status.ruleMatched) {
    items.push(
      <span
        key="rule"
        title="Eine Regel hat auf diese E-Mail gematcht"
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold text-violet-700 bg-violet-50 border-violet-200"
      >
        <Shield className="w-3 h-3" />
        Regel
      </span>
    );
  }

  if (status.classified && !hideClassified && !status.ruleMatched) {
    items.push(
      <span
        key="ai"
        title={status.category ? `KI-klassifiziert als „${status.category}"` : 'KI-klassifiziert'}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold text-indigo-700 bg-indigo-50 border-indigo-200"
      >
        <Sparkles className="w-3 h-3" />
        KI
      </span>
    );
  }

  if (items.length === 0) return null;

  return <div className="flex flex-wrap items-center gap-1">{items}</div>;
};
