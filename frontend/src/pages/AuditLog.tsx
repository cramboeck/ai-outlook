import { useState, useEffect } from 'react';
import { Search, Filter, DollarSign, BarChart3, Clock, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '../services/apiClient';

interface LogEntry {
  id: string;
  email_id: string;
  email_subject: string;
  event_type: string;
  source: string;
  rule_name?: string;
  category?: string;
  confidence?: number;
  reasoning?: string;
  model?: string;
  tokens_total?: number;
  estimated_cost_usd?: number;
  processing_time_ms?: number;
  old_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface AuditStats {
  total_events: string;
  classifications: string;
  rule_matches: string;
  actions_extracted: string;
  user_overrides: string;
  ai_events: string;
  rule_events: string;
}

interface CostData {
  summary: {
    total_cost: string;
    total_tokens: string;
    request_count: string;
  };
  daily: Array<{ date: string; cost: string; tokens: string; requests: string }>;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  classification: 'Klassifizierung',
  rule_match: 'Regel-Match',
  action_extracted: 'Aktion extrahiert',
  action_applied: 'Aktion angewendet',
  user_override: 'Manuell geaendert',
  email_moved: 'Email verschoben',
  email_deleted: 'Email geloescht',
  document_forwarded: 'Dokument weitergeleitet',
  rule_dry_run: 'Regel-Test',
  error: 'Fehler',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  classification: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  rule_match: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  action_extracted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  user_override: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  email_moved: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  document_forwarded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const SOURCE_LABELS: Record<string, string> = {
  ai: 'KI',
  rule: 'Regel',
  manual: 'Manuell',
  auto: 'Automatisch',
  system: 'System',
};

export function AuditLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [cost, setCost] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    event_type: '',
    source: '',
    email_id: '',
  });
  const pageSize = 25;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.event_type) params.set('event_type', filters.event_type);
      if (filters.source) params.set('source', filters.source);
      if (filters.email_id) params.set('email_id', filters.email_id);
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));

      const data = await api.get<{ items: LogEntry[]; total: number }>(`/audit/log?${params}`);
      setLogs(data.items);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch audit log:', error);
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const [statsData, costData] = await Promise.all([
        api.get<AuditStats>('/audit/stats?period=7d'),
        api.get<CostData>('/audit/cost?period=30d'),
      ]);
      setStats(statsData);
      setCost(costData);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  useEffect(() => {
    fetchStats();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">Audit Log</h1>
        <button
          onClick={() => { fetchLogs(); fetchStats(); }}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-bg-secondary rounded-lg hover:bg-border transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Aktualisieren
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
            <BarChart3 className="w-4 h-4" />
            Events (7 Tage)
          </div>
          <div className="text-2xl font-bold text-text">{stats?.total_events || '0'}</div>
          <div className="text-xs text-text-secondary mt-1">
            {stats?.ai_events || '0'} KI / {stats?.rule_events || '0'} Regeln
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
            <Filter className="w-4 h-4" />
            Klassifizierungen
          </div>
          <div className="text-2xl font-bold text-text">{stats?.classifications || '0'}</div>
          <div className="text-xs text-text-secondary mt-1">
            {stats?.user_overrides || '0'} manuell geaendert
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            KI-Kosten (30 Tage)
          </div>
          <div className="text-2xl font-bold text-text">
            ${parseFloat(cost?.summary?.total_cost || '0').toFixed(4)}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {cost?.summary?.request_count || '0'} Requests
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
            <Clock className="w-4 h-4" />
            Aktionen
          </div>
          <div className="text-2xl font-bold text-text">{stats?.actions_extracted || '0'}</div>
          <div className="text-xs text-text-secondary mt-1">extrahierte Aufgaben</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Email-ID filtern..."
            value={filters.email_id}
            onChange={e => { setFilters(f => ({ ...f, email_id: e.target.value })); setPage(0); }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg-secondary"
          />
        </div>
        <select
          value={filters.event_type}
          onChange={e => { setFilters(f => ({ ...f, event_type: e.target.value })); setPage(0); }}
          className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg-secondary"
        >
          <option value="">Alle Event-Typen</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={filters.source}
          onChange={e => { setFilters(f => ({ ...f, source: e.target.value })); setPage(0); }}
          className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg-secondary"
        >
          <option value="">Alle Quellen</option>
          {Object.entries(SOURCE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Log Table */}
      <div className="bg-bg-secondary rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-text-secondary">
                <th className="text-left p-3 font-medium">Zeitpunkt</th>
                <th className="text-left p-3 font-medium">Event</th>
                <th className="text-left p-3 font-medium">Quelle</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Kategorie</th>
                <th className="text-left p-3 font-medium">Konfidenz</th>
                <th className="text-right p-3 font-medium">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-text-secondary">Laden...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-text-secondary">Keine Eintraege gefunden</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-border hover:bg-bg transition-colors">
                  <td className="p-3 text-text-secondary whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="p-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_TYPE_COLORS[log.event_type] || 'bg-gray-100 text-gray-800'}`}>
                      {EVENT_TYPE_LABELS[log.event_type] || log.event_type}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="text-xs text-text-secondary">
                      {SOURCE_LABELS[log.source] || log.source}
                    </span>
                    {log.rule_name && (
                      <span className="block text-xs text-text-secondary truncate max-w-[150px]" title={log.rule_name}>
                        {log.rule_name}
                      </span>
                    )}
                  </td>
                  <td className="p-3 max-w-[200px] truncate text-text" title={log.email_subject || ''}>
                    {log.email_subject || '-'}
                  </td>
                  <td className="p-3 text-text">{log.category || '-'}</td>
                  <td className="p-3">
                    {log.confidence != null ? (
                      <span className={`font-mono text-xs ${
                        log.confidence >= 0.8 ? 'text-green-600' :
                        log.confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {(log.confidence * 100).toFixed(0)}%
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-text-secondary">
                    {log.estimated_cost_usd
                      ? `$${parseFloat(String(log.estimated_cost_usd)).toFixed(5)}`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <span className="text-sm text-text-secondary">
              {total} Eintraege - Seite {page + 1} von {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-bg disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-bg disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
