// Copilot Draft Panel
//
// Premium panel shown inside ReplyModal when a Context-Aware Draft is
// available. Distinguished visually from the standard draft via an Indigo
// gradient border and a "Powered by Copilot" badge. Lists retrieval
// citations and offers regenerate / copy / apply.

import { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  FileText,
  MessageSquare,
  Folder,
  Mail,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import type { CopilotCitation, CopilotDraftDto, CitationSource } from '../services/copilotService';

interface Props {
  draft: CopilotDraftDto;
  isRegenerating?: boolean;
  error?: string | null;
  onRegenerate?: () => void;
  onApply?: (text: string) => void;
}

const SOURCE_ICON: Record<CitationSource, React.ComponentType<{ className?: string }>> = {
  teams: MessageSquare,
  sharepoint: Folder,
  onedrive: Folder,
  email: Mail,
  other: FileText,
};

const SOURCE_LABEL: Record<CitationSource, string> = {
  teams: 'Teams',
  sharepoint: 'SharePoint',
  onedrive: 'OneDrive',
  email: 'E-Mail',
  other: 'Dokument',
};

export const CopilotDraftPanel = ({
  draft,
  isRegenerating = false,
  error = null,
  onRegenerate,
  onApply,
}: Props) => {
  const [editedText, setEditedText] = useState(draft.draft_text);
  const [copied, setCopied] = useState(false);

  // Reset editor when a new draft comes in (regenerate case)
  if (editedText === '' && draft.draft_text) {
    setEditedText(draft.draft_text);
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 via-white to-indigo-50/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-b border-indigo-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-indigo-900">Context-Aware Draft</h4>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-semibold uppercase tracking-wide">
                Powered by Copilot
              </span>
            </div>
            <p className="text-xs text-indigo-700/80">
              Geerdet auf {draft.retrievalHitCount ?? draft.citations.length} Firmen-Dokument{draft.citations.length === 1 ? '' : 'e'} aus Teams / SharePoint
            </p>
          </div>
        </div>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50"
            title="Neu generieren"
          >
            {isRegenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>Neu generieren</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Draft text */}
      <div className="p-4 space-y-3">
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 resize-none font-mono text-sm bg-white"
          rows={8}
          disabled={isRegenerating}
        />

        {/* Citations */}
        {draft.citations.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-indigo-900 uppercase tracking-wide mb-2">
              Quellen ({draft.citations.length})
            </h5>
            <ol className="space-y-1.5">
              {draft.citations.map((c) => (
                <CitationRow key={c.index} citation={c} />
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-50/50 border-t border-indigo-200">
        <div className="text-xs text-indigo-700/70">
          {draft.model && <>Modell: <span className="font-mono">{draft.model}</span></>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 text-sm transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" /> Kopiert
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> Kopieren
              </>
            )}
          </button>
          {onApply && (
            <button
              onClick={() => onApply(editedText)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:opacity-90 text-sm transition-opacity"
            >
              Entwurf uebernehmen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const CitationRow = ({ citation }: { citation: CopilotCitation }) => {
  const Icon = SOURCE_ICON[citation.source] ?? FileText;
  const label = SOURCE_LABEL[citation.source] ?? 'Dokument';
  const body = (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-indigo-50 transition-colors">
      <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-100 text-indigo-700 text-xs font-bold">
        {citation.index}
      </span>
      <Icon className="flex-shrink-0 w-4 h-4 text-indigo-600 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-indigo-900 truncate">{citation.title}</span>
          <span className="text-xs text-indigo-600/70">·</span>
          <span className="text-xs text-indigo-600/70">{label}</span>
          {citation.url && <ExternalLink className="w-3 h-3 text-indigo-400" />}
        </div>
        {citation.snippet && (
          <p className="text-xs text-indigo-700/80 line-clamp-2 mt-0.5">{citation.snippet}</p>
        )}
      </div>
    </div>
  );
  if (citation.url) {
    return (
      <li>
        <a href={citation.url} target="_blank" rel="noopener noreferrer" className="block">
          {body}
        </a>
      </li>
    );
  }
  return <li>{body}</li>;
};
