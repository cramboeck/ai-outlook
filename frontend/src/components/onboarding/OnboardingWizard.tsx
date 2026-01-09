import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Mail,
  Brain,
  MessageSquare,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
} from 'lucide-react';

const ONBOARDING_COMPLETE_KEY = 'postpilot_onboarding_complete';

export const isOnboardingComplete = (): boolean => {
  return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
};

export const markOnboardingComplete = (): void => {
  localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
};

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
}

const steps: OnboardingStep[] = [
  {
    title: 'Willkommen bei PostPilot!',
    description: 'Dein KI-Assistent für intelligentes E-Mail-Management. Lass uns kurz durch die wichtigsten Funktionen gehen.',
    icon: <Sparkles className="w-12 h-12" />,
    color: 'from-primary to-primary-dark',
    features: [
      'KI-gestützte Kategorisierung',
      'Intelligente Antwortvorschläge',
      'Automatische Ordnersortierung',
    ],
  },
  {
    title: 'KI-Kategorisierung',
    description: 'PostPilot analysiert deine E-Mails und ordnet sie automatisch in 6 smarte Kategorien ein.',
    icon: <Brain className="w-12 h-12" />,
    color: 'from-purple-500 to-purple-700',
    features: [
      'Dringend - Sofortige Aufmerksamkeit erforderlich',
      'Aktion - Antwort oder Handlung nötig',
      'Zur Info - Keine Aktion erforderlich',
      'Meeting - Termine und Einladungen',
      'Finanzen - Rechnungen und Zahlungen',
      'Intern - Interne Kommunikation',
    ],
  },
  {
    title: 'KI-Antworten',
    description: 'Lasse dir professionelle Antworten in Sekunden generieren - in deinem bevorzugten Stil.',
    icon: <MessageSquare className="w-12 h-12" />,
    color: 'from-green-500 to-green-700',
    features: [
      '4 Antwort-Töne: Formell, Locker, Freundlich, Bestimmt',
      'Native deutsche Formulierungen',
      'Ein-Klick zum Senden oder Bearbeiten',
    ],
  },
  {
    title: 'Ordner-Vorschläge',
    description: 'PostPilot schlägt den passenden Ordner für jede E-Mail vor - basierend auf Inhalt und deiner Ordnerstruktur.',
    icon: <FolderOpen className="w-12 h-12" />,
    color: 'from-orange-500 to-orange-700',
    features: [
      'Intelligente Ordnererkennung',
      'Ein-Klick Verschieben',
      'Lernt aus deinen Ordnern',
    ],
  },
  {
    title: 'Bereit zum Start!',
    description: 'Du bist startklar! Klicke unten, um dein Dashboard zu öffnen und loszulegen.',
    icon: <Mail className="w-12 h-12" />,
    color: 'from-primary to-primary-dark',
    features: [
      'Dashboard mit Übersicht aller E-Mails',
      'Smart Insights auf einen Blick',
      'Suche und Filter für schnellen Zugriff',
    ],
  },
];

export const OnboardingWizard = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
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

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                index === currentStep
                  ? 'bg-primary w-8'
                  : index < currentStep
                    ? 'bg-primary'
                    : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header with gradient */}
          <div className={`bg-gradient-to-r ${step.color} p-8 text-white text-center`}>
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {step.icon}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">{step.title}</h1>
            <p className="text-white/90">{step.description}</p>
          </div>

          {/* Content */}
          <div className="p-6 md:p-8">
            <ul className="space-y-3">
              {step.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-text">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <div className="px-6 md:px-8 pb-6 md:pb-8 flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-text-secondary hover:text-text transition-colors text-sm"
            >
              Überspringen
            </button>

            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={handlePrevious}
                  className="flex items-center gap-1 px-4 py-2 text-text-secondary hover:text-text transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Zurück
                </button>
              )}

              {isLastStep ? (
                <button
                  onClick={handleComplete}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors font-medium"
                >
                  Los geht's!
                  <Sparkles className="w-4 h-4" />
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
          Schritt {currentStep + 1} von {steps.length}
        </p>
      </div>
    </div>
  );
};
