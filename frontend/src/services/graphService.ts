import { Client } from '@microsoft/microsoft-graph-client';
import type { Email, User, Category, MailFolder } from '../types';

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

// E-Mails laden (nur Posteingang)
export const getEmails = async (
  top: number = 50,
  skip: number = 0
): Promise<{ value: Email[]; '@odata.nextLink'?: string }> => {
  const client = getGraphClient();
  return await client
    .api('/me/mailFolders/inbox/messages')
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

// ========== MAIL CLIENT FUNCTIONS ==========

// Mail-Ordner laden
export const getMailFolders = async (): Promise<{ value: MailFolder[] }> => {
  const client = getGraphClient();
  return await client
    .api('/me/mailFolders')
    .select('id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount,isHidden')
    .top(50)
    .get();
};

// E-Mails aus beliebigem Ordner laden
export const getEmailsFromFolder = async (
  folderId: string,
  top: number = 50,
  skip: number = 0
): Promise<{ value: Email[]; '@odata.nextLink'?: string }> => {
  const client = getGraphClient();
  return await client
    .api(`/me/mailFolders/${folderId}/messages`)
    .select(
      'id,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,importance,categories,isRead,hasAttachments,conversationId,isDraft'
    )
    .top(top)
    .skip(skip)
    .orderby('receivedDateTime desc')
    .get();
};

// E-Mail senden
export const sendEmail = async (
  to: string[],
  subject: string,
  body: string,
  options?: {
    cc?: string[];
    bcc?: string[];
    bodyType?: 'text' | 'html';
    importance?: 'low' | 'normal' | 'high';
  }
): Promise<void> => {
  const client = getGraphClient();

  const message = {
    subject,
    body: {
      contentType: options?.bodyType || 'html',
      content: body,
    },
    toRecipients: to.map((email) => ({
      emailAddress: { address: email },
    })),
    ccRecipients: options?.cc?.map((email) => ({
      emailAddress: { address: email },
    })),
    bccRecipients: options?.bcc?.map((email) => ({
      emailAddress: { address: email },
    })),
    importance: options?.importance || 'normal',
  };

  await client.api('/me/sendMail').post({ message });
};

// Auf E-Mail antworten
export const replyToEmail = async (
  messageId: string,
  body: string,
  replyAll: boolean = false
): Promise<void> => {
  const client = getGraphClient();
  const endpoint = replyAll ? 'replyAll' : 'reply';

  await client.api(`/me/messages/${messageId}/${endpoint}`).post({
    message: {
      body: {
        contentType: 'html',
        content: body,
      },
    },
  });
};

// E-Mail weiterleiten
export const forwardEmail = async (
  messageId: string,
  to: string[],
  comment?: string
): Promise<void> => {
  const client = getGraphClient();

  await client.api(`/me/messages/${messageId}/forward`).post({
    toRecipients: to.map((email) => ({
      emailAddress: { address: email },
    })),
    comment,
  });
};

// E-Mail verschieben
export const moveEmail = async (
  messageId: string,
  destinationFolderId: string
): Promise<Email> => {
  const client = getGraphClient();
  return await client.api(`/me/messages/${messageId}/move`).post({
    destinationId: destinationFolderId,
  });
};

// E-Mail löschen (in Papierkorb)
export const deleteEmail = async (messageId: string): Promise<void> => {
  const client = getGraphClient();
  await client.api(`/me/messages/${messageId}`).delete();
};

// E-Mail als gelesen/ungelesen markieren
export const markEmailAsRead = async (
  messageId: string,
  isRead: boolean
): Promise<void> => {
  const client = getGraphClient();
  await client.api(`/me/messages/${messageId}`).patch({ isRead });
};

// E-Mail-Entwurf erstellen
export const createDraft = async (
  to: string[],
  subject: string,
  body: string
): Promise<Email> => {
  const client = getGraphClient();

  const draft = {
    subject,
    body: {
      contentType: 'html',
      content: body,
    },
    toRecipients: to.map((email) => ({
      emailAddress: { address: email },
    })),
  };

  return await client.api('/me/messages').post(draft);
};

// Entwurf senden
export const sendDraft = async (messageId: string): Promise<void> => {
  const client = getGraphClient();
  await client.api(`/me/messages/${messageId}/send`).post({});
};

// Gesendete E-Mails ohne Antwort finden (für Follow-up)
export const getSentEmailsWithoutReply = async (
  daysAgo: number = 3
): Promise<Email[]> => {
  const client = getGraphClient();
  const dateFilter = new Date();
  dateFilter.setDate(dateFilter.getDate() - daysAgo);

  // Gesendete E-Mails laden
  const sentEmails = await client
    .api('/me/mailFolders/sentitems/messages')
    .select('id,subject,toRecipients,sentDateTime,conversationId')
    .filter(`sentDateTime ge ${dateFilter.toISOString()}`)
    .top(100)
    .orderby('sentDateTime desc')
    .get();

  // Inbox E-Mails laden um Antworten zu finden
  const inboxEmails = await client
    .api('/me/mailFolders/inbox/messages')
    .select('id,conversationId,receivedDateTime')
    .filter(`receivedDateTime ge ${dateFilter.toISOString()}`)
    .top(200)
    .get();

  const inboxConversationIds = new Set(
    inboxEmails.value.map((e: Email) => e.conversationId)
  );

  // Nur E-Mails ohne Antwort zurückgeben
  return sentEmails.value.filter(
    (email: Email) => !inboxConversationIds.has(email.conversationId)
  );
};
