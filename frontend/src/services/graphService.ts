import { Client } from '@microsoft/microsoft-graph-client';
import type { Email, User, Category } from '../types';

let graphClient: Client | null = null;

export const initGraphClient = (accessToken: string): Client => {
  graphClient = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
  return graphClient;
};

export const getGraphClient = (): Client => {
  if (!graphClient) {
    throw new Error('Graph client not initialized. Call initGraphClient first.');
  }
  return graphClient;
};

// User info
export const getMe = async (): Promise<User> => {
  const client = getGraphClient();
  return await client.api('/me').select('id,displayName,mail,userPrincipalName').get();
};

// E-Mails laden
export const getEmails = async (
  top: number = 50,
  skip: number = 0
): Promise<{ value: Email[]; '@odata.nextLink'?: string }> => {
  const client = getGraphClient();
  return await client
    .api('/me/messages')
    .select(
      'id,subject,bodyPreview,from,receivedDateTime,importance,categories,isRead,hasAttachments,conversationId'
    )
    .top(top)
    .skip(skip)
    .orderby('receivedDateTime desc')
    .get();
};

// E-Mail mit Body laden (für Klassifizierung)
export const getEmailWithBody = async (messageId: string): Promise<Email> => {
  const client = getGraphClient();
  return await client
    .api(`/me/messages/${messageId}`)
    .select('id,subject,body,bodyPreview,from,receivedDateTime,importance,categories')
    .get();
};

// Kategorie setzen
export const setEmailCategory = async (messageId: string, categories: string[]): Promise<void> => {
  const client = getGraphClient();
  await client.api(`/me/messages/${messageId}`).patch({
    categories,
  });
};

// Master-Kategorien laden
export const getMasterCategories = async (): Promise<{ value: Category[] }> => {
  const client = getGraphClient();
  return await client.api('/me/outlook/masterCategories').get();
};

// Master-Kategorie erstellen
export const createMasterCategory = async (displayName: string, color: string): Promise<void> => {
  const client = getGraphClient();
  await client.api('/me/outlook/masterCategories').post({
    displayName,
    color,
  });
};

// Mehrere E-Mails gleichzeitig kategorisieren (Batch)
export const setEmailCategoriesBatch = async (
  updates: Array<{ id: string; categories: string[] }>
): Promise<void> => {
  const client = getGraphClient();

  // Graph API Batch Request (max 20 per batch)
  const batchSize = 20;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const batchRequest = {
      requests: batch.map((update, index) => ({
        id: `${index}`,
        method: 'PATCH',
        url: `/me/messages/${update.id}`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          categories: update.categories,
        },
      })),
    };

    await client.api('/$batch').post(batchRequest);
  }
};

// Helper: Unkategorisierte E-Mails filtern (client-seitig)
export const filterUncategorized = (emails: Email[]): Email[] => {
  return emails.filter((email) => email.categories.length === 0);
};

// Helper: E-Mails nach Kategorie filtern
export const filterByCategory = (emails: Email[], category: string): Email[] => {
  return emails.filter((email) => email.categories.includes(category));
};
