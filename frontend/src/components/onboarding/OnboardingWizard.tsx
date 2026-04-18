import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import {
  Sparkles,
  Mail,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Rocket,
  PlugZap,
  Brain,
  Zap,
  BarChart3,
  Shield,
} from 'lucide-react';

const ONBOARDING_COMPLETE_KEY = 'postpilot_onboarding_complete';

export const isOnboardingComplete = (): boolean => {
  return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
};

export const markOnboardingComplete = (): void => {
  localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
};

export const OnboardingWizard = () => {
  const navigate = useNavigate();
  const { accounts } = useMsal();
  const [currentStep, setCurrentStep] = useState(0);

  const account = accounts[0];
  const firstName = account?.name?.split(' ')[0] || 'Nutzer';
  const userEmail = account?.username || '';

  const totalSteps = 3;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    markOnboardingComplete();
    navigate('/dashboard');
  };

  const handleSkip = () => {
    markOnboardingComplete();
    navigate('/dashboard');
  };

  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Progress bar */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index <= currentStep
                  ? 'bg-primary w-12'
                  : 'bg-gray-300 w-8'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-xl overflow-hidden">
          {/* Step 1: Welcome */}
          {currentStep === 0 && (
            <>
              <div className="bg-gradient-to-r from-primary to-primary-dark p-8 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-12 h-12" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-2">
                  Willkommen, {firstName}!
                </h1>
                <p className="text-white/90">
                  Lass uns MailSort in 2 Minuten einrichten.
                </p>
              </div>

              <div className="p-6 md:p-8">
                {/* User info confirmation */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6 flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-lg">
                    {firstName[0]}
                  </div>
                  <div>
                    <p className="font-medium text-text">{account?.name || 'Nutzer'}</p>
                    <p className="text-sm text-text-secondary">{userEmail}</p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-600 ml-auto" />
                </div>

                <h3 className="font-semibold text-text mb-4">Das kann MailSort fuer dich tun:</h3>
                <ul className="space-y-3">
                  {[
                    { icon: <Brain className="w-5 h-5 text-purple-600" />, text: 'E-Mails automatisch kategorisieren und priorisieren' },
                    { icon: <Zap className="w-5 h-5 text-orange-600" />, text: 'Rechnungen, Vertraege und Dokumente erkennen' },
                    { icon: <BarChart3 className="w-5 h-5 text-blue-600" />, text: 'Aufgaben aus E-Mails extrahieren und verwalten' },
                    { icon: <Shield className="w-5 h-5 text-green-600" />, text: 'DSGVO-konform – keine E-Mail-Speicherung' },
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      {item.icon}
                      <span className="text-text">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Step 2: Quick Integration Setup */}
          {currentStep === 1 && (
            <>
              <div className="bg-gradient-to-r from-blue-500 to-blue-700 p-8 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <PlugZap className="w-12 h-12" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-2">
                  Integrationen verbinden
                </h1>
                <p className="text-white/90">
                  Wohin sollen erkannte Dokumente weitergeleitet werden?
                </p>
              </div>

              <div className="p-6 md:p-8">
                <p className="text-text-secondary mb-6">
                  Du kannst Integrationen jetzt einrichten oder spaeter unter Einstellungen nachholen.
                </p>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[
                    { name: 'SharePoint', desc: 'Microsoft 365 Bibliothek', emoji: '📁' },
                    { name: 'sevDesk', desc: 'Buchhaltung & Belege', emoji: '📊' },
                    { name: 'Paperless-ngx', desc: 'Dokumenten-Archiv', emoji: '📄' },
                    { name: 'Webhook', desc: 'Power Automate / Custom', emoji: '🔗' },
                  ].map((integration) => (
                    <button
                      key={integration.name}
                      onClick={() => {
                        markOnboardingComplete();
                        navigate('/integrations');
                      }}
                      className="text-left p-4 rounded-xl border border-border hover:border-primary hover:shadow-md transition-all group"
                    >
                      <span className="text-2xl mb-2 block">{integration.emoji}</span>
                      <p className="font-medium text-text group-hover:text-primary transition-colors">
                        {integration.name}
                      </p>
                      <p className="text-xs text-text-secondary">{integration.desc}</p>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  className="w-full text-center text-sm text-text-secondary hover:text-text transition-colors py-2"
                >
                  Spaeter einrichten →
                </button>
              </div>
            </>
          )}

          {/* Step 3: Ready! */}
          {currentStep === 2 && (
            <>
              <div className="bg-gradient-to-r from-green-500 to-green-700 p-8 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Rocket className="w-12 h-12" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-2">
                  Alles bereit!
                </h1>
                <p className="text-white/90">
                  MailSort ist startklar. Lass uns deine ersten E-Mails analysieren.
                </p>
              </div>

              <div className="p-6 md:p-8">
                <div className="space-y-4 mb-6">
                  {[
                    { label: 'Microsoft-Konto verbunden', done: true },
                    { label: 'E-Mail-Zugriff genehmigt', done: true },
                    { label: 'KI-Engine bereit', done: true },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-text font-medium">{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <p className="text-sm text-text-secondary">
                    <strong className="text-text">Tipp:</strong> Oeffne den Posteingang im Dashboard und klicke auf
                    "Alle verarbeiten" um deine E-Mails sofort zu kategorisieren.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="px-6 md:px-8 pb-6 md:pb-8 flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-text-secondary hover:text-text transition-colors text-sm"
            >
              Ueberspringen
            </button>

            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={handlePrevious}
                  className="flex items-center gap-1 px-4 py-2 text-text-secondary hover:text-text transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Zurueck
                </button>
              )}

              {isLastStep ? (
                <button
                  onClick={handleComplete}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors font-medium"
                >
                  Dashboard oeffnen
                  <Mail className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors font-medium"
                >
                  Weiter
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Step counter */}
        <p className="text-center text-text-secondary text-sm mt-4">
          Schritt {currentStep + 1} von {totalSteps}
        </p>
      </div>
    </div>
  );
};
