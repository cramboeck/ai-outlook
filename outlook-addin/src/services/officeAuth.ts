// Office SSO Authentication
// Exchanges Office identity token for backend JWT
// Used instead of MSAL redirect flow (which doesn't work in Office Add-in iframe)

declare const Office: any;
declare const OfficeRuntime: any;

const API_URL = 'http://localhost:7071/api';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get an access token using Office SSO.
 * Falls back to dialog-based auth if SSO is not available.
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    // Try Office SSO first
    const ssoToken = await Office.auth.getAccessTokenAsync({
      allowSignInPrompt: true,
      allowConsentPrompt: true,
      forMSGraphAccess: true,
    });

    // Exchange SSO token for backend JWT
    const response = await fetch(`${API_URL}/auth/exchange-office-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ssoToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Token exchange failed');
    }

    const data = await response.json();
    cachedToken = data.accessToken;
    tokenExpiry = Date.now() + (data.expiresIn || 3600) * 1000;

    return cachedToken!;
  } catch (error) {
    // SSO not available - fall back to using the SSO token directly
    // The backend will validate it as an Azure AD token
    console.warn('Office SSO fallback:', error);

    try {
      const ssoToken = await Office.auth.getAccessTokenAsync({
        allowSignInPrompt: true,
      });
      cachedToken = ssoToken;
      tokenExpiry = Date.now() + 3600 * 1000;
      return ssoToken;
    } catch (ssoError) {
      throw new Error('Authentication failed. Please sign in again.');
    }
  }
}

/**
 * Make an authenticated API call to the backend.
 */
export async function apiCall<T = unknown>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'API error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Clear cached token (for logout or token refresh).
 */
export function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}
