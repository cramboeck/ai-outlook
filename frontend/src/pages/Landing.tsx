import { useNavigate } from 'react-router-dom';
import { useIsAuthenticated } from '@azure/msal-react';
import { useEffect } from 'react';
import { Mail, Sparkles, Zap, Shield } from 'lucide-react';
import { LoginButton } from '../components/auth/LoginButton';

export const Landing = () => {
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const features = [
    {
      icon: Sparkles,
      title: 'KI-Kategorisierung',
      description: 'Automatische Klassifizierung mit Azure OpenAI GPT-4',
    },
    {
      icon: Zap,
      title: 'Sofort einsatzbereit',
      description: 'Keine Installation - funktioniert mit jedem Outlook',
    },
    {
      icon: Shield,
      title: 'DSGVO-konform',
      description: 'Alle Daten bleiben in der EU (Azure West Europe)',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10">
      {/* Header */}
      <header className="px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-text">MailSort</span>
          </div>
          <LoginButton variant="outline" />
        </div>
      </header>

      {/* Hero */}
      <main className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-text mb-6">
            E-Mails sortieren mit{' '}
            <span className="text-primary">künstlicher Intelligenz</span>
          </h1>
          <p className="text-xl text-text-secondary mb-10 max-w-2xl mx-auto">
            MailSort kategorisiert Ihre Microsoft 365 E-Mails automatisch.
            Dringend, Aktion erforderlich, Zur Info - alles sortiert in Sekunden.
          </p>
          <LoginButton size="lg" />
        </div>

        {/* Features */}
        <div className="max-w-4xl mx-auto mt-20 grid md:grid-cols-3 gap-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-xl p-6 shadow-sm border border-border"
            >
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-text mb-2">{feature.title}</h3>
              <p className="text-text-secondary">{feature.description}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 text-center text-text-secondary text-sm">
        <p>&copy; {new Date().getFullYear()} Ramböck IT. Alle Rechte vorbehalten.</p>
      </footer>
    </div>
  );
};
