import type { Classification, BatchClassificationResult, ClassifyRequest, BatchClassifyRequest, Email, EmailContext } from '../types';
import { getActiveCategories } from './categoryService';
import { api } from './apiClient';

// Convert Category to CategoryDefinition for API
const getCategoriesForApi = () => {
  return getActiveCategories().map(cat => ({
    name: cat.name,
    description: cat.description,
    keywords: cat.keywords,
  }));
};

// Extract context signals from an email
export const extractEmailContext = (email: Email, userEmail?: string): EmailContext => {
  const subject = email.subject || '';
  const senderAddress = email.from?.emailAddress?.address || '';

  // Check if user is direct recipient or CC
  const toRecipients = email.toRecipients || [];
  const isDirectRecipient = userEmail
    ? toRecipients.some(r => r.emailAddress?.address?.toLowerCase() === userEmail.toLowerCase())
    : true; // Assume direct if we don't know user email

  // Extract sender domain
  const senderDomain = senderAddress.includes('@')
    ? senderAddress.split('@')[1].toLowerCase()
    : '';

  // Detect RE: / AW: (Reply)
  const isReply = /^(re:|aw:|antw:|antwort:|reply:)/i.test(subject.trim());

  // Detect FW: / WG: (Forward)
  const isForward = /^(fw:|fwd:|wg:|weiterl:|weitergeleitet:)/i.test(subject.trim());

  // Count CC recipients (estimate based on conversation)
  // Since we don't have ccRecipients directly, we estimate
  const ccCount = 0; // Would need ccRecipients from Graph API

  return {
    isReply,
    isForward,
    isDirectRecipient,
    ccCount,
    senderDomain,
    hasAttachments: email.hasAttachments || false,
  };
};

// Extract context for batch processing
export const extractBatchEmailContext = (
  emails: Array<{ id: string; subject: string; body: string; sender: string; hasAttachments?: boolean }>,
  _userEmail?: string
): Array<{ id: string; subject: string; body: string; sender: string; context: EmailContext }> => {
  return emails.map(email => {
    const subject = email.subject || '';
    const senderAddress = email.sender || '';

    const senderDomain = senderAddress.includes('@')
      ? senderAddress.split('@')[1].toLowerCase()
      : '';

    const isReply = /^(re:|aw:|antw:|antwort:|reply:)/i.test(subject.trim());
    const isForward = /^(fw:|fwd:|wg:|weiterl:|weitergeleitet:)/i.test(subject.trim());

    return {
      ...email,
      context: {
        isReply,
        isForward,
        isDirectRecipient: true, // Assume direct for batch (inbox usually)
        ccCount: 0,
        senderDomain,
        hasAttachments: email.hasAttachments || false,
      },
    };
  });
};

export const classifyEmail = async (request: ClassifyRequest): Promise<Classification> => {
  const result = await api.post<Record<string, unknown>>('/classify', {
    ...request,
    categories: getCategoriesForApi(),
  });

  return {
    category: result.category as string,
    confidence: result.confidence as number,
    reasoning: result.reasoning as string,
    urgency: (result.urgency as string) || 'medium',
    suggestedAction: result.suggestedAction as string | undefined,
    signals: (result.signals as Classification['signals']) || {
      isActionRequired: false,
      hasDeadline: false,
      isAutomated: false,
    },
  };
};

export const classifyEmailBatch = async (
  request: BatchClassifyRequest
): Promise<BatchClassificationResult> => {
  const enrichedEmails = extractBatchEmailContext(
    request.emails.map(e => ({
      ...e,
      hasAttachments: false,
    }))
  );

  const result = await api.post<{ results: any[]; totalTokens: number; processingTimeMs: number }>('/classify-batch', {
    emails: enrichedEmails,
    categories: getCategoriesForApi(),
  });

  return {
    results: (result.results || []).map((r: any) => ({
      id: r.id,
      category: r.category,
      confidence: r.confidence,
      reasoning: r.reasoning,
      urgency: r.urgency || 'medium',
      signals: r.signals || {
        isActionRequired: false,
        hasDeadline: false,
        isAutomated: false,
      },
    })),
    totalTokens: result.totalTokens || 0,
    processingTimeMs: result.processingTimeMs || 0,
  };
};

// Helper: HTML zu Text konvertieren
export const htmlToText = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
};

// Helper: Body für Klassifizierung vorbereiten (max 2000 chars)
export const prepareBodyForClassification = (body: string, contentType: 'text' | 'html'): string => {
  let text = contentType === 'html' ? htmlToText(body) : body;
  // Whitespace normalisieren
  text = text.replace(/\s+/g, ' ').trim();
  // Auf 2000 Zeichen begrenzen
  return text.length > 2000 ? text.substring(0, 2000) + '...' : text;
};

// Get urgency color for UI
export const getUrgencyColor = (urgency: string): string => {
  switch (urgency) {
    case 'critical': return '#dc2626'; // red-600
    case 'high': return '#ea580c'; // orange-600
    case 'medium': return '#ca8a04'; // yellow-600
    case 'low': return '#16a34a'; // green-600
    default: return '#6b7280'; // gray-500
  }
};

// Get urgency label for UI
export const getUrgencyLabel = (urgency: string): string => {
  switch (urgency) {
    case 'critical': return 'Kritisch';
    case 'high': return 'Hoch';
    case 'medium': return 'Mittel';
    case 'low': return 'Niedrig';
    default: return urgency;
  }
};
