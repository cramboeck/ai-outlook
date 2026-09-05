import { TrendingUp, TrendingDown, Mail, CheckCircle, Clock, Users } from 'lucide-react';
import type { Email } from '../../types';
import { useMemo } from 'react';

interface WeeklyBriefingProps {
  emails: Email[];
}

export const WeeklyBriefing = ({ emails }: WeeklyBriefingProps) => {
  const briefing = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Diese Woche
    const thisWeekEmails = emails.filter(
      (e) => new Date(e.receivedDateTime) >= oneWeekAgo
    );

    // Letzte Woche (für Vergleich)
    const lastWeekEmails = emails.filter((e) => {
      const date = new Date(e.receivedDateTime);
      return date >= twoWeeksAgo && date < oneWeekAgo;
    });

    // Statistiken
    const total = thisWeekEmails.length;
    const read = thisWeekEmails.filter((e) => e.isRead).length;
    const unread = total - read;
    const categorized = thisWeekEmails.filter((e) => e.categories.length > 0).length;

    // Veränderung zur Vorwoche
    const lastWeekTotal = lastWeekEmails.length;
    const changePercent = lastWeekTotal > 0
      ? Math.round(((total - lastWeekTotal) / lastWeekTotal) * 100)
      : 0;

    // Top-Absender
    const senderCounts: Record<string, { name: string; count: number }> = {};
    thisWeekEmails.forEach((e) => {
      const addr = e.from.emailAddress.address;
      if (!senderCounts[addr]) {
        senderCounts[addr] = { name: e.from.emailAddress.name, count: 0 };
      }
      senderCounts[addr].count++;
    });
    const topSenders = Object.values(senderCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Top-Kategorien
    const categoryCounts: Record<string, number> = {};
    thisWeekEmails.forEach((e) => {
      e.categories.forEach((cat) => {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
    });
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    // Dringende Mails
    const urgentCount = thisWeekEmails.filter(
      (e) => e.categories.includes('Dringend') || e.importance === 'high'
    ).length;

    return {
      total,
      read,
      unread,
      categorized,
      changePercent,
      topSenders,
      topCategories,
      urgentCount,
    };
  }, [emails]);

  const isPositiveChange = briefing.changePercent > 0;

  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <span>📊</span> Wochen-Übersicht
          </h2>
          <p className="text-sm text-text-secondary">Letzte 7 Tage</p>
        </div>
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${
            isPositiveChange
              ? 'bg-red-100 text-red-600'
              : 'bg-green-100 text-green-600'
          }`}
        >
          {isPositiveChange ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          {Math.abs(briefing.changePercent)}% vs. Vorwoche
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg p-3 border border-border">
          <div className="flex items-center gap-2 text-text-secondary mb-1">
            <Mail className="w-4 h-4" />
            <span className="text-xs">Gesamt</span>
          </div>
          <p className="text-2xl font-bold text-text">{briefing.total}</p>
        </div>

        <div className="bg-card rounded-lg p-3 border border-border">
          <div className="flex items-center gap-2 text-text-secondary mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs">Gelesen</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{briefing.read}</p>
        </div>

        <div className="bg-card rounded-lg p-3 border border-border">
          <div className="flex items-center gap-2 text-text-secondary mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Ungelesen</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{briefing.unread}</p>
        </div>

        <div className="bg-card rounded-lg p-3 border border-border">
          <div className="flex items-center gap-2 text-text-secondary mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs">Kategorisiert</span>
          </div>
          <p className="text-2xl font-bold text-primary">{briefing.categorized}</p>
        </div>
      </div>

      {/* Top Senders & Categories */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Top Absender */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Top Absender</h3>
          <div className="space-y-2">
            {briefing.topSenders.length > 0 ? (
              briefing.topSenders.map((sender, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-text truncate max-w-[180px]">
                    {sender.name || 'Unbekannt'}
                  </span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-text-secondary">
                    {sender.count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">Keine Daten</p>
            )}
          </div>
        </div>

        {/* Top Kategorien */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Top Kategorien</h3>
          <div className="space-y-2">
            {briefing.topCategories.length > 0 ? (
              briefing.topCategories.map((cat, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-text">{cat.name}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {cat.count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">Keine kategorisierten Mails</p>
            )}
          </div>
        </div>
      </div>

      {/* Urgent Notice */}
      {briefing.urgentCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <div>
            <p className="font-medium text-red-800">
              {briefing.urgentCount} dringende Mail{briefing.urgentCount > 1 ? 's' : ''}
            </p>
            <p className="text-sm text-red-600">Diese Woche eingegangen</p>
          </div>
        </div>
      )}
    </div>
  );
};
