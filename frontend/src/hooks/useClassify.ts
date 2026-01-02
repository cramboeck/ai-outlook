import { useMutation } from '@tanstack/react-query';
import { classifyEmail, classifyEmailBatch, prepareBodyForClassification } from '../services/classifyService';
import type { Email, Classification, BatchClassificationResult } from '../types';

export const useClassify = () => {
  // Einzelne E-Mail klassifizieren
  const classifyMutation = useMutation({
    mutationFn: async (email: Email): Promise<Classification> => {
      const bodyContent = email.body?.content || email.bodyPreview;
      const contentType = email.body?.contentType || 'text';

      return classifyEmail({
        subject: email.subject,
        body: prepareBodyForClassification(bodyContent, contentType),
        sender: email.from.emailAddress.address,
        receivedDateTime: email.receivedDateTime,
        importance: email.importance,
      });
    },
  });

  // Mehrere E-Mails klassifizieren
  const classifyBatchMutation = useMutation({
    mutationFn: async (emails: Email[]): Promise<BatchClassificationResult> => {
      const preparedEmails = emails.map((email) => ({
        id: email.id,
        subject: email.subject,
        body: prepareBodyForClassification(
          email.body?.content || email.bodyPreview,
          email.body?.contentType || 'text'
        ),
        sender: email.from.emailAddress.address,
      }));

      return classifyEmailBatch({ emails: preparedEmails });
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

    reset: () => {
      classifyMutation.reset();
      classifyBatchMutation.reset();
    },
  };
};
