// useRules hook - Execute email rules
import { useState, useCallback } from 'react';
import type { Email } from '../types';
import {
  findMatchingRules,
  recordRuleTrigger,
  isAutoRunEnabled,
  type RuleAction,
} from '../services/rulesService';
import {
  moveEmail,
  setEmailCategory,
  markEmailAsRead,
  markEmailAsUnread,
  flagEmail,
  deleteEmail,
} from '../services/graphService';

export interface RuleExecutionResult {
  emailId: string;
  emailSubject: string;
  ruleId: string;
  ruleName: string;
  actions: RuleAction[];
  success: boolean;
  error?: string;
}

interface UseRulesReturn {
  isProcessing: boolean;
  processedCount: number;
  results: RuleExecutionResult[];
  executeRulesOnEmails: (emails: Email[]) => Promise<RuleExecutionResult[]>;
  executeRulesOnEmail: (email: Email) => Promise<RuleExecutionResult[]>;
  clearResults: () => void;
}

// Track processed emails in this session to avoid re-processing
const processedEmailIds = new Set<string>();

export const useRules = (): UseRulesReturn => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [results, setResults] = useState<RuleExecutionResult[]>([]);

  const executeAction = async (
    email: Email,
    action: RuleAction
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      switch (action.type) {
        case 'move':
          if (action.targetFolderId) {
            await moveEmail(email.id, action.targetFolderId);
          }
          break;
        case 'categorize':
          if (action.targetCategory) {
            // Add category to existing categories
            const existingCategories = email.categories || [];
            const newCategories = existingCategories.includes(action.targetCategory)
              ? existingCategories
              : [...existingCategories, action.targetCategory];
            await setEmailCategory(email.id, newCategories);
          }
          break;
        case 'markRead':
          await markEmailAsRead(email.id);
          break;
        case 'markUnread':
          await markEmailAsUnread(email.id);
          break;
        case 'flag':
          await flagEmail(email.id, true);
          break;
        case 'unflag':
          await flagEmail(email.id, false);
          break;
        case 'delete':
          await deleteEmail(email.id);
          break;
        default:
          return { success: false, error: `Unknown action: ${action.type}` };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const executeRulesOnEmail = useCallback(
    async (email: Email): Promise<RuleExecutionResult[]> => {
      // Skip if already processed in this session
      if (processedEmailIds.has(email.id)) {
        return [];
      }

      const matchingRules = findMatchingRules(email);
      if (matchingRules.length === 0) {
        return [];
      }

      const emailResults: RuleExecutionResult[] = [];

      for (const rule of matchingRules) {
        let allSuccess = true;
        let lastError: string | undefined;

        for (const action of rule.actions) {
          const result = await executeAction(email, action);
          if (!result.success) {
            allSuccess = false;
            lastError = result.error;
            break; // Stop processing actions if one fails
          }
        }

        // Record the trigger
        if (allSuccess) {
          recordRuleTrigger(rule.id);
        }

        emailResults.push({
          emailId: email.id,
          emailSubject: email.subject || '(Kein Betreff)',
          ruleId: rule.id,
          ruleName: rule.name,
          actions: rule.actions,
          success: allSuccess,
          error: lastError,
        });

        // If stopProcessing is set and rule matched, stop
        if (rule.stopProcessing) {
          break;
        }
      }

      // Mark as processed
      processedEmailIds.add(email.id);

      return emailResults;
    },
    []
  );

  const executeRulesOnEmails = useCallback(
    async (emails: Email[]): Promise<RuleExecutionResult[]> => {
      if (!isAutoRunEnabled()) {
        return [];
      }

      setIsProcessing(true);
      setProcessedCount(0);

      const allResults: RuleExecutionResult[] = [];

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const emailResults = await executeRulesOnEmail(email);
        allResults.push(...emailResults);
        setProcessedCount(i + 1);
      }

      setResults((prev) => [...prev, ...allResults]);
      setIsProcessing(false);

      return allResults;
    },
    [executeRulesOnEmail]
  );

  const clearResults = useCallback(() => {
    setResults([]);
    setProcessedCount(0);
  }, []);

  return {
    isProcessing,
    processedCount,
    results,
    executeRulesOnEmails,
    executeRulesOnEmail,
    clearResults,
  };
};

// Reset processed emails (e.g., on folder change)
export const resetProcessedEmails = () => {
  processedEmailIds.clear();
};
