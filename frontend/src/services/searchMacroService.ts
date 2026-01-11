// Search Macro Service
// Save and manage search filters as reusable macros with optional auto-actions

export interface SearchMacro {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  criteria: SearchMacroCriteria;
  actions?: SearchMacroAction[];
  createdAt: number;
  lastUsedAt?: number;
  useCount: number;
}

export interface SearchMacroCriteria {
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  dateFrom?: string;
  dateTo?: string;
  dateRelative?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth';
  hasAttachments?: boolean;
  isRead?: boolean;
  importance?: 'high' | 'normal' | 'low';
  categories?: string[];
  folderId?: string;
  direction?: 'all' | 'incoming' | 'outgoing';
}

export interface SearchMacroAction {
  type: 'move' | 'categorize' | 'markRead' | 'markUnread' | 'delete' | 'flag';
  targetFolderId?: string;
  targetCategory?: string;
}

interface MacroStorage {
  version: number;
  macros: SearchMacro[];
}

const STORAGE_KEY = 'postpilot_search_macros';
const STORAGE_VERSION = 1;

// Generate unique ID
const generateId = (): string => {
  return `macro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Load macros from localStorage
export const loadMacros = (): SearchMacro[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as MacroStorage;
      if (data.version === STORAGE_VERSION) {
        return data.macros;
      }
    }
  } catch (e) {
    console.error('Failed to load search macros:', e);
  }
  return getDefaultMacros();
};

// Save macros to localStorage
const saveMacros = (macros: SearchMacro[]): void => {
  try {
    const data: MacroStorage = {
      version: STORAGE_VERSION,
      macros,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save search macros:', e);
  }
};

// Get default macros
export const getDefaultMacros = (): SearchMacro[] => [
  {
    id: 'default_unread_important',
    name: 'Wichtige ungelesene',
    description: 'Ungelesene E-Mails mit hoher Priorität',
    icon: '⭐',
    criteria: {
      isRead: false,
      importance: 'high',
    },
    createdAt: Date.now(),
    useCount: 0,
  },
  {
    id: 'default_with_attachments',
    name: 'Mit Anhängen',
    description: 'Alle E-Mails mit Anhängen',
    icon: '📎',
    criteria: {
      hasAttachments: true,
    },
    createdAt: Date.now(),
    useCount: 0,
  },
  {
    id: 'default_last_7_days',
    name: 'Letzte 7 Tage',
    description: 'E-Mails der letzten Woche',
    icon: '📅',
    criteria: {
      dateRelative: 'last7days',
    },
    createdAt: Date.now(),
    useCount: 0,
  },
  {
    id: 'default_uncategorized',
    name: 'Unkategorisiert',
    description: 'E-Mails ohne Kategorie',
    icon: '❓',
    criteria: {
      categories: [],
    },
    createdAt: Date.now(),
    useCount: 0,
  },
];

// Create a new macro
export const createMacro = (
  name: string,
  criteria: SearchMacroCriteria,
  description?: string,
  icon?: string,
  actions?: SearchMacroAction[]
): SearchMacro => {
  const macros = loadMacros();
  const newMacro: SearchMacro = {
    id: generateId(),
    name,
    description,
    icon: icon || '🔍',
    criteria,
    actions,
    createdAt: Date.now(),
    useCount: 0,
  };
  macros.push(newMacro);
  saveMacros(macros);
  return newMacro;
};

// Update an existing macro
export const updateMacro = (id: string, updates: Partial<SearchMacro>): SearchMacro | null => {
  const macros = loadMacros();
  const index = macros.findIndex((m) => m.id === id);
  if (index === -1) return null;

  macros[index] = { ...macros[index], ...updates };
  saveMacros(macros);
  return macros[index];
};

// Delete a macro
export const deleteMacro = (id: string): boolean => {
  const macros = loadMacros();
  const filtered = macros.filter((m) => m.id !== id);
  if (filtered.length === macros.length) return false;
  saveMacros(filtered);
  return true;
};

// Record macro usage
export const recordMacroUsage = (id: string): void => {
  const macros = loadMacros();
  const macro = macros.find((m) => m.id === id);
  if (macro) {
    macro.lastUsedAt = Date.now();
    macro.useCount++;
    saveMacros(macros);
  }
};

// Get a single macro by ID
export const getMacro = (id: string): SearchMacro | null => {
  const macros = loadMacros();
  return macros.find((m) => m.id === id) || null;
};

// Convert relative date to actual date
export const resolveRelativeDate = (
  relative: SearchMacroCriteria['dateRelative']
): { from: string; to: string } | null => {
  if (!relative) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date;
  let to: Date = new Date(today);
  to.setHours(23, 59, 59, 999);

  switch (relative) {
    case 'today':
      from = today;
      break;
    case 'yesterday':
      from = new Date(today);
      from.setDate(from.getDate() - 1);
      to = new Date(from);
      to.setHours(23, 59, 59, 999);
      break;
    case 'last7days':
      from = new Date(today);
      from.setDate(from.getDate() - 7);
      break;
    case 'last30days':
      from = new Date(today);
      from.setDate(from.getDate() - 30);
      break;
    case 'thisMonth':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'lastMonth':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    default:
      return null;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
};

// Available icons for macros
export const MACRO_ICONS = [
  '🔍', '📧', '📬', '📭', '✉️', '💌',
  '⭐', '🌟', '💡', '🔔', '🚨', '⚡',
  '📎', '📁', '🗂️', '📋', '📑', '🗃️',
  '📅', '🕐', '⏰', '🗓️', '📆', '⌛',
  '💰', '💵', '🧾', '📊', '📈', '💼',
  '👤', '👥', '🏢', '🏠', '🌐', '🔗',
  '✅', '❌', '⚠️', '❓', '❗', '🔴',
  '🟢', '🔵', '🟡', '🟠', '🟣', '⚪',
];

// Reset to default macros
export const resetToDefaultMacros = (): SearchMacro[] => {
  const defaults = getDefaultMacros();
  saveMacros(defaults);
  return defaults;
};
