import { useMutation } from '@tanstack/react-query';
import { classifyEmail, classifyEmailBatch, prepareBodyForClassification } from '../services/classifyService';
import {
  getCachedClassification,
  cacheClassification,
  cacheClassificationBatch,
  markAsApplied,
  getPendingClassifications,
  getPendingCount,
  removeFromCache,
  clearPendingClassifications,
} from '../services/classificationCacheService';
import type { Email, Classification, BatchClassificationResult } from '../types';

export const useClassify = () => {
  // Einzelne E-Mail klassifizieren (mit Cache-Check)
  const classifyMutation = useMutation({
    mutationFn: async (email: Email): Promise<Classification> => {
      // Check cache first
      const cached = getCachedClassification(email.id);
      if (cached) {
        return cached.classification;
      }

      const bodyContent = email.body?.content || email.bodyPreview;
      const contentType = email.body?.contentType || 'text';

      const result = await classifyEmail({
        subject: email.subject,
        body: prepareBodyForClassification(bodyContent, contentType),
        sender: email.from.emailAddress.address,
        receivedDateTime: email.receivedDateTime,
        importance: email.importance,
      });

      // Cache the result
      cacheClassification(
        email.id,
        email.subject,
        email.from.emailAddress.address,
        result
      );

      return result;
    },
  });

  // Mehrere E-Mails klassifizieren (automatisch in 20er-Chunks aufgeteilt, mit Cache)
  const classifyBatchMutation = useMutation({
    mutationFn: async (emails: Email[]): Promise<BatchClassificationResult> => {
      // Check which emails are already cached
      const uncachedEmails: Email[] = [];
      const cachedResults: BatchClassificationResult['results'] = [];

      for (const email of emails) {
        const cached = getCachedClassification(email.id);
        if (cached) {
          cachedResults.push({
            id: email.id,
            category: cached.classification.category,
            confidence: cached.classification.confidence,
            reasoning: cached.classification.reasoning,
            urgency: cached.classification.urgency || 'medium',
            signals: cached.classification.signals || {
              isActionRequired: false,
              hasDeadline: false,
              isAutomated: false,
            },
          });
        } else {
          uncachedEmails.push(email);
        }
      }

      // If all cached, return immediately
      if (uncachedEmails.length === 0) {
        return {
          results: cachedResults,
          totalTokens: 0,
          processingTimeMs: 0,
        };
      }

      // Prepare uncached emails for API call
      const preparedEmails = uncachedEmails.map((email) => ({
        id: email.id,
        subject: email.subject,
        body: prepareBodyForClassification(
          email.body?.content || email.bodyPreview,
          email.body?.contentType || 'text'
        ),
        sender: email.from.emailAddress.address,
      }));

      // Split into chunks of 20 (API limit)
      const BATCH_SIZE = 20;
      const chunks: typeof preparedEmails[] = [];
      for (let i = 0; i < preparedEmails.length; i += BATCH_SIZE) {
        chunks.push(preparedEmails.slice(i, i + BATCH_SIZE));
      }

      // Process all chunks and combine results
      const allResults: BatchClassificationResult = {
        results: [...cachedResults],
        totalTokens: 0,
        processingTimeMs: 0,
      };

      for (const chunk of chunks) {
        const result = await classifyEmailBatch({ emails: chunk });

        // Cache each result
        const cacheItems = result.results.map((r) => {
          const email = uncachedEmails.find((e) => e.id === r.id)!;
          return {
            emailId: r.id,
            subject: email.subject,
            sender: email.from.emailAddress.address,
            classification: {
              category: r.category,
              confidence: r.confidence,
              reasoning: r.reasoning,
              urgency: r.urgency || 'medium',
              signals: r.signals || {
                isActionRequired: false,
                hasDeadline: false,
                isAutomated: false,
              },
            } as Classification,
          };
        });
        cacheClassificationBatch(cacheItems);

        allResults.results.push(...result.results);
        allResults.totalTokens += result.totalTokens;
        allResults.processingTimeMs += result.processingTimeMs;
      }

      return allResults;
    },
  });

  return {
    classify: classifyMutation.mutate,
    classifyAsync: classifyMutation.mutateAsync,
    isClassifying: classifyMutation.isPending,
    classificationResult: classifyMutation.data,
    classificationError: classifyMutation.error,

    classifyBatch: classifyBatchMutation.mutate,
    classifyBatchAsync: classifyBatchMutation.mutateAsync,
    isClassifyingBatch: classifyBatchMutation.isPending,
    batchResult: classifyBatchMutation.data,
    batchError: classifyBatchMutation.error,

    // Cache functions
    getPendingClassifications,
    getPendingCount,
    markAsApplied,
    removeFromCache,
    clearPendingClassifications,

    reset: () => {
      classifyMutation.reset();
      classifyBatchMutation.reset();
    },
  };
};
