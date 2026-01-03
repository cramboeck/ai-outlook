import { useMemo } from 'react';
import type { Email, InsightCard, SmartView } from '../types';
import { CATEGORIES } from '../config/categories';

// Berechne Insights aus E-Mail-Daten
export const useInsights = (emails: Email[]) => {
  const insights = useMemo(() => {
    const cards: InsightCard[] = [];
    const now = new Date();

    // 1. Dringende E-Mails (Kategorie "Dringend" oder hohe Wichtigkeit + ungelesen)
    const urgentEmails = emails.filter(
      (e) =>
        e.categories.includes('Dringend') ||
        (e.importance === 'high' && !e.isRead)
    );
    if (urgentEmails.length > 0) {
      cards.push({
        id: 'urgent',
        type: 'urgent',
        title: `${urgentEmails.length} dringende Mail${urgentEmails.length > 1 ? 's' : ''}`,
        description: 'Benötigen sofortige Aufmerksamkeit',
        count: urgentEmails.length,
        emailIds: urgentEmails.map((e) => e.id),
        icon: '🔴',
        color: 'bg-red-500',
        priority: 100,
      });
    }

    // 2. Aktion erforderlich (ungelesen)
    const actionEmails = emails.filter(
      (e) => e.categories.includes('Aktion erforderlich') && !e.isRead
    );
    if (actionEmails.length > 0) {
      cards.push({
        id: 'action',
        type: 'action',
        title: `${actionEmails.length} Aktion${actionEmails.length > 1 ? 'en' : ''} erforderlich`,
        description: 'Warten auf Ihre Antwort oder Handlung',
        count: actionEmails.length,
        emailIds: actionEmails.map((e) => e.id),
        icon: '⚡',
        color: 'bg-orange-500',
        priority: 90,
      });
    }

    // 3. Meetings heute/morgen
    const meetingEmails = emails.filter((e) => {
      if (!e.categories.includes('Meeting')) return false;
      const received = new Date(e.receivedDateTime);
      const hoursDiff = (now.getTime() - received.getTime()) / (1000 * 60 * 60);
      return hoursDiff < 48; // Letzte 48 Stunden
    });
    if (meetingEmails.length > 0) {
      cards.push({
        id: 'meeting',
        type: 'meeting',
        title: `${meetingEmails.length} Meeting-Anfrage${meetingEmails.length > 1 ? 'n' : ''}`,
        description: 'Termine prüfen und bestätigen',
        count: meetingEmails.length,
        emailIds: meetingEmails.map((e) => e.id),
        icon: '📅',
        color: 'bg-purple-500',
        priority: 70,
      });
    }

    // 4. Finanzen (Rechnungen, Angebote)
    const financeEmails = emails.filter(
      (e) => e.categories.includes('Finanzen') && !e.isRead
    );
    if (financeEmails.length > 0) {
      cards.push({
        id: 'finance',
        type: 'finance',
        title: `${financeEmails.length} Finanz-Mail${financeEmails.length > 1 ? 's' : ''}`,
        description: 'Rechnungen und Angebote prüfen',
        count: financeEmails.length,
        emailIds: financeEmails.map((e) => e.id),
        icon: '💰',
        color: 'bg-green-500',
        priority: 60,
      });
    }

    // 5. Alte ungelesene E-Mails (> 3 Tage)
    const oldUnreadEmails = emails.filter((e) => {
      if (e.isRead) return false;
      const received = new Date(e.receivedDateTime);
      const daysDiff = (now.getTime() - received.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff > 3;
    });
    if (oldUnreadEmails.length > 0) {
      cards.push({
        id: 'overdue',
        type: 'overdue',
        title: `${oldUnreadEmails.length} überfällig`,
        description: 'Ungelesen seit mehr als 3 Tagen',
        count: oldUnreadEmails.length,
        emailIds: oldUnreadEmails.map((e) => e.id),
        icon: '⏰',
        color: 'bg-yellow-500',
        priority: 50,
      });
    }

    // 6. Unkategorisiert (Aktion erforderlich)
    const uncategorized = emails.filter((e) => e.categories.length === 0);
    if (uncategorized.length > 0) {
      cards.push({
        id: 'uncategorized',
        type: 'action',
        title: `${uncategorized.length} unkategorisiert`,
        description: 'KI-Klassifizierung empfohlen',
        count: uncategorized.length,
        emailIds: uncategorized.map((e) => e.id),
        icon: '📋',
        color: 'bg-gray-500',
        priority: 40,
      });
    }

    // Sortiere nach Priorität
    return cards.sort((a, b) => b.priority - a.priority);
  }, [emails]);

  return { insights };
};

// Smart Views generieren
export const useSmartViews = (emails: Email[]): SmartView[] => {
  return useMemo(() => {
    const now = new Date();

    const views: SmartView[] = [
      {
        id: 'unread-important',
        name: 'Wichtig & Ungelesen',
        icon: '🔥',
        filter: (e) => !e.isRead && (e.importance === 'high' || e.categories.includes('Dringend')),
      },
      {
        id: 'needs-response',
        name: 'Antwort erforderlich',
        icon: '💬',
        filter: (e) => e.categories.includes('Aktion erforderlich') && !e.isRead,
      },
      {
        id: 'meetings-upcoming',
        name: 'Meetings',
        icon: '📅',
        filter: (e) => e.categories.includes('Meeting'),
      },
      {
        id: 'finance',
        name: 'Finanzen',
        icon: '💰',
        filter: (e) => e.categories.includes('Finanzen'),
      },
      {
        id: 'newsletters',
        name: 'Newsletter & Info',
        icon: '📰',
        filter: (e) => e.categories.includes('Zur Info'),
      },
      {
        id: 'old-unread',
        name: 'Überfällig (>3 Tage)',
        icon: '⏰',
        filter: (e) => {
          if (e.isRead) return false;
          const received = new Date(e.receivedDateTime);
          const daysDiff = (now.getTime() - received.getTime()) / (1000 * 60 * 60 * 24);
          return daysDiff > 3;
        },
      },
      {
        id: 'with-attachments',
        name: 'Mit Anhängen',
        icon: '📎',
        filter: (e) => e.hasAttachments,
      },
      {
        id: 'today',
        name: 'Heute',
        icon: '📬',
        filter: (e) => {
          const received = new Date(e.receivedDateTime);
          return received.toDateString() === now.toDateString();
        },
      },
    ];

    // Zähle E-Mails pro View
    return views.map((view) => ({
      ...view,
      count: emails.filter(view.filter).length,
    }));
  }, [emails]);
};

// Priority Score berechnen
export const calculatePriorityScore = (email: Email): number => {
  let score = 50; // Basis-Score
  const now = new Date();
  const received = new Date(email.receivedDateTime);
  const hoursAge = (now.getTime() - received.getTime()) / (1000 * 60 * 60);

  // Faktoren
  if (!email.isRead) score += 10;
  if (email.importance === 'high') score += 20;
  if (email.importance === 'low') score -= 10;
  if (email.categories.includes('Dringend')) score += 25;
  if (email.categories.includes('Aktion erforderlich')) score += 15;
  if (email.categories.includes('Zur Info')) score -= 15;
  if (email.hasAttachments) score += 5;

  // Alter (neuere = höher, aber nicht zu viel)
  if (hoursAge < 1) score += 10;
  else if (hoursAge < 4) score += 5;
  else if (hoursAge > 72) score -= 10; // Älter als 3 Tage

  // Begrenze auf 0-100
  return Math.max(0, Math.min(100, score));
};

// Top-Absender ermitteln
export const useTopSenders = (emails: Email[], limit: number = 5) => {
  return useMemo(() => {
    const senderCounts: Record<string, { name: string; email: string; count: number }> = {};

    emails.forEach((email) => {
      const address = email.from.emailAddress.address;
      if (!senderCounts[address]) {
        senderCounts[address] = {
          name: email.from.emailAddress.name,
          email: address,
          count: 0,
        };
      }
      senderCounts[address].count++;
    });

    return Object.values(senderCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }, [emails, limit]);
};

// Kategorie-Statistiken
export const useCategoryStats = (emails: Email[]) => {
  return useMemo(() => {
    const stats: Record<string, number> = {};

    CATEGORIES.forEach((cat) => {
      stats[cat.name] = 0;
    });

    emails.forEach((email) => {
      email.categories.forEach((cat) => {
        if (stats[cat] !== undefined) {
          stats[cat]++;
        }
      });
    });

    return Object.entries(stats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [emails]);
};
