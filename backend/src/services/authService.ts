// Auth Service — Token exchange helpers
//
// The app validates incoming user tokens in middleware/auth.ts. For privileged
// downstream calls (Microsoft Graph / Copilot Retrieval) we cannot reuse the
// incoming token because its audience is our own API. Instead we run the
// OAuth 2.0 On-Behalf-Of (OBO) flow to exchange the user's token for a fresh
// Graph-audience token that carries the same user identity.
//
// Env vars required for OBO:
//   AZURE_CLIENT_ID          — App registration client id
//   AZURE_CLIENT_SECRET      — App registration client secret
//   AZURE_TENANT_ID          — Tenant id or 'common' / 'organizations' for multi-tenant
//
// Azure AD app must have the Graph delegated permissions granted:
//   Chat.Read, Files.Read.All, Sites.Read.All, User.Read  (minimum for Copilot Retrieval)

import { ConfidentialClientApplication, Configuration, LogLevel } from '@azure/msal-node';
import { logger } from './logger';

export const GRAPH_SCOPES_COPILOT = [
  'https://graph.microsoft.com/Chat.Read',
  'https://graph.microsoft.com/Files.Read.All',
  'https://graph.microsoft.com/Sites.Read.All',
  'https://graph.microsoft.com/User.Read',
];

export class OboAuthError extends Error {
  readonly code: 'missing_config' | 'invalid_grant' | 'consent_required' | 'unknown';
  readonly httpStatus: number;

  constructor(
    message: string,
    code: OboAuthError['code'],
    httpStatus = 500
  ) {
    super(message);
    this.name = 'OboAuthError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

let cachedApp: ConfidentialClientApplication | null = null;

function getMsalApp(): ConfidentialClientApplication {
  if (cachedApp) return cachedApp;

  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID || 'common';

  if (!clientId || !clientSecret) {
    throw new OboAuthError(
      'OBO flow disabled: AZURE_CLIENT_ID or AZURE_CLIENT_SECRET missing',
      'missing_config',
      503
    );
  }

  const config: Configuration = {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    system: {
      loggerOptions: {
        // Never log PII / tokens. Warn level keeps us aware of config issues.
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          if (level === LogLevel.Error) logger.error('msal', { message });
          else if (level === LogLevel.Warning) logger.warn('msal', { message });
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Warning,
      },
    },
  };

  cachedApp = new ConfidentialClientApplication(config);
  return cachedApp;
}

export interface GraphTokenResult {
  accessToken: string;
  expiresOn: Date | null;
  scopes: string[];
}

/**
 * Exchange the user's inbound JWT for a Graph-audience token carrying the
 * same user identity. Used to call Microsoft Graph APIs on behalf of the
 * signed-in user (Copilot Retrieval requires this).
 *
 * @param clientToken  Raw JWT from the incoming Authorization header (without
 *                     the 'Bearer ' prefix)
 * @param scopes       Graph scopes to request. Defaults to Copilot Retrieval set.
 * @throws OboAuthError on misconfiguration, missing consent, or invalid token
 */
export async function getGraphTokenOnBehalfOf(
  clientToken: string,
  scopes: string[] = GRAPH_SCOPES_COPILOT
): Promise<GraphTokenResult> {
  if (!clientToken || clientToken.length < 20) {
    throw new OboAuthError('clientToken is missing or malformed', 'unknown', 400);
  }

  const app = getMsalApp();

  try {
    const result = await app.acquireTokenOnBehalfOf({
      oboAssertion: clientToken,
      scopes,
    });

    if (!result?.accessToken) {
      throw new OboAuthError('MSAL returned no accessToken', 'unknown');
    }

    return {
      accessToken: result.accessToken,
      expiresOn: result.expiresOn ?? null,
      scopes: result.scopes ?? scopes,
    };
  } catch (err) {
    // msal-node surfaces `errorCode` and `errorMessage` on its errors.
    const anyErr = err as { errorCode?: string; errorMessage?: string; message?: string };
    const errorCode = anyErr.errorCode ?? 'unknown';
    const errorMessage = anyErr.errorMessage ?? anyErr.message ?? 'unknown';

    // We deliberately do NOT log the token itself.
    logger.warn('OBO token acquisition failed', { errorCode, errorMessage: errorMessage.slice(0, 200) });

    if (
      errorCode === 'invalid_grant' ||
      errorMessage.includes('AADSTS65001') ||
      errorMessage.includes('consent')
    ) {
      throw new OboAuthError(
        'User or admin has not consented to the required Graph scopes',
        'consent_required',
        403
      );
    }
    if (errorCode === 'interaction_required') {
      throw new OboAuthError(
        'Interactive sign-in required (MFA / conditional access)',
        'consent_required',
        403
      );
    }

    throw new OboAuthError(
      `OBO exchange failed: ${errorCode}`,
      errorCode === 'invalid_grant' ? 'invalid_grant' : 'unknown',
      401
    );
  }
}

/**
 * True when OBO is wired up (env vars + msal app constructible).
 * Lets callers short-circuit without catching OboAuthError.
 */
export function isOboConfigured(): boolean {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}

/**
 * Extract the raw bearer token from an Express request's Authorization header.
 * Returns null when no usable token is present.
 */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith('Bearer ')) return null;
  const token = authorizationHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}
