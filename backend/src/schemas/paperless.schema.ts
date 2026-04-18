import { z } from 'zod';

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export const paperlessConfigSchema = z.object({
  // Self-hosted per tenant. HTTPS enforced for professional SaaS context.
  baseUrl: z
    .string()
    .url()
    .startsWith('https://', 'baseUrl must use HTTPS'),
  apiToken: z.string().min(10),
  // When true the service polls /api/tasks/ until the upload is processed
  // or the poll budget is exhausted. Default true.
  pollForDocumentId: z.boolean().optional(),
  // Total poll budget (ms). Default 10_000 (5 × 2_000).
  pollTimeoutMs: z.number().int().positive().max(60_000).optional(),
  // HTTP request timeout. Default 30_000.
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});
export type PaperlessConfig = z.infer<typeof paperlessConfigSchema>;

export const paperlessDocumentInputSchema = z.object({
  pdfBuffer: z
    .instanceof(Buffer)
    .refine(b => b.byteLength > 0, 'pdfBuffer must not be empty')
    .refine(b => b.byteLength <= MAX_PDF_BYTES, 'pdfBuffer exceeds 15 MB limit'),
  pdfFilename: z.string().min(1).max(255),
  title: z.string().min(1).max(500),
  createdDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  correspondentName: z.string().max(255).optional(),
  documentTypeName: z.string().max(100).optional(),
  tags: z.array(z.string().min(1).max(100)).max(20).optional(),
});
export type PaperlessDocumentInput = z.infer<typeof paperlessDocumentInputSchema>;
