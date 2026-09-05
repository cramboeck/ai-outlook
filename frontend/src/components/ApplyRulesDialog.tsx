// Apply Rules Dialog
//
// One UI that covers both flows:
//   - "Alle Regeln anwenden" (ruleId undefined): walks the active rule set
//     against the last N inbox emails
//   - "Diese Regel anwenden" (ruleId set): targets a single rule
//
// Flow:
//   1. Fetch inbox emails via Graph (paged, up to `maxEmails`)
//   2. POST them to /api/rules/evaluate-batch → server returns per-email
//      rule matches + the actions to run
//   3. If dry-run: just show the plan
//      else: execute actions via Graph client-side, progress + counts
//
// Everything streams — we resolve per-email before moving on so progress
// feels honest, and a single failing action never stops the run.

import { useEffect, useState } from 'react';
import { X, Loader2, Play, CheckCircle2, AlertTriangle, Eye, Zap } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { graphScopes } from '../config/msalConfig';
import {
  initGraphClient,
  getEmailsFromFolder,
} from '../services/graphService';
import {
  evaluateRulesOnEmails,
  executeRuleAction,
  resetFolderCache,
} from '../services/retroactiveRulesService';
import type { EvaluationResult, ActionExecutionResult } from '../services/retroactiveRulesService';
import type { Email } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** When set, only this rule is evaluated. Omit for "all active rules". */
  ruleId?: string;
  ruleName?: string;
}

type Phase = 'idle' | 'fetching' | 'evaluating' | 'executing' | 'done' | 'error';

const DEFAULT_EMAIL_LIMIT = 500;

export const ApplyRulesDialog = ({ isOpen, onClose, ruleId, ruleName }: Props) => {
  const { instance, accounts } = useMsal();
  const [phase, setPhase] = useState<Phase>('idle');
  const [dryRun, setDryRun] = useState(true);
  const [maxEmails, setMaxEmails] = useState(DEFAULT_EMAIL_LIMIT);
  const [skipAlreadyCategorized, setSkipAlreadyCategorized] = useState(true);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [evaluations, setEvaluations] = useState<EvaluationResult[]>([]);
  const [executed, setExecuted] = useState<Array<{
    emailId: string;
    rule: string;
    results: ActionExecutionResult[];
  }>>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset between opens so a fresh summary is shown every time.
      setPhase('idle');
      setFetchedCount(0);
      setEvaluations([]);
      setExecuted([]);
      setErrorMsg(null);
      resetFolderCache();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const run = async () => {
    setPhase('fetching');
    setErrorMsg(null);
    setEvaluations([]);
    setExecuted([]);

    try {
      if (!accounts[0]) throw new Error('Nicht angemeldet');
      const tokenResp = await instance.acquireTokenSilent({
        ...graphScopes,
        account: accounts[0],
      });
      initGraphClient(tokenResp.accessToken);

      // 1. Fetch inbox emails (we work on the Inbox by default — users who
      //    want to run on a different folder can extend this later).
      let fetched: Email[] = [];
      let skip = 0;
      const pageSize = 50;
      while (fetched.length < maxEmails) {
        const page = await getEmailsFromFolder('inbox', pageSize, skip);
        const items = (page.value ?? []) as Email[];
        if (items.length === 0) break;
        fetched = fetched.concat(items);
        skip += pageSize;
        setFetchedCount(fetched.length);
        if (items.length < pageSize) break;
      }

      const candidates = skipAlreadyCategorized
        ? fetched.filter(e => (e.categories ?? []).length === 0)
        : fetched;

      // 2. Evaluate on backend (chunk so we stay under the 500 cap).
      setPhase('evaluating');
      const allEvals: EvaluationResult[] = [];
      for (let i = 0; i < candidates.length; i += 400) {
        const chunk = candidates.slice(i, i + 400);
        const result = await evaluateRulesOnEmails(chunk, ruleId);
        allEvals.push(...result);
        setEvaluations([...allEvals]);
      }

      if (dryRun) {
        setPhase('done');
        return;
      }

      // 3. Execute actions — one email at a time, but each email's actions
      //    run in sequence (order matters: move-after-categorize etc.).
      setPhase('executing');
      const executedLocal: typeof executed = [];
      for (const ev of allEvals) {
        for (const match of ev.matches) {
          const results: ActionExecutionResult[] = [];
          for (const action of match.actions) {
            results.push(await executeRuleAction(ev.email_id, action));
          }
          executedLocal.push({ emailId: ev.email_id, rule: match.rule_name, results });
          setExecuted([...executedLocal]);
        }
      }

      setPhase('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler');
      setPhase('error');
    }
  };

  const totalMatches = evaluations.reduce((acc, ev) => acc + ev.matches.length, 0);
  const totalSuccessfulActions = executed.reduce(
    (acc, e) => acc + e.results.filter(r => r.success).length, 0
  );
  const totalFailedActions = executed.reduce(
    (acc, e) => acc + e.results.filter(r => !r.success).length, 0
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-card rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">
                {ruleId ? `Regel anwenden: ${ruleName}` : 'Alle Regeln anwenden'}
              </h2>
              <p className="text-sm text-text-secondary">
                Läuft über Ihre Inbox — keine neuen Mails werden importiert.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/40 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Options */}
          {phase === 'idle' && (
            <>
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                <strong>Achtung:</strong> Ohne Dry-Run werden Kategorien gesetzt, E-Mails verschoben, gelöscht und an Integrationen weitergeleitet. Führen Sie zuerst einen Dry-Run durch.
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <Eye className="w-4 h-4 text-text-secondary" />
                  <span>Dry-Run (nur anzeigen, nichts verändern)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={skipAlreadyCategorized}
                    onChange={(e) => setSkipAlreadyCategorized(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <span>Bereits kategorisierte E-Mails überspringen</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-text-secondary">Max. E-Mails prüfen:</span>
                  <input
                    type="number"
                    value={maxEmails}
                    onChange={(e) => setMaxEmails(Math.max(1, Math.min(5000, parseInt(e.target.value, 10) || DEFAULT_EMAIL_LIMIT)))}
                    className="w-24 px-2 py-1 border border-border rounded text-sm"
                    min={1}
                    max={5000}
                  />
                </label>
              </div>
            </>
          )}

          {/* Progress */}
          {(phase === 'fetching' || phase === 'evaluating' || phase === 'executing') && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-text">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>
                  {phase === 'fetching' && `Lade E-Mails… (${fetchedCount})`}
                  {phase === 'evaluating' && `Prüfe Regeln… (${evaluations.length} Treffer bisher)`}
                  {phase === 'executing' && `Wende Aktionen an… (${executed.length} / ${totalMatches})`}
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Summary + detail */}
          {phase === 'done' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="text-2xl font-bold text-blue-900">{fetchedCount}</div>
                  <div className="text-xs text-blue-700">E-Mails geprüft</div>
                </div>
                <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
                  <div className="text-2xl font-bold text-violet-900">{totalMatches}</div>
                  <div className="text-xs text-violet-700">Regel-Treffer</div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-2xl font-bold text-emerald-900">
                    {dryRun ? '—' : totalSuccessfulActions}
                  </div>
                  <div className="text-xs text-emerald-700">
                    {dryRun ? 'Dry-Run' : 'Aktionen ausgeführt'}
                  </div>
                </div>
              </div>

              {totalFailedActions > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm">
                  {totalFailedActions} Aktion(en) schlugen fehl. Details unten.
                </div>
              )}

              {/* Per-match list (collapsible) */}
              {evaluations.length > 0 && (
                <details className="text-sm" open={!dryRun || evaluations.length < 20}>
                  <summary className="cursor-pointer text-text-secondary hover:text-text">
                    {dryRun ? 'Welche Regeln würden feuern?' : 'Detail pro Treffer'}
                  </summary>
                  <ul className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                    {evaluations.map(ev => (
                      <li key={ev.email_id} className="p-2 rounded bg-gray-50 border border-border">
                        <div className="text-xs font-mono text-text-secondary truncate">{ev.email_id}</div>
                        {ev.matches.map((m, i) => (
                          <div key={i} className="text-sm">
                            <span className="font-medium text-violet-700">{m.rule_name}</span>
                            <span className="text-xs text-text-secondary"> → {m.actions.map(a => a.type).join(', ')}</span>
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-gray-50 flex items-center justify-end gap-3">
          {phase === 'idle' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-text-secondary hover:text-text hover:bg-gray-200 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={run}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                <Play className="w-4 h-4" />
                {dryRun ? 'Dry-Run starten' : 'Jetzt ausführen'}
              </button>
            </>
          )}
          {(phase === 'done' || phase === 'error') && (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Schliessen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
