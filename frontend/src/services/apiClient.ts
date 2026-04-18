// Centralized API client with MSAL token injection
// All backend API calls should go through this client

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalConfig } from '../config/msalConfig';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7071/api';

let msalInstance: PublicClientApplication | null = null;

export const setMsalInstance = (instance: PublicClientApplication) => {
  msalInstance = instance;
};

// Acquire access token silently, fallback to interactive
const getAccessToken = async (): Promise<string> => {
  if (!msalInstance) {
    throw new Error('MSAL instance not initialized. Call setMsalInstance first.');
  }

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error('No authenticated account. Please log in.');
  }

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: [`api://${msalConfig.auth.clientId}/access_as_user`],
      account: accounts[0],
    });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Fallback: use Graph token as bearer for backend
      const result = await msalInstance.acquireTokenSilent({
        scopes: ['User.Read'],
        account: accounts[0],
      });
      return result.accessToken;
    }
    throw error;
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
      errorMessage = errorData.details || errorData.error || errorData.message || `API error: ${response.status}`;
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
