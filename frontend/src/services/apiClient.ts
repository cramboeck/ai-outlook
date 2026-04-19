// Centralized API client with MSAL token injection
// All backend API calls should go through this client

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7071/api';

let msalInstance: PublicClientApplication | null = null;

export const setMsalInstance = (instance: PublicClientApplication) => {
  msalInstance = instance;
};

// Acquire a backend-bearer token.
//
// We deliberately use the Graph-audience User.Read scope: it is part of
// every initial loginRequest, so MSAL always has a valid refresh token for
// it. The original attempt to mint a custom api://<clientId>/access_as_user
// token was throwing 400 (invalid_scope) on tenants where "Expose an API"
// was never configured — which broke every authenticated call in the UI.
//
// On any silent failure (expired refresh token, CA policy change, server
// 400) we fall back to an interactive popup so the UI self-heals instead
// of requiring manual storage clears.
const getAccessToken = async (): Promise<string> => {
  if (!msalInstance) {
    throw new Error('MSAL instance not initialized. Call setMsalInstance first.');
  }

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error('No authenticated account. Please log in.');
  }

  const scopes = ['User.Read'];

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes,
      account: accounts[0],
    });
    return result.accessToken;
  } catch (silentErr) {
    const needsInteraction =
      silentErr instanceof InteractionRequiredAuthError
      || (silentErr as { errorCode?: string })?.errorCode === 'invalid_grant'
      || (silentErr as { name?: string })?.name === 'ServerError'
      || (silentErr as { message?: string })?.message?.includes('400');

    if (!needsInteraction) throw silentErr;

    try {
      const popupResult = await msalInstance.acquireTokenPopup({
        scopes,
        account: accounts[0],
      });
      return popupResult.accessToken;
    } catch (popupErr) {
      throw new Error(
        `Authentifizierung fehlgeschlagen. Bitte melde dich neu an. (${(popupErr as Error).message ?? 'unknown'})`
      );
    }
  }
};

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export const apiClient = async <T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (!skipAuth) {
    let gotToken = false;
    if (msalInstance) {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        try {
          const token = await getAccessToken();
          requestHeaders['Authorization'] = `Bearer ${token}`;
          gotToken = true;
        } catch {
          // Token acquisition failed - fall through to dev mode
        }
      }
    }

    if (!gotToken) {
      if (import.meta.env.DEV) {
        // Dev mode: send mock auth headers (backend SKIP_AUTH=true accepts these)
        requestHeaders['X-Tenant-Id'] = '00000000-0000-4000-a000-000000000001';
        requestHeaders['X-User-Id'] = '00000000-0000-4000-a000-000000000002';
        requestHeaders['X-User-Email'] = 'dev@localhost';
        requestHeaders['X-User-Name'] = 'Dev User';
      } else {
        throw new Error('Authentication required');
      }
    }
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorData = await response.json();
      errorMessage = formatApiError(errorData, response.status);
    } catch {
      errorMessage = `API error: ${response.status} ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
};

// Turn any error payload into a single readable string. Supports:
//   - Zod validation: { error: 'Validation failed', details: [{field,message}] }
//   - Copilot-unavailable: { error, reason }
//   - Generic: { error: string } or { message: string }
function formatApiError(payload: unknown, status: number): string {
  if (!payload || typeof payload !== 'object') {
    return `API error: ${status}`;
  }
  const p = payload as Record<string, unknown>;

  // Zod details array → "field: message" joined
  if (Array.isArray(p.details)) {
    const parts = p.details
      .map(d => {
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          const obj = d as { field?: string; message?: string };
          return obj.field ? `${obj.field}: ${obj.message ?? '?'}` : obj.message ?? JSON.stringify(d);
        }
        return String(d);
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }

  // Normal string fields
  for (const key of ['error', 'message', 'details'] as const) {
    const v = p[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }

  return `API error: ${status}`;
}

// Convenience methods
export const api = {
  get: <T = unknown>(endpoint: string, options?: Omit<ApiRequestOptions, 'method'>) =>
    apiClient<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(endpoint, { ...options, method: 'POST', body }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(endpoint, { ...options, method: 'PATCH', body }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiClient<T>(endpoint, { ...options, method: 'PUT', body }),

  delete: <T = unknown>(endpoint: string, options?: Omit<ApiRequestOptions, 'method'>) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' }),
};
