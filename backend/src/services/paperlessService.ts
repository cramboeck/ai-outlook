// Paperless-NGX API Client
// Stateless HTTP client — no DB access, no tenant state.
// Callers load apiToken + baseUrl from the `integrations` table.
//
// Flow for uploading a document:
//   1. Resolve/create correspondent, document_type and tag IDs
//   2. POST /api/documents/post_document/  (multipart) → task UUID
//   3. Optionally poll /api/tasks/?task_id=<uuid> until SUCCESS
//      → returns the final document id

import {
  paperlessConfigSchema,
  paperlessDocumentInputSchema,
  type PaperlessConfig,
  type PaperlessDocumentInput,
} from '../schemas/paperless.schema';
import { logger } from './logger';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_RETRIES = 2;
const USER_AGENT = 'MailSort/1.0 (+https://mailsort.app)';

// Tag every auto-uploaded document with this marker so users can audit
// MailSort's activity from the Paperless UI.
const MAILSORT_AUTO_TAG = 'MailSort';

// --- Response types (only fields we consume) ------------------------------

interface PaperlessListResponse<T> {
  count: number;
  results: T[];
}

interface PaperlessNamedEntity {
  id: number;
  name: string;
}

type PaperlessTaskStatus = 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'REVOKED';

interface PaperlessTask {
  task_id: string;
  status: PaperlessTaskStatus;
  related_document?: number | null;
  result?: string | null;
}

// --- Public result types --------------------------------------------------

export type PaperlessUploadResult =
  | { status: 'accepted'; taskId: string }
  | { status: 'processed'; taskId: string; documentId: number }
  | { status: 'failed'; taskId: string; reason: string };

// --- Errors ---------------------------------------------------------------

export class PaperlessApiError extends Error {
  readonly statusCode: number;
  readonly endpoint: string;
  readonly responseBody?: string;

  constructor(message: string, statusCode: number, endpoint: string, responseBody?: string) {
    super(message);
    this.name = 'PaperlessApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.responseBody = responseBody;
  }
}

// --- Client ---------------------------------------------------------------

export interface PaperlessClient {
  uploadDocument(input: PaperlessDocumentInput): Promise<PaperlessUploadResult>;
  testConnection(): Promise<{ ok: boolean; version?: string }>;
}

export function createClient(rawConfig: PaperlessConfig): PaperlessClient {
  const config = paperlessConfigSchema.parse(rawConfig);
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollEnabled = config.pollForDocumentId ?? true;
  const pollTimeoutMs = config.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  return {
    uploadDocument: input =>
      uploadDocument(baseUrl, config.apiToken, timeoutMs, pollEnabled, pollTimeoutMs, input),
    testConnection: () => testConnection(baseUrl, config.apiToken, timeoutMs),
  };
}

// --- Core operations ------------------------------------------------------

async function uploadDocument(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
  pollEnabled: boolean,
  pollTimeoutMs: number,
  rawInput: PaperlessDocumentInput
): Promise<PaperlessUploadResult> {
  const input = paperlessDocumentInputSchema.parse(rawInput);

  const [correspondentId, documentTypeId, tagIds] = await Promise.all([
    input.correspondentName
      ? resolveOrCreate(baseUrl, apiToken, timeoutMs, 'correspondents', input.correspondentName)
      : Promise.resolve<number | null>(null),
    input.documentTypeName
      ? resolveOrCreate(baseUrl, apiToken, timeoutMs, 'document_types', input.documentTypeName)
      : Promise.resolve<number | null>(null),
    resolveTagIds(baseUrl, apiToken, timeoutMs, [
      ...(input.tags ?? []),
      MAILSORT_AUTO_TAG,
    ]),
  ]);

  const form = new FormData();
  const bytes = Uint8Array.from(input.pdfBuffer);
  form.append('document', new Blob([bytes], { type: 'application/pdf' }), input.pdfFilename);
  form.append('title', input.title);
  if (input.createdDate) form.append('created', input.createdDate);
  if (correspondentId !== null) form.append('correspondent', String(correspondentId));
  if (documentTypeId !== null) form.append('document_type', String(documentTypeId));
  for (const tagId of tagIds) {
    form.append('tags', String(tagId));
  }

  // post_document returns the task UUID as a raw JSON-encoded string
  // (e.g. "\"abc-1234-uuid\""), not an object.
  const taskId = await request<string>(
    baseUrl,
    '/api/documents/post_document/',
    {
      method: 'POST',
      headers: { Authorization: `Token ${apiToken}` },
      body: form,
    },
    timeoutMs
  );

  if (!pollEnabled) {
    logger.info('paperless upload accepted (no poll)', { taskId });
    return { status: 'accepted', taskId };
  }

  const final = await pollTask(baseUrl, apiToken, timeoutMs, pollTimeoutMs, taskId);

  if (final?.status === 'SUCCESS' && typeof final.related_document === 'number') {
    logger.info('paperless document processed', {
      taskId,
      documentId: final.related_document,
    });
    return { status: 'processed', taskId, documentId: final.related_document };
  }
  if (final?.status === 'FAILURE' || final?.status === 'REVOKED') {
    return {
      status: 'failed',
      taskId,
      reason: final.result ?? final.status,
    };
  }
  // Timed out waiting — caller can look up the task later.
  return { status: 'accepted', taskId };
}

type NamedEndpoint = 'correspondents' | 'document_types' | 'tags';

async function resolveOrCreate(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
  endpoint: NamedEndpoint,
  name: string
): Promise<number> {
  const params = new URLSearchParams({ name__iexact: name });
  const list = await request<PaperlessListResponse<PaperlessNamedEntity>>(
    baseUrl,
    `/api/${endpoint}/?${params.toString()}`,
    { method: 'GET', headers: { Authorization: `Token ${apiToken}` } },
    timeoutMs
  );
  if (list.results.length > 0) {
    return list.results[0].id;
  }

  const created = await request<PaperlessNamedEntity>(
    baseUrl,
    `/api/${endpoint}/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    },
    timeoutMs
  );
  return created.id;
}

async function resolveTagIds(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
  names: string[]
): Promise<number[]> {
  const unique = Array.from(new Set(names.map(n => n.trim()).filter(n => n.length > 0)));
  const ids = await Promise.all(
    unique.map(n => resolveOrCreate(baseUrl, apiToken, timeoutMs, 'tags', n))
  );
  return ids;
}

async function pollTask(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
  pollTimeoutMs: number,
  taskId: string
): Promise<PaperlessTask | null> {
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const params = new URLSearchParams({ task_id: taskId });
      const tasks = await request<PaperlessTask[]>(
        baseUrl,
        `/api/tasks/?${params.toString()}`,
        { method: 'GET', headers: { Authorization: `Token ${apiToken}` } },
        timeoutMs
      );
      const task = tasks.find(t => t.task_id === taskId) ?? tasks[0];
      if (!task) continue;
      if (task.status === 'SUCCESS' || task.status === 'FAILURE' || task.status === 'REVOKED') {
        return task;
      }
    } catch (err) {
      // Transient errors while polling shouldn't kill the upload result —
      // the document is already accepted.
      logger.warn('paperless task poll failed', {
        taskId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
  return null;
}

async function testConnection(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number
): Promise<{ ok: boolean; version?: string }> {
  try {
    // /api/ returns { correspondents: "...", documents: "...", ... } with
    // a X-Version header when auth succeeds.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/api/`, {
        method: 'GET',
        headers: {
          Authorization: `Token ${apiToken}`,
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return { ok: false };
      return { ok: true, version: res.headers.get('x-version') ?? undefined };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn('paperless testConnection failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { ok: false };
  }
}

// --- HTTP core (retry + timeout + error normalization) --------------------

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const headers = new Headers(init.headers);
  headers.set('User-Agent', USER_AGENT);
  headers.set('Accept', 'application/json');

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= MAX_RETRIES) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
      clearTimeout(timer);

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const retryable = res.status >= 500 && res.status < 600;
      const text = await safeReadText(res);
      if (!retryable || attempt === MAX_RETRIES) {
        throw new PaperlessApiError(
          `paperless ${res.status} on ${path}`,
          res.status,
          path,
          text.slice(0, 500)
        );
      }
      lastErr = new PaperlessApiError(
        `paperless ${res.status}`,
        res.status,
        path,
        text.slice(0, 500)
      );
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof PaperlessApiError) {
        if (attempt === MAX_RETRIES) throw err;
        lastErr = err;
      } else {
        if (attempt === MAX_RETRIES) {
          throw new PaperlessApiError(
            `Network error on ${path}: ${(err as Error).message}`,
            0,
            path
          );
        }
        lastErr = err;
      }
    }

    attempt += 1;
    await sleep(2 ** attempt * 500); // 1s, 2s
  }

  throw lastErr instanceof Error ? lastErr : new Error('paperless request failed');
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
