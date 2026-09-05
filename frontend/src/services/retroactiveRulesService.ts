// Retroactive rule application
//
// Walks a list of emails, asks the backend which rules match (shared
// ruleEngine), then executes the resulting actions client-side via Graph.
// The backend never sees the Graph token, so actions like move / delete /
// categorize have to run in the browser; the backend is the authority on
// which rule matches which email.

import { api } from './apiClient';
import type { Email } from '../types';
import {
  setEmailCategory,
  markEmailAsRead,
  markEmailAsUnread,
  flagEmail,
  deleteEmail,
  moveEmail,
  getMailFolders,
} from './graphService';

export interface BackendRuleMatchAction {
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
  targetFolderName?: string;
  targetCategory?: string;
  integrationId?: string;
}

export interface EvaluationResult {
  email_id: string;
  matches: Array<{
    rule_id: string;
    rule_name: string;
    matched_criteria: string[];
    actions: BackendRuleMatchAction[];
  }>;
}

export interface EvaluateBatchResponse {
  evaluations: EvaluationResult[];
}

/**
 * Ask the backend which rules match each of the provided emails.
 * Optional ruleId restricts evaluation to a single rule (for "Jetzt
 * anwenden" on a single card).
 */
export async function evaluateRulesOnEmails(
  emails: Email[],
  ruleId?: string
): Promise<EvaluationResult[]> {
  const payload = emails.map(e => ({
    id: e.id,
    subject: e.subject,
    bodyPreview: e.bodyPreview,
    body: e.body?.content,
    sender: e.from?.emailAddress?.address,
    importance: e.importance,
    hasAttachments: e.hasAttachments,
    categories: e.categories,
    receivedDateTime: e.receivedDateTime,
  }));
  const data = await api.post<EvaluateBatchResponse>('/rules/evaluate-batch', {
    emails: payload,
    ...(ruleId ? { rule_id: ruleId } : {}),
  });
  return data.evaluations ?? [];
}

// --- Folder name resolver (cached per run) -------------------------------

let folderIdByName: Record<string, string> | null = null;

async function resolveFolderId(folderName: string): Promise<string | null> {
  if (!folderIdByName) {
    const result = await getMailFolders();
    const map: Record<string, string> = {};
    const walk = (folders: any[]) => {
      for (const f of folders) {
        if (f.displayName) map[f.displayName.toLowerCase()] = f.id;
        if (Array.isArray(f.childFolders)) walk(f.childFolders);
      }
    };
    walk(result.value ?? []);
    folderIdByName = map;
  }
  return folderIdByName[folderName.toLowerCase()] ?? null;
}

export function resetFolderCache(): void {
  folderIdByName = null;
}

// --- Action executor -----------------------------------------------------

export interface ActionExecutionResult {
  type: BackendRuleMatchAction['type'];
  success: boolean;
  message?: string;
}

/**
 * Execute one rule action against one email via Graph + MailSort APIs.
 * Designed to be robust: a single failing action never stops the overall
 * run, the per-action result is returned for display.
 */
export async function executeRuleAction(
  emailId: string,
  action: BackendRuleMatchAction
): Promise<ActionExecutionResult> {
  try {
    switch (action.type) {
      case 'categorize':
        if (!action.targetCategory) {
          return { type: action.type, success: false, message: 'Kein Kategorie-Wert' };
        }
        await setEmailCategory(emailId, [action.targetCategory]);
        return { type: action.type, success: true };

      case 'move': {
        // Prefer explicit id when the rule carries one (rare — usually we
        // just have the folder name).
        let targetId = action.targetFolderId;
        if (!targetId && action.targetFolderName) {
          targetId = (await resolveFolderId(action.targetFolderName)) ?? undefined;
        }
        if (!targetId) {
          return {
            type: action.type,
            success: false,
            message: `Ordner „${action.targetFolderName ?? '?'}" nicht gefunden`,
          };
        }
        await moveEmail(emailId, targetId);
        return { type: action.type, success: true };
      }

      case 'markRead':
        await markEmailAsRead(emailId);
        return { type: action.type, success: true };

      case 'markUnread':
        await markEmailAsUnread(emailId);
        return { type: action.type, success: true };

      case 'flag':
        await flagEmail(emailId, true);
        return { type: action.type, success: true };

      case 'unflag':
        await flagEmail(emailId, false);
        return { type: action.type, success: true };

      case 'delete':
        await deleteEmail(emailId);
        return { type: action.type, success: true };

      case 'extractActions':
        // Fire-and-forget trigger of the full pipeline for this email.
        await api.post('/process-email', { email: { id: emailId } }).catch(() => {/* non-fatal */});
        return { type: action.type, success: true };

      case 'forwardToDms':
        if (!action.integrationId) {
          return { type: action.type, success: false, message: 'Integration-ID fehlt' };
        }
        await api.post(`/integrations/${action.integrationId}/forward`, { email_id: emailId });
        return { type: action.type, success: true };

      default:
        return { type: action.type, success: false, message: 'Unbekannter Action-Typ' };
    }
  } catch (err) {
    return {
      type: action.type,
      success: false,
      message: err instanceof Error ? err.message : 'Fehler',
    };
  }
}
