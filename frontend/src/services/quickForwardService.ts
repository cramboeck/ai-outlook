// Quick-Forward Service
// Shared logic: fetch the PDF attachment from Graph, acquire a SharePoint-
// capable Graph token, POST to /api/integrations/:id/forward, surface a
// structured result so the caller can toast success / link / error.

import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { api } from './apiClient';
import {
  initGraphClient,
  getDocumentAttachments,
} from './graphService';
import { graphScopes, sharepointScopes } from '../config/msalConfig';
import type { Email } from '../types';

export interface Integration {
  id: string;
  type: 'sharepoint' | 'sevdesk' | 'datev' | 'paperless' | 'webhook';
  name: string;
  description?: string | null;
  enabled: boolean;
  status?: string;
  last_error?: string | null;
}

export interface ForwardOutcome {
  success: boolean;
  message: string;
  document_id?: number;
  file_url?: string;
}

export async function fetchActiveIntegrations(): Promise<Integration[]> {
  const data = await api.get<{ items: Integration[] }>('/integrations');
  return (data.items ?? []).filter(i => i.enabled);
}

export interface ForwardPrefill {
  integrationType: Integration['type'];
  /** Map of document_data-field → target-system-column label. Empty when the
   *  integration does not have a user-editable metadata schema. */
  metadata_columns: Record<string, string>;
  /** Latest extracted document_data for this email from any prior AI run. */
  prefill: Record<string, unknown>;
}

export async function getForwardPrefill(
  integrationId: string,
  emailId: string
): Promise<ForwardPrefill> {
  return api.get<ForwardPrefill>(
    `/integrations/${encodeURIComponent(integrationId)}/forward-prefill?email_id=${encodeURIComponent(emailId)}`
  );
}

/**
 * Pull the primary document attachment (PDF preferred) from Graph. Returns
 * null when no suitable attachment is present — the caller can decide
 * whether to abort (sevDesk/Paperless need a PDF) or continue (Webhook /
 * Teams work without).
 */
export async function fetchPrimaryAttachment(
  instance: IPublicClientApplication,
  account: AccountInfo,
  emailId: string
): Promise<{ name: string; contentType: string; contentBytes: string } | null> {
  const token = await instance.acquireTokenSilent({
    ...graphScopes,
    account,
  });
  initGraphClient(token.accessToken);
  const attachments = await getDocumentAttachments(emailId);
  const first = attachments[0];
  if (!first?.contentBytes) return null;
  return {
    name: first.name,
    contentType: first.contentType,
    contentBytes: first.contentBytes,
  };
}

/**
 * Try to acquire a Graph token with SharePoint scopes. Falls back to the
 * standard Graph scopes — SharePoint forwards will then 403 server-side
 * with a clear error, which the UI surfaces via the toast.
 */
export async function acquireSharepointAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<string | undefined> {
  try {
    const result = await instance.acquireTokenSilent({
      scopes: sharepointScopes.scopes,
      account,
    });
    return result.accessToken;
  } catch {
    try {
      const fallback = await instance.acquireTokenSilent({
        scopes: graphScopes.scopes,
        account,
      });
      return fallback.accessToken;
    } catch {
      return undefined;
    }
  }
}

/**
 * Core action: forward this email to a single integration. The backend
 * endpoint is shared with the Freigabe-Workflow, so the same path handles
 * attachment upload, metadata, and per-integration logic.
 */
export async function forwardEmailToIntegration(
  instance: IPublicClientApplication,
  account: AccountInfo,
  email: Email,
  integrationId: string,
  integrationType: Integration['type'],
  /** Optional enriched document_data (auto-extracted + user-edited fields
   *  from the MetadataPrefillModal). Overrides the server-side fallback
   *  that would otherwise reuse the last action's data. */
  documentData?: Record<string, unknown>
): Promise<ForwardOutcome> {
  const attachment = await fetchPrimaryAttachment(instance, account, email.id).catch(() => null);

  // SharePoint needs the user's Graph token to upload against their drive.
  const accessToken = integrationType === 'sharepoint'
    ? await acquireSharepointAccessToken(instance, account)
    : undefined;

  try {
    const result = await api.post<{
      success?: boolean;
      message?: string;
      document_id?: number;
      file_url?: string;
    }>(`/integrations/${integrationId}/forward`, {
      email_id: email.id,
      email_subject: email.subject,
      attachment: attachment ?? undefined,
      access_token: accessToken,
      document_data: documentData,
    });
    return {
      success: result.success ?? true,
      message: result.message ?? 'Erfolgreich weitergeleitet',
      document_id: result.document_id,
      file_url: result.file_url,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Weiterleitung fehlgeschlagen',
    };
  }
}
