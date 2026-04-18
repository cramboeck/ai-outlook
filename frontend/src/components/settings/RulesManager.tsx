// Rules Manager Component
// Manage automatic email processing rules

import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Copy,
  AlertCircle,
  Zap,
  Folder,
  Tag,
  Eye,
  EyeOff,
  Flag,
  Download,
  Upload,
} from 'lucide-react';
import {
  loadRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  duplicateRule,
  reorderRules,
  isAutoRunEnabled,
  setAutoRunEnabled,
  exportRules,
  importRules,
  type EmailRule,
  type RuleCriteria,
  type RuleAction,
} from '../../services/rulesService';
import { getMailFolders } from '../../services/graphService';
import { buildFolderHierarchy, type FolderWithPath } from '../../services/folderService';
import { getActiveCategories } from '../../services/categoryService';
import type { Category } from '../../types';

interface RuleEditModalProps {
  rule: EmailRule | null;
  isNew: boolean;
  folders: FolderWithPath[];
  categories: Category[];
  onSave: (rule: Partial<EmailRule>) => void;
  onClose: () => void;
}

const RuleEditModal = ({
  rule,
  isNew,
  folders,
  categories,
  onSave,
  onClose,
}: RuleEditModalProps) => {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [stopProcessing, setStopProcessing] = useState(rule?.stopProcessing ?? false);
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(rule?.criteria?.matchMode || 'all');

  // Criteria
  const [fromContains, setFromContains] = useState(rule?.criteria?.fromContains || '');
  const [fromDomain, setFromDomain] = useState(rule?.criteria?.fromDomain || '');
  const [subjectContains, setSubjectContains] = useState(rule?.criteria?.subjectContains || '');
  const [bodyContains, setBodyContains] = useState(rule?.criteria?.bodyContains || '');
  const [hasAttachments, setHasAttachments] = useState<boolean | undefined>(
    rule?.criteria?.hasAttachments
  );
  const [importance, setImportance] = useState<'high' | 'normal' | 'low' | undefined>(
    rule?.criteria?.importance
  );

  // Actions
  const [actions, setActions] = useState<RuleAction[]>(rule?.actions || []);
  const [showAddAction, setShowAddAction] = useState(false);

  const handleAddAction = (type: RuleAction['type']) => {
    const newAction: RuleAction = { type };
    setActions([...actions, newAction]);
    setShowAddAction(false);
  };

  const handleUpdateAction = (index: number, updates: Partial<RuleAction>) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], ...updates };
    setActions(updated);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim() || actions.length === 0) return;

    const criteria: RuleCriteria = {
      matchMode,
    };

    if (fromContains) criteria.fromContains = fromContains;
    if (fromDomain) criteria.fromDomain = fromDomain;
    if (subjectContains) criteria.subjectContains = subjectContains;
    if (bodyContains) criteria.bodyContains = bodyContains;
    if (hasAttachments !== undefined) criteria.hasAttachments = hasAttachments;
    if (importance) criteria.importance = importance;

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      enabled,
      stopProcessing,
      criteria,
      actions,
    });
  };

  const getActionLabel = (action: RuleAction) => {
    switch (action.type) {
      case 'move':
        return 'Verschieben nach';
      case 'categorize':
        return 'Kategorie setzen';
      case 'markRead':
        return 'Als gelesen markieren';
      case 'markUnread':
        return 'Als ungelesen markieren';
      case 'flag':
        return 'Kennzeichnen';
      case 'unflag':
        return 'Kennzeichnung entfernen';
      case 'delete':
        return 'Löschen';
      default:
        return action.type;
    }
  };

  const getActionIcon = (type: RuleAction['type']) => {
    switch (type) {
      case 'move':
        return Folder;
      case 'categorize':
        return Tag;
      case 'markRead':
        return Eye;
      case 'markUnread':
        return EyeOff;
      case 'flag':
      case 'unflag':
        return Flag;
      case 'delete':
        return Trash2;
      default:
        return Zap;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-text">
            {isNew ? 'Neue Regel erstellen' : 'Regel bearbeiten'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Newsletter kategorisieren"
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-bg text-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Beschreibung
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optionale Beschreibung"
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-bg text-text"
              />
            </div>
          </div>

          {/* Criteria Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-text">Bedingungen</h4>
              <select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as 'all' | 'any')}
                className="text-sm px-2 py-1 border border-border rounded bg-bg text-text"
              >
                <option value="all">Alle Bedingungen (UND)</option>
                <option value="any">Eine Bedingung (ODER)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Absender enthält
                </label>
                <input
                  type="text"
                  value={fromContains}
                  onChange={(e) => setFromContains(e.target.value)}
                  placeholder="z.B. newsletter"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg text-text"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Absender-Domain
                </label>
                <input
                  type="text"
                  value={fromDomain}
                  onChange={(e) => setFromDomain(e.target.value)}
                  placeholder="z.B. microsoft.com"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg text-text"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Betreff enthält
                </label>
                <input
                  type="text"
                  value={subjectContains}
                  onChange={(e) => setSubjectContains(e.target.value)}
                  placeholder="z.B. Rechnung"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg text-text"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Inhalt enthält
                </label>
                <input
                  type="text"
                  value={bodyContains}
                  onChange={(e) => setBodyContains(e.target.value)}
                  placeholder="z.B. unsubscribe"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg text-text"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Anhänge
                </label>
                <select
                  value={hasAttachments === undefined ? '' : hasAttachments.toString()}
                  onChange={(e) =>
                    setHasAttachments(
                      e.target.value === '' ? undefined : e.target.value === 'true'
                    )
                  }
                  className="px-3 py-2 border border-border rounded-lg text-sm bg-bg text-text"
                >
                  <option value="">Egal</option>
                  <option value="true">Mit Anhängen</option>
                  <option value="false">Ohne Anhänge</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Wichtigkeit
                </label>
                <select
                  value={importance || ''}
                  onChange={(e) =>
                    setImportance(
                      (e.target.value as 'high' | 'normal' | 'low') || undefined
                    )
                  }
                  className="px-3 py-2 border border-border rounded-lg text-sm bg-bg text-text"
                >
                  <option value="">Egal</option>
                  <option value="high">Hoch</option>
                  <option value="normal">Normal</option>
                  <option value="low">Niedrig</option>
                </select>
              </div>
            </div>
          </div>

          {/* Actions Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-text">Aktionen *</h4>

            {actions.length === 0 ? (
              <p className="text-sm text-text-secondary italic">
                Keine Aktionen definiert. Füge mindestens eine Aktion hinzu.
              </p>
            ) : (
              <div className="space-y-2">
                {actions.map((action, index) => {
                  const Icon = getActionIcon(action.type);
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-bg rounded-lg"
                    >
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-text">
                        {getActionLabel(action)}
                      </span>

                      {action.type === 'move' && (
                        <select
                          value={action.targetFolderId || ''}
                          onChange={(e) => {
                            const folder = folders.find((f) => f.id === e.target.value);
                            handleUpdateAction(index, {
                              targetFolderId: e.target.value,
                              targetFolderName: folder?.displayName,
                            });
                          }}
                          className="flex-1 px-2 py-1 border border-border rounded text-sm bg-bg text-text"
                        >
                          <option value="">Ordner wählen...</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.path || folder.displayName}
                            </option>
                          ))}
                        </select>
                      )}

                      {action.type === 'categorize' && (
                        <select
                          value={action.targetCategory || ''}
                          onChange={(e) =>
                            handleUpdateAction(index, { targetCategory: e.target.value })
                          }
                          className="flex-1 px-2 py-1 border border-border rounded text-sm bg-bg text-text"
                        >
                          <option value="">Kategorie wählen...</option>
                          {categories.map((cat) => (
                            <option key={cat.name} value={cat.name}>
                              {cat.emoji} {cat.name}
                            </option>
                          ))}
                        </select>
                      )}

                      <button
                        onClick={() => handleRemoveAction(index)}
                        className="p-1 text-text-secondary hover:text-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Action Button */}
            <div className="relative">
              <button
                onClick={() => setShowAddAction(!showAddAction)}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-text-secondary hover:text-primary hover:border-primary transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Aktion hinzufügen
              </button>

              {showAddAction && (
                <div className="absolute top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg z-10 py-1 min-w-[200px]">
                  {[
                    { type: 'move' as const, label: 'Verschieben' },
                    { type: 'categorize' as const, label: 'Kategorisieren' },
                    { type: 'markRead' as const, label: 'Als gelesen markieren' },
                    { type: 'markUnread' as const, label: 'Als ungelesen markieren' },
                    { type: 'flag' as const, label: 'Kennzeichnen' },
                    { type: 'unflag' as const, label: 'Kennzeichnung entfernen' },
                    { type: 'delete' as const, label: 'Löschen' },
                  ].map(({ type, label }) => {
                    const Icon = getActionIcon(type);
                    return (
                      <button
                        key={type}
                        onClick={() => handleAddAction(type)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3 pt-4 border-t border-border">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-text">Regel aktivieren</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={stopProcessing}
                onChange={(e) => setStopProcessing(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-text">
                Keine weiteren Regeln anwenden (wenn diese zutrifft)
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-bg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || actions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 text-sm"
          >
            <Check className="w-4 h-4" />
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

export const RulesManager = () => {
  const [rules, setRules] = useState<EmailRule[]>([]);
  const [autoRun, setAutoRun] = useState(true);
  const [folders, setFolders] = useState<FolderWithPath[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRule, setEditingRule] = useState<EmailRule | null>(null);
  const [isNewRule, setIsNewRule] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load data on mount
  useEffect(() => {
    setRules(loadRules());
    setAutoRun(isAutoRunEnabled());
    setCategories(getActiveCategories());

    // Load folders
    getMailFolders()
      .then((result) => {
        const hierarchy = buildFolderHierarchy(result.value);
        setFolders(hierarchy);
      })
      .catch(console.error);
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleToggleAutoRun = () => {
    const newValue = !autoRun;
    setAutoRun(newValue);
    setAutoRunEnabled(newValue);
  };

  const handleAddRule = () => {
    setEditingRule(null);
    setIsNewRule(true);
    setShowEditModal(true);
  };

  const handleEditRule = (rule: EmailRule) => {
    setEditingRule(rule);
    setIsNewRule(false);
    setShowEditModal(true);
  };

  const handleSaveRule = (ruleData: Partial<EmailRule>) => {
    if (isNewRule) {
      createRule(
        ruleData.name!,
        ruleData.criteria!,
        ruleData.actions!,
        {
          description: ruleData.description,
          enabled: ruleData.enabled,
          stopProcessing: ruleData.stopProcessing,
        }
      );
      showMessage('success', 'Regel erstellt');
    } else if (editingRule) {
      updateRule(editingRule.id, ruleData);
      showMessage('success', 'Regel aktualisiert');
    }
    setRules(loadRules());
    setShowEditModal(false);
  };

  const handleDeleteRule = (id: string) => {
    if (confirm('Möchten Sie diese Regel wirklich löschen?')) {
      deleteRule(id);
      setRules(loadRules());
      showMessage('success', 'Regel gelöscht');
    }
  };

  const handleToggleRule = (id: string) => {
    toggleRule(id);
    setRules(loadRules());
  };

  const handleDuplicateRule = (id: string) => {
    duplicateRule(id);
    setRules(loadRules());
    showMessage('success', 'Regel dupliziert');
  };

  const handleMoveRule = (id: string, direction: 'up' | 'down') => {
    const index = rules.findIndex((r) => r.id === id);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rules.length) return;

    const newOrder = [...rules];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    reorderRules(newOrder.map((r) => r.id));
    setRules(loadRules());
  };

  const handleExport = () => {
    const json = exportRules();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mailsort-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        importRules(text, true);
        setRules(loadRules());
        showMessage('success', 'Regeln importiert');
      } catch (err) {
        showMessage('error', 'Import fehlgeschlagen');
      }
    };
    input.click();
  };

  const getActionSummary = (actions: RuleAction[]) => {
    return actions
      .map((a) => {
        switch (a.type) {
          case 'move':
            return `→ ${a.targetFolderName || 'Ordner'}`;
          case 'categorize':
            return `🏷️ ${a.targetCategory}`;
          case 'markRead':
            return '👁️ Gelesen';
          case 'markUnread':
            return '📩 Ungelesen';
          case 'flag':
            return '🚩 Kennzeichnen';
          case 'unflag':
            return '⚪ Entkennen';
          case 'delete':
            return '🗑️ Löschen';
          default:
            return a.type;
        }
      })
      .join(', ');
  };

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-text">Automatische Regeln</h2>
            </div>
            <p className="text-sm text-text-secondary">
              Regeln für automatische E-Mail-Verarbeitung
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-secondary">Auto-Ausführung</span>
            <button
              onClick={handleToggleAutoRun}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoRun ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoRun ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}
          >
            {message.type === 'success' ? (
              <Check className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {message.text}
          </div>
        )}

        {/* Rules List */}
        {rules.length === 0 ? (
          <div className="text-center py-8">
            <Zap className="w-12 h-12 text-text-secondary mx-auto mb-3 opacity-50" />
            <p className="text-text-secondary">Keine Regeln definiert</p>
            <p className="text-sm text-text-secondary">
              Erstellen Sie eine Regel, um E-Mails automatisch zu verarbeiten
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <div
                key={rule.id}
                className={`border rounded-lg transition-colors ${
                  rule.enabled
                    ? 'border-border bg-bg'
                    : 'border-border/50 bg-bg opacity-60'
                }`}
              >
                {/* Rule Header */}
                <div className="flex items-center gap-3 p-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleMoveRule(rule.id, 'up')}
                      disabled={index === 0}
                      className="p-0.5 text-text-secondary hover:text-text disabled:opacity-30"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMoveRule(rule.id, 'down')}
                      disabled={index === rules.length - 1}
                      className="p-0.5 text-text-secondary hover:text-text disabled:opacity-30"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    className={`p-1.5 rounded transition-colors ${
                      rule.enabled
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                        : 'bg-gray-100 dark:bg-gray-600 text-text-secondary'
                    }`}
                    title={rule.enabled ? 'Deaktivieren' : 'Aktivieren'}
                  >
                    {rule.enabled ? (
                      <Play className="w-4 h-4" />
                    ) : (
                      <Pause className="w-4 h-4" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() =>
                        setExpandedRule(expandedRule === rule.id ? null : rule.id)
                      }
                      className="text-left w-full"
                    >
                      <p className="font-medium text-text truncate">{rule.name}</p>
                      <p className="text-xs text-text-secondary truncate">
                        {getActionSummary(rule.actions)}
                      </p>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {rule.triggerCount > 0 && (
                      <span className="text-xs text-text-secondary px-2 py-0.5 bg-gray-100 dark:bg-gray-600 rounded">
                        {rule.triggerCount}×
                      </span>
                    )}
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="p-1.5 text-text-secondary hover:text-primary transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicateRule(rule.id)}
                      className="p-1.5 text-text-secondary hover:text-primary transition-colors"
                      title="Duplizieren"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 text-text-secondary hover:text-red-600 transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedRule === rule.id && (
                  <div className="px-3 pb-3 pt-0 border-t border-border mt-1">
                    <div className="pt-3 space-y-2 text-sm">
                      {rule.description && (
                        <p className="text-text-secondary">{rule.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {rule.criteria.fromContains && (
                          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                            Von: *{rule.criteria.fromContains}*
                          </span>
                        )}
                        {rule.criteria.fromDomain && (
                          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                            Domain: {rule.criteria.fromDomain}
                          </span>
                        )}
                        {rule.criteria.subjectContains && (
                          <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs">
                            Betreff: *{rule.criteria.subjectContains}*
                          </span>
                        )}
                        {rule.criteria.hasAttachments !== undefined && (
                          <span className="px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded text-xs">
                            {rule.criteria.hasAttachments ? 'Mit Anhängen' : 'Ohne Anhänge'}
                          </span>
                        )}
                        {rule.criteria.importance && (
                          <span className="px-2 py-0.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs">
                            Wichtigkeit: {rule.criteria.importance}
                          </span>
                        )}
                      </div>
                      {rule.stopProcessing && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          ⚠️ Stoppt weitere Regelverarbeitung
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Regeln exportieren"
            >
              <Download className="w-4 h-4" />
              Exportieren
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Regeln importieren"
            >
              <Upload className="w-4 h-4" />
              Importieren
            </button>
          </div>
          <button
            onClick={handleAddRule}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Neue Regel
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <RuleEditModal
          rule={editingRule}
          isNew={isNewRule}
          folders={folders}
          categories={categories}
          onSave={handleSaveRule}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
};
