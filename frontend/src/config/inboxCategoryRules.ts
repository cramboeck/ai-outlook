// Regelwerk fuer die Inbox-Uebersicht.
//
// Kategorien werden nach der Reihenfolge in `categoryRules` geprueft — die
// erste passende Regel gewinnt. Wer eine Kategorie hinzufuegen, verschieben
// oder anpassen will, aendert nur diese Datei. Kein LLM, keine Kosten,
// deterministisch.

export type CategoryId =
  | 'quarantine'
  | 'backup'
  | 'tlsReports'
  | 'teamsMessages'
  | 'projectOffers'
  | 'security'
  | 'invoices'
  | 'notifications'
  | 'customers';

export interface CategoryRule {
  id: CategoryId;
  label: string;
  emoji: string;
  color: string;            // Tailwind-Klasse fuer Balken/Chip
  colorHex: string;         // Hex fuer den gestapelten Balken (SVG/CSS)
  description: string;      // Kurzbeschreibung im aufgeklappten Fach
  match: (ctx: MatchContext) => boolean;
}

export interface MatchContext {
  senderAddress: string;    // lowercase
  senderName: string;       // lowercase
  subject: string;          // lowercase
  bodyPreview: string;      // lowercase
}

const has = (haystack: string, needle: string) => haystack.includes(needle);
const hasAny = (haystack: string, needles: string[]) =>
  needles.some((n) => haystack.includes(n));

export const categoryRules: CategoryRule[] = [
  {
    id: 'quarantine',
    label: 'Quarantaene-Berichte',
    emoji: '🛡️',
    color: 'bg-slate-500',
    colorHex: '#64748b',
    description:
      'Automatische Quarantaene-Meldungen von Microsoft Defender oder anderen Mail-Gateways.',
    match: ({ subject }) => subject.startsWith('quarantäne-bericht') || subject.startsWith('quarantaene-bericht'),
  },
  {
    id: 'backup',
    label: 'Backup-Berichte',
    emoji: '💾',
    color: 'bg-gray-500',
    colorHex: '#6b7280',
    description: 'Automatische Berichte deiner Backup-Loesung.',
    match: ({ subject }) => has(subject, '365 total backup'),
  },
  {
    id: 'tlsReports',
    label: 'TLS-Reports',
    emoji: '📡',
    color: 'bg-zinc-500',
    colorHex: '#71717a',
    description: 'SMTP-TLS-Reports (RFC 8460) — rein technische Zustellstatistik.',
    match: ({ senderAddress, senderName }) =>
      has(senderAddress, 'smtp-tls-reporting') || has(senderName, 'smtp-tls-reporting'),
  },
  {
    id: 'teamsMessages',
    label: 'Teams-Nachrichten',
    emoji: '💬',
    color: 'bg-indigo-500',
    colorHex: '#6366f1',
    description: 'Chat-Benachrichtigungen aus Microsoft Teams.',
    match: ({ senderAddress, subject }) =>
      has(senderAddress, 'noreply') && has(subject, 'sent a message'),
  },
  {
    id: 'projectOffers',
    label: 'Projektangebote',
    emoji: '💼',
    color: 'bg-teal-500',
    colorHex: '#14b8a6',
    description: 'Auftrags- und Projektangebote von Freelance-Plattformen.',
    match: ({ senderAddress }) =>
      hasAny(senderAddress, ['freelancermap', 'freelance.de', 'contractor.de']),
  },
  {
    id: 'security',
    label: 'Sicherheit & Warnungen',
    emoji: '⚠️',
    color: 'bg-red-500',
    colorHex: '#ef4444',
    description:
      'Sicherheitswarnungen, Login-Meldungen, Service-Ausfaelle und aehnliche Alerts.',
    match: ({ senderAddress, subject }) =>
      hasAny(senderAddress, [
        'defender-noreply',
        'accounts.google',
        'bitdefender',
        'all-inkl',
        'powerautomate',
        'github.com',
      ]) ||
      hasAny(subject, [
        'malware',
        'sicherheits-',
        'latenz',
        'neuem gerät',
        'neuem geraet',
        'gesperrt',
        "isn't working",
        'have failed',
      ]),
  },
  {
    id: 'invoices',
    label: 'Rechnungen, Belege & Versand',
    emoji: '💰',
    color: 'bg-emerald-500',
    colorHex: '#10b981',
    description: 'Rechnungen, Bestellbestaetigungen, Zahlungsbelege und Versandinfos.',
    match: ({ senderAddress, subject }) =>
      hasAny(senderAddress, [
        'paypal',
        'apple.com',
        'amazon.',
        'dhl.',
        'dpd.',
        'ups.com',
        'stripe',
        'billing@',
      ]) ||
      hasAny(subject, ['rechnung', 'beleg', 'zahlung', 'bestellt', 'versendet', 'paket']),
  },
  {
    id: 'notifications',
    label: 'Sonstige Benachrichtigungen',
    emoji: '🔔',
    color: 'bg-slate-400',
    colorHex: '#94a3b8',
    description: 'Automatische Systemmails mit noreply / no-reply / notification.',
    match: ({ senderAddress }) =>
      hasAny(senderAddress, ['noreply', 'no-reply', 'notification']),
  },
  // Auffangbecken — MUSS als letztes stehen. Alles was echt aussieht landet hier.
  {
    id: 'customers',
    label: 'Kunden & Geschaeftliches',
    emoji: '👥',
    color: 'bg-primary',
    colorHex: '#0f4c81',
    description: 'Persoenliche und geschaeftliche Mails, die echte Antworten brauchen.',
    match: () => true,
  },
];

// Reihenfolge, in der die Faecher untereinander angezeigt werden.
// Wichtige/erwuenschte oben, automatische unten.
export const displayOrder: CategoryId[] = [
  'customers',
  'projectOffers',
  'invoices',
  'security',
  'teamsMessages',
  'notifications',
  'quarantine',
  'backup',
  'tlsReports',
];
