// Audit Service - Centralized event logging for 100% audit trail
// All processing events, user actions, and system operations are logged here
// Async fire-and-forget to avoid impacting request performance

import { query } from '../db';
import { logger } from './logger';

export interface AuditEvent {
  tenantId: string;
  userId?: string;
  emailId?: string;
  emailSubject?: string;
  eventType: 'classification' | 'rule_match' | 'action_extracted' | 'action_applied' |
    'user_override' | 'email_moved' | 'email_deleted' | 'document_forwarded' |
    'rule_dry_run' | 'error';
  source: 'rule' | 'ai' | 'manual' | 'auto' | 'system';
  ruleId?: string;
  ruleName?: string;
  category?: string;
  confidence?: number;
  reasoning?: string;
  model?: string;
  tokensPrompt?: number;
  tokensCompletion?: number;
  tokensTotal?: number;
  estimatedCostUsd?: number;
  processingTimeMs?: number;
  oldState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Approximate cost per 1M tokens (GPT-4o-mini)
const COST_PER_1M_INPUT = 0.15;
const COST_PER_1M_OUTPUT = 0.60;

/**
 * Estimate cost from token counts.
 */
export function estimateCost(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1_000_000) * COST_PER_1M_INPUT +
         (completionTokens / 1_000_000) * COST_PER_1M_OUTPUT;
}

/**
 * Log a processing event to the audit trail.
 * Fire-and-forget - errors are logged but don't propagate.
 */
export async function logEvent(event: AuditEvent): Promise<void> {
  try {
    await query(
      `INSERT INTO processing_log (
        tenant_id, user_id, email_id, email_subject,
        event_type, source, rule_id, rule_name,
        category, confidence, reasoning,
        model, tokens_prompt, tokens_completion, tokens_total, estimated_cost_usd,
        processing_time_ms, old_state, new_state, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )`,
      [
        event.tenantId,
        event.userId || null,
        event.emailId || null,
        event.emailSubject || null,
        event.eventType,
        event.source,
        event.ruleId || null,
        event.ruleName || null,
        event.category || null,
        event.confidence || null,
        event.reasoning || null,
        event.model || null,
        event.tokensPrompt || null,
        event.tokensCompletion || null,
        event.tokensTotal || null,
        event.estimatedCostUsd || null,
        event.processingTimeMs || null,
        event.oldState ? JSON.stringify(event.oldState) : null,
        event.newState ? JSON.stringify(event.newState) : null,
        event.metadata ? JSON.stringify(event.metadata) : '{}',
      ]
    );
  } catch (error) {
    // Fire-and-forget: log but don't propagate
    logger.error('Failed to log audit event', {
      eventType: event.eventType,
      error: (error as Error).message,
    });
  }
}

/**
 * Log multiple events in a batch.
 */
export async function logEvents(events: AuditEvent[]): Promise<void> {
  await Promise.all(events.map(logEvent));
}
