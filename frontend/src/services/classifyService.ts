import type { Classification, BatchClassificationResult, ClassifyRequest, BatchClassifyRequest } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7071/api';

export const classifyEmail = async (request: ClassifyRequest): Promise<Classification> => {
  const response = await fetch(`${API_URL}/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Classification failed: ${error}`);
  }

  return response.json();
};

export const classifyEmailBatch = async (
  request: BatchClassifyRequest
): Promise<BatchClassificationResult> => {
  const response = await fetch(`${API_URL}/classify-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Batch classification failed: ${error}`);
  }

  return response.json();
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
