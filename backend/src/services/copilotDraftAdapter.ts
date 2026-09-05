// Copilot Draft Adapter
// Wraps copilotService.generateContextAwareDraft into the pipeline's
// AICopilotDraftGenerator interface. Translates the service's "unavailable"
// outcome into a { skipped: { reason } } marker so the pipeline can record
// *why* the premium draft did not materialise.

import { generateContextAwareDraft } from './copilotService';
import type {
  AICopilotDraftGenerator,
  CopilotDraft,
} from '../engine/processingPipeline';
import type { EmailForProcessing } from '../engine/ruleEngine';

export function createCopilotDraftGenerator(): AICopilotDraftGenerator {
  return {
    async generate(email: EmailForProcessing, userAccessToken: string) {
      const outcome = await generateContextAwareDraft({
        emailSubject: email.subject,
        emailBody: email.body || email.bodyPreview || '',
        emailSender: email.senderEmail,
        userAccessToken,
      });

      if (outcome.status === 'unavailable') {
        const skipped: CopilotDraft = {
          draftText: '',
          citations: [],
          model: '',
          retrievalHitCount: 0,
          processingTimeMs: 0,
          skipped: { reason: outcome.reason },
        };
        return {
          draft: skipped,
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
      }

      const { draft } = outcome;
      return {
        draft: {
          draftText: draft.draftText,
          citations: draft.citations,
          model: draft.model,
          retrievalHitCount: draft.retrievalHitCount,
          processingTimeMs: draft.processingTimeMs,
        },
        usage: draft.usage,
      };
    },
  };
}
