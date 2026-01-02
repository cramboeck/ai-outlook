import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { StatsCards } from '../components/dashboard/StatsCards';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { useEmails, useEmailStats } from '../hooks/useEmails';

export const Dashboard = () => {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const { emails, isLoading } = useEmails();
  const { stats } = useEmailStats();

  const account = accounts[0];
  const firstName = account?.name?.split(' ')[0] || 'Nutzer';

  const uncategorizedEmails = emails.filter((e) => e.categories.length === 0);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">
            Willkommen zurück, {firstName}!
          </h1>
          <p className="text-text-secondary">
            Hier ist eine Übersicht Ihrer E-Mails
          </p>
        </div>

        {uncategorizedEmails.length > 0 && (
          <button
            onClick={() => navigate('/inbox')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {uncategorizedEmails.length} unkategorisiert
          </button>
        )}
      </div>

      {/* Stats */}
      <StatsCards
        total={stats.total}
        uncategorized={stats.uncategorized}
        byCategory={stats.byCategory}
        isLoading={isLoading}
      />

      {/* Recent Activity */}
      <RecentActivity emails={emails} />
    </div>
  );
};
