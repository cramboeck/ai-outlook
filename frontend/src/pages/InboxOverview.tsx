import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { Inbox, RefreshCw, AlertTriangle, LogIn, Info, ShieldCheck } from 'lucide-react';
import { graphScopes } from '../config/msalConfig';
import { initGraphClient } from '../services/graphService';
import { fetchAllUnread, type UnreadMail, type FetchUnreadResult } from '../services/graphInboxService';
import { categorize, type Categorization } from '../services/inboxCategorizer';
import { CategoryStackedBar } from '../components/inbox-overview/CategoryStackedBar';
import { HandlungsbedarfBlock } from '../components/inbox-overview/HandlungsbedarfBlock';
import { CategoryAccordion } from '../components/inbox-overview/CategoryAccordion';
import { formatLoadedAt } from '../utils/inboxFormat';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'auth-error'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; loadedAt: string; result: FetchUnreadResult };

export const InboxOverview = () => {
  const { instance, accounts } = useMsal();
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (accounts.length === 0) throw new InteractionRequiredAuthError('no_account');
    const response = await instance.acquireTokenSilent({
      ...graphScopes,
      account: accounts[0],
    });
    return response.accessToken;
  }, [instance, accounts]);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const token = await getAccessToken();
      initGraphClient(token);
      const result = await fetchAllUnread({ maxPages: 20, pageSize: 100 });
      setState({ kind: 'ok', loadedAt: new Date().toISOString(), result });
    } catch (err) {
      if (
        err instanceof InteractionRequiredAuthError ||
        (err instanceof Error && err.message === 'no_account')
      ) {
        setState({
          kind: 'auth-error',
          message: 'Die Anmeldung ist abgelaufen oder Berechtigungen fehlen.',
        });
        return;
      }
      const status =
        (err as { statusCode?: number; response?: { status?: number } })?.statusCode ??
        (err as { statusCode?: number; response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        setState({
          kind: 'auth-error',
          message:
            status === 403
              ? 'Der Zugriff auf den Posteingang wurde abgelehnt (Fehler 403). Bitte pruefe, ob die App die Berechtigung Mail.Read besitzt.'
              : 'Anmeldung abgelaufen. Bitte neu anmelden.',
        });
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [getAccessToken]);

  // Erst-Laden nach Mount
  useEffect(() => {
    if (accounts.length > 0 && state.kind === 'idle') {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  const categorization: Categorization | null = useMemo(() => {
    if (state.kind !== 'ok') return null;
    return categorize(state.result.mails as UnreadMail[]);
  }, [state]);

  const handleReLogin = useCallback(async () => {
    try {
      await instance.loginPopup({ ...graphScopes });
      await load();
    } catch {
      // ignoriert — der Nutzer hat abgebrochen
    }
  }, [instance, load]);

  const handleSelectCategory = useCallback((id: string) => {
    setOpenCategoryId((cur) => (cur === id ? null : id));
    // Nach dem Layout-Update in das Fach scrollen
    requestAnimationFrame(() => {
      const el = document.getElementById(`category-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const total = categorization?.total ?? 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Kopf */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text">Ungelesen im Posteingang</h1>
            <p className="text-text-secondary text-sm">
              Sortiert nach Art der Mail. Nur lesend, es wird nichts veraendert.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.kind === 'loading'}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${state.kind === 'loading' ? 'animate-spin' : ''}`} />
          Neu laden
        </button>
      </header>

      {/* Zustand */}
      {state.kind === 'loading' && (
        <div className="p-6 border border-border rounded-xl bg-white dark:bg-slate-900 text-text-secondary flex items-center gap-3">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Lade ungelesene Mails ...
        </div>
      )}

      {state.kind === 'auth-error' && (
        <div className="p-6 border border-amber-300 dark:border-amber-800/60 rounded-xl bg-amber-50 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h2 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                Anmeldung noetig
              </h2>
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">{state.message}</p>
              <button
                type="button"
                onClick={() => void handleReLogin()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Neu anmelden
              </button>
            </div>
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="p-6 border border-red-300 dark:border-red-800/60 rounded-xl bg-red-50 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h2 className="font-semibold text-red-900 dark:text-red-100 mb-1">
                Konnte Mails nicht laden
              </h2>
              <p className="text-sm text-red-800 dark:text-red-200 mb-3">{state.message}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Nochmal versuchen
              </button>
            </div>
          </div>
        </div>
      )}

      {state.kind === 'ok' && categorization && (
        <>
          {/* Gesamtzahl + Balken */}
          <section className="p-6 border border-border rounded-xl bg-white dark:bg-slate-900">
            <div className="flex items-baseline gap-3 mb-4">
              <div className="text-4xl font-bold text-text">{total}</div>
              <div className="text-text-secondary">
                {total === 1 ? 'ungelesene Mail' : 'ungelesene Mails'}
              </div>
            </div>
            {total > 0 ? (
              <CategoryStackedBar
                buckets={categorization.buckets}
                total={total}
                onSelectCategory={handleSelectCategory}
              />
            ) : (
              <div className="flex items-center gap-2 text-text-secondary text-sm">
                <Inbox className="w-4 h-4" />
                Dein Posteingang ist auf gelesen. Nichts zu tun.
              </div>
            )}
          </section>

          {/* Handlungsbedarf */}
          <HandlungsbedarfBlock mails={categorization.actionable} />

          {/* Faecher */}
          <div className="space-y-3">
            {categorization.buckets.map((b) => (
              <CategoryAccordion
                key={b.rule.id}
                bucket={b}
                openId={openCategoryId}
                onToggle={handleSelectCategory}
              />
            ))}
          </div>

          {/* Hinweise */}
          {state.result.partial && (
            <div className="p-4 border border-amber-300 dark:border-amber-800/60 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-start gap-2 text-sm">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-amber-800 dark:text-amber-200">
                Nur teilweise geladen — {state.result.mails.length} Mails aus{' '}
                {state.result.pagesFetched} Seiten. Sicherheitslimit oder Netzwerkfehler:{' '}
                {state.result.errorMessage ?? 'unbekannt'}.
              </div>
            </div>
          )}

          {/* Fusszeile */}
          <footer className="flex items-center gap-2 text-xs text-text-secondary pt-2 border-t border-border">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              Zuletzt geladen: {formatLoadedAt(state.loadedAt)} · Nur lesender Zugriff ·
              Keine Speicherung im Server oder Log
            </span>
          </footer>
        </>
      )}
    </div>
  );
};
