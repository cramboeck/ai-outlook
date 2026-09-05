import { useEffect, useState } from 'react';
import { Cpu, Cloud, ServerCrash, Sparkles } from 'lucide-react';
import { getAiInfo } from '../../services/aiInfoService';
import type { AiInfo, AiProvider } from '../../services/aiInfoService';

const LABEL: Record<AiProvider, string> = {
  azure: 'Azure OpenAI',
  ollama: 'Ollama (lokal)',
  openai: 'OpenAI',
  custom: 'Custom',
  unconfigured: 'Nicht konfiguriert',
  unknown: 'Unbekannt',
};

const ICON: Record<AiProvider, React.ComponentType<{ className?: string }>> = {
  azure: Cloud,
  ollama: Cpu,
  openai: Cloud,
  custom: Sparkles,
  unconfigured: ServerCrash,
  unknown: ServerCrash,
};

const ACCENT: Record<AiProvider, string> = {
  azure: 'bg-blue-50 text-blue-700 border-blue-200',
  ollama: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  openai: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  custom: 'bg-purple-50 text-purple-700 border-purple-200',
  unconfigured: 'bg-amber-50 text-amber-700 border-amber-200',
  unknown: 'bg-gray-50 text-gray-600 border-gray-200',
};

export const AiProviderBadge = () => {
  const [info, setInfo] = useState<AiInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAiInfo()
      .then(data => { if (!cancelled) setInfo(data); })
      .catch(() => { /* badge simply hides on auth / network failure */ });
    return () => { cancelled = true; };
  }, []);

  if (!info) return null;

  const Icon = ICON[info.provider] ?? ICON.unknown;
  const accent = ACCENT[info.provider] ?? ACCENT.unknown;

  return (
    <div
      className={`mx-3 my-3 px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${accent}`}
      title={info.copilotObo ? 'Copilot OBO konfiguriert' : 'Copilot OBO nicht konfiguriert'}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{LABEL[info.provider]}</div>
        {info.model && (
          <div className="font-mono text-xs opacity-75 truncate">{info.model}</div>
        )}
      </div>
      {info.copilotObo && (
        <span
          className="flex-shrink-0 text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/60"
          title="Copilot-OBO-Flow ist konfiguriert"
        >
          Copilot
        </span>
      )}
    </div>
  );
};
