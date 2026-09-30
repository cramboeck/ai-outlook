// Email Status + Timeline
//
// Two small clients on top of the existing audit routes:
//   - getEmailStatusBatch: feeds the status-indicator badges in the email
//     list (classified / action / forwarded / rule).
//   - getEmailTimeline: drives the right-hand event sidebar in EmailDetail.

import { api } from './apiClient';

export interface EmailStatus {
  classified: boolean;
  hasAction: boolean;
  forwarded: boolean;
  ruleMatched: boolean;
  category?: string;
  urgency?: string;
}

export async function getEmailStatusBatch(emailIds: string[]): Promise<Record<string, EmailStatus>> {
  if (!emailIds || emailIds.length === 0) return {};
  const data = await api.post<{ statuses: Record<string, EmailStatus> }>(
    '/audit/status-batch',
    { email_ids: emailIds }
  );
  return data.statuses ?? {};
}

export interface TimelineEvent {
  id: string;
  created_at: string;
  event_type:
    | 'classification'
    | 'rule_match'
    | 'action_extracted'
    | 'action_applied'
    | 'user_override'
    | 'email_moved'
    | 'email_deleted'
    | 'document_forwarded'
    | 'copilot_draft_generated'
    | 'rule_dry_run'
    | 'error';
  source: 'rule' | 'ai' | 'manual' | 'auto' | 'system';
  rule_name?: string | null;
  category?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
  model?: string | null;
  tokens_prompt?: number | null;
  tokens_completion?: number | null;
  tokens_total?: number | null;
  estimated_cost_usd?: number | null;
  processing_time_ms?: number | null;
  metadata?: Record<string, unknown> | null;
}

export async function getEmailTimeline(emailId: string): Promise<TimelineEvent[]> {
  const data = await api.get<{ timeline: TimelineEvent[] }>(
    `/audit/email/${encodeURIComponent(emailId)}`
  );
  return data.timeline ?? [];
}
