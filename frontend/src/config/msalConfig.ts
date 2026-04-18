import type { Configuration } from '@azure/msal-browser';
import { LogLevel } from '@azure/msal-browser';

// Multi-tenant: Use 'organizations' for work/school accounts only
// Use 'common' to also allow personal Microsoft accounts
const authority = import.meta.env.VITE_MSAL_TENANT_ID
  ? `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID}`
  : 'https://login.microsoftonline.com/organizations';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID || '',
    authority,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    // Required for multi-tenant apps
    knownAuthorities: ['login.microsoftonline.com'],
    // Navigate to requesting page after login
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage', // Use localStorage for better persistence across tabs
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            break;
          case LogLevel.Warning:
            console.warn(message);
            break;
          default:
            break;
        }
      },
    },
  },
};

// Helper to get the client ID
export const getClientId = (): string => {
  return import.meta.env.VITE_MSAL_CLIENT_ID || '';
};

// Admin consent URL generator for tenant admins
export const getAdminConsentUrl = (redirectUri?: string): string => {
  const clientId = getClientId();
  const redirect = redirectUri || `${window.location.origin}/admin-consent`;
  const scopes = graphScopes.scopes.join(' ');

  return `https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirect)}`;
};

export const loginRequest = {
  scopes: ['User.Read', 'Mail.ReadWrite', 'Mail.Send', 'MailboxSettings.ReadWrite'],
};

export const graphScopes = {
  scopes: [
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/MailboxSettings.ReadWrite',
  ],
};

// Separate scopes for To-Do sync - requested only when needed
export const todoScopes = {
  scopes: [
    'https://graph.microsoft.com/Tasks.ReadWrite',
  ],
};

// Separate scopes for SharePoint - requested only when needed
export const sharepointScopes = {
  scopes: [
    'https://graph.microsoft.com/Sites.ReadWrite.All',
  ],
};
