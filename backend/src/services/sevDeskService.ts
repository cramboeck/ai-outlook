// sevDesk API Client (REST v1)
// Stateless HTTP client — no DB access, no tenant state.
// Callers (processingPipeline, integrations route) are responsible for
// loading the apiToken from the `integrations` table and handling audit
// logging / DB updates.
//
// Flow for creating an incoming voucher:
//   1. POST /Voucher/Factory/uploadTempFile   (multipart PDF upload)
//   2. resolveSupplier()                      (contact lookup / optional create)
//   3. POST /Voucher/Factory/saveVoucher      (voucher + position)

import {
  sevDeskConfigSchema,
  sevDeskVoucherInputSchema,
  type SevDeskConfig,
  type SevDeskVoucherInput,
  type SevDeskTaxType,
} from '../schemas/sevdesk.schema';
import { logger } from './logger';

const DEFAULT_BASE_URL = 'https://my.sevdesk.de/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TAX_RATE = 19;
const DEFAULT_TAX_TYPE: SevDeskTaxType = 'default';
const USER_AGENT = 'MailSort/1.0 (+https://mailsort.app)';
const MAX_RETRIES = 2;

// --- Response types (strict, only the fields we consume) ------------------

interface SevDeskTempFileResponse {
  objects: { filename: string };
}

interface SevDeskContact {
  id: string;
  name?: string;
  customerNumber?: string | null;
  familyName?: string | null;
}

interface SevDeskListResponse<T> {
  objects: T[];
}

interface SevDeskVoucherResponse {
  objects: {
    voucher: { id: string; voucherNumber?: string | null };
    voucherPos: unknown[];
  };
}

// --- Public result types --------------------------------------------------

export type SupplierMatchStatus = 'matched' | 'created' | 'needs_review';

export interface SupplierSuggestion {
  id: string;
  name: string;
  customerNumber?: string | null;
}

export interface SevDeskVoucherResult {
  status: 'created';
  voucherId: string;
  voucherNumber: string | null;
  uploadedFilename: string;
  supplier: { id: string; matchStatus: Exclude<SupplierMatchStatus, 'needs_review'> };
}

export interface SevDeskVoucherNeedsReview {
  status: 'needs_review';
  reason: 'ambiguous_supplier';
  suggestions: SupplierSuggestion[];
}

export type CreateVoucherOutcome = SevDeskVoucherResult | SevDeskVoucherNeedsReview;

// --- Errors ---------------------------------------------------------------

export class SevDeskApiError extends Error {
  readonly statusCode: number;
  readonly endpoint: string;
  readonly sevDeskMessage?: string;

  constructor(message: string, statusCode: number, endpoint: string, sevDeskMessage?: string) {
    super(message);
    this.name = 'SevDeskApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.sevDeskMessage = sevDeskMessage;
  }
}

// --- Client ---------------------------------------------------------------

export interface SevDeskClient {
  createVoucher(input: SevDeskVoucherInput): Promise<CreateVoucherOutcome>;
  testConnection(): Promise<{ ok: boolean; sevClientId?: string }>;
}

export function createClient(rawConfig: SevDeskConfig): SevDeskClient {
  const config = sevDeskConfigSchema.parse(rawConfig);
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    createVoucher: input => createVoucher(baseUrl, config, timeoutMs, input),
    testConnection: () => testConnection(baseUrl, config.apiToken, timeoutMs),
  };
}

// --- Core operations ------------------------------------------------------

async function createVoucher(
  baseUrl: string,
  config: SevDeskConfig,
  timeoutMs: number,
  rawInput: SevDeskVoucherInput
): Promise<CreateVoucherOutcome> {
  const input = sevDeskVoucherInputSchema.parse(rawInput);

  const supplier = await resolveSupplier(baseUrl, config.apiToken, timeoutMs, input);
  if (supplier.status === 'needs_review') {
    return supplier;
  }

  const uploadedFilename = await uploadTempFile(
    baseUrl,
    config.apiToken,
    timeoutMs,
    input.pdfBuffer,
    input.pdfFilename
  );

  const taxRate = input.extractedData.taxRate ?? config.defaultTaxRate ?? DEFAULT_TAX_RATE;
  const taxType = input.extractedData.taxType ?? config.defaultTaxType ?? DEFAULT_TAX_TYPE;
  const currency = input.extractedData.currency ?? 'EUR';
  const sumGross = input.extractedData.amount ?? 0;
  const sumNet = round2(sumGross / (1 + taxRate / 100));

  const body = {
    voucher: {
      objectName: 'Voucher',
      mapAll: true,
      voucherDate: new Date().toISOString().slice(0, 10),
      supplier: { id: supplier.id, objectName: 'Contact' },
      supplierName: input.extractedData.vendor ?? null,
      description: input.extractedData.invoiceNumber ?? input.pdfFilename,
      payDate: input.extractedData.dueDate ?? null,
      status: 50, // Draft; user confirms in sevDesk UI
      taxRate,
      taxType,
      creditDebit: 'C', // Credit = Eingangsrechnung
      voucherType: 'VOU',
      currency,
      sumNet,
      sumGross,
      filename: uploadedFilename,
    },
    voucherPosSave: [
      {
        objectName: 'VoucherPos',
        mapAll: true,
        accountingType: config.defaultAccountingType
          ? { id: config.defaultAccountingType, objectName: 'AccountingType' }
          : null,
        taxRate,
        net: sumNet,
        sumNet,
        sumGross,
        comment: input.extractedData.invoiceNumber ?? null,
      },
    ],
    voucherPosDelete: null,
    filename: uploadedFilename,
  };

  const res = await request<SevDeskVoucherResponse>(
    baseUrl,
    '/Voucher/Factory/saveVoucher',
    {
      method: 'POST',
      headers: {
        Authorization: config.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  const voucher = res.objects.voucher;
  logger.info('sevDesk voucher created', {
    voucherId: voucher.id,
    voucherNumber: voucher.voucherNumber ?? null,
    supplierId: supplier.id,
    supplierStatus: supplier.status,
  });

  return {
    status: 'created',
    voucherId: voucher.id,
    voucherNumber: voucher.voucherNumber ?? null,
    uploadedFilename,
    supplier: { id: supplier.id, matchStatus: supplier.status },
  };
}

// Supplier matching:
//   exact (case-insensitive, trimmed) → use
//   ≥1 fuzzy matches and !forceCreate → needs_review
//   otherwise → create (unless vendor missing, then throw)
type SupplierResolution =
  | { status: 'matched' | 'created'; id: string }
  | SevDeskVoucherNeedsReview;

async function resolveSupplier(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
  input: SevDeskVoucherInput
): Promise<SupplierResolution> {
  if (input.supplierContactId) {
    return { status: 'matched', id: input.supplierContactId };
  }

  const vendor = input.extractedData.vendor?.trim();
  if (!vendor) {
    throw new SevDeskApiError(
      'Supplier vendor name missing and no supplierContactId provided',
      400,
      'resolveSupplier'
    );
  }

  const candidates = await searchContacts(baseUrl, apiToken, timeoutMs, vendor);
  const needle = vendor.toLowerCase();
  const exact = candidates.find(c => (c.name ?? '').trim().toLowerCase() === needle);
  if (exact) {
    return { status: 'matched', id: exact.id };
  }

  if (candidates.length > 0 && !input.forceCreateContact) {
    return {
      status: 'needs_review',
      reason: 'ambiguous_supplier',
      suggestions: candidates.slice(0, 10).map(c => ({
        id: c.id,
        name: c.name ?? '(unnamed)',
        customerNumber: c.customerNumber ?? null,
      })),
    };
  }

  const created = await createContact(baseUrl, apiToken, timeoutMs, vendor);
  return { status: 'created', id: created.id };
}

async function searchContacts(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
  name: string
): Promise<SevDeskContact[]> {
  const params = new URLSearchParams({ depth: '1', limit: '20', name });
  const res = await request<SevDeskListResponse<SevDeskContact>>(
    baseUrl,
    `/Contact?${params.toString()}`,
    { method: 'GET', headers: { Authorization: apiToken } },
    timeoutMs
  );
  return res.objects ?? [];
}

async function createContact(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
  name: string
): Promise<SevDeskContact> {
  const res = await request<{ objects: SevDeskContact }>(
    baseUrl,
    '/Contact',
    {
      method: 'POST',
      headers: { Authorization: apiToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category: { id: 2, objectName: 'Category' }, // 2 = Supplier
      }),
    },
    timeoutMs
  );
  return res.objects;
}

async function uploadTempFile(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number,
  pdfBuffer: Buffer,
  filename: string
): Promise<string> {
  const form = new FormData();
  // Copy into a fresh Uint8Array<ArrayBuffer> — Node's Buffer uses
  // ArrayBufferLike which DOM-lib BlobPart does not accept directly.
  const bytes = Uint8Array.from(pdfBuffer);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);

  const res = await request<SevDeskTempFileResponse>(
    baseUrl,
    '/Voucher/Factory/uploadTempFile',
    {
      method: 'POST',
      headers: { Authorization: apiToken },
      body: form,
    },
    timeoutMs
  );
  return res.objects.filename;
}

async function testConnection(
  baseUrl: string,
  apiToken: string,
  timeoutMs: number
): Promise<{ ok: boolean; sevClientId?: string }> {
  try {
    const res = await request<SevDeskListResponse<{ id: string }>>(
      baseUrl,
      '/SevClient',
      { method: 'GET', headers: { Authorization: apiToken } },
      timeoutMs
    );
    return { ok: true, sevClientId: res.objects[0]?.id };
  } catch (err) {
    logger.warn('sevDesk testConnection failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { ok: false };
  }
}

// --- HTTP core (retry + timeout + error normalization) -------------------

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
        return (await res.json()) as T;
      }

      const retryable = res.status >= 500 && res.status < 600;
      const text = await safeReadText(res);
      if (!retryable || attempt === MAX_RETRIES) {
        throw new SevDeskApiError(
          `sevDesk ${res.status} on ${path}`,
          res.status,
          path,
          text.slice(0, 500)
        );
      }
      lastErr = new SevDeskApiError(`sevDesk ${res.status}`, res.status, path, text.slice(0, 500));
    } catch (err) {
      clearTimeout(timer);
      const isNetwork = !(err instanceof SevDeskApiError);
      if (!isNetwork || attempt === MAX_RETRIES) {
        if (err instanceof SevDeskApiError) throw err;
        throw new SevDeskApiError(
          `Network error on ${path}: ${(err as Error).message}`,
          0,
          path
        );
      }
      lastErr = err;
    }

    attempt += 1;
    await sleep(2 ** attempt * 500); // 1s, 2s
  }

  throw lastErr instanceof Error ? lastErr : new Error('sevDesk request failed');
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
