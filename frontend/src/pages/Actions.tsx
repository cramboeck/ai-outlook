import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  StickyNote,
  Mail,
  CalendarClock,
  Tag,
  ListTodo,
} from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { todoScopes } from '../config/msalConfig';
import { api } from '../services/apiClient';
import { initGraphClient, getAllTodoTasks, createTodoTask } from '../services/graphService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Subtask {
  id: string;
  displayName: string;
  isChecked: boolean;
}

interface Action {
  id: string;
  email_id: string;
  email_subject?: string;
  description: string;
  action_type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'done' | 'dismissed';
  deadline?: string;
  notes?: string;
  document_type?: string;
  forwarded_to?: string;
  source?: string;
  ms_todo_id?: string;
  ms_todo_list_id?: string;
  subtasks?: Subtask[] | string;
  created_at: string;
  updated_at: string;
}

interface ActionSummary {
  open: number;
  in_progress: number;
  done: number;
  dismissed: number;
  overdue: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<Action['priority'], { label: string; color: string; bg: string }> = {
  critical: { label: 'Kritisch', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
  high: { label: 'Hoch', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  medium: { label: 'Mittel', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  low: { label: 'Niedrig', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  reply: 'Antworten',
  review: 'Pruefen',
  schedule: 'Planen',
  approve: 'Genehmigen',
  forward: 'Weiterleiten',
  follow_up: 'Nachfassen',
  other: 'Sonstiges',
};

const STATUS_LABELS: Record<Action['status'], string> = {
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
  dismissed: 'Verworfen',
};

const COLUMN_CONFIG = [
  { status: 'open' as const, label: 'Offen', accent: 'border-yellow-500', accentBg: 'bg-yellow-500', countBg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { status: 'in_progress' as const, label: 'In Bearbeitung', accent: 'border-blue-500', accentBg: 'bg-blue-500', countBg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { status: 'done' as const, label: 'Erledigt', accent: 'border-green-500', accentBg: 'bg-green-500', countBg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
] as const;

const ALL_ACTION_TYPES = ['reply', 'review', 'schedule', 'approve', 'forward', 'follow_up', 'other'];
const ALL_PRIORITIES: Action['priority'][] = ['critical', 'high', 'medium', 'low'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOverdue(deadline?: string): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Actions() {
  const { instance, accounts } = useMsal();

  // Data
  const [actions, setActions] = useState<Action[]>([]);
  const [summary, setSummary] = useState<ActionSummary | null>(null);
  const [overdueActions, setOverdueActions] = useState<Action[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Microsoft To-Do Sync
  const [todoSyncing, setTodoSyncing] = useState(false);
  const [todoSyncResult, setTodoSyncResult] = useState<{ imported: number; updated: number; skipped: number; pushed: number } | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.get<ActionSummary>('/actions/summary');
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  }, []);

  const fetchOverdue = useCallback(async () => {
    try {
      const raw = await api.get<Action[] | { items: Action[] }>('/actions/overdue');
      const items = Array.isArray(raw) ? raw : (raw as any).items ?? [];
      setOverdueActions(items);
    } catch (err) {
      console.error('Failed to fetch overdue actions:', err);
    }
  }, []);

  const fetchActions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (priorityFilter) params.set('priority', priorityFilter);
      if (typeFilter) params.set('type', typeFilter);
      const qs = params.toString();
      const raw = await api.get<Action[] | { items: Action[] }>(`/actions${qs ? '?' + qs : ''}`);
      const items = Array.isArray(raw) ? raw : (raw as any).items ?? [];
      setActions(items);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Laden der Aufgaben';
      setError(message);
      console.error('Failed to fetch actions:', err);
    }
  }, [priorityFilter, typeFilter]);

  const fetchAll = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    await Promise.all([fetchActions(), fetchSummary(), fetchOverdue()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchActions, fetchSummary, fetchOverdue]);

  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  // -------------------------------------------------------------------------
  // Microsoft To-Do Sync
  // -------------------------------------------------------------------------

  const syncTodo = async () => {
    setTodoSyncing(true);
    setTodoSyncResult(null);
    setError(null);
    try {
      // Step 0: Acquire Graph token for To-Do scopes (separate from mail token)
      if (accounts.length === 0) {
        setError('Nicht angemeldet. Bitte melden Sie sich mit Ihrem Microsoft-Konto an.');
        setTodoSyncing(false);
        return;
      }
      let tokenResponse;
      try {
        tokenResponse = await instance.acquireTokenSilent({
          scopes: todoScopes.scopes,
          account: accounts[0],
        });
      } catch (silentErr) {
        console.warn('To-Do silent token failed, trying popup:', silentErr);
        try {
          tokenResponse = await instance.acquireTokenPopup({
            scopes: todoScopes.scopes,
            account: accounts[0],
          });
        } catch (popupErr) {
          console.error('To-Do popup token failed:', popupErr);
          setError(
            'Tasks.ReadWrite Berechtigung konnte nicht erhalten werden. ' +
            'Bitte prüfen Sie in Azure AD unter "API-Berechtigungen", dass "Tasks.ReadWrite" hinzugefügt und Admin-Zustimmung erteilt wurde.'
          );
          setTodoSyncing(false);
          return;
        }
      }

      if (!tokenResponse?.accessToken) {
        setError('Kein Zugriffstoken für Microsoft To-Do erhalten. Bitte prüfen Sie die Azure AD App-Registrierung.');
        setTodoSyncing(false);
        return;
      }

      console.log('To-Do token acquired, scopes:', tokenResponse.scopes);
      // Use a temporary Graph client for To-Do operations (don't clobber the mail client)
      initGraphClient(tokenResponse.accessToken);

      // Step 1: Fetch all tasks from Microsoft To-Do via Graph API
      const { lists, tasks } = await getAllTodoTasks(false);

      if (tasks.length === 0 && lists.length === 0) {
        setError('Keine Microsoft To-Do Listen gefunden. Bitte stellen Sie sicher, dass Sie angemeldet sind und Tasks.ReadWrite Berechtigungen haben.');
        setTodoSyncing(false);
        return;
      }

      // Step 2: Send tasks to backend for sync/import
      const syncResult = await api.post<{ imported: number; updated: number; skipped: number; errors: number }>('/todo/sync', {
        tasks: tasks.map(t => ({
          id: t.id,
          listId: t.listId,
          listName: t.listName,
          title: t.title,
          body: t.body?.content,
          status: t.status,
          importance: t.importance,
          dueDateTime: t.dueDateTime?.dateTime,
          createdDateTime: t.createdDateTime,
          lastModifiedDateTime: t.lastModifiedDateTime,
          categories: t.categories,
          checklistItems: t.checklistItems?.map(c => ({
            id: c.id,
            displayName: c.displayName,
            isChecked: c.isChecked,
          })),
        })),
      });

      // Step 3: Check if there are MailSort-only actions that should go to To-Do
      let pushed = 0;
      try {
        const statusResult = await api.get<{ push_candidates: any[] }>('/todo/status');
        const candidates = statusResult.push_candidates || [];

        if (candidates.length > 0 && lists.length > 0) {
          // Push to the default/first list
          const defaultList = lists.find(l => l.wellknownListName === 'defaultList') || lists[0];
          const mappings: Array<{ actionId: string; todoId: string; listId: string }> = [];

          for (const candidate of candidates.slice(0, 20)) { // Max 20 per sync
            try {
              const created = await createTodoTask(defaultList.id, {
                title: candidate.description,
                importance: candidate.priority === 'high' || candidate.priority === 'critical' ? 'high' : candidate.priority === 'low' ? 'low' : 'normal',
                dueDateTime: candidate.deadline || undefined,
                body: candidate.source === 'ai' ? 'Automatisch erkannt von MailSort' : undefined,
              });
              mappings.push({ actionId: candidate.id, todoId: created.id, listId: defaultList.id });
              pushed++;
            } catch (err) {
              console.error('Failed to push action to To-Do:', err);
            }
          }

          // Confirm push back to backend
          if (mappings.length > 0) {
            await api.post('/todo/push-confirm', { mappings });
          }
        }
      } catch (err) {
        console.error('Push to To-Do failed:', err);
      }

      setTodoSyncResult({
        imported: syncResult.imported,
        updated: syncResult.updated,
        skipped: syncResult.skipped,
        pushed,
      });

      if (syncResult.errors > 0) {
        setError(`To-Do Sync: ${syncResult.errors} Fehler beim Import. Bitte pruefen Sie die Konsole fuer Details.`);
      }

      // Refresh actions list
      await fetchAll(false);

      // Auto-clear result after 8 seconds
      setTimeout(() => setTodoSyncResult(null), 8000);
    } catch (err) {
      console.error('To-Do sync failed:', err);
      setError(err instanceof Error ? err.message : 'Microsoft To-Do Sync fehlgeschlagen');
    }
    setTodoSyncing(false);
  };

  // -------------------------------------------------------------------------
  // Status change (optimistic)
  // -------------------------------------------------------------------------

  const updateStatus = async (action: Action, newStatus: Action['status']) => {
    const prevActions = [...actions];
    const prevOverdue = [...overdueActions];

    // Optimistic update
    setActions((prev) =>
      prev.map((a) => (a.id === action.id ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a))
    );
    setOverdueActions((prev) =>
      prev.map((a) => (a.id === action.id ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a))
    );
    setUpdatingStatus((prev) => new Set(prev).add(action.id));

    try {
      await api.patch(`/actions/${action.id}`, { status: newStatus });
      // Refresh summary counts
      fetchSummary();
      fetchOverdue();
    } catch (err) {
      console.error('Failed to update status:', err);
      // Rollback
      setActions(prevActions);
      setOverdueActions(prevOverdue);
    } finally {
      setUpdatingStatus((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  };

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------

  const toggleNotes = (id: string, currentNotes?: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!(id in editingNotes)) {
          setEditingNotes((e) => ({ ...e, [id]: currentNotes || '' }));
        }
      }
      return next;
    });
  };

  const saveNotes = async (id: string) => {
    setSavingNotes((prev) => new Set(prev).add(id));
    try {
      await api.patch(`/actions/${id}`, { notes: editingNotes[id] || '' });
      setActions((prev) =>
        prev.map((a) => (a.id === id ? { ...a, notes: editingNotes[id] || '' } : a))
      );
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSavingNotes((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  const filteredActions = actions.filter((a) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesDesc = a.description.toLowerCase().includes(q);
      const matchesSubject = a.email_subject?.toLowerCase().includes(q);
      if (!matchesDesc && !matchesSubject) return false;
    }
    return true;
  });

  const actionsForColumn = (status: Action['status']) =>
    filteredActions.filter((a) => a.status === status);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderPriorityBadge = (priority: Action['priority']) => {
    const cfg = PRIORITY_CONFIG[priority];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.color}`}>
        {cfg.label}
      </span>
    );
  };

  const renderTypeBadge = (type: string) => {
    const label = ACTION_TYPE_LABELS[type] || type;
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
        <Tag className="w-3 h-3 mr-1" />
        {label}
      </span>
    );
  };

  const renderStatusButtons = (action: Action) => {
    const isUpdating = updatingStatus.has(action.id);

    if (action.status === 'open') {
      return (
        <div className="flex gap-2 mt-3">
          <button
            disabled={isUpdating}
            onClick={() => updateStatus(action, 'in_progress')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
          >
            <ArrowRight className="w-3 h-3" />
            Starten
          </button>
          <button
            disabled={isUpdating}
            onClick={() => updateStatus(action, 'dismissed')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-3 h-3" />
            Verwerfen
          </button>
        </div>
      );
    }

    if (action.status === 'in_progress') {
      return (
        <div className="flex gap-2 mt-3">
          <button
            disabled={isUpdating}
            onClick={() => updateStatus(action, 'done')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-3 h-3" />
            Erledigt
          </button>
          <button
            disabled={isUpdating}
            onClick={() => updateStatus(action, 'open')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-3 h-3" />
            Zurueck
          </button>
        </div>
      );
    }

    if (action.status === 'done') {
      return (
        <div className="flex gap-2 mt-3">
          <button
            disabled={isUpdating}
            onClick={() => updateStatus(action, 'in_progress')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-3 h-3" />
            Wiedereroeffnen
          </button>
        </div>
      );
    }

    return null;
  };

  // Parse the JSONB subtasks column — Postgres returns it already expanded
  // when used via the driver, but the frontend cache path can stringify it.
  const parseSubtasks = (raw: Action['subtasks']): Subtask[] => {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return raw;
  };

  const togglingSubtasks = useRef(new Set<string>());
  const [_, forceRender] = useState(0);

  const toggleSubtask = async (action: Action, sub: Subtask) => {
    if (!action.ms_todo_id || !action.ms_todo_list_id) {
      // Local-only subtask toggling is future work. Without a Graph id we
      // would silently lose the state on next sync.
      return;
    }
    const key = `${action.id}:${sub.id}`;
    if (togglingSubtasks.current.has(key)) return;
    togglingSubtasks.current.add(key);
    forceRender(x => x + 1);

    const nextChecked = !sub.isChecked;

    // Optimistic UI: flip locally first, then write-through to Graph + DB.
    setActions(prev => prev.map(a => {
      if (a.id !== action.id) return a;
      const subs = parseSubtasks(a.subtasks).map(s =>
        s.id === sub.id ? { ...s, isChecked: nextChecked } : s
      );
      return { ...a, subtasks: subs };
    }));

    try {
      // 1. Push to Microsoft Graph
      if (!accounts?.[0]) throw new Error('Nicht angemeldet');
      const tokenResp = await instance.acquireTokenSilent({
        ...todoScopes,
        account: accounts[0],
      });
      initGraphClient(tokenResp.accessToken);
      const { updateTodoChecklistItem } = await import('../services/graphService');
      await updateTodoChecklistItem(action.ms_todo_list_id, action.ms_todo_id, sub.id, nextChecked);

      // 2. Persist on our side so the next page-load is consistent.
      await api.patch(`/todo/action/${action.id}/subtask/${sub.id}`, { isChecked: nextChecked });
    } catch (err) {
      // Roll back the optimistic change.
      setActions(prev => prev.map(a => {
        if (a.id !== action.id) return a;
        const subs = parseSubtasks(a.subtasks).map(s =>
          s.id === sub.id ? { ...s, isChecked: sub.isChecked } : s
        );
        return { ...a, subtasks: subs };
      }));
      console.error('Subtask toggle failed:', err);
    } finally {
      togglingSubtasks.current.delete(key);
      forceRender(x => x + 1);
    }
  };

  const renderSubtasks = (action: Action) => {
    const subs = parseSubtasks(action.subtasks);
    if (subs.length === 0) return null;
    const done = subs.filter(s => s.isChecked).length;
    return (
      <div className="mb-3 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
        <div className="text-xs text-text-secondary mb-1.5">
          Unteraufgaben ({done} / {subs.length})
        </div>
        <ul className="space-y-1">
          {subs.map(sub => {
            const key = `${action.id}:${sub.id}`;
            const isToggling = togglingSubtasks.current.has(key);
            return (
              <li key={sub.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sub.isChecked}
                  disabled={isToggling}
                  onChange={() => toggleSubtask(action, sub)}
                  className="mt-0.5 cursor-pointer accent-primary"
                />
                <span className={`flex-1 ${sub.isChecked ? 'line-through text-text-secondary' : 'text-text'}`}>
                  {sub.displayName}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderActionCard = (action: Action) => {
    const overdue = action.status !== 'done' && action.status !== 'dismissed' && isOverdue(action.deadline);
    const notesExpanded = expandedNotes.has(action.id);
    const isSavingNote = savingNotes.has(action.id);

    return (
      <div
        key={action.id}
        className={`bg-card rounded-lg border p-4 shadow-sm transition-all ${
          overdue ? 'border-red-400 dark:border-red-600' : 'border-border'
        }`}
      >
        {/* Top row: priority + type + source badges */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {renderPriorityBadge(action.priority)}
          {renderTypeBadge(action.action_type)}
          {action.ms_todo_id && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" title="Synchronisiert mit Microsoft To-Do">
              <ListTodo className="w-3 h-3" />
              To-Do
            </span>
          )}
          {action.source === 'ai' && !action.ms_todo_id && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              KI
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-text font-medium mb-2">{action.description}</p>

        {/* Subtasks (from MS To-Do checklistItems) */}
        {renderSubtasks(action)}

        {/* Email subject */}
        {action.email_subject && (
          <div className="flex items-center gap-1 text-xs text-text-secondary mb-2">
            <Mail className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{truncate(action.email_subject, 50)}</span>
          </div>
        )}

        {/* Deadline */}
        {action.deadline && (
          <div
            className={`flex items-center gap-1 text-xs mb-2 ${
              overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-text-secondary'
            }`}
          >
            <CalendarClock className="w-3 h-3 flex-shrink-0" />
            <span>
              Frist: {formatDate(action.deadline)}
              {overdue && ' (ueberfaellig)'}
            </span>
          </div>
        )}

        {/* Status buttons */}
        {renderStatusButtons(action)}

        {/* Notes toggle */}
        <button
          onClick={() => toggleNotes(action.id, action.notes)}
          className="flex items-center gap-1 mt-3 text-xs text-text-secondary hover:text-text transition-colors"
        >
          <StickyNote className="w-3 h-3" />
          Notizen
          {notesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* Notes editor */}
        {notesExpanded && (
          <div className="mt-2 space-y-2">
            <textarea
              className="w-full text-xs p-2 border border-border rounded bg-bg-secondary text-text resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              placeholder="Notizen hinzufuegen..."
              value={editingNotes[action.id] ?? action.notes ?? ''}
              onChange={(e) => setEditingNotes((prev) => ({ ...prev, [action.id]: e.target.value }))}
            />
            <button
              disabled={isSavingNote}
              onClick={() => saveNotes(action.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-primary text-white rounded hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {isSavingNote && <Loader2 className="w-3 h-3 animate-spin" />}
              Speichern
            </button>
          </div>
        )}

        {/* Meta */}
        <div className="text-xs text-text-secondary mt-3 pt-2 border-t border-border">
          Erstellt: {formatDateTime(action.created_at)}
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-text-secondary text-sm">Aufgaben werden geladen...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">Aufgaben</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={syncTodo}
            disabled={todoSyncing}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
            title="Microsoft To-Do Aufgaben synchronisieren"
          >
            {todoSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListTodo className="w-4 h-4" />}
            To-Do Sync
          </button>
          <button
            onClick={() => fetchAll(false)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-bg-secondary rounded-lg hover:bg-border transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* To-Do Sync Result */}
      {todoSyncResult && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-700 dark:text-blue-300 text-sm">
          <ListTodo className="w-4 h-4 flex-shrink-0" />
          <span>
            Microsoft To-Do Sync: {todoSyncResult.imported} importiert, {todoSyncResult.updated} aktualisiert, {todoSyncResult.skipped} unveraendert
            {todoSyncResult.pushed > 0 && `, ${todoSyncResult.pushed} nach To-Do gepusht`}
          </span>
          <button onClick={() => setTodoSyncResult(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => fetchAll(false)} className="ml-auto underline text-xs">
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Stats bar */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-bg-secondary rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
              <Clock className="w-4 h-4 text-yellow-500" />
              Offen
            </div>
            <div className="text-2xl font-bold text-text">{summary.open}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
              <ArrowRight className="w-4 h-4 text-blue-500" />
              In Bearbeitung
            </div>
            <div className="text-2xl font-bold text-text">{summary.in_progress}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Erledigt
            </div>
            <div className="text-2xl font-bold text-text">{summary.done}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Ueberfaellig
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.overdue}</div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Suche nach Beschreibung oder Betreff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-bg-secondary text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-bg-secondary text-text focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Alle Prioritaeten</option>
          {ALL_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_CONFIG[p].label}
            </option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-bg-secondary text-text focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Alle Typen</option>
          {ALL_ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTION_TYPE_LABELS[t] || t}
            </option>
          ))}
        </select>

        {/* Clear filters */}
        {(priorityFilter || typeFilter || searchQuery) && (
          <button
            onClick={() => {
              setPriorityFilter('');
              setTypeFilter('');
              setSearchQuery('');
            }}
            className="flex items-center gap-1 px-3 py-2 text-sm text-text-secondary hover:text-text transition-colors"
          >
            <X className="w-4 h-4" />
            Filter zuruecksetzen
          </button>
        )}
      </div>

      {/* Overdue section */}
      {overdueActions.length > 0 && (
        <div className="border border-red-300 dark:border-red-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setOverdueOpen((o) => !o)}
            className="flex items-center justify-between w-full px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-semibold text-sm"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Ueberfaellige Aufgaben ({overdueActions.length})
            </div>
            {overdueOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {overdueOpen && (
            <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 bg-red-50/50 dark:bg-red-900/10">
              {overdueActions.map((a) => renderActionCard(a))}
            </div>
          )}
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-6 overflow-x-auto pb-4">
        {COLUMN_CONFIG.map((col) => {
          const colActions = actionsForColumn(col.status);
          return (
            <div key={col.status} className="flex-1 min-w-[300px]">
              {/* Column header */}
              <div className={`flex items-center justify-between mb-4 pl-3 border-l-4 ${col.accent}`}>
                <h2 className="font-semibold text-text">{col.label}</h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${col.countBg}`}>
                  {colActions.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {colActions.length === 0 ? (
                  <div className="text-center py-10 text-text-secondary text-sm border border-dashed border-border rounded-lg bg-gray-50/50">
                    <div className="text-2xl mb-2 opacity-60">
                      {col.status === 'open' ? '📋' : col.status === 'in_progress' ? '⚡' : col.status === 'waiting' ? '⏳' : '✅'}
                    </div>
                    <p className="font-medium text-text-secondary">Keine Aufgaben</p>
                    <p className="text-xs text-text-secondary/70 mt-1">
                      {col.status === 'open' ? 'Neue Aufgaben erscheinen hier' : col.status === 'done' ? 'Erledigte Aufgaben landen hier' : ''}
                    </p>
                  </div>
                ) : (
                  colActions.map((action) => renderActionCard(action))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Actions;
