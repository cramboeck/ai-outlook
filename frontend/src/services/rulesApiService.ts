// Rules API Service - Server-side rule management
// Works alongside rulesService.ts (localStorage) for hybrid local+server rules

import { api } from './apiClient';
import type { EmailRule } from './rulesService';

// Fetch all server-side rules
export async function fetchServerRules(): Promise<EmailRule[]> {
  const data = await api.get<{ rules: any[] }>('/rules');
  return (data.rules || []).map(mapToEmailRule);
}

// Fetch a single server-side rule
export async function fetchServerRule(id: string): Promise<EmailRule> {
  const data = await api.get<{ rule: any }>(`/rules/${id}`);
  return mapToEmailRule(data.rule);
}

// Create a server-side rule
export async function createServerRule(rule: Partial<EmailRule>): Promise<EmailRule> {
  const payload = mapToBackend(rule);
  const data = await api.post<{ rule: any }>('/rules', payload);
  return mapToEmailRule(data.rule);
}

// Update a server-side rule
export async function updateServerRule(id: string, updates: Partial<EmailRule>): Promise<EmailRule> {
  const payload = mapToBackend(updates);
  const data = await api.patch<{ rule: any }>(`/rules/${id}`, payload);
  return mapToEmailRule(data.rule);
}

// Delete a server-side rule
export async function deleteServerRule(id: string): Promise<void> {
  await api.delete(`/rules/${id}`);
}

// Record a rule trigger on the server
export async function recordServerRuleTrigger(id: string): Promise<EmailRule> {
  const data = await api.post<{ rule: any }>(`/rules/${id}/trigger`);
  return mapToEmailRule(data.rule);
}

// Reorder server-side rules
export async function reorderServerRules(ruleIds: string[]): Promise<EmailRule[]> {
  const data = await api.put<{ rules: any[] }>('/rules/reorder', { ruleIds });
  return (data.rules || []).map(mapToEmailRule);
}

// --- Smart Rule Suggestion ------------------------------------------------

export type SuggestedCriterionField =
  | 'fromContains'
  | 'fromExact'
  | 'fromDomain'
  | 'subjectContains'
  | 'subjectStartsWith'
  | 'bodyContains'
  | 'hasAttachments'
  | 'importance';

export interface SuggestedCriterion {
  field: SuggestedCriterionField;
  value: string | boolean;
  description: string;
  enabled: boolean;
}

export type SuggestedActionType = 'categorize' | 'move' | 'markRead' | 'flag';

export interface SuggestedAction {
  type: SuggestedActionType;
  value: string;
  description: string;
  enabled: boolean;
}

export interface RuleSuggestion {
  suggestedName: string;
  suggestedDescription: string;
  suggestedPriority: number;
  suggestedStopProcessing: boolean;
  criteria: SuggestedCriterion[];
  actions: SuggestedAction[];
  reasoning: string;
}

export interface SuggestRuleFromEmailInput {
  subject?: string;
  body?: string;
  sender?: string;
  hasAttachments?: boolean;
  importance?: 'high' | 'normal' | 'low';
}

export async function suggestRuleFromEmail(
  input: SuggestRuleFromEmailInput
): Promise<RuleSuggestion> {
  const data = await api.post<{ suggestion: RuleSuggestion }>(
    '/suggest-rule-from-email',
    input
  );
  return data.suggestion;
}

// Sync local rules to server (one-way push)
export async function syncLocalRulesToServer(
  localRules: EmailRule[]
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  for (const rule of localRules) {
    try {
      await createServerRule(rule);
      synced++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to sync rule "${rule.name}": ${message}`);
    }
  }

  return { synced, errors };
}

// Map backend DB row to frontend EmailRule format
function mapToEmailRule(row: any): EmailRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    enabled: row.enabled ?? true,
    criteria:
      typeof row.criteria === 'string'
        ? JSON.parse(row.criteria)
        : row.criteria || {},
    actions:
      typeof row.actions === 'string'
        ? JSON.parse(row.actions)
        : row.actions || [],
    priority: row.priority ?? 0,
    stopProcessing: row.stop_processing ?? false,
    createdAt: row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now(),
    lastTriggeredAt: row.last_triggered_at
      ? new Date(row.last_triggered_at).getTime()
      : undefined,
    triggerCount: row.trigger_count ?? 0,
  };
}

// Map frontend EmailRule to backend format
function mapToBackend(rule: Partial<EmailRule>): Record<string, any> {
  const payload: Record<string, any> = {};
  if (rule.name !== undefined) payload.name = rule.name;
  if (rule.description !== undefined) payload.description = rule.description;
  if (rule.enabled !== undefined) payload.enabled = rule.enabled;
  if (rule.criteria !== undefined) payload.criteria = rule.criteria;
  if (rule.actions !== undefined) payload.actions = rule.actions;
  if (rule.priority !== undefined) payload.priority = rule.priority;
  if (rule.stopProcessing !== undefined)
    payload.stop_processing = rule.stopProcessing;
  return payload;
}
