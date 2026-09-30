// Document Detector Adapter
// Wraps the existing documentDetectionService into the AIDocumentDetector pipeline interface

import { detectDocument } from './documentDetectionService';
import type { AIDocumentDetector } from '../engine/processingPipeline';
import type { EmailForProcessing } from '../engine/ruleEngine';

/**
 * Create an AIDocumentDetector adapter for the processing pipeline.
 */
export function createDocumentDetector(): AIDocumentDetector {
  return {
    async detect(email: EmailForProcessing) {
      const result = await detectDocument(
        email.subject,
        email.body || email.bodyPreview,
        email.senderEmail,
        email.hasAttachments
      );

      // Map documentDetectionService result to pipeline DocumentInfo format
      if (!result.document) {
        return {
          document: null,
          usage: result.usage,
          model: result.model,
          processingTimeMs: result.processingTimeMs,
        };
      }

      return {
        document: {
          type: result.document.type as 'invoice' | 'order' | 'contract' | 'receipt',
          confidence: result.document.confidence,
          extractedData: result.document.extractedData,
          suggestedActions: result.document.suggestedActions,
        },
        usage: result.usage,
        model: result.model,
        processingTimeMs: result.processingTimeMs,
      };
    },
  };
}
