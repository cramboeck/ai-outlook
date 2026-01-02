import type { Category } from '../types';

export const CATEGORIES: Category[] = [
  {
    name: 'Dringend',
    color: 'preset0',
    emoji: '🔴',
    description: 'Zeitkritische Anfragen, Eskalationen',
    keywords: ['dringend', 'asap', 'sofort', 'notfall', 'kritisch', 'eskalation', 'urgent'],
  },
  {
    name: 'Aktion erforderlich',
    color: 'preset1',
    emoji: '🟡',
    description: 'Aufgaben die Antwort oder Handlung brauchen',
    keywords: ['bitte', 'könnten sie', 'anfrage', 'aufgabe', 'erledigen', 'prüfen', 'freigabe'],
  },
  {
    name: 'Zur Info',
    color: 'preset2',
    emoji: '🟢',
    description: 'Newsletter, CC-Mails, Benachrichtigungen',
    keywords: ['fyi', 'zur info', 'newsletter', 'automatisch', 'benachrichtigung', 'info:', 'cc:'],
  },
  {
    name: 'Meeting',
    color: 'preset3',
    emoji: '🔵',
    description: 'Terminanfragen, Einladungen, Besprechungen',
    keywords: ['termin', 'meeting', 'besprechung', 'einladung', 'call', 'teams', 'zoom'],
  },
  {
    name: 'Finanzen',
    color: 'preset4',
    emoji: '🟣',
    description: 'Rechnungen, Angebote, Bestellungen',
    keywords: ['rechnung', 'invoice', 'angebot', 'bestellung', 'zahlung', 'buchhaltung', '€', 'eur'],
  },
  {
    name: 'Intern',
    color: 'preset5',
    emoji: '⚫',
    description: 'Interne Kommunikation, Team-Updates',
    keywords: ['intern', 'team', 'mitarbeiter', 'hr', 'personal', 'urlaub'],
  },
];

export const getCategoryByName = (name: string): Category | undefined => {
  return CATEGORIES.find((c) => c.name === name);
};

export const getCategoryColor = (name: string): string => {
  return getCategoryByName(name)?.color || 'preset7';
};

export const getCategoryEmoji = (name: string): string => {
  return getCategoryByName(name)?.emoji || '📧';
};

// Map preset colors to actual CSS colors for display
export const PRESET_COLORS: Record<string, string> = {
  preset0: '#d13438', // Red - Dringend
  preset1: '#ff8c00', // Orange - Aktion erforderlich
  preset2: '#107c10', // Green - Zur Info
  preset3: '#0078d4', // Blue - Meeting
  preset4: '#8764b8', // Purple - Finanzen
  preset5: '#5d5a58', // Gray - Intern
  preset6: '#038387',
  preset7: '#8e8cd8',
};

export const getPresetCssColor = (preset: string): string => {
  return PRESET_COLORS[preset] || '#8e8cd8';
};
