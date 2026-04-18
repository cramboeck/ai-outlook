import { z } from 'zod';

// sevDesk tax types (REST API v1).
// See: https://api.sevdesk.de/#tag/Voucher
// - default:  Regelbesteuerung (DE, 7% / 19%)
// - eu:       Innergemeinschaftliche Lieferung/Leistung (EU Reverse Charge)
// - noteu:    Ausfuhr Drittland
// - ss:       Kleinunternehmer (§19 UStG)
// - custom:   Abweichender Steuersatz
export const sevDeskTaxTypeSchema = z.enum(['default', 'eu', 'noteu', 'ss', 'custom']);
export type SevDeskTaxType = z.infer<typeof sevDeskTaxTypeSchema>;

export const sevDeskConfigSchema = z.object({
  apiToken: z.string().min(10),
  baseUrl: z
    .string()
    .url()
    .startsWith('https://', 'baseUrl must use HTTPS')
    .optional(),
  defaultTaxRate: z.number().min(0).max(100).optional(),
  defaultTaxType: sevDeskTaxTypeSchema.optional(),
  // sevDesk internal id of the user's "Buchhaltungskonto" used on voucher positions.
  // Optional — if absent the service uses sevDesk's inbox default.
  defaultAccountingType: z.number().int().positive().optional(),
  // HTTP timeout in milliseconds (default 30_000)
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});
export type SevDeskConfig = z.infer<typeof sevDeskConfigSchema>;

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export const sevDeskVoucherInputSchema = z.object({
  pdfBuffer: z
    .instanceof(Buffer)
    .refine(b => b.byteLength > 0, 'pdfBuffer must not be empty')
    .refine(b => b.byteLength <= MAX_PDF_BYTES, 'pdfBuffer exceeds 15 MB limit'),
  pdfFilename: z.string().min(1).max(255),
  extractedData: z.object({
    vendor: z.string().max(255).optional(),
    amount: z.number().finite().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    invoiceNumber: z.string().max(100).optional(),
    dueDate: z.string().datetime({ offset: true }).optional()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    taxRate: z.number().min(0).max(100).optional(),
    taxType: sevDeskTaxTypeSchema.optional(),
  }),
  // If provided the service skips contact lookup/creation and uses this id.
  supplierContactId: z.string().min(1).optional(),
  // When true the service creates a new contact even if only fuzzy matches exist.
  // Default false → fuzzy matches trigger needs_review.
  forceCreateContact: z.boolean().optional(),
});
export type SevDeskVoucherInput = z.infer<typeof sevDeskVoucherInputSchema>;
