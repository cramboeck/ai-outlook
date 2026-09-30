// Laedt alle ungelesenen Mails des Posteingangs paginiert. Ausschliesslich
// lesend. Nichts wird veraendert, nichts in einer Datenbank abgelegt.

import { getGraphClient } from './graphService';

export interface UnreadMail {
  id: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  hasAttachments: boolean;
  webLink: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  } | null;
}

export interface FetchUnreadResult {
  mails: UnreadMail[];
  partial: boolean;          // true = abgebrochen (Seiten-Limit oder Fehler mitten drin)
  pagesFetched: number;
  errorMessage?: string;
}

// Aufrufer erwartet einen initialisierten Graph-Client (via initGraphClient()).
export async function fetchAllUnread(options?: {
  maxPages?: number;
  pageSize?: number;
}): Promise<FetchUnreadResult> {
  const maxPages = options?.maxPages ?? 20;
  const pageSize = Math.min(options?.pageSize ?? 100, 100);

  const client = getGraphClient();

  const mails: UnreadMail[] = [];
  let pagesFetched = 0;
  let partial = false;
  let errorMessage: string | undefined;

  // Erster Request — kein $search, damit die Sortierung stabil bleibt und
  // Paging deterministisch funktioniert.
  let request = client
    .api('/me/mailFolders/inbox/messages')
    .filter('isRead eq false')
    .select('id,subject,from,receivedDateTime,bodyPreview,hasAttachments,webLink')
    .orderby('receivedDateTime desc')
    .top(pageSize);

  try {
    while (pagesFetched < maxPages) {
      const page = await fetchWithRetry(() => request.get());
      pagesFetched += 1;
      const value: UnreadMail[] = Array.isArray(page?.value) ? page.value : [];
      mails.push(...value);
      const next = page?.['@odata.nextLink'];
      if (!next) break;
      // Client kann eine absolute NextLink-URL verarbeiten. Wir bauen einen
      // neuen Request mit der URL.
      request = client.api(next);
    }
    if (pagesFetched >= maxPages) {
      // Wir haben die Sicherheitsgrenze getroffen — es koennten noch mehr da sein.
      // Wir markieren partial nur, wenn wirklich noch etwas kaeme.
      const nextCheck = await fetchWithRetry(() => request.get());
      if (nextCheck?.['@odata.nextLink']) {
        partial = true;
      } else if (Array.isArray(nextCheck?.value)) {
        // seltener Fall: exakt an der Seiten-Grenze — die zusaetzliche Seite noch anhaengen
        mails.push(...(nextCheck.value as UnreadMail[]));
      }
    }
  } catch (err) {
    partial = true;
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return { mails, partial, pagesFetched, errorMessage };
}

// Ein einziger 429-Retry mit Retry-After-Header. Alles andere durchreichen.
async function fetchWithRetry<T>(op: () => Promise<T>, alreadyRetried = false): Promise<T> {
  try {
    return await op();
  } catch (err: unknown) {
    if (alreadyRetried) throw err;
    const status = (err as { statusCode?: number; response?: { status?: number } })?.statusCode
      ?? (err as { statusCode?: number; response?: { status?: number } })?.response?.status;
    if (status !== 429) throw err;
    const retryAfterRaw =
      (err as { headers?: Record<string, string> })?.headers?.['retry-after'] ??
      (err as { headers?: Record<string, string> })?.headers?.['Retry-After'];
    const waitMs = parseRetryAfter(retryAfterRaw) ?? 2000;
    await sleep(waitMs);
    return fetchWithRetry(op, true);
  }
}

function parseRetryAfter(raw: string | undefined): number | null {
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return Math.max(0, asNumber * 1000);
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
