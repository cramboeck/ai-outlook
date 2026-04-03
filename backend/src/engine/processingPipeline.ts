// Processing Pipeline - Core orchestrator for email processing
// Flow: Rules first -> AI Classification -> Action Extraction -> Document Detection -> Audit Log

import { evaluateRules, getCategoryFromRules, getExecutableActions, loadTenantRules } from './ruleEngine';
import type { EmailForProcessing, RuleMatch, RuleAction } from './ruleEngine';
import { logEvent, estimateCost } from '../services/auditService';
import { logger } from '../services/logger';

export interface ProcessingOptions {
  dryRun?: boolean;
  forceAI?: boolean;
  autoApplyThreshold?: number;
  skipActionExtraction?: boolean;
}

export interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
  urgency?: string;
  signals?: {
    isActionRequired: boolean;
    hasDeadline: boolean;
    isAutomated: boolean;
  };
}

export interface ExtractedAction {
  description: string;
  priority: 'high' | 'medium' | 'low';
  type: 'response' | 'task' | 'decision' | 'meeting' | 'payment' | 'document';
  deadline?: string;
}

export interface DocumentInfo {
  type: 'invoice' | 'order' | 'contract' | 'receipt';
  confidence: number;
  extractedData: {
    vendor?: string;
    amount?: number;
    currency?: string;
    invoiceNumber?: string;
    orderNumber?: string;
    dueDate?: string;
    items?: string[];
  };
  suggestedActions: string[];
}

export interface ProcessingResult {
  emailId: string;

  // Classification
  classification: ClassificationResult | null;
  classificationSource: 'rule' | 'ai' | 'none';

  // Rule matches
  ruleMatches: Array<{
    ruleId: string;
    ruleName: string;
    matchedCriteria: string[];
    actions: RuleAction[];
  }>;

  // Extracted actions/TODOs
  actions: ExtractedAction[];

  // Document detection
  document: DocumentInfo | null;

  // Executable actions from rules
  pendingActions: Array<{
    ruleId: string;
    ruleName: string;
    action: RuleAction;
  }>;

  // Auto-apply decision
  autoApply: boolean;

  // Metadata
  dryRun: boolean;
  processingTimeMs: number;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
    estimatedCostUsd: number;
  };
}

// AI service interfaces (to be injected)
export interface AIClassifier {
  classify(email: EmailForProcessing, categories?: Array<{ name: string; description: string }>): Promise<{
    result: ClassificationResult;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
    processingTimeMs: number;
  }>;
}

export interface AIActionExtractor {
  extract(email: EmailForProcessing): Promise<{
    actions: ExtractedAction[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
    processingTimeMs: number;
  }>;
}

export interface AIDocumentDetector {
  detect(email: EmailForProcessing): Promise<{
    document: DocumentInfo | null;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
    processingTimeMs: number;
  }>;
}

/**
 * Process a single email through the full pipeline.
 */
export async function processEmail(
  tenantId: string,
  userId: string,
  email: EmailForProcessing,
  options: ProcessingOptions = {},
  services: {
    classifier?: AIClassifier;
    actionExtractor?: AIActionExtractor;
    documentDetector?: AIDocumentDetector;
  } = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const { dryRun = false, forceAI = false, autoApplyThreshold = 0.85 } = options;

  const result: ProcessingResult = {
    emailId: email.id,
    classification: null,
    classificationSource: 'none',
    ruleMatches: [],
    actions: [],
    document: null,
    pendingActions: [],
    autoApply: false,
    dryRun,
    processingTimeMs: 0,
    tokenUsage: { prompt: 0, completion: 0, total: 0, estimatedCostUsd: 0 },
  };

  try {
    // Step 1: Evaluate rules
    const rules = await loadTenantRules(tenantId);
    const ruleMatches = await evaluateRules(tenantId, email, rules);

    result.ruleMatches = ruleMatches.map(m => ({
      ruleId: m.rule.id,
      ruleName: m.rule.name,
      matchedCriteria: m.matchedCriteria,
      actions: m.rule.actions,
    }));

    // Log rule matches
    for (const match of ruleMatches) {
      await logEvent({
        tenantId,
        userId,
        emailId: email.id,
        emailSubject: email.subject,
        eventType: dryRun ? 'rule_dry_run' : 'rule_match',
        source: 'rule',
        ruleId: match.rule.id,
        ruleName: match.rule.name,
        metadata: { matchedCriteria: match.matchedCriteria },
      });
    }

    // Step 2: Classification (rules first, AI fallback)
    const ruleCategory = getCategoryFromRules(ruleMatches);

    if (ruleCategory && !forceAI) {
      result.classification = {
        category: ruleCategory,
        confidence: 1.0,
        reasoning: `Matched rule: ${ruleMatches[0].rule.name}`,
      };
      result.classificationSource = 'rule';

      await logEvent({
        tenantId,
        userId,
        emailId: email.id,
        emailSubject: email.subject,
        eventType: 'classification',
        source: 'rule',
        category: ruleCategory,
        confidence: 1.0,
        reasoning: `Rule: ${ruleMatches[0].rule.name}`,
        ruleId: ruleMatches[0].rule.id,
      });
    } else if (services.classifier) {
      // AI Classification
      const aiResult = await services.classifier.classify(email);
      result.classification = aiResult.result;
      result.classificationSource = 'ai';

      // Track token usage
      result.tokenUsage.prompt += aiResult.usage.prompt_tokens;
      result.tokenUsage.completion += aiResult.usage.completion_tokens;
      result.tokenUsage.total += aiResult.usage.total_tokens;

      const cost = estimateCost(aiResult.usage.prompt_tokens, aiResult.usage.completion_tokens);
      result.tokenUsage.estimatedCostUsd += cost;

      await logEvent({
        tenantId,
        userId,
        emailId: email.id,
        emailSubject: email.subject,
        eventType: 'classification',
        source: 'ai',
        category: aiResult.result.category,
        confidence: aiResult.result.confidence,
        reasoning: aiResult.result.reasoning,
        model: aiResult.model,
        tokensPrompt: aiResult.usage.prompt_tokens,
        tokensCompletion: aiResult.usage.completion_tokens,
        tokensTotal: aiResult.usage.total_tokens,
        estimatedCostUsd: cost,
        processingTimeMs: aiResult.processingTimeMs,
      });
    }

    // Step 3: Action extraction (for actionable categories)
    const actionableCategories = ['Aktion erforderlich', 'Dringend', 'Meeting', 'Finanzen'];
    const shouldExtractActions = result.classification &&
      (actionableCategories.includes(result.classification.category) ||
       result.classification.signals?.isActionRequired) &&
      !options.skipActionExtraction;

    if (shouldExtractActions && services.actionExtractor) {
      const actionResult = await services.actionExtractor.extract(email);
      result.actions = actionResult.actions;

      result.tokenUsage.prompt += actionResult.usage.prompt_tokens;
      result.tokenUsage.completion += actionResult.usage.completion_tokens;
      result.tokenUsage.total += actionResult.usage.total_tokens;
      const cost = estimateCost(actionResult.usage.prompt_tokens, actionResult.usage.completion_tokens);
      result.tokenUsage.estimatedCostUsd += cost;

      for (const action of actionResult.actions) {
        await logEvent({
          tenantId,
          userId,
          emailId: email.id,
          emailSubject: email.subject,
          eventType: 'action_extracted',
          source: 'ai',
          model: actionResult.model,
          metadata: { action },
        });
      }
    }

    // Step 4: Document detection (for finance category)
    const financeCategories = ['Finanzen'];
    const shouldDetectDocument = result.classification &&
      financeCategories.includes(result.classification.category);

    if (shouldDetectDocument && services.documentDetector) {
      const docResult = await services.documentDetector.detect(email);
      result.document = docResult.document;

      result.tokenUsage.prompt += docResult.usage.prompt_tokens;
      result.tokenUsage.completion += docResult.usage.completion_tokens;
      result.tokenUsage.total += docResult.usage.total_tokens;
      const cost = estimateCost(docResult.usage.prompt_tokens, docResult.usage.completion_tokens);
      result.tokenUsage.estimatedCostUsd += cost;
    }

    // Step 5: Collect executable actions from rules
    result.pendingActions = getExecutableActions(ruleMatches);

    // Step 6: Auto-apply decision
    if (result.classification && result.classification.confidence >= autoApplyThreshold) {
      result.autoApply = true;
    }

    // Update rule trigger counts (if not dry run)
    if (!dryRun) {
      for (const match of ruleMatches) {
        await incrementRuleTrigger(match.rule.id);
      }
    }

  } catch (error) {
    logger.error('Processing pipeline error', {
      emailId: email.id,
      tenantId,
      error: (error as Error).message,
    });

    await logEvent({
      tenantId,
      userId,
      emailId: email.id,
      emailSubject: email.subject,
      eventType: 'error',
      source: 'system',
      metadata: { error: (error as Error).message },
    });

    throw error;
  }

  result.processingTimeMs = Date.now() - startTime;
  return result;
}

/**
 * Process multiple emails through the pipeline.
 */
export async function processEmailBatch(
  tenantId: string,
  userId: string,
  emails: EmailForProcessing[],
  options: ProcessingOptions = {},
  services: {
    classifier?: AIClassifier;
    actionExtractor?: AIActionExtractor;
    documentDetector?: AIDocumentDetector;
  } = {}
): Promise<ProcessingResult[]> {
  // Load rules once for the batch
  const rules = await loadTenantRules(tenantId);

  const results: ProcessingResult[] = [];
  for (const email of emails) {
    const result = await processEmail(tenantId, userId, email, options, services);
    results.push(result);
  }

  return results;
}

// Helper: increment rule trigger count
import { query } from '../db';

async function incrementRuleTrigger(ruleId: string): Promise<void> {
  try {
    await query(
      'UPDATE rules SET trigger_count = trigger_count + 1, last_triggered_at = NOW() WHERE id = $1',
      [ruleId]
    );
  } catch (error) {
    logger.error('Failed to update rule trigger count', { ruleId, error: (error as Error).message });
  }
}
