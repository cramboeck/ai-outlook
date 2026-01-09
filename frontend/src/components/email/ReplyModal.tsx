import { useState } from 'react';
import { X, Loader2, Sparkles, Send, Copy, Check, RefreshCw } from 'lucide-react';
import type { Email } from '../../types';
import {
  generateReply,
  TONE_OPTIONS,
  INTENT_OPTIONS,
  QUICK_REPLIES,
} from '../../services/replyService';
import type { ReplyTone, ReplyIntent, GenerateReplyResponse } from '../../services/replyService';
import { getStoredSignature } from '../settings/SettingsModal';

interface ReplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: Email;
  userName?: string;
  onSendReply?: (to: string, subject: string, body: string) => void;
}

export const ReplyModal = ({
  isOpen,
  onClose,
  email,
  userName = 'Freundliche Grüße',
  onSendReply,
}: ReplyModalProps) => {
  const [tone, setTone] = useState<ReplyTone>('formal');
  const [intent, setIntent] = useState<ReplyIntent>('info');
  const [customInstruction, setCustomInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateReplyResponse | null>(null);
  const [editedReply, setEditedReply] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async (quickIntent?: ReplyIntent) => {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    const useIntent = quickIntent || intent;

    try {
      const response = await generateReply({
        emailId: email.id,
        subject: email.subject,
        body: email.body?.content || email.bodyPreview,
        sender: email.from.emailAddress.address,
        senderName: email.from.emailAddress.name,
        tone,
        intent: useIntent,
        customInstruction: useIntent === 'custom' ? customInstruction : undefined,
        userName,
      });

      setResult(response);

      // Append signature if configured
      const signature = getStoredSignature();
      const replyWithSignature = signature
        ? `${response.reply}\n\n${signature}`
        : response.reply;

      setEditedReply(replyWithSignature);
      setIntent(useIntent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Generieren');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUseSuggestion = (suggestion: string) => {
    setEditedReply(suggestion);
  };

  const handleSend = () => {
    if (onSendReply && result) {
      onSendReply(email.from.emailAddress.address, result.subject, editedReply);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-text">KI-Antwort generieren</h2>
              <p className="text-sm text-text-secondary truncate max-w-md">
                Re: {email.subject}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Step 1: Tone Selection */}
          <div>
            <h3 className="text-sm font-medium text-text mb-3">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-xs mr-2">1</span>
              Tonalität wählen
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {TONE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTone(option.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tone === option.value
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="text-lg mb-1">{option.emoji}</div>
                  <div className="text-sm font-medium text-text">{option.label}</div>
                  <div className="text-xs text-text-secondary">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Quick Actions or Custom */}
          <div>
            <h3 className="text-sm font-medium text-text mb-3">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-xs mr-2">2</span>
              Schnellantwort oder eigene Absicht
            </h3>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 mb-4">
              {QUICK_REPLIES.map((quick) => (
                <button
                  key={quick.intent}
                  onClick={() => handleGenerate(quick.intent)}
                  disabled={isGenerating}
                  className="px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg hover:opacity-90 transition-all text-sm font-medium disabled:opacity-50 shadow-sm"
                >
                  {quick.label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-text-secondary">oder eigene Absicht wählen</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Intent Selection */}
            <div className="flex flex-wrap gap-2">
              {INTENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setIntent(option.value)}
                  className={`px-4 py-2 rounded-lg border transition-all ${
                    intent === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="mr-2">{option.emoji}</span>
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Instruction */}
          {intent === 'custom' && (
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-2">✏️ Eigene Anweisung</h3>
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="z.B. 'Frage nach einem alternativen Termin nächste Woche'"
                className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                rows={2}
              />
            </div>
          )}

          {/* Generate Button */}
          {!result && (
            <button
              onClick={() => handleGenerate()}
              disabled={isGenerating || (intent === 'custom' && !customInstruction)}
              className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generiere Antwort...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Antwort generieren
                </>
              )}
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-text-secondary">📝 Generierte Antwort</h3>
                <button
                  onClick={() => handleGenerate()}
                  disabled={isGenerating}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark"
                >
                  <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                  Neu generieren
                </button>
              </div>

              <textarea
                value={editedReply}
                onChange={(e) => setEditedReply(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none font-mono text-sm"
                rows={8}
              />

              {/* Suggestions */}
              {result.suggestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-text-secondary mb-2">
                    💡 Kürzere Alternativen
                  </h4>
                  <div className="space-y-2">
                    {result.suggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => handleUseSuggestion(suggestion)}
                        className="w-full p-3 text-left text-sm bg-gray-50 border border-border rounded-lg hover:border-primary/50 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {result && (
          <div className="px-6 py-4 border-t border-border bg-gray-50 flex items-center justify-between gap-4">
            <div className="text-xs text-text-secondary">
              {result.tokens} Tokens verwendet
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-white transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    Kopiert!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Kopieren
                  </>
                )}
              </button>
              {onSendReply && (
                <button
                  onClick={handleSend}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Antwort senden
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
