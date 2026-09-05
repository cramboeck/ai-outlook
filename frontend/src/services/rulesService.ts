// Email Rules Service
// Automatic rules for processing incoming emails

import type { Email } from '../types';

export interface EmailRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  criteria: RuleCriteria;
  actions: RuleAction[];
  priority: number; // Lower = higher priority
  stopProcessing: boolean; // If true, don't apply further rules after this one matches
  createdAt: number;
  lastTriggeredAt?: number;
  triggerCount: number;
}

export interface RuleCriteria {
  // Sender criteria
  fromContains?: string; // Partial match on sender email/name
  fromExact?: string; // Exact email match
  fromDomain?: string; // Match domain (e.g., "microsoft.com")

  // Recipient criteria
  toContains?: string;

  // Subject criteria
  subjectContains?: string;
  subjectStartsWith?: string;

  // Body criteria
  bodyContains?: string;

  // Other criteria
  hasAttachments?: boolean;
  importance?: 'high' | 'normal' | 'low';
  isRead?: boolean;

  // Match mode: all criteria must match (AND) or any (OR)
  matchMode?: 'all' | 'any';
}

export interface RuleAction {
  type:
    | 'move'
    | 'categorize'
    | 'markRead'
    | 'markUnread'
    | 'flag'
    | 'unflag'
    | 'delete'
    | 'extractActions'
    | 'forwardToDms';
  targetFolderId?: string;
  targetFolderName?: string; // For display purposes
  targetCategory?: string;
  /** For forwardToDms: resolved integration id (uuid). */
  integrationId?: string;
  /** Display-only name of the integration, populated when picked in the UI. */
  integrationName?: string;
}

interface RulesStorage {
  version: number;
  rules: EmailRule[];
  autoRunEnabled: boolean;
}

const STORAGE_KEY = 'postpilot_email_rules';
const STORAGE_VERSION = 1;

// Generate unique ID
const generateId = (): string => {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Load rules from localStorage
export const loadRules = (): EmailRule[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as RulesStorage;
      if (data.version === STORAGE_VERSION) {
        return data.rules.sort((a, b) => a.priority - b.priority);
      }
    }
  } catch (e) {
    console.error('Failed to load email rules:', e);
  }
  return getDefaultRules();
};

// Save rules to localStorage
const saveRules = (rules: EmailRule[]): void => {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    let autoRunEnabled = true;
    if (existing) {
      try {
        const data = JSON.parse(existing) as RulesStorage;
        autoRunEnabled = data.autoRunEnabled ?? true;
      } catch {
        // ignore
      }
    }
    const data: RulesStorage = {
      version: STORAGE_VERSION,
      rules: rules.sort((a, b) => a.priority - b.priority),
      autoRunEnabled,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save email rules:', e);
  }
};

// Check if auto-run is enabled
export const isAutoRunEnabled = (): boolean => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as RulesStorage;
      return data.autoRunEnabled ?? true;
    }
  } catch {
    // ignore
  }
  return true;
};

// Set auto-run enabled state
export const setAutoRunEnabled = (enabled: boolean): void => {
  const rules = loadRules();
  const data: RulesStorage = {
    version: STORAGE_VERSION,
    rules,
    autoRunEnabled: enabled,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

// Get default rules (examples)
export const getDefaultRules = (): EmailRule[] => [
  {
    id: 'default_newsletter',
    name: 'Newsletter automatisch kategorisieren',
    description: 'Kategorisiert E-Mails von Newsletter-Diensten',
    enabled: false,
    criteria: {
      fromDomain: 'newsletter',
      matchMode: 'any',
    },
    actions: [
      { type: 'categorize', targetCategory: 'Newsletter' },
    ],
    priority: 100,
    stopProcessing: false,
    createdAt: Date.now(),
    triggerCount: 0,
  },
  {
    id: 'default_important_unread',
    name: 'Wichtige Mails markieren',
    description: 'Markiert wichtige E-Mails mit Flag',
    enabled: false,
    criteria: {
      importance: 'high',
      matchMode: 'all',
    },
    actions: [
      { type: 'flag' },
    ],
    priority: 50,
    stopProcessing: false,
    createdAt: Date.now(),
    triggerCount: 0,
  },
];

// Create a new rule
export const createRule = (
  name: string,
  criteria: RuleCriteria,
  actions: RuleAction[],
  options?: {
    description?: string;
    enabled?: boolean;
    priority?: number;
    stopProcessing?: boolean;
  }
): EmailRule => {
  const rules = loadRules();
  const maxPriority = rules.length > 0 ? Math.max(...rules.map(r => r.priority)) : 0;

  const newRule: EmailRule = {
    id: generateId(),
    name,
    description: options?.description,
    enabled: options?.enabled ?? true,
    criteria,
    actions,
    priority: options?.priority ?? maxPriority + 10,
    stopProcessing: options?.stopProcessing ?? false,
    createdAt: Date.now(),
    triggerCount: 0,
  };

  rules.push(newRule);
  saveRules(rules);
  return newRule;
};

// Update an existing rule
export const updateRule = (id: string, updates: Partial<EmailRule>): EmailRule | null => {
  const rules = loadRules();
  const index = rules.findIndex(r => r.id === id);
  if (index === -1) return null;

  rules[index] = { ...rules[index], ...updates };
  saveRules(rules);
  return rules[index];
};

// Delete a rule
export const deleteRule = (id: string): boolean => {
  const rules = loadRules();
  const filtered = rules.filter(r => r.id !== id);
  if (filtered.length === rules.length) return false;
  saveRules(filtered);
  return true;
};

// Toggle rule enabled state
export const toggleRule = (id: string): EmailRule | null => {
  const rules = loadRules();
  const rule = rules.find(r => r.id === id);
  if (!rule) return null;

  rule.enabled = !rule.enabled;
  saveRules(rules);
  return rule;
};

// Reorder rules (change priority)
export const reorderRules = (ruleIds: string[]): void => {
  const rules = loadRules();
  ruleIds.forEach((id, index) => {
    const rule = rules.find(r => r.id === id);
    if (rule) {
      rule.priority = (index + 1) * 10;
    }
  });
  saveRules(rules);
};

// Check if an email matches rule criteria
export const emailMatchesCriteria = (email: Email, criteria: RuleCriteria): boolean => {
  const checks: boolean[] = [];

  // Sender checks
  if (criteria.fromContains) {
    const senderEmail = email.from?.emailAddress?.address?.toLowerCase() || '';
    const senderName = email.from?.emailAddress?.name?.toLowerCase() || '';
    const search = criteria.fromContains.toLowerCase();
    checks.push(senderEmail.includes(search) || senderName.includes(search));
  }

  if (criteria.fromExact) {
    const senderEmail = email.from?.emailAddress?.address?.toLowerCase() || '';
    checks.push(senderEmail === criteria.fromExact.toLowerCase());
  }

  if (criteria.fromDomain) {
    const senderEmail = email.from?.emailAddress?.address?.toLowerCase() || '';
    const domain = criteria.fromDomain.toLowerCase();
    // Support both exact domain match and partial match
    checks.push(
      senderEmail.endsWith(`@${domain}`) ||
      senderEmail.includes(`.${domain}`) ||
      senderEmail.includes(domain)
    );
  }

  // Recipient checks
  if (criteria.toContains) {
    const recipients = email.toRecipients?.map(r =>
      `${r.emailAddress?.address || ''} ${r.emailAddress?.name || ''}`.toLowerCase()
    ).join(' ') || '';
    checks.push(recipients.includes(criteria.toContains.toLowerCase()));
  }

  // Subject checks
  if (criteria.subjectContains) {
    const subject = email.subject?.toLowerCase() || '';
    checks.push(subject.includes(criteria.subjectContains.toLowerCase()));
  }

  if (criteria.subjectStartsWith) {
    const subject = email.subject?.toLowerCase() || '';
    checks.push(subject.startsWith(criteria.subjectStartsWith.toLowerCase()));
  }

  // Body checks
  if (criteria.bodyContains) {
    const body = email.bodyPreview?.toLowerCase() || '';
    checks.push(body.includes(criteria.bodyContains.toLowerCase()));
  }

  // Attachment check
  if (criteria.hasAttachments !== undefined) {
    checks.push(email.hasAttachments === criteria.hasAttachments);
  }

  // Importance check
  if (criteria.importance) {
    checks.push(email.importance?.toLowerCase() === criteria.importance);
  }

  // Read status check
  if (criteria.isRead !== undefined) {
    checks.push(email.isRead === criteria.isRead);
  }

  // If no criteria specified, don't match
  if (checks.length === 0) return false;

  // Apply match mode
  if (criteria.matchMode === 'any') {
    return checks.some(c => c);
  }
  return checks.every(c => c); // Default to 'all'
};

// Find matching rules for an email
export const findMatchingRules = (email: Email): EmailRule[] => {
  const rules = loadRules().filter(r => r.enabled);
  const matching: EmailRule[] = [];

  for (const rule of rules) {
    if (emailMatchesCriteria(email, rule.criteria)) {
      matching.push(rule);
      if (rule.stopProcessing) break;
    }
  }

  return matching;
};

// Record that a rule was triggered
export const recordRuleTrigger = (ruleId: string): void => {
  const rules = loadRules();
  const rule = rules.find(r => r.id === ruleId);
  if (rule) {
    rule.lastTriggeredAt = Date.now();
    rule.triggerCount++;
    saveRules(rules);
  }
};

// Get rule by ID
export const getRule = (id: string): EmailRule | null => {
  const rules = loadRules();
  return rules.find(r => r.id === id) || null;
};

// Get enabled rules count
export const getEnabledRulesCount = (): number => {
  return loadRules().filter(r => r.enabled).length;
};

// Duplicate a rule
export const duplicateRule = (id: string): EmailRule | null => {
  const rule = getRule(id);
  if (!rule) return null;

  return createRule(
    `${rule.name} (Kopie)`,
    { ...rule.criteria },
    [...rule.actions],
    {
      description: rule.description,
      enabled: false,
      stopProcessing: rule.stopProcessing,
    }
  );
};

// Export rules as JSON
export const exportRules = (): string => {
  const rules = loadRules();
  return JSON.stringify(rules, null, 2);
};

// Import rules from JSON
export const importRules = (json: string, merge: boolean = true): EmailRule[] => {
  try {
    const imported = JSON.parse(json) as EmailRule[];
    if (!Array.isArray(imported)) throw new Error('Invalid format');

    // Validate structure
    for (const rule of imported) {
      if (!rule.name || !rule.criteria || !rule.actions) {
        throw new Error('Invalid rule structure');
      }
    }

    if (merge) {
      const existing = loadRules();
      // Assign new IDs to imported rules
      const newRules = imported.map(r => ({
        ...r,
        id: generateId(),
        createdAt: Date.now(),
        triggerCount: 0,
        lastTriggeredAt: undefined,
      }));
      saveRules([...existing, ...newRules]);
      return loadRules();
    } else {
      // Replace all rules
      const newRules = imported.map(r => ({
        ...r,
        id: generateId(),
        createdAt: Date.now(),
        triggerCount: 0,
        lastTriggeredAt: undefined,
      }));
      saveRules(newRules);
      return newRules;
    }
  } catch (e) {
    console.error('Failed to import rules:', e);
    throw new Error('Ungültiges Regelformat');
  }
};

// Reset to default rules
export const resetToDefaultRules = (): EmailRule[] => {
  const defaults = getDefaultRules();
  saveRules(defaults);
  return defaults;
};
