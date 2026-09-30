// Copilot Draft API client
//
// Wraps the backend /api/copilot endpoints. Keep the types mirrored with
// backend/src/routes/copilot.ts → backend/src/services/copilotService.ts.

import { api } from './apiClient';

export type CitationSource = 'teams' | 'sharepoint' | 'onedrive' | 'email' | 'other';

export interface CopilotCitation {
  index: number;
  title: string;
  url: string | null;
  source: CitationSource;
  snippet: string;
}

export interface CopilotDraftDto {
  id?: string;
  draft_text: string;
  citations: CopilotCitation[];
  model?: string;
  retrievalHitCount?: number;
  processingTimeMs?: number;
  created_at?: string;
  source?: 'azure_openai' | 'copilot_rag';
}

export interface GenerateDraftRequest {
  emailId: string;
  emailSubject: string;
  emailBody: string;
  emailSender: string;
  instruction?: string;
  userName?: string;
}

export class CopilotUnavailableError extends Error {
  readonly reason: string;
  readonly status: number;
  constructor(message: string, reason: string, status: number) {
    super(message);
    this.name = 'CopilotUnavailableError';
    this.reason = reason;
    this.status = status;
  }
}

/**
 * Fetch the latest stored draft for an email. Returns null when no draft exists
 * (typical for non-premium tenants or emails that did not trigger generation).
 */
export async function getLatestDraft(emailId: string): Promise<CopilotDraftDto | null> {
  try {
    return await api.get<CopilotDraftDto>(`/copilot/drafts/${encodeURIComponent(emailId)}`);
  } catch (err) {
    // The shared apiClient throws a generic Error with a message like
    // "API error: 404 Not Found". Treat 404 as "no draft yet".
    const msg = (err as Error).message || '';
    if (/404/.test(msg)) return null;
    throw err;
  }
}

/**
 * Request a fresh Copilot-grounded draft. Used by the "Regenerate" button.
 */
export async function generateDraft(input: GenerateDraftRequest): Promise<CopilotDraftDto> {
  try {
    return await api.post<CopilotDraftDto>('/copilot/draft', input);
  } catch (err) {
    const msg = (err as Error).message || '';
    const statusMatch = msg.match(/API error:\s*(\d{3})/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;
    if (status === 403) {
      throw new CopilotUnavailableError(
        'Dein Tenant hat keine Copilot-Lizenz oder es fehlt die Admin-Zustimmung.',
        'no_copilot_license',
        403
      );
    }
    if (status === 503) {
      throw new CopilotUnavailableError(
        'Copilot-OBO ist im Backend nicht konfiguriert.',
        'obo_not_configured',
        503
      );
    }
    throw err;
  }
}
