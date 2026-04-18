import { Mail, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { CATEGORIES } from '../../config/categories';

interface StatsCardsProps {
  total: number;
  uncategorized: number;
  byCategory: Record<string, number>;
  isLoading?: boolean;
}

export const StatsCards = ({ total, uncategorized, byCategory, isLoading }: StatsCardsProps) => {
  const categorized = total - uncategorized;

  const urgentCount = byCategory['Dringend'] || 0;
  const actionCount = byCategory['Aktion erforderlich'] || 0;

  const cards = [
    {
      icon: Mail,
      label: 'Gesamt',
      value: total,
      color: 'bg-primary/10 text-primary',
    },
    {
      icon: AlertCircle,
      label: 'Dringend',
      value: urgentCount,
      color: 'bg-error/10 text-error',
      emoji: CATEGORIES.find((c) => c.name === 'Dringend')?.emoji,
    },
    {
      icon: Clock,
      label: 'Aktion nötig',
      value: actionCount,
      color: 'bg-warning/10 text-warning',
      emoji: CATEGORIES.find((c) => c.name === 'Aktion erforderlich')?.emoji,
    },
    {
      icon: CheckCircle,
      label: 'Kategorisiert',
      value: categorized,
      color: 'bg-success/10 text-success',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card rounded-xl p-5 border border-border animate-pulse">
            <div className="h-10 w-10 bg-gray-200 rounded-lg mb-3" />
            <div className="h-8 w-16 bg-gray-200 rounded mb-1" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-card rounded-xl p-5 border border-border hover:shadow-md transition-shadow"
        >
          <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${card.color} mb-3`}>
            {card.emoji ? (
              <span className="text-lg">{card.emoji}</span>
            ) : (
              <card.icon className="w-5 h-5" />
            )}
          </div>
          <p className="text-2xl font-bold text-text">{card.value}</p>
          <p className="text-sm text-text-secondary">{card.label}</p>
        </div>
      ))}
    </div>
  );
};
