// Smart Rule From Email
//
// Modal that proposes a reusable automation rule derived from the
// currently-selected email. The LLM suggests criteria + actions; the user
// toggles what to keep, edits the values, and saves.

import { useEffect, useState } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  AlertTriangle,
  Check,
  Wand2,
  Info,
} from 'lucide-react';
import type { Email } from '../types';
import {
  suggestRuleFromEmail,
  createServerRule,
} from '../services/rulesApiService';
import type {
  RuleSuggestion,
  SuggestedCriterion,
  SuggestedAction,
} from '../services/rulesApiService';
import type { RuleCriteria, RuleAction } from '../services/rulesService';
import {
  fetchActiveIntegrations,
} from '../services/quickForwardService';
import type { Integration } from '../services/quickForwardService';

interface Props {
  isOpen: boolean;
  email: Email | null;
  onClose: () => void;
  onCreated?: (ruleName: string) => void;
}

const FIELD_LABEL: Record<SuggestedCriterion['field'], string> = {
  fromContains: 'Sender enthaelt',
  fromExact: 'Sender genau',
  fromDomain: 'Sender-Domain',
  subjectContains: 'Betreff enthaelt',
  subjectStartsWith: 'Betreff beginnt mit',
  bodyContains: 'Text enthaelt',
  hasAttachments: 'Hat Anhaenge',
  importance: 'Wichtigkeit',
};

const ACTION_LABEL: Record<SuggestedAction['type'], string> = {
  categorize: 'Kategorisieren',
  move: 'Verschieben nach',
  markRead: 'Als gelesen markieren',
  markUnread: 'Als ungelesen markieren',
  flag: 'Follow-up markieren',
  unflag: 'Follow-up entfernen',
  delete: 'In Papierkorb verschieben',
  extractActions: 'KI-Analyse + Aufgaben',
  forwardToDms: 'An Integration weiterleiten',
};

/** Actions that need no further value: just toggle the checkbox. */
const PARAMETERLESS_ACTIONS = new Set<SuggestedAction['type']>([
  'markRead', 'markUnread', 'flag', 'unflag', 'delete', 'extractActions',
]);

export const SmartRuleFromEmailModal = ({
  isOpen,
  email,
  onClose,
  onCreated,
}: Props) => {
  const [suggestion, setSuggestion] = useState<RuleSuggestion | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  /** Per-action-index the integration id picked when type === 'forwardToDms'. */
  const [actionIntegrationIds, setActionIntegrationIds] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable overrides
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stopProcessing, setStopProcessing] = useState(false);
  const [priority, setPriority] = useState(100);

  useEffect(() => {
    if (!isOpen || !email) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuggestion(null);
    setActionIntegrationIds({});

    // Load active integrations in parallel — needed for the forwardToDms
    // action to offer a concrete target to the user. Failure is silent; the
    // action will simply render a "keine Integration" placeholder.
    fetchActiveIntegrations()
      .then(list => { if (!cancelled) setIntegrations(list); })
      .catch(() => { /* non-critical */ });

    // Strip HTML + collapse whitespace + clamp to 5 000 chars. The backend
    // prompt only uses the first ~1 500 anyway; sending the raw HTML of a
    // newsletter would blow past the server-side input limit.
    const plainBody = (email.body?.content || email.bodyPreview || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);

    suggestRuleFromEmail({
      subject: email.subject,
      body: plainBody,
      sender: email.from.emailAddress.address,
      hasAttachments: !!email.hasAttachments,
      importance: (email.importance as 'high' | 'normal' | 'low') || 'normal',
    })
      .then(s => {
        if (cancelled) return;
        setSuggestion(s);
        setName(s.suggestedName);
        setDescription(s.suggestedDescription);
        setStopProcessing(s.suggestedStopProcessing);
        setPriority(s.suggestedPriority);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Vorschlag fehlgeschlagen');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, email?.id]);

  if (!isOpen) return null;

  const toggleCriterion = (idx: number) => {
    if (!suggestion) return;
    const next = { ...suggestion };
    next.criteria = next.criteria.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c);
    setSuggestion(next);
  };

  const updateCriterionValue = (idx: number, value: string | boolean) => {
    if (!suggestion) return;
    const next = { ...suggestion };
    next.criteria = next.criteria.map((c, i) => i === idx ? { ...c, value } : c);
    setSuggestion(next);
  };

  const toggleAction = (idx: number) => {
    if (!suggestion) return;
    const next = { ...suggestion };
    next.actions = next.actions.map((a, i) => i === idx ? { ...a, enabled: !a.enabled } : a);
    setSuggestion(next);
  };

  const updateActionValue = (idx: number, value: string) => {
    if (!suggestion) return;
    const next = { ...suggestion };
    next.actions = next.actions.map((a, i) => i === idx ? { ...a, value } : a);
    setSuggestion(next);
  };

  const canSave = !!suggestion
    && name.trim().length > 0
    && suggestion.criteria.some(c => c.enabled)
    && suggestion.actions.some(a => a.enabled);

  const handleSave = async () => {
    if (!suggestion) return;
    setSaving(true);
    setError(null);
    try {
      const criteria = buildRuleCriteria(suggestion.criteria);
      const actions = buildRuleActions(suggestion.actions, actionIntegrationIds, integrations);
      await createServerRule({
        name: name.trim(),
        description: description.trim(),
        enabled: true,
        priority,
        stopProcessing,
        criteria,
        actions,
      });
      onCreated?.(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Smart-Regel aus E-Mail</h2>
              <p className="text-sm text-text-secondary truncate max-w-md">
                {email?.subject || 'E-Mail'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/40 rounded-lg transition-colors"
            disabled={saving}
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-violet-500" />
              <p className="text-sm">KI analysiert die E-Mail…</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {suggestion && !loading && (
            <>
              {/* Reasoning */}
              {suggestion.reasoning && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-50 border border-violet-200 text-violet-900 text-sm">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{suggestion.reasoning}</span>
                </div>
              )}

              {/* Name + Description */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 text-sm"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Beschreibung</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 text-sm"
                    maxLength={300}
                  />
                </div>
              </div>

              {/* Criteria */}
              <div>
                <h3 className="text-sm font-semibold text-text mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  Kriterien (UND-Verknuepfung)
                </h3>
                <ul className="space-y-2">
                  {suggestion.criteria.map((c, idx) => (
                    <li
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        c.enabled
                          ? 'border-violet-200 bg-violet-50/50'
                          : 'border-border bg-gray-50 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        onChange={() => toggleCriterion(idx)}
                        className="mt-1 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                          {FIELD_LABEL[c.field]}
                        </div>
                        {c.field === 'hasAttachments' ? (
                          <div className="text-sm text-text">muss Anhaenge haben</div>
                        ) : c.field === 'importance' ? (
                          <select
                            value={String(c.value)}
                            onChange={(e) => updateCriterionValue(idx, e.target.value)}
                            disabled={!c.enabled}
                            className="w-full px-2 py-1.5 border border-border rounded text-sm bg-white"
                          >
                            <option value="high">hoch</option>
                            <option value="normal">normal</option>
                            <option value="low">niedrig</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={String(c.value)}
                            onChange={(e) => updateCriterionValue(idx, e.target.value)}
                            disabled={!c.enabled}
                            className="w-full px-2 py-1.5 border border-border rounded text-sm font-mono bg-white"
                          />
                        )}
                        {c.description && (
                          <div className="text-xs text-text-secondary">{c.description}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              <div>
                <h3 className="text-sm font-semibold text-text mb-2 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  Aktionen
                </h3>
                <ul className="space-y-2">
                  {suggestion.actions.map((a, idx) => (
                    <li
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        a.enabled
                          ? 'border-emerald-200 bg-emerald-50/50'
                          : 'border-border bg-gray-50 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={() => toggleAction(idx)}
                        className="mt-1 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                          {ACTION_LABEL[a.type]}
                        </div>
                        {(a.type === 'categorize' || a.type === 'move') ? (
                          <input
                            type="text"
                            value={a.value}
                            onChange={(e) => updateActionValue(idx, e.target.value)}
                            disabled={!a.enabled}
                            className="w-full px-2 py-1.5 border border-border rounded text-sm bg-white"
                          />
                        ) : a.type === 'forwardToDms' ? (
                          integrations.length === 0 ? (
                            <div className="text-sm text-amber-700">
                              Keine aktive Integration konfiguriert. Diese Aktion wird nicht ausgefuehrt.
                            </div>
                          ) : (
                            <select
                              value={
                                actionIntegrationIds[idx]
                                ?? integrations.find(i => i.type === a.integrationType)?.id
                                ?? integrations[0]?.id
                                ?? ''
                              }
                              onChange={(e) => setActionIntegrationIds(prev => ({ ...prev, [idx]: e.target.value }))}
                              disabled={!a.enabled}
                              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-white"
                            >
                              {integrations.map(i => (
                                <option key={i.id} value={i.id}>
                                  {i.name} ({i.type})
                                </option>
                              ))}
                            </select>
                          )
                        ) : PARAMETERLESS_ACTIONS.has(a.type) ? (
                          <div className="text-xs text-text-secondary">(keine Parameter)</div>
                        ) : (
                          <input
                            type="text"
                            value={a.value}
                            onChange={(e) => updateActionValue(idx, e.target.value)}
                            disabled={!a.enabled}
                            className="w-full px-2 py-1.5 border border-border rounded text-sm bg-white"
                          />
                        )}
                        {a.description && (
                          <div className="text-xs text-text-secondary">{a.description}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Advanced options */}
              <details className="text-sm">
                <summary className="cursor-pointer text-text-secondary hover:text-text">Erweiterte Optionen</summary>
                <div className="mt-3 space-y-3 pl-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-text-secondary w-32">Prioritaet</label>
                    <input
                      type="number"
                      value={priority}
                      onChange={(e) => setPriority(parseInt(e.target.value, 10) || 100)}
                      className="w-24 px-2 py-1.5 border border-border rounded text-sm"
                      min={1}
                      max={999}
                    />
                    <span className="text-xs text-text-secondary">niedriger = frueher</span>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={stopProcessing}
                      onChange={(e) => setStopProcessing(e.target.checked)}
                    />
                    <span>Nach dieser Regel keine weiteren anwenden</span>
                  </label>
                </div>
              </details>
            </>
          )}
        </div>

        {/* Footer */}
        {suggestion && !loading && (
          <div className="px-6 py-4 border-t border-border bg-gray-50 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-text-secondary hover:text-text hover:bg-gray-200 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Speichere…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Regel erstellen
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Helpers: map suggestion shape → server rule shape --------------------

function buildRuleCriteria(items: SuggestedCriterion[]): RuleCriteria {
  const criteria: RuleCriteria = { matchMode: 'all' };
  for (const c of items) {
    if (!c.enabled) continue;
    switch (c.field) {
      case 'fromContains': criteria.fromContains = String(c.value); break;
      case 'fromExact': criteria.fromExact = String(c.value); break;
      case 'fromDomain': criteria.fromDomain = String(c.value); break;
      case 'subjectContains': criteria.subjectContains = String(c.value); break;
      case 'subjectStartsWith': criteria.subjectStartsWith = String(c.value); break;
      case 'bodyContains': criteria.bodyContains = String(c.value); break;
      case 'hasAttachments': criteria.hasAttachments = true; break;
      case 'importance':
        criteria.importance = c.value === 'high' ? 'high' : c.value === 'low' ? 'low' : 'normal';
        break;
    }
  }
  return criteria;
}

function buildRuleActions(
  items: SuggestedAction[],
  actionIntegrationIds: Record<number, string>,
  integrations: Integration[],
): RuleAction[] {
  const out: RuleAction[] = [];
  items.forEach((a, idx) => {
    if (!a.enabled) return;
    switch (a.type) {
      case 'categorize':
        out.push({ type: 'categorize', targetCategory: a.value });
        break;
      case 'move':
        out.push({ type: 'move', targetFolderName: a.value });
        break;
      case 'markRead':
        out.push({ type: 'markRead' });
        break;
      case 'markUnread':
        out.push({ type: 'markUnread' });
        break;
      case 'flag':
        out.push({ type: 'flag' });
        break;
      case 'unflag':
        out.push({ type: 'unflag' });
        break;
      case 'delete':
        out.push({ type: 'delete' });
        break;
      case 'extractActions':
        out.push({ type: 'extractActions' });
        break;
      case 'forwardToDms': {
        // Prefer the explicit user pick, else the suggested integrationType
        // match, else the first active integration — skip entirely if nothing
        // is configured.
        const chosenId =
          actionIntegrationIds[idx]
          ?? integrations.find(i => i.type === a.integrationType)?.id
          ?? integrations[0]?.id;
        if (!chosenId) return;
        const integration = integrations.find(i => i.id === chosenId);
        out.push({
          type: 'forwardToDms',
          integrationId: chosenId,
          integrationName: integration?.name,
        });
        break;
      }
    }
  });
  return out;
}
