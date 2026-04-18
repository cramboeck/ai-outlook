// Document Detection Service
// AI-based detection of invoices, orders, contracts, receipts
// Extracts structured data for DMS integration

import OpenAI from 'openai';
import { logger } from './logger';

export interface DocumentInfo {
  type: 'invoice' | 'order' | 'contract' | 'receipt' | 'none';
  confidence: number;
  extractedData: {
    vendor?: string;
    amount?: number;
    currency?: string;
    invoiceNumber?: string;
    orderNumber?: string;
    dueDate?: string;
    contractPeriod?: string;
    items?: string[];
  };
  suggestedActions: string[];
}

interface DocumentDetectionResult {
  document: DocumentInfo | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
  processingTimeMs: number;
}

function getOpenAIClient(): OpenAI {
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini'}`,
      defaultQuery: { 'api-version': '2024-08-01-preview' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  throw new Error('No OpenAI configuration found');
}

const SYSTEM_PROMPT = `# Dokumenten-Erkennung in E-Mails

Analysiere die E-Mail und erkenne ob es sich um ein Geschaeftsdokument handelt.

## Dokumenttypen
- **invoice**: Rechnung (Rechnungsnummer, Betrag, Faelligkeit, Lieferant)
- **order**: Bestellung/Auftragsbestaetigung (Bestellnummer, Artikel, Lieferant)
- **contract**: Vertrag (Vertragspartner, Laufzeit, Kuendigungsfrist)
- **receipt**: Beleg/Quittung (Betrag, Datum, Haendler)
- **none**: Kein Geschaeftsdokument

## Ausgabe-Format (JSON)
{
  "type": "<invoice|order|contract|receipt|none>",
  "confidence": <0.0-1.0>,
  "extractedData": {
    "vendor": "<Lieferant/Vertragspartner oder null>",
    "amount": <Betrag als Zahl oder null>,
    "currency": "<EUR|USD|etc. oder null>",
    "invoiceNumber": "<Rechnungsnr. oder null>",
    "orderNumber": "<Bestellnr. oder null>",
    "dueDate": "<Faelligkeitsdatum ISO oder null>",
    "contractPeriod": "<Vertragslaufzeit oder null>",
    "items": ["<Artikel/Positionen>"]
  },
  "suggestedActions": ["forward_sharepoint", "forward_sevdesk", "forward_datev", "archive"]
}

## Regeln
- Nur als Dokument erkennen wenn KLARE Indikatoren vorhanden (Rechnungsnummer, Betrag, etc.)
- Bei Newsletter-Angeboten oder Marketing-Mails: type = "none"
- suggestedActions basierend auf Dokumenttyp:
  - invoice: ["forward_sevdesk", "forward_sharepoint", "archive"]
  - order: ["forward_sharepoint", "archive"]
  - contract: ["forward_sharepoint", "archive"]
  - receipt: ["forward_sevdesk", "archive"]`;

export async function detectDocument(
  subject: string,
  body: string,
  sender: string,
  hasAttachments: boolean
): Promise<DocumentDetectionResult> {
  const startTime = Date.now();
  const client = getOpenAIClient();
  const model = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const userMessage = `E-Mail:
**Betreff:** ${subject}
**Von:** ${sender}
**Anhaenge:** ${hasAttachments ? 'Ja' : 'Nein'}
**Inhalt:** ${(body || subject).substring(0, 2000)}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content) as DocumentInfo;
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      document: result.type === 'none' ? null : result,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      model,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Document detection error', { error: (error as Error).message });
    return {
      document: null,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model,
      processingTimeMs: Date.now() - startTime,
    };
  }
}
