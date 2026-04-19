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

// ---------------------------------------------------------------------------
// Email Attachments
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentBytes?: string; // base64 encoded
}

// Get attachments for an email
export const getEmailAttachments = async (messageId: string): Promise<EmailAttachment[]> => {
  const client = getGraphClient();
  const response = await client
    .api(`/me/messages/${messageId}/attachments`)
    .select('id,name,contentType,size,isInline')
    .get();
  return response.value || [];
};

// Get a single attachment with content (base64)
export const getEmailAttachmentContent = async (messageId: string, attachmentId: string): Promise<EmailAttachment> => {
  const client = getGraphClient();
  return await client
    .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
    .get();
};

// Get all PDF/document attachments for an email (with content)
export const getDocumentAttachments = async (messageId: string): Promise<EmailAttachment[]> => {
  const attachments = await getEmailAttachments(messageId);

  // Match by content-type OR by filename extension. Many mail clients ship
  // PDFs as application/octet-stream, so trusting contentType alone misses
  // real documents. The extension allowlist keeps us off signatures / tiny
  // logos (.png/.jpg are also matched by extension but signatures are
  // flagged as isInline and already filtered).
  const docContentTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument',
  ];
  const docExtensions = /\.(pdf|jpg|jpeg|png|tif|tiff|doc|docx|xls|xlsx)$/i;

  const docAttachments = attachments.filter(a => {
    if (a.isInline) return false;
    const name = a.name || '';
    const ct = a.contentType || '';
    return docContentTypes.some(t => ct.startsWith(t)) || docExtensions.test(name);
  });

  // Prefer PDFs first so callers that only use the [0]th attachment still
  // get the primary document (not a signature image).
  docAttachments.sort((a, b) => {
    const aIsPdf = /\.pdf$/i.test(a.name) || a.contentType === 'application/pdf';
    const bIsPdf = /\.pdf$/i.test(b.name) || b.contentType === 'application/pdf';
    if (aIsPdf && !bIsPdf) return -1;
    if (!aIsPdf && bIsPdf) return 1;
    return 0;
  });

  // Fetch content for each document attachment
  const withContent: EmailAttachment[] = [];
  for (const att of docAttachments) {
    const full = await getEmailAttachmentContent(messageId, att.id);
    withContent.push(full);
  }

  return withContent;
};

// ---------------------------------------------------------------------------
// Microsoft To-Do
// ---------------------------------------------------------------------------

export interface TodoTaskList {
  id: string;
  displayName: string;
  isOwner: boolean;
  isShared: boolean;
  wellknownListName?: string; // 'defaultList', 'flaggedEmails', etc.
}

export interface TodoTask {
  id: string;
  title: string;
  body?: { content: string; contentType: string };
  status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
  importance: 'low' | 'normal' | 'high';
  isReminderOn?: boolean;
  createdDateTime: string;
  lastModifiedDateTime: string;
  completedDateTime?: { dateTime: string; timeZone: string };
  dueDateTime?: { dateTime: string; timeZone: string };
  categories?: string[];
  linkedResources?: Array<{
    id: string;
    webUrl: string;
    applicationName: string;
    displayName: string;
  }>;
}

// Get all To-Do lists
export const getTodoLists = async (): Promise<TodoTaskList[]> => {
  const client = getGraphClient();
  const response = await client
    .api('/me/todo/lists')
    .select('id,displayName,isOwner,isShared,wellknownListName')
    .get();
  return response.value || [];
};

// Get tasks from a specific list
export const getTodoTasks = async (
  listId: string,
  top: number = 100,
  includeCompleted: boolean = false
): Promise<TodoTask[]> => {
  const client = getGraphClient();
  let request = client
    .api(`/me/todo/lists/${listId}/tasks`)
    .select('id,title,body,status,importance,isReminderOn,createdDateTime,lastModifiedDateTime,completedDateTime,dueDateTime,categories,linkedResources')
    .top(top)
    .orderby('createdDateTime desc');

  if (!includeCompleted) {
    request = request.filter("status ne 'completed'");
  }

  const response = await request.get();
  return response.value || [];
};

// Get all tasks from all lists (convenience function)
export const getAllTodoTasks = async (includeCompleted: boolean = false): Promise<{
  lists: TodoTaskList[];
  tasks: Array<TodoTask & { listId: string; listName: string }>;
}> => {
  const lists = await getTodoLists();
  const allTasks: Array<TodoTask & { listId: string; listName: string }> = [];

  for (const list of lists) {
    const tasks = await getTodoTasks(list.id, 200, includeCompleted);
    for (const task of tasks) {
      allTasks.push({ ...task, listId: list.id, listName: list.displayName });
    }
  }

  return { lists, tasks: allTasks };
};

// Create a task in a To-Do list
export const createTodoTask = async (
  listId: string,
  task: {
    title: string;
    body?: string;
    importance?: 'low' | 'normal' | 'high';
    dueDateTime?: string; // ISO date
    linkedResourceUrl?: string;
    linkedResourceName?: string;
  }
): Promise<TodoTask> => {
  const client = getGraphClient();

  const taskBody: any = {
    title: task.title,
    importance: task.importance || 'normal',
  };

  if (task.body) {
    taskBody.body = { content: task.body, contentType: 'text' };
  }
  if (task.dueDateTime) {
    taskBody.dueDateTime = {
      dateTime: task.dueDateTime,
      timeZone: 'Europe/Berlin',
    };
  }

  const created = await client
    .api(`/me/todo/lists/${listId}/tasks`)
    .post(taskBody);

  // Add linked resource if provided
  if (task.linkedResourceUrl && created.id) {
    try {
      await client
        .api(`/me/todo/lists/${listId}/tasks/${created.id}/linkedResources`)
        .post({
          webUrl: task.linkedResourceUrl,
          applicationName: 'MailSort',
          displayName: task.linkedResourceName || 'MailSort Aufgabe',
        });
    } catch { /* linked resources are optional */ }
  }

  return created;
};

// Update a To-Do task
export const updateTodoTask = async (
  listId: string,
  taskId: string,
  updates: {
    title?: string;
    status?: TodoTask['status'];
    importance?: TodoTask['importance'];
    dueDateTime?: string | null;
  }
): Promise<TodoTask> => {
  const client = getGraphClient();
  const body: any = {};

  if (updates.title !== undefined) body.title = updates.title;
  if (updates.status !== undefined) body.status = updates.status;
  if (updates.importance !== undefined) body.importance = updates.importance;
  if (updates.dueDateTime !== undefined) {
    body.dueDateTime = updates.dueDateTime
      ? { dateTime: updates.dueDateTime, timeZone: 'Europe/Berlin' }
      : null;
  }

  return await client
    .api(`/me/todo/lists/${listId}/tasks/${taskId}`)
    .patch(body);
};
