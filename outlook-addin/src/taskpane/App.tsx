// MailSort Outlook Add-in - Task Pane
// Shows classification, actions, document info, and DMS buttons for the selected email

import { useState, useEffect } from 'react';
import { QuickClassify } from './components/QuickClassify';
import { ActionPanel } from './components/ActionPanel';
import { DocumentPanel } from './components/DocumentPanel';
import { AuditTrail } from './components/AuditTrail';

declare const Office: any;

interface EmailData {
  id: string;
  subject: string;
  sender: string;
  body: string;
  hasAttachments: boolean;
}

export function App() {
  const [email, setEmail] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'classify' | 'actions' | 'documents' | 'audit'>('classify');

  useEffect(() => {
    Office.onReady(() => {
      loadEmailData();
      // Listen for item change events
      Office.context.mailbox.addHandlerAsync(
        Office.EventType.ItemChanged,
        () => loadEmailData()
      );
    });
  }, []);

  const loadEmailData = async () => {
    setLoading(true);
    setError(null);

    try {
      const item = Office.context.mailbox.item;
      if (!item) {
        setError('Keine E-Mail ausgewaehlt');
        setLoading(false);
        return;
      }

      // Get email body
      const body = await new Promise<string>((resolve, reject) => {
        item.body.getAsync(Office.CoercionType.Text, (result: any) => {
          if (result.status === Office.AsyncResultStatus.Succeeded) {
            resolve(result.value);
          } else {
            reject(new Error(result.error.message));
          }
        });
      });

      setEmail({
        id: item.itemId,
        subject: item.subject,
        sender: item.from?.emailAddress || '',
        body: body.substring(0, 2000),
        hasAttachments: item.attachments?.length > 0,
      });
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Segoe UI, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>MailSort</div>
          <div style={{ color: '#666' }}>Laden...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '16px', fontFamily: 'Segoe UI, sans-serif' }}>
        <div style={{ color: '#d32f2f', padding: '12px', background: '#ffeef0', borderRadius: '4px' }}>
          {error}
        </div>
      </div>
    );
  }

  if (!email) return null;

  const tabs = [
    { id: 'classify' as const, label: 'Kategorie' },
    { id: 'actions' as const, label: 'Aktionen' },
    { id: 'documents' as const, label: 'Dokumente' },
    { id: 'audit' as const, label: 'Verlauf' },
  ];

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', background: '#f5f5f5' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email.subject}
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
          Von: {email.sender}
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '8px 4px',
              border: 'none',
              background: activeTab === tab.id ? '#fff' : '#f9f9f9',
              borderBottom: activeTab === tab.id ? '2px solid #0078d4' : '2px solid transparent',
              color: activeTab === tab.id ? '#0078d4' : '#666',
              fontSize: '12px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {activeTab === 'classify' && <QuickClassify email={email} />}
        {activeTab === 'actions' && <ActionPanel email={email} />}
        {activeTab === 'documents' && <DocumentPanel email={email} />}
        {activeTab === 'audit' && <AuditTrail emailId={email.id} />}
      </div>
    </div>
  );
}
