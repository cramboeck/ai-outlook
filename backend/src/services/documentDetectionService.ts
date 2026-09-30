// Document Detection Service
// AI-based detection of invoices, orders, contracts, receipts
// Extracts structured data for DMS integration

import OpenAI from 'openai';
import { logger } from './logger';

// sevDesk-compatible tax type values.
// - default: DE Regelbesteuerung (7 % / 19 %)
// - eu:      Innergemeinschaftliche Lieferung/Leistung (EU Reverse Charge)
// - noteu:   Drittland / Ausfuhr
// - ss:      Kleinunternehmer (§19 UStG) / Steuerfrei
// - custom:  Abweichender / unklarer Satz
export type TaxType = 'default' | 'eu' | 'noteu' | 'ss' | 'custom';

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
    taxRate?: number;
    taxType?: TaxType;
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
    "items": ["<Artikel/Positionen>"],
    "taxRate": <Prozentsatz als Zahl, z.B. 19 oder 7, oder null>,
    "taxType": "<default|eu|noteu|ss|custom oder null>"
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
  - receipt: ["forward_sevdesk", "archive"]

## USt-Erkennung (taxRate + taxType)
Nur setzen wenn EINDEUTIG aus dem Text ableitbar, sonst null.
- "default": Normale DE-Rechnung mit 19 % oder 7 % USt. Setze taxRate entsprechend.
- "eu": Innergemeinschaftliche Lieferung/Leistung. Indikatoren: "Reverse Charge",
  "Steuerschuldnerschaft des Leistungsempfaengers", "innergemeinschaftlich",
  Lieferant mit EU-USt-IdNr. (nicht DE). taxRate = 0.
- "noteu": Drittland (z.B. USA, CH, UK). Indikatoren: "Ausfuhrlieferung",
  "Steuerfrei nach §6 UStG", Nicht-EU-Absender. taxRate = 0.
- "ss": Kleinunternehmer. Indikator: "§19 UStG", "Kleinunternehmerregelung",
  "Kein Ausweis von Umsatzsteuer". taxRate = 0.
- "custom": Anderer Satz (z.B. 10.7 % Landwirtschaft, oesterreichische Rechnung mit 20 %).
- Wenn Rechnung EUR und Steuer weder explizit noch ableitbar: taxType = "default",
  taxRate = 19 (haeufigster Fall, wird in sevDesk vom User geprueft).`;

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
