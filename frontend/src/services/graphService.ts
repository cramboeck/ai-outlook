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

// Mail-Ordner laden (inkl. Unterordner)
export const getMailFolders = async (): Promise<{ value: MailFolder[] }> => {
  const client = getGraphClient();
  const result = await client
    .api('/me/mailFolders')
    .select('id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount,isHidden')
    .top(100)
    .get();

  // Load child folders recursively
  const allFolders: MailFolder[] = [...result.value];

  const loadChildFolders = async (parentId: string) => {
    try {
      const children = await client
        .api(`/me/mailFolders/${parentId}/childFolders`)
        .select('id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount,isHidden')
        .top(50)
        .get();

      for (const child of children.value) {
        allFolders.push(child);
        if (child.childFolderCount > 0) {
          await loadChildFolders(child.id);
        }
      }
    } catch {
      // Ignore errors for child folders
    }
  };

  // Load children for folders that have them
  for (const folder of result.value) {
    if (folder.childFolderCount > 0) {
      await loadChildFolders(folder.id);
    }
  }

  return { value: allFolders };
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

// E-Mails in Batch löschen
export const deleteEmailsBatch = async (messageIds: string[]): Promise<void> => {
  const client = getGraphClient();

  // Graph API batch requests (max 20 per batch)
  const batchSize = 20;
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const requests = batch.map((id, index) => ({
      id: String(index + 1),
      method: 'DELETE',
      url: `/me/messages/${id}`,
    }));

    await client.api('/$batch').post({ requests });
  }
};

// E-Mail als gelesen/ungelesen markieren
export const markEmailAsRead = async (
  messageId: string,
  isRead: boolean = true
): Promise<void> => {
  const client = getGraphClient();
  await client.api(`/me/messages/${messageId}`).patch({ isRead });
};

// Mark email as unread
export const markEmailAsUnread = async (messageId: string): Promise<void> => {
  return markEmailAsRead(messageId, false);
};

// Flag/unflag email
export const flagEmail = async (
  messageId: string,
  flagged: boolean = true
): Promise<void> => {
  const client = getGraphClient();
  await client.api(`/me/messages/${messageId}`).patch({
    flag: {
      flagStatus: flagged ? 'flagged' : 'notFlagged',
    },
  });
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

// Resolve well-known folder name to actual folder ID
export const resolveWellKnownFolder = async (wellKnownName: string): Promise<string> => {
  const client = getGraphClient();
  try {
    const folder = await client.api(`/me/mailFolders/${wellKnownName}`).select('id').get();
    return folder.id;
  } catch {
    // Return the original name if resolution fails
    return wellKnownName;
  }
};

// E-Mails suchen mit Kriterien
export interface SearchCriteria {
  query?: string; // Free text search
  from?: string; // Sender email or name
  subject?: string; // Subject contains
  dateFrom?: string; // ISO date string
  dateTo?: string; // ISO date string
  hasAttachments?: boolean;
  isRead?: boolean;
  folderId?: string; // Search in specific folder
}

export const searchEmails = async (
  criteria: SearchCriteria,
  top: number = 100
): Promise<{ value: Email[] }> => {
  const client = getGraphClient();

  const hasTextSearch = criteria.query || criteria.subject || criteria.from;

  // Resolve well-known folder names to actual folder IDs
  let resolvedFolderId = criteria.folderId;
  if (criteria.folderId === 'inbox' || criteria.folderId === 'sentitems') {
    resolvedFolderId = await resolveWellKnownFolder(criteria.folderId);
  }

  // Build the request - endpoint based on folder selection
  const endpoint = resolvedFolderId
    ? `/me/mailFolders/${resolvedFolderId}/messages`
    : '/me/messages';

  const selectFields = 'id,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,importance,categories,isRead,hasAttachments,conversationId,parentFolderId';

  let results: Email[] = [];

  if (hasTextSearch) {
    // Use $search for text queries - can't combine with $filter or $orderby
    const searchParts: string[] = [];

    if (criteria.query) {
      searchParts.push(`"${criteria.query}"`);
    }
    if (criteria.subject) {
      searchParts.push(`"${criteria.subject}"`);
    }
    if (criteria.from) {
      // Remove wildcards for search, we'll filter client-side
      const fromSearch = criteria.from.replace(/\*/g, '').replace(/@/g, ' ');
      if (fromSearch.trim()) {
        searchParts.push(`"${fromSearch.trim()}"`);
      }
    }

    const searchQuery = searchParts.join(' ');

    const response = await client
      .api(endpoint)
      .header('ConsistencyLevel', 'eventual')
      .search(searchQuery)
      .select(selectFields)
      .top(Math.min(top * 3, 500)) // Fetch more to account for client-side filtering
      .get();

    results = response.value || [];

    // Apply client-side filters to enforce AND logic (since $search is OR-based)

    // Filter by 'from' - support wildcards like *@microsoft.com
    if (criteria.from) {
      const fromPattern = criteria.from.toLowerCase();
      results = results.filter(e => {
        const senderEmail = e.from?.emailAddress?.address?.toLowerCase() || '';
        const senderName = e.from?.emailAddress?.name?.toLowerCase() || '';

        // Handle wildcard patterns
        if (fromPattern.includes('*')) {
          const regex = new RegExp('^' + fromPattern.replace(/\*/g, '.*') + '$', 'i');
          return regex.test(senderEmail) || regex.test(senderName);
        }

        // Normal substring match
        return senderEmail.includes(fromPattern) || senderName.includes(fromPattern);
      });
    }

    // Filter by 'subject'
    if (criteria.subject) {
      const subjectPattern = criteria.subject.toLowerCase();
      results = results.filter(e => {
        const subject = e.subject?.toLowerCase() || '';
        return subject.includes(subjectPattern);
      });
    }

    // Filter by date
    if (criteria.dateFrom) {
      const dateFrom = new Date(criteria.dateFrom);
      results = results.filter(e => new Date(e.receivedDateTime) >= dateFrom);
    }
    if (criteria.dateTo) {
      const dateTo = new Date(criteria.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      results = results.filter(e => new Date(e.receivedDateTime) <= dateTo);
    }
    if (criteria.hasAttachments !== undefined) {
      results = results.filter(e => e.hasAttachments === criteria.hasAttachments);
    }
    if (criteria.isRead !== undefined) {
      results = results.filter(e => e.isRead === criteria.isRead);
    }

    // Sort by date (since $orderby can't be used with $search)
    results.sort((a, b) =>
      new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
    );

    // Limit to requested top
    results = results.slice(0, top);
  } else {
    // No text search - use $filter and $orderby
    const filters: string[] = [];

    if (criteria.dateFrom) {
      filters.push(`receivedDateTime ge ${criteria.dateFrom}`);
    }
    if (criteria.dateTo) {
      const dateTo = new Date(criteria.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      filters.push(`receivedDateTime le ${dateTo.toISOString()}`);
    }
    if (criteria.hasAttachments !== undefined) {
      filters.push(`hasAttachments eq ${criteria.hasAttachments}`);
    }
    if (criteria.isRead !== undefined) {
      filters.push(`isRead eq ${criteria.isRead}`);
    }

    let request = client
      .api(endpoint)
      .select(selectFields)
      .top(top)
      .orderby('receivedDateTime desc');

    if (filters.length > 0) {
      request = request.filter(filters.join(' and '));
    }

    const response = await request.get();
    results = response.value || [];
  }

  return { value: results };
};

// Mehrere E-Mails verschieben (Batch)
export const moveEmailsBatch = async (
  messageIds: string[],
  destinationFolderId: string
): Promise<void> => {
  const client = getGraphClient();

  // Graph API Batch Request (max 20 per batch)
  const batchSize = 20;
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const batchRequest = {
      requests: batch.map((id, index) => ({
        id: `${index}`,
        method: 'POST',
        url: `/me/messages/${id}/move`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          destinationId: destinationFolderId,
        },
      })),
    };

    await client.api('/$batch').post(batchRequest);
  }
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
