// E-Mail von Graph API
export interface Email {
  id: string;
  subject: string;
  bodyPreview: string;
  body?: {
    content: string;
    contentType: 'text' | 'html';
  };
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  importance: 'low' | 'normal' | 'high';
  categories: string[];
  isRead: boolean;
  hasAttachments: boolean;
  conversationId: string;
}

// Klassifizierungsergebnis von Azure Function
export interface Classification {
  category: string;
  confidence: number; // 0.0 - 1.0
  reasoning: string; // Begründung auf Deutsch
  suggestedAction?: string; // Optional: Empfohlene nächste Aktion
}

// Batch-Klassifizierung Response
export interface BatchClassificationResult {
  results: Array<{
    id: string;
    category: string;
    confidence: number;
    reasoning: string;
  }>;
  totalTokens: number;
  processingTimeMs: number;
}

// Kategorie-Definition
export interface Category {
  name: string;
  color: string; // Graph API preset (preset0-preset24)
  emoji: string;
  description: string;
  keywords: string[];
}

// User von Graph API
export interface User {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

// Email Stats für Dashboard
export interface EmailStats {
  total: number;
  uncategorized: number;
  byCategory: Record<string, number>;
}

// Classify Request
export interface ClassifyRequest {
  subject: string;
  body: string;
  sender: string;
  receivedDateTime: string;
  importance: string;
}

// Batch Classify Request
export interface BatchClassifyRequest {
  emails: Array<{
    id: string;
    subject: string;
    body: string;
    sender: string;
  }>;
}

// ========== SMART FEATURES ==========

// Insight Card für Dashboard
export interface InsightCard {
  id: string;
  type: 'urgent' | 'action' | 'waiting' | 'finance' | 'meeting' | 'overdue';
  title: string;
  description: string;
  count: number;
  emailIds: string[];
  icon: string;
  color: string;
  priority: number; // Für Sortierung
}

// Extrahierte Aktion aus E-Mail
export interface ExtractedAction {
  id: string;
  emailId: string;
  emailSubject: string;
  action: string;
  assignedTo?: string;
  deadline?: string;
  status: 'todo' | 'waiting' | 'done';
  createdAt: string;
  sender: string;
}

// Priority Score für E-Mail
export interface EmailWithPriority extends Email {
  priorityScore: number; // 0-100
  priorityFactors: {
    senderImportance: number;
    contentUrgency: number;
    hasDeadline: boolean;
    isUnread: boolean;
    ageHours: number;
  };
}

// Smart View Definition
export interface SmartView {
  id: string;
  name: string;
  icon: string;
  filter: (email: Email) => boolean;
  count?: number;
}

// Weekly Briefing
export interface WeeklyBriefing {
  totalEmails: number;
  answeredEmails: number;
  pendingEmails: number;
  topSenders: Array<{ name: string; count: number }>;
  topCategories: Array<{ name: string; count: number }>;
  urgentItems: string[];
  weekOverWeekChange: number; // Prozent
}

// VIP Contact (auto-detected)
export interface VIPContact {
  email: string;
  name: string;
  avgResponseTimeMinutes: number;
  emailCount: number;
  lastContact: string;
  importance: 'high' | 'medium';
}
