import { api } from './apiClient';

interface EmailInput {
  id: string;
  subject: string;
  body: string;
  sender: string;
  receivedDateTime: string;
}

export interface ExtractedAction {
  emailId: string;
  action: string;
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
  type: 'response' | 'task' | 'decision' | 'meeting' | 'payment';
}

interface ExtractActionsResponse {
  actions: ExtractedAction[];
  totalTokens: number;
  processingTimeMs: number;
}

export const extractActions = async (emails: EmailInput[]): Promise<ExtractActionsResponse> => {
  return api.post<ExtractActionsResponse>('/extract-actions', { emails });
};

// Helper: Priorität zu Farbe
export const getPriorityColor = (priority: 'high' | 'medium' | 'low'): string => {
  switch (priority) {
    case 'high':
      return 'text-red-600 bg-red-50';
    case 'medium':
      return 'text-orange-600 bg-orange-50';
    case 'low':
      return 'text-gray-600 bg-gray-50';
  }
};

// Helper: Typ zu Icon
export const getTypeIcon = (type: string): string => {
  switch (type) {
    case 'response':
      return '💬';
    case 'task':
      return '✅';
    case 'decision':
      return '🤔';
    case 'meeting':
      return '📅';
    case 'payment':
      return '💰';
    default:
      return '📝';
  }
};

// Helper: Typ zu deutschem Label
export const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'response':
      return 'Antwort';
    case 'task':
      return 'Aufgabe';
    case 'decision':
      return 'Entscheidung';
    case 'meeting':
      return 'Meeting';
    case 'payment':
      return 'Zahlung';
    default:
      return 'Aktion';
  }
};
