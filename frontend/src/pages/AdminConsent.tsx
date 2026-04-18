import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Building2, ArrowRight } from 'lucide-react';

export const AdminConsent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    // Check URL parameters for consent result
    const adminConsent = searchParams.get('admin_consent');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const tenant = searchParams.get('tenant');

    if (error) {
      setStatus('error');
      setErrorMessage(errorDescription || error);
    } else if (adminConsent === 'True' || tenant) {
      setStatus('success');
      setTenantId(tenant);
    } else {
      // No parameters - might be direct navigation
      setStatus('error');
      setErrorMessage('Keine Consent-Informationen gefunden. Bitte starte den Admin-Consent-Prozess erneut.');
    }
  }, [searchParams]);

  const handleContinue = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-text mb-2">Verarbeite Consent...</h1>
            <p className="text-text-secondary">Bitte warten</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-text mb-2">Erfolgreich eingerichtet!</h1>
            <p className="text-text-secondary mb-6">
              MailSort wurde erfolgreich für Ihre Organisation freigegeben.
              {tenantId && (
                <span className="block mt-2 text-sm">
                  Tenant: <code className="bg-gray-100 px-2 py-0.5 rounded">{tenantId}</code>
                </span>
              )}
            </p>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6 text-left">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Nächste Schritte</p>
                  <ul className="text-sm text-blue-700 mt-1 space-y-1">
                    <li>• Alle Benutzer Ihrer Organisation können sich jetzt anmelden</li>
                    <li>• Jeder Benutzer muss sich einmalig mit seinem Microsoft-Konto anmelden</li>
                    <li>• Die App greift nur auf E-Mails des jeweiligen Benutzers zu</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              onClick={handleContinue}
              className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium"
            >
              Weiter zur Anmeldung
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-text mb-2">Fehler beim Einrichten</h1>
            <p className="text-text-secondary mb-4">
              Der Admin-Consent konnte nicht abgeschlossen werden.
            </p>

            {errorMessage && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => navigate('/')}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium"
              >
                Zurück zur Startseite
              </button>
              <p className="text-sm text-text-secondary">
                Benötigen Sie Hilfe?{' '}
                <a href="mailto:support@ramboeck-it.com" className="text-primary hover:underline">
                  Kontaktieren Sie uns
                </a>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
