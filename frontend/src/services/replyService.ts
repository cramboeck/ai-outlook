const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7071/api';

export type ReplyTone = 'formal' | 'casual' | 'friendly' | 'assertive';
export type ReplyIntent = 'accept' | 'decline' | 'question' | 'info' | 'custom';

export interface GenerateReplyRequest {
  emailId: string;
  subject: string;
  body: string;
  sender: string;
  senderName: string;
  tone: ReplyTone;
  intent: ReplyIntent;
  customInstruction?: string;
  userName?: string;
}

export interface GenerateReplyResponse {
  reply: string;
  subject: string;
  suggestions: string[];
  tokens: number;
}

export const generateReply = async (request: GenerateReplyRequest): Promise<GenerateReplyResponse> => {
  const response = await fetch(`${API_URL}/generate-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Reply generation failed');
  }

  return response.json();
};

// Quick reply templates
export const QUICK_REPLIES: Array<{ label: string; intent: ReplyIntent; tone: ReplyTone }> = [
  { label: '👍 Zusagen', intent: 'accept', tone: 'friendly' },
  { label: '👎 Absagen', intent: 'decline', tone: 'formal' },
  { label: '❓ Rückfrage', intent: 'question', tone: 'casual' },
  { label: '📝 Bestätigen', intent: 'info', tone: 'formal' },
];

// Tone options with descriptions
export const TONE_OPTIONS: Array<{ value: ReplyTone; label: string; emoji: string; description: string }> = [
  { value: 'formal', label: 'Formell', emoji: '👔', description: 'Professionell mit "Sie"' },
  { value: 'casual', label: 'Locker', emoji: '😊', description: 'Entspannt aber professionell' },
  { value: 'friendly', label: 'Freundlich', emoji: '🤗', description: 'Warmherzig, evtl. "Du"' },
  { value: 'assertive', label: 'Bestimmt', emoji: '💪', description: 'Direkt und klar' },
];

// Intent options
export const INTENT_OPTIONS: Array<{ value: ReplyIntent; label: string; emoji: string }> = [
  { value: 'accept', label: 'Zusagen', emoji: '✅' },
  { value: 'decline', label: 'Absagen', emoji: '❌' },
  { value: 'question', label: 'Rückfrage', emoji: '❓' },
  { value: 'info', label: 'Info geben', emoji: '📋' },
  { value: 'custom', label: 'Eigene Anweisung', emoji: '✏️' },
];
