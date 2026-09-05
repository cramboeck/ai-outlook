// Shared OpenAI Client Factory
// Supports: Azure OpenAI, OpenAI Cloud, and Ollama (via OpenAI-compatible API)
//
// Configuration priority:
// 1. Azure OpenAI (AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY)
// 2. OpenAI / Ollama (OPENAI_API_KEY + optional OPENAI_BASE_URL)
//
// For Ollama: set OPENAI_BASE_URL=http://<ollama-host>:11434/v1
//             set OPENAI_API_KEY=ollama  (any non-empty value)
//             set OPENAI_MODEL=qwen3:8b

import OpenAI from 'openai';

let cachedClient: OpenAI | null = null;
let cachedProvider: string | null = null;

export function getOpenAIClient(): OpenAI {
  if (cachedClient) return cachedClient;

  // 1. Azure OpenAI
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    cachedClient = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini'}`,
      defaultQuery: { 'api-version': '2024-08-01-preview' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
    });
    cachedProvider = 'azure';
    console.log('🤖 AI Provider: Azure OpenAI');
    return cachedClient;
  }

  // 2. OpenAI Cloud or Ollama (OpenAI-compatible)
  if (process.env.OPENAI_API_KEY) {
    const baseURL = process.env.OPENAI_BASE_URL;
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });

    if (baseURL?.includes('11434')) {
      cachedProvider = 'ollama';
      console.log(`🤖 AI Provider: Ollama (${baseURL})`);
    } else if (baseURL) {
      cachedProvider = 'custom';
      console.log(`🤖 AI Provider: Custom (${baseURL})`);
    } else {
      cachedProvider = 'openai';
      console.log('🤖 AI Provider: OpenAI Cloud');
    }
    return cachedClient;
  }

  throw new Error(
    'No AI configuration found. Set one of:\n' +
    '  - OPENAI_API_KEY + OPENAI_BASE_URL (for Ollama/OpenAI)\n' +
    '  - AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY (for Azure)'
  );
}

export function getModel(): string {
  return process.env.AZURE_OPENAI_DEPLOYMENT || process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

export function getProvider(): string {
  return cachedProvider || 'unknown';
}

/**
 * Wrap system prompts for model-specific quirks.
 * - qwen3 models use "thinking mode" by default which wastes tokens.
 *   Prepend /no_think to disable it for structured output tasks.
 */
export function wrapSystemPrompt(prompt: string): string {
  const model = getModel().toLowerCase();
  if (model.startsWith('qwen3')) {
    return `/no_think\n${prompt}`;
  }
  return prompt;
}

/**
 * Check if AI services are available (keys configured).
 */
export function isAIConfigured(): boolean {
  return !!(
    process.env.OPENAI_API_KEY ||
    (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY)
  );
}
