import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Sparkles } from 'lucide-react';
import { EmailList } from '../components/email/EmailList';
import { ClassifyButton } from '../components/classification/ClassifyButton';
import { ClassificationResult } from '../components/classification/ClassificationResult';
import { BatchClassifyModal } from '../components/classification/BatchClassifyModal';
import { ReplyModal } from '../components/email/ReplyModal';
import { useEmails } from '../hooks/useEmails';
import { useClassify } from '../hooks/useClassify';
import type { Email, Classification } from '../types';

export const Inbox = () => {
  const { accounts } = useMsal();
  const { emails, isLoading, isFetching, refetch, getEmailBody, setCategoryAsync, setCategoriesBatchAsync } = useEmails();
  const { classifyAsync, isClassifying, classifyBatchAsync } = useClassify();

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [classificationResult, setClassificationResult] = useState<Classification | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Reply Modal State
  const [replyEmail, setReplyEmail] = useState<Email | null>(null);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);

  const account = accounts[0];
  const userName = account?.name || 'Freundliche Grüße';

  const uncategorizedEmails = emails.filter((e) => e.categories.length === 0);

  const handleClassifyEmail = async (email: Email) => {
    setSelectedEmail(email);
    setClassificationResult(null);

    try {
      // Load full email body for better classification
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
      await setCategoryAsync({
        messageId: selectedEmail.id,
        categories: [classificationResult.category],
      });
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
    setSelectedEmail(null);
  };

  const handleBatchClassify = async (emailsToClassify: Email[]) => {
    // Load full bodies for all emails
    const fullEmails = await Promise.all(
      emailsToClassify.map((email) => getEmailBody(email.id))
    );
    return classifyBatchAsync(fullEmails);
  };

  const handleBatchApply = async (updates: Array<{ id: string; categories: string[] }>) => {
    await setCategoriesBatchAsync(updates);
  };

  const handleReplyClick = async (email: Email) => {
    // Load full email body for better reply generation
    const fullEmail = await getEmailBody(email.id);
    setReplyEmail(fullEmail);
    setIsReplyModalOpen(true);
  };

  const handleSendReply = (to: string, subject: string, body: string) => {
    // Open Outlook compose window with pre-filled content
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
    setIsReplyModalOpen(false);
    setReplyEmail(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Posteingang</h1>
          <p className="text-text-secondary">
            {uncategorizedEmails.length} unkategorisierte E-Mails
          </p>
        </div>

        {uncategorizedEmails.length > 0 && (
          <button
            onClick={() => setIsBatchModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Alle kategorisieren
          </button>
        )}
      </div>

      {/* Classification Result */}
      {classificationResult && selectedEmail && (
        <div className="max-w-2xl">
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

      {/* Currently classifying indicator */}
      {isClassifying && selectedEmail && !classificationResult && (
        <div className="max-w-2xl bg-white border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <ClassifyButton onClick={() => {}} isLoading={true} disabled />
            <span className="text-text-secondary">
              Klassifiziere: {selectedEmail.subject}
            </span>
          </div>
        </div>
      )}

      {/* Email List */}
      <EmailList
        emails={emails}
        isLoading={isLoading || isFetching}
        onRefresh={refetch}
        onEmailSelect={setSelectedEmail}
        onClassify={handleClassifyEmail}
        onReply={handleReplyClick}
        selectedEmailId={selectedEmail?.id}
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
    </div>
  );
};
