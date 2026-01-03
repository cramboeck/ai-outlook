import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import {
  Sparkles,
  Mail,
  Zap,
  Brain,
  Shield,
  CheckCircle,
  Clock,
  BarChart3,
  MessageSquare,
  Users,
  Lock,
  Globe,
  Star,
  Rocket,
  Play,
} from 'lucide-react';
import { graphScopes } from '../config/msalConfig';

export const Landing = () => {
  const navigate = useNavigate();
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    instance.loginRedirect(graphScopes);
  };

  const handleBetaSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // TODO: Connect to backend/newsletter service
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setSubmitted(true);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Navigation */}
      <nav className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-dark rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-text">PostPilot</span>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  BETA
                </span>
              </div>
              <span className="text-xs text-text-secondary">by Ramböck IT</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-text-secondary hover:text-text transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-text-secondary hover:text-text transition-colors">
              Preise
            </a>
            <a href="#security" className="text-text-secondary hover:text-text transition-colors">
              Sicherheit
            </a>
          </div>
          <button
            onClick={handleLogin}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium"
          >
            Kostenlos starten
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Rocket className="w-4 h-4" />
            Early Bird: 50% Rabatt für die ersten 100 Nutzer!
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-text mb-6 leading-tight">
            Dein KI-Assistent für<br />
            <span className="text-primary">intelligentes E-Mail-Management</span>
          </h1>

          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10">
            PostPilot kategorisiert, priorisiert und beantwortet deine E-Mails automatisch.
            Spare 2+ Stunden täglich und verpasse nie wieder wichtige Nachrichten.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-xl hover:bg-primary-dark transition-all shadow-lg hover:shadow-xl text-lg font-medium w-full sm:w-auto justify-center"
            >
              <Sparkles className="w-5 h-5" />
              Kostenlos testen
            </button>
            <a
              href="#demo"
              className="flex items-center gap-2 px-8 py-4 border border-border rounded-xl hover:bg-gray-50 transition-colors text-lg w-full sm:w-auto justify-center"
            >
              <Play className="w-5 h-5" />
              Demo ansehen
            </a>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              <span>DSGVO-konform</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-green-600" />
              <span>Daten in der EU</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-green-600" />
              <span>Microsoft 365 zertifiziert</span>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="bg-dark text-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Das E-Mail-Chaos kostet dich Zeit und Nerven
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">121</div>
              <p className="text-gray-400">E-Mails pro Tag im Durchschnitt</p>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">2.5h</div>
              <p className="text-gray-400">täglich für E-Mails verschwendet</p>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">23%</div>
              <p className="text-gray-400">wichtige Mails werden übersehen</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-text mb-4">
            Alles was du brauchst, um E-Mails zu meistern
          </h2>
          <p className="text-lg text-text-secondary">
            Powered by GPT-4 – optimiert für deutschsprachige Geschäftskommunikation
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 md:p-8 rounded-2xl border border-border hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <Brain className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-text mb-3">KI-Kategorisierung</h3>
            <p className="text-text-secondary">
              Automatische Einsortierung in 6 smarte Kategorien: Dringend, Aktion erforderlich,
              Meeting, Finanzen, Intern, Zur Info.
            </p>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-2xl border border-border hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-text mb-3">Smart Insights</h3>
            <p className="text-text-secondary">
              Sofort sehen was wichtig ist: Dringende Mails, offene Aufgaben, überfällige
              Antworten – alles auf einen Blick.
            </p>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-2xl border border-border hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-text mb-3">KI-Antworten</h3>
            <p className="text-text-secondary">
              Professionelle Antworten in Sekunden. Wähle Ton und Absicht – die KI
              formuliert perfekt auf Deutsch.
            </p>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-2xl border border-border hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-orange-600" />
            </div>
            <h3 className="text-xl font-semibold text-text mb-3">Action Board</h3>
            <p className="text-text-secondary">
              Aufgaben werden automatisch aus E-Mails extrahiert. Deadlines erkannt,
              Prioritäten gesetzt – nie wieder vergessen.
            </p>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-2xl border border-border hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-xl font-semibold text-text mb-3">Wochen-Briefing</h3>
            <p className="text-text-secondary">
              Wöchentliche Übersicht: Top-Absender, Kategorieverteilung, Trends –
              verstehe dein E-Mail-Verhalten.
            </p>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-2xl border border-border hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-teal-600" />
            </div>
            <h3 className="text-xl font-semibold text-text mb-3">DSGVO & Sicherheit</h3>
            <p className="text-text-secondary">
              Deine Daten bleiben in der EU. Keine E-Mail-Speicherung, Ende-zu-Ende
              verschlüsselt, Microsoft-zertifiziert.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="bg-primary/5 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-text mb-8">
            Warum PostPilot statt Microsoft Copilot?
          </h2>
          <div className="bg-white rounded-2xl border border-border overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 md:px-6 py-4 text-left font-semibold text-text">Feature</th>
                  <th className="px-4 md:px-6 py-4 text-center font-semibold text-primary">PostPilot</th>
                  <th className="px-4 md:px-6 py-4 text-center font-semibold text-text-secondary">Copilot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 md:px-6 py-4">Native deutsche Antworten</td>
                  <td className="px-4 md:px-6 py-4 text-center text-green-600 font-medium">✓</td>
                  <td className="px-4 md:px-6 py-4 text-center text-red-500">Übersetzt</td>
                </tr>
                <tr>
                  <td className="px-4 md:px-6 py-4">Automatische Kategorisierung</td>
                  <td className="px-4 md:px-6 py-4 text-center text-green-600 font-medium">✓ 6 Kategorien</td>
                  <td className="px-4 md:px-6 py-4 text-center text-red-500">✗</td>
                </tr>
                <tr>
                  <td className="px-4 md:px-6 py-4">Action Board mit Deadlines</td>
                  <td className="px-4 md:px-6 py-4 text-center text-green-600 font-medium">✓</td>
                  <td className="px-4 md:px-6 py-4 text-center text-red-500">✗</td>
                </tr>
                <tr>
                  <td className="px-4 md:px-6 py-4">Ton & Absicht wählbar</td>
                  <td className="px-4 md:px-6 py-4 text-center text-green-600 font-medium">✓ 4 Töne</td>
                  <td className="px-4 md:px-6 py-4 text-center text-orange-500">Begrenzt</td>
                </tr>
                <tr>
                  <td className="px-4 md:px-6 py-4">Preis</td>
                  <td className="px-4 md:px-6 py-4 text-center font-bold text-primary">ab 0€</td>
                  <td className="px-4 md:px-6 py-4 text-center text-text-secondary">30€/User/Monat</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-yellow-50 text-yellow-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Star className="w-4 h-4" />
            Early Bird: 50% Rabatt – nur für kurze Zeit!
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-text mb-4">
            Einfache, faire Preise
          </h2>
          <p className="text-lg text-text-secondary">
            Starte kostenlos, upgrade wenn du mehr brauchst
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {/* Free Tier */}
          <div className="bg-white p-6 md:p-8 rounded-2xl border border-border">
            <h3 className="text-lg font-semibold text-text-secondary mb-2">Free</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-text">0€</span>
              <span className="text-text-secondary">/Monat</span>
            </div>
            <p className="text-text-secondary mb-6">Perfekt zum Ausprobieren</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>50 E-Mails/Monat klassifizieren</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Smart Insights Dashboard</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>6 Kategorien in Outlook</span>
              </li>
              <li className="flex items-start gap-2 text-text-secondary">
                <CheckCircle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                <span className="line-through">KI-Antworten</span>
              </li>
              <li className="flex items-start gap-2 text-text-secondary">
                <CheckCircle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                <span className="line-through">Action Board</span>
              </li>
            </ul>
            <button
              onClick={handleLogin}
              className="w-full py-3 border border-border rounded-xl hover:bg-gray-50 transition-colors font-medium"
            >
              Kostenlos starten
            </button>
          </div>

          {/* Pro Tier */}
          <div className="bg-white p-6 md:p-8 rounded-2xl border-2 border-primary relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium">
              Beliebt
            </div>
            <h3 className="text-lg font-semibold text-text-secondary mb-2">Pro</h3>
            <div className="mb-1">
              <span className="text-4xl font-bold text-text">4,50€</span>
              <span className="text-text-secondary">/Monat</span>
            </div>
            <p className="text-sm text-green-600 mb-6">
              <span className="line-through text-text-secondary">9€</span> Early Bird -50%
            </p>
            <p className="text-text-secondary mb-6">Für Power-User und Freelancer</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span><strong>Unbegrenzte</strong> E-Mails</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Alles aus Free</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span><strong>KI-Antworten</strong> generieren</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span><strong>Action Board</strong> mit Deadlines</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Wochen-Briefing</span>
              </li>
            </ul>
            <button
              onClick={handleLogin}
              className="w-full py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors font-medium"
            >
              Pro werden
            </button>
          </div>

          {/* Business Tier */}
          <div className="bg-white p-6 md:p-8 rounded-2xl border border-border">
            <h3 className="text-lg font-semibold text-text-secondary mb-2">Business</h3>
            <div className="mb-1">
              <span className="text-4xl font-bold text-text">14,50€</span>
              <span className="text-text-secondary">/User/Monat</span>
            </div>
            <p className="text-sm text-green-600 mb-6">
              <span className="line-through text-text-secondary">29€</span> Early Bird -50%
            </p>
            <p className="text-text-secondary mb-6">Für Teams und Unternehmen</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Alles aus Pro</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span><strong>Team-Dashboard</strong></span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Shared Categories</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Admin-Konsole</span>
              </li>
              <li className="flex items-start gap-2 text-text">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Priority Support</span>
              </li>
            </ul>
            <button
              onClick={handleLogin}
              className="w-full py-3 border border-border rounded-xl hover:bg-gray-50 transition-colors font-medium"
            >
              Team starten
            </button>
          </div>
        </div>
      </section>

      {/* Beta Signup Section */}
      <section className="bg-gradient-to-br from-primary to-primary-dark py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Werde Beta-Tester und spare 50%
          </h2>
          <p className="text-white/80 mb-8">
            Melde dich für die Beta an und sichere dir den Early Bird Rabatt für immer.
            Die ersten 100 Nutzer erhalten außerdem 3 Monate Pro gratis.
          </p>

          {submitted ? (
            <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-white">
              <CheckCircle className="w-12 h-12 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Du bist dabei!</h3>
              <p className="text-white/80">
                Wir melden uns, sobald dein Zugang freigeschaltet ist.
              </p>
            </div>
          ) : (
            <form onSubmit={handleBetaSignup} className="flex flex-col sm:flex-row gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                required
                className="flex-1 px-6 py-4 rounded-xl text-text focus:outline-none focus:ring-4 focus:ring-white/20"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-8 py-4 bg-white text-primary rounded-xl font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  'Wird gesendet...'
                ) : (
                  <>
                    <Rocket className="w-5 h-5" />
                    Beta-Zugang sichern
                  </>
                )}
              </button>
            </form>
          )}

          <p className="text-white/60 text-sm mt-4">
            Kein Spam. Jederzeit abmelden. Deine Daten sind sicher.
          </p>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-text mb-4">
            Sicherheit & Datenschutz
          </h2>
          <p className="text-lg text-text-secondary">
            Deine Daten gehören dir – wir nehmen das ernst
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center p-4 md:p-6">
            <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="font-semibold text-text mb-2">DSGVO-konform</h3>
            <p className="text-sm text-text-secondary">Vollständig EU-Datenschutz konform</p>
          </div>
          <div className="text-center p-4 md:p-6">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="font-semibold text-text mb-2">Verschlüsselt</h3>
            <p className="text-sm text-text-secondary">TLS 1.3 Ende-zu-Ende</p>
          </div>
          <div className="text-center p-4 md:p-6">
            <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Globe className="w-7 h-7 text-purple-600" />
            </div>
            <h3 className="font-semibold text-text mb-2">EU-Server</h3>
            <p className="text-sm text-text-secondary">Daten bleiben in der EU</p>
          </div>
          <div className="text-center p-4 md:p-6">
            <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-orange-600" />
            </div>
            <h3 className="font-semibold text-text mb-2">Kein Zugriff</h3>
            <p className="text-sm text-text-secondary">Wir speichern keine E-Mails</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-dark text-white py-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-xl font-bold">PostPilot</span>
                <p className="text-xs text-gray-400">by Ramböck IT</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-gray-400">
              <a href="https://ramboeck-it.com/impressum" className="hover:text-primary transition-colors">Impressum</a>
              <a href="https://ramboeck-it.com/datenschutz" className="hover:text-primary transition-colors">Datenschutz</a>
              <a href="#" className="hover:text-primary transition-colors">AGB</a>
              <a href="https://ramboeck-it.com/kontakt" className="hover:text-primary transition-colors">Kontakt</a>
            </div>
            <p className="text-gray-400 text-sm">
              © 2025 Ramböck IT. Made with ❤️ in Austria.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
