import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { StatsCards } from '../components/dashboard/StatsCards';
import { InsightCards } from '../components/dashboard/InsightCards';
import { SmartViews } from '../components/dashboard/SmartViews';
import { WeeklyBriefing } from '../components/dashboard/WeeklyBriefing';
import { ActionBoard } from '../components/dashboard/ActionBoard';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { useEmails, useEmailStats } from '../hooks/useEmails';
import { useInsights, useSmartViews } from '../hooks/useInsights';
import type { InsightCard, SmartView } from '../types';

export const Dashboard = () => {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const { emails, isLoading } = useEmails();
  const { stats } = useEmailStats();
  const { insights } = useInsights(emails);
  const smartViews = useSmartViews(emails);

  const [activeView, setActiveView] = useState<string | undefined>();

  const account = accounts[0];
  const firstName = account?.name?.split(' ')[0] || 'Nutzer';

  const uncategorizedEmails = emails.filter((e) => e.categories.length === 0);

  // Filtere Emails basierend auf aktiver Smart View
  const filteredEmails = activeView
    ? emails.filter(smartViews.find((v) => v.id === activeView)?.filter || (() => true))
    : emails;

  const handleInsightClick = (insight: InsightCard) => {
    // Navigiere zu Inbox mit Filter
    navigate('/inbox', { state: { filterEmailIds: insight.emailIds } });
  };

  const handleViewSelect = (view: SmartView) => {
    if (activeView === view.id) {
      setActiveView(undefined); // Toggle off
    } else {
      setActiveView(view.id);
    }
  };

  const handleEmailClick = (emailId: string) => {
    navigate('/inbox', { state: { selectedEmailId: emailId } });
  };

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">
            Willkommen zurück, {firstName}!
          </h1>
          <p className="text-text-secondary">
            Hier ist Ihre intelligente E-Mail-Übersicht
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

      {/* AI Insight Cards */}
      <InsightCards insights={insights} onInsightClick={handleInsightClick} />

      {/* Smart Views */}
      <SmartViews
        views={smartViews}
        activeViewId={activeView}
        onViewSelect={handleViewSelect}
      />

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Weekly Briefing */}
        <WeeklyBriefing emails={emails} />

        {/* Right: Action Board */}
        <ActionBoard emails={emails} onEmailClick={handleEmailClick} />
      </div>

      {/* Stats */}
      <StatsCards
        total={stats.total}
        uncategorized={stats.uncategorized}
        byCategory={stats.byCategory}
        isLoading={isLoading}
      />

      {/* Recent Activity - gefiltert wenn SmartView aktiv */}
      <RecentActivity
        emails={activeView ? filteredEmails : emails}
        title={activeView ? smartViews.find((v) => v.id === activeView)?.name : undefined}
      />
    </div>
  );
};
