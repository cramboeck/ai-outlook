// Unit tests for documentDetectionService
//
// The SUT instantiates `new OpenAI(...)` directly, so we intercept the
// 'openai' module export and inject a fake chat.completions.create. Each
// test then controls exactly what the "API" returns — no network, no
// env leakage.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => {
  class FakeOpenAI {
    chat = {
      completions: {
        create: (...args: unknown[]) => mockCreate(...args),
      },
    };
  }
  return { default: FakeOpenAI };
});

// Make sure the SUT decides to build a client (needs one of these envs).
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_MODEL = 'gpt-4o-mini';

import { detectDocument } from '../services/documentDetectionService';

function openaiResponse(
  content: string | null,
  usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
) {
  return {
    choices: [{ message: { content } }],
    usage,
  };
}

describe('documentDetectionService.detectDocument', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns a structured DocumentInfo for a recognised invoice', async () => {
    mockCreate.mockResolvedValue(openaiResponse(JSON.stringify({
      type: 'invoice',
      confidence: 0.92,
      extractedData: {
        vendor: 'ACME GmbH',
        amount: 1190.0,
        currency: 'EUR',
        invoiceNumber: 'R-2026-0042',
        dueDate: '2026-05-15',
        taxRate: 19,
        taxType: 'default',
      },
      suggestedActions: ['forward_sevdesk', 'archive'],
    })));

    const result = await detectDocument(
      'Ihre Rechnung R-2026-0042',
      'Anbei unsere Rechnung ueber 1190 EUR.',
      'billing@acme.example',
      true
    );

    expect(result.document).not.toBeNull();
    expect(result.document?.type).toBe('invoice');
    expect(result.document?.extractedData.vendor).toBe('ACME GmbH');
    expect(result.document?.extractedData.taxType).toBe('default');
    expect(result.usage.total_tokens).toBe(150);
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns document=null when the model labels the email as "none"', async () => {
    mockCreate.mockResolvedValue(openaiResponse(JSON.stringify({
      type: 'none',
      confidence: 0.1,
      extractedData: {},
      suggestedActions: [],
    })));

    const result = await detectDocument('Newsletter', 'Schau dir unsere Angebote an', 'news@ads.example', false);
    expect(result.document).toBeNull();
    expect(result.usage.total_tokens).toBe(150);
  });

  it('preserves the USt-Typ for EU reverse-charge invoices', async () => {
    mockCreate.mockResolvedValue(openaiResponse(JSON.stringify({
      type: 'invoice',
      confidence: 0.88,
      extractedData: {
        vendor: 'EU Partner sp.z.o.o.',
        amount: 500,
        currency: 'EUR',
        taxRate: 0,
        taxType: 'eu',
      },
      suggestedActions: ['forward_sevdesk'],
    })));

    const result = await detectDocument(
      'Invoice EU',
      'Reverse Charge — Steuerschuldnerschaft des Leistungsempfaengers',
      'billing@eu.example',
      true
    );
    expect(result.document?.extractedData.taxType).toBe('eu');
    expect(result.document?.extractedData.taxRate).toBe(0);
  });

  it('returns null document when OpenAI responds with empty content', async () => {
    mockCreate.mockResolvedValue(openaiResponse(null));

    const result = await detectDocument('Subject', 'Body', 'sender@example.com', false);
    expect(result.document).toBeNull();
    expect(result.usage.total_tokens).toBe(0);
  });

  it('returns null document when the response is not valid JSON', async () => {
    mockCreate.mockResolvedValue(openaiResponse('<html>gateway timeout</html>'));

    const result = await detectDocument('Subject', 'Body', 'sender@example.com', false);
    expect(result.document).toBeNull();
  });

  it('swallows underlying OpenAI errors and returns null document + zero usage', async () => {
    mockCreate.mockRejectedValue(new Error('Connection error.'));

    const result = await detectDocument('Subject', 'Body', 'sender@example.com', false);
    expect(result.document).toBeNull();
    expect(result.usage.total_tokens).toBe(0);
  });

  it('passes the email subject, sender and body into the prompt', async () => {
    mockCreate.mockResolvedValue(openaiResponse(JSON.stringify({
      type: 'none',
      confidence: 0.2,
      extractedData: {},
      suggestedActions: [],
    })));

    await detectDocument('Test Subject', 'Test body content', 'test@example.com', false);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = callArgs.messages.find(m => m.role === 'user');
    expect(userMessage?.content).toContain('Test Subject');
    expect(userMessage?.content).toContain('Test body content');
    expect(userMessage?.content).toContain('test@example.com');
  });

  it('clamps the body to 2000 characters before calling the model', async () => {
    mockCreate.mockResolvedValue(openaiResponse(JSON.stringify({
      type: 'none',
      confidence: 0.2,
      extractedData: {},
      suggestedActions: [],
    })));

    const longBody = 'x'.repeat(5000);
    await detectDocument('s', longBody, 'sender@example.com', false);

    const callArgs = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = callArgs.messages.find(m => m.role === 'user');
    expect(userMessage?.content).toMatch(/x{2000}$/);
  });
});
