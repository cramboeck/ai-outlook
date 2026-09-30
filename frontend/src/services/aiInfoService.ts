// AI Info client — fetches which LLM provider / model the backend is using.
// Used by the sidebar badge so the user can verify at a glance.

import { api } from './apiClient';

export type AiProvider = 'azure' | 'ollama' | 'openai' | 'custom' | 'unconfigured' | 'unknown';

export interface AiInfo {
  provider: AiProvider;
  model: string | null;
  configured: boolean;
  copilotObo: boolean;
}

export async function getAiInfo(): Promise<AiInfo> {
  return api.get<AiInfo>('/ai-info');
}
