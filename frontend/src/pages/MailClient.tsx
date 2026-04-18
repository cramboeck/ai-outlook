import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, RefreshCw, Clock, Search, FileText, CheckCircle2, AlertTriangle, Receipt, ShoppingCart, FileSignature, ScanSearch } from 'lucide-react';
import { api } from '../services/apiClient';
import { FolderSidebar } from '../components/mail/FolderSidebar';
import { ComposeModal } from '../components/mail/ComposeModal';
import { EmailDetail } from '../components/mail/EmailDetail';
import { EmailList } from '../components/email/EmailList';
import { ClassifyButton } from '../components/classification/ClassifyButton';
import { ClassificationResult } from '../components/classification/ClassificationResult';
import { BatchClassifyModal } from '../components/classification/BatchClassifyModal';
import { ReplyModal } from '../components/email/ReplyModal';
import { SearchModal } from '../components/mail/SearchModal';
import { useClassify } from '../hooks/useClassify';
import {
  getEmailsFromFolder,
  getEmailWithBody,
  setEmailCategory,
  setEmailCategoriesBatch,
  getSentEmailsWithoutReply,
  replyToEmail,
} from '../services/graphService';
import type { Email, Classification } from '../types';

export const MailClient = () => {
  const { accounts } = useMsal();
  const { classifyAsync, isClassifying, classifyBatchAsync } = useClassify();

  // Folder state
  const [selectedFolderId, setSelectedFolderId] = useState('inbox');
  const [selectedFolderName, setSelectedFolderName] = useState('Posteingang');

  // Modal states
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Email states
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [replyEmail, setReplyEmail] = useState<Email | null>(null);
  const [classificationResult, setClassificationResult] = useState<Classification | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);

  const account = accounts[0];
  const userName = account?.name || 'Freundliche Grüße';

  // Fetch emails for selected folder
  const {
    data: emails = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['emails', selectedFolderId],
    queryFn: async () => {
      if (selectedFolderId === 'followup') {
        return getSentEmailsWithoutReply(7);
      }
      const result = await getEmailsFromFolder(selectedFolderId, 50, 0);
      return result.value;
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!selectedFolderId,
  });

  // Fetch follow-up count
  const { data: followUpEmails = [] } = useQuery({
    queryKey: ['followup-count'],
    queryFn: () => getSentEmailsWithoutReply(7),
    staleTime: 5 * 60 * 1000,
  });

  const uncategorizedEmails = emails.filter((e) => e.categories.length === 0);

  const handleFolderSelect = (folderId: string, folderName: string) => {
    setSelectedFolderId(folderId);
    setSelectedFolderName(folderName);
    setSelectedEmail(null);
    setClassificationResult(null);
  };

  const getEmailBody = async (messageId: string): Promise<Email> => {
    return getEmailWithBody(messageId);
  };

  const handleClassifyEmail = async (email: Email) => {
    setSelectedEmail(email);
    setClassificationResult(null);

    try {
      const fullEmail = await getEmailBody(email.id);
      const result = await classifyAsync(fullEmail);
      setClassificationResult(result);
    } catch (error) {
      console.error('Classification failed:', error);
    }
  };

  const handleApplyCategory = async () => {
    if (!selectedEmail || !classificationResult) return;

    setIsApplying(true);
    try {
      await setEmailCategory(selectedEmail.id, [classificationResult.category]);
      refetch();
      setClassificationResult(null);
      setSelectedEmail(null);
    } catch (error) {
      console.error('Failed to apply category:', error);
    } finally {
      setIsApplying(false);
    }
  };

  const handleDismiss = () => {
    setClassificationResult(null);
    setAnalysisResult(null);
    setSelectedEmail(null);
  };

  // Full pipeline analysis: classification + action extraction + document detection
  const handleAnalyzeEmail = async (email: Email) => {
    setSelectedEmail(email);
    setClassificationResult(null);
    setAnalysisResult(null);
    setIsAnalyzing(true);

    try {
      const fullEmail = await getEmailBody(email.id);
      const result = await api.post('/process-email', {
        email: {
          id: fullEmail.id,
          subject: fullEmail.subject,
          body: fullEmail.body?.content || fullEmail.bodyPreview || '',
          sender: fullEmail.from?.emailAddress?.address || '',
          senderEmail: fullEmail.from?.emailAddress?.address || '',
          hasAttachments: fullEmail.hasAttachments || false,
          importance: fullEmail.importance || 'normal',
        },
      });
      setAnalysisResult(result);
    } catch (error) {
      console.error('Analysis failed:', error);
      setAnalysisResult({ error: (error as Error).message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBatchClassify = async (emailsToClassify: Email[]) => {
    const fullEmails = await Promise.all(
      emailsToClassify.map((email) => getEmailBody(email.id))
    );
    return classifyBatchAsync(fullEmails);
  };

  const handleBatchApply = async (updates: Array<{ id: string; categories: string[] }>) => {
    await setEmailCategoriesBatch(updates);
    refetch();
  };

  const handleReplyClick = async (email: Email) => {
    const fullEmail = await getEmailBody(email.id);
    setReplyEmail(fullEmail);
    setIsReplyModalOpen(true);
  };

  const handleSendReply = async (to: string, subject: string, body: string) => {
    if (replyEmail) {
      try {
        await replyToEmail(replyEmail.id, body, false);
        setIsReplyModalOpen(false);
        setReplyEmail(null);
        refetch();
      } catch (error) {
        console.error('Failed to send reply:', error);
        // Fallback to mailto
        const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');
      }
    }
  };

  // Check if we're in a "sent" folder
  const isSentFolder = selectedFolderName.toLowerCase().includes('gesendet') ||
    selectedFolderName.toLowerCase().includes('sent');

  const isFollowUp = selectedFolderId === 'followup';

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      {/* Folder Sidebar */}
      <FolderSidebar
        selectedFolderId={selectedFolderId}
        onFolderSelect={handleFolderSelect}
        onComposeClick={() => setIsComposeOpen(true)}
        followUpCount={followUpEmails.length}
      />

      {/* Main Content - Email List */}
      <div className={`flex-1 flex flex-col overflow-hidden bg-gray-50 ${selectedEmail ? 'hidden md:flex md:w-2/5 lg:w-1/2' : ''}`}>
        {/* Header */}
        <div className="bg-card border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isFollowUp && <Clock className="w-5 h-5 text-orange-500" />}
              <div>
                <h1 className="text-lg font-bold text-text">{selectedFolderName}</h1>
                <p className="text-xs text-text-secondary">
                  {emails.length} E-Mails
                  {!isSentFolder && !isFollowUp && uncategorizedEmails.length > 0 && (
                    <> · {uncategorizedEmails.length} unkategorisiert</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSearchModalOpen(true)}
                className="p-2 text-text-secondary hover:text-text hover:bg-gray-100 rounded-lg transition-colors"
                title="E-Mails suchen & verschieben"
              >
                <Search className="w-4 h-4" />
              </button>

              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-2 text-text-secondary hover:text-text hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>

              {!isSentFolder && !isFollowUp && uncategorizedEmails.length > 0 && (
                <button
                  onClick={() => setIsBatchModalOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
                >
                  <Sparkles className="w-3 h-3" />
                  <span className="hidden sm:inline">Kategorisieren</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Classification Result */}
        {classificationResult && selectedEmail && (
          <div className="bg-card border-b border-border px-4 py-3">
            <p className="text-sm text-text-secondary mb-2">
              Ergebnis für: <strong>{selectedEmail.subject}</strong>
            </p>
            <ClassificationResult
              result={classificationResult}
              onApply={handleApplyCategory}
              onDismiss={handleDismiss}
              isApplying={isApplying}
            />
          </div>
        )}

        {/* Analysis Result (full pipeline) */}
        {analysisResult && selectedEmail && !analysisResult.error && (
          <div className="bg-card border-b border-border px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text flex items-center gap-2">
                <ScanSearch className="w-4 h-4 text-emerald-500" />
                Analyse-Ergebnis
              </p>
              <button
                onClick={() => setAnalysisResult(null)}
                className="text-xs text-text-secondary hover:text-text"
              >
                Schliessen
              </button>
            </div>

            {/* Classification */}
            {analysisResult.classification && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">Kategorie:</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                  {analysisResult.classification.category}
                </span>
                <span className="text-xs text-text-secondary">
                  ({Math.round((analysisResult.classification.confidence || 0) * 100)}%)
                </span>
              </div>
            )}

            {/* Extracted Actions */}
            {analysisResult.actions?.length > 0 && (
              <div>
                <p className="text-xs text-text-secondary mb-1">Erkannte Aufgaben:</p>
                <div className="space-y-1">
                  {analysisResult.actions.map((action: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span className="text-text">{action.description}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        action.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                        action.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      }`}>
                        {action.priority}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detected Document */}
            {analysisResult.document && (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                {analysisResult.document.type === 'invoice' && <Receipt className="w-4 h-4 text-purple-500" />}
                {analysisResult.document.type === 'order' && <ShoppingCart className="w-4 h-4 text-blue-500" />}
                {analysisResult.document.type === 'contract' && <FileSignature className="w-4 h-4 text-amber-500" />}
                {analysisResult.document.type === 'receipt' && <FileText className="w-4 h-4 text-green-500" />}
                <div className="text-sm">
                  <span className="font-medium text-text">
                    {analysisResult.document.type === 'invoice' ? 'Rechnung' :
                     analysisResult.document.type === 'order' ? 'Bestellung' :
                     analysisResult.document.type === 'contract' ? 'Vertrag' :
                     'Quittung'}
                  </span>
                  {analysisResult.document.extractedData?.vendor && (
                    <span className="text-text-secondary"> von {analysisResult.document.extractedData.vendor}</span>
                  )}
                  {analysisResult.document.extractedData?.amount && (
                    <span className="text-text-secondary"> - {analysisResult.document.extractedData.amount} {analysisResult.document.extractedData.currency || 'EUR'}</span>
                  )}
                </div>
                <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">Auf Dokumente-Seite gespeichert</span>
              </div>
            )}

            {/* No findings */}
            {!analysisResult.actions?.length && !analysisResult.document && analysisResult.classification && (
              <p className="text-xs text-text-secondary">Keine Aufgaben oder Dokumente erkannt.</p>
            )}

            {/* Token usage */}
            {analysisResult.tokenUsage?.total > 0 && (
              <p className="text-xs text-text-secondary">
                {analysisResult.tokenUsage.total} Tokens verwendet
              </p>
            )}
          </div>
        )}

        {/* Analysis error */}
        {analysisResult?.error && (
          <div className="bg-card border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span>Analyse fehlgeschlagen: {analysisResult.error}</span>
              <button onClick={() => setAnalysisResult(null)} className="ml-auto text-xs underline">Schliessen</button>
            </div>
          </div>
        )}

        {/* Currently analyzing indicator */}
        {isAnalyzing && selectedEmail && (
          <div className="bg-card border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <ScanSearch className="w-5 h-5 text-emerald-500 animate-pulse" />
              <span className="text-text-secondary text-sm">
                Analysiere E-Mail (Klassifizierung + Aufgaben + Dokumente)...
              </span>
            </div>
          </div>
        )}

        {/* Currently classifying indicator */}
        {isClassifying && selectedEmail && !classificationResult && (
          <div className="bg-card border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <ClassifyButton onClick={() => {}} isLoading={true} disabled />
              <span className="text-text-secondary text-sm">
                Klassifiziere...
              </span>
            </div>
          </div>
        )}

        {/* Email List */}
        <div className="flex-1 overflow-y-auto">
          <EmailList
            emails={emails}
            isLoading={isLoading || isFetching}
            onRefresh={refetch}
            onEmailSelect={setSelectedEmail}
            onClassify={!isSentFolder && !isFollowUp ? handleClassifyEmail : undefined}
            onReply={handleReplyClick}
            selectedEmailId={selectedEmail?.id}
          />
        </div>
      </div>

      {/* Email Detail Panel */}
      {selectedEmail && (
        <div className="flex-1 md:w-3/5 lg:w-1/2">
          <EmailDetail
            email={selectedEmail}
            onClose={() => setSelectedEmail(null)}
            onReply={handleReplyClick}
            onClassify={!isSentFolder && !isFollowUp ? handleClassifyEmail : undefined}
            onAnalyze={!isSentFolder && !isFollowUp ? handleAnalyzeEmail : undefined}
            isAnalyzing={isAnalyzing}
            onDelete={() => refetch()}
            onMoved={() => {
              refetch();
              setSelectedEmail(null);
            }}
            showFolderSuggestion={!isSentFolder && !isFollowUp}
          />
        </div>
      )}

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSent={() => refetch()}
      />

      {/* Batch Classify Modal */}
      <BatchClassifyModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        emails={uncategorizedEmails}
        onClassify={handleBatchClassify}
        onApply={handleBatchApply}
      />

      {/* Reply Modal */}
      {replyEmail && (
        <ReplyModal
          isOpen={isReplyModalOpen}
          onClose={() => {
            setIsReplyModalOpen(false);
            setReplyEmail(null);
          }}
          email={replyEmail}
          userName={userName}
          onSendReply={handleSendReply}
        />
      )}

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onMoved={() => refetch()}
      />
    </div>
  );
};
