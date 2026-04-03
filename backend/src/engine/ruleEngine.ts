// Server-Side Rule Engine
// Evaluates rules against emails - fast, deterministic, user-controlled
// Ported from frontend/src/services/rulesService.ts (lines 246-321)

import { query } from '../db';
import { logger } from '../services/logger';

export interface EmailForProcessing {
  id: string;
  subject: string;
  bodyPreview: string;
  body?: string;
  senderEmail: string;
  senderDomain: string;
  importance: string;
  hasAttachments: boolean;
  isDirectRecipient: boolean;
  ccCount: number;
  isReply: boolean;
  isForward: boolean;
  categories: string[];
  receivedDateTime?: string;
}

export interface RuleCriteria {
  fromContains?: string;
  fromDomain?: string;
  subjectContains?: string;
  bodyContains?: string;
  hasAttachments?: boolean;
  importance?: string;
  matchMode?: 'AND' | 'OR';
}

export interface RuleAction {
  type: 'categorize' | 'move' | 'markRead' | 'markUnread' | 'flag' | 'unflag' | 'delete' | 'extractActions' | 'forwardToDms';
  value?: string;
  integrationId?: string;
}

export interface Rule {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  stop_processing: boolean;
  criteria: RuleCriteria;
  actions: RuleAction[];
}

export interface RuleMatch {
  rule: Rule;
  matchedCriteria: string[];
}

/**
 * Evaluate a single criterion against an email.
 */
function evaluateCriterion(email: EmailForProcessing, field: string, value: unknown): boolean {
  const lowerSubject = (email.subject || '').toLowerCase();
  const lowerBody = (email.bodyPreview || email.body || '').toLowerCase();
  const lowerSender = (email.senderEmail || '').toLowerCase();

  switch (field) {
    case 'fromContains':
      return lowerSender.includes((value as string).toLowerCase());
    case 'fromDomain':
      return email.senderDomain.toLowerCase() === (value as string).toLowerCase();
    case 'subjectContains':
      return lowerSubject.includes((value as string).toLowerCase());
    case 'bodyContains':
      return lowerBody.includes((value as string).toLowerCase());
    case 'hasAttachments':
      return email.hasAttachments === value;
    case 'importance':
      return email.importance?.toLowerCase() === (value as string).toLowerCase();
    default:
      return false;
  }
}

/**
 * Check if an email matches a rule's criteria.
 */
function emailMatchesCriteria(email: EmailForProcessing, criteria: RuleCriteria): { matches: boolean; matchedFields: string[] } {
  const matchMode = criteria.matchMode || 'AND';
  const matchedFields: string[] = [];

  const criteriaEntries = Object.entries(criteria).filter(
    ([key]) => key !== 'matchMode' && key !== 'logic'
  );

  // Skip rules with no criteria
  if (criteriaEntries.length === 0) {
    return { matches: false, matchedFields: [] };
  }

  for (const [field, value] of criteriaEntries) {
    if (value === undefined || value === null || value === '') continue;

    const result = evaluateCriterion(email, field, value);
    if (result) {
      matchedFields.push(field);
    }

    // Short-circuit for OR mode
    if (matchMode === 'OR' && result) {
      return { matches: true, matchedFields };
    }

    // Short-circuit for AND mode on failure
    if (matchMode === 'AND' && !result) {
      return { matches: false, matchedFields };
    }
  }

  // For AND mode: all must match
  if (matchMode === 'AND') {
    const activeFields = criteriaEntries.filter(([, v]) => v !== undefined && v !== null && v !== '');
    return { matches: matchedFields.length === activeFields.length, matchedFields };
  }

  // For OR mode: at least one must match
  return { matches: matchedFields.length > 0, matchedFields };
}

/**
 * Load enabled rules for a tenant, ordered by priority.
 */
export async function loadTenantRules(tenantId: string): Promise<Rule[]> {
  return query<Rule>(
    'SELECT * FROM rules WHERE tenant_id = $1 AND enabled = true ORDER BY priority ASC',
    [tenantId]
  );
}

/**
 * Evaluate all enabled rules against an email.
 * Returns matches in priority order, respecting stop_processing.
 */
export async function evaluateRules(
  tenantId: string,
  email: EmailForProcessing,
  rules?: Rule[]
): Promise<RuleMatch[]> {
  const tenantRules = rules || await loadTenantRules(tenantId);
  const matches: RuleMatch[] = [];

  for (const rule of tenantRules) {
    const { matches: isMatch, matchedFields } = emailMatchesCriteria(email, rule.criteria);

    if (isMatch) {
      matches.push({
        rule,
        matchedCriteria: matchedFields,
      });

      logger.debug('Rule matched', {
        ruleId: rule.id,
        ruleName: rule.name,
        emailId: email.id,
        matchedFields,
      });

      if (rule.stop_processing) {
        break;
      }
    }
  }

  return matches;
}

/**
 * Extract the categorize action from rule matches (first one wins).
 */
export function getCategoryFromRules(matches: RuleMatch[]): string | null {
  for (const match of matches) {
    const categorizeAction = match.rule.actions.find(a => a.type === 'categorize');
    if (categorizeAction?.value) {
      return categorizeAction.value;
    }
  }
  return null;
}

/**
 * Get all non-categorize actions that should be executed.
 */
export function getExecutableActions(matches: RuleMatch[]): Array<{ ruleId: string; ruleName: string; action: RuleAction }> {
  const actions: Array<{ ruleId: string; ruleName: string; action: RuleAction }> = [];

  for (const match of matches) {
    for (const action of match.rule.actions) {
      if (action.type !== 'categorize') {
        actions.push({
          ruleId: match.rule.id,
          ruleName: match.rule.name,
          action,
        });
      }
    }
  }

  return actions;
}
