import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion';
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
  Building2,
  Server,
  Headphones,
  Eye,
  Database,
  FileX,
  ShieldCheck,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { graphScopes, getAdminConsentUrl } from '../config/msalConfig';

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

// Animated counter component
const AnimatedCounter = ({ target, suffix = '' }: { target: number; suffix?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) =>
    suffix === 'h' ? v.toFixed(1) : suffix === '%' ? Math.round(v) : Math.round(v)
  );
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (isInView) {
      const controls = animate(count, target, {
        duration: 2,
        ease: 'easeOut',
      });
      const unsubscribe = rounded.on('change', (v) => setDisplay(String(v)));
      return () => {
        controls.stop();
        unsubscribe();
      };
    }
  }, [isInView, target, count, rounded]);

  return (
    <span ref={ref}>
      {display}{suffix}
    </span>
  );
};

// Section wrapper with scroll-triggered animation
const AnimatedSection = ({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={fadeInUp}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const featureCards = [
  { icon: <Brain className="w-6 h-6 text-blue-600" />, bg: 'bg-blue-100', title: 'KI-Kategorisierung', desc: 'Automatische Einsortierung in 6 smarte Kategorien: Dringend, Aktion erforderlich, Meeting, Finanzen, Intern, Zur Info.' },
  { icon: <Zap className="w-6 h-6 text-purple-600" />, bg: 'bg-purple-100', title: 'Smart Insights', desc: 'Sofort sehen was wichtig ist: Dringende Mails, offene Aufgaben, überfällige Antworten – alles auf einen Blick.' },
  { icon: <MessageSquare className="w-6 h-6 text-green-600" />, bg: 'bg-green-100', title: 'KI-Antworten', desc: 'Professionelle Antworten in Sekunden. Wähle Ton und Absicht – die KI formuliert perfekt auf Deutsch.' },
  { icon: <BarChart3 className="w-6 h-6 text-orange-600" />, bg: 'bg-orange-100', title: 'Action Board', desc: 'Aufgaben werden automatisch aus E-Mails extrahiert. Deadlines erkannt, Prioritäten gesetzt – nie wieder vergessen.' },
  { icon: <Clock className="w-6 h-6 text-red-600" />, bg: 'bg-red-100', title: 'Wochen-Briefing', desc: 'Wöchentliche Übersicht: Top-Absender, Kategorieverteilung, Trends – verstehe dein E-Mail-Verhalten.' },
  { icon: <Shield className="w-6 h-6 text-teal-600" />, bg: 'bg-teal-100', title: 'DSGVO & Sicherheit', desc: 'Deine Daten bleiben in der EU. Keine E-Mail-Speicherung, Ende-zu-Ende verschlüsselt, Microsoft-zertifiziert.' },
];

const FeatureGrid = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={staggerContainer}
      className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {featureCards.map((card, i) => (
        <motion.div
          key={i}
          variants={fadeInUp}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="bg-white p-6 md:p-8 rounded-2xl border border-border hover:shadow-lg transition-shadow"
        >
          <div className={`w-12 h-12 ${card.bg} rounded-xl flex items-center justify-center mb-4`}>
            {card.icon}
          </div>
          <h3 className="text-xl font-semibold text-text mb-3">{card.title}</h3>
          <p className="text-text-secondary">{card.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  );
};

export const Landing = () => {
  const navigate = useNavigate();
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/onboarding');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    instance.loginRedirect(graphScopes);
  };

  const handleBetaSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:7071';
      const response = await fetch(`${apiBase}/api/beta-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Registrierung fehlgeschlagen');
      }

      setSubmitted(true);
    } catch (err) {
      console.error('Beta signup error:', err);
      // Still show success to avoid leaking whether email exists
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
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
                <span className="text-xl font-bold text-text">MailSort</span>
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
            <a href="#admin" className="text-text-secondary hover:text-text transition-colors">
              Für Unternehmen
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6"
          >
            <Rocket className="w-4 h-4" />
            Early Bird: 50% Rabatt für die ersten 100 Nutzer!
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl md:text-6xl font-bold text-text mb-6 leading-tight"
          >
            Dein KI-Assistent für<br />
            <span className="text-primary">intelligentes E-Mail-Management</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10"
          >
            MailSort kategorisiert, priorisiert und beantwortet deine E-Mails automatisch.
            Spare 2+ Stunden täglich und verpasse nie wieder wichtige Nachrichten.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleLogin}
              className="flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-xl hover:bg-primary-dark transition-all shadow-lg hover:shadow-xl text-lg font-medium w-full sm:w-auto justify-center"
            >
              <Sparkles className="w-5 h-5" />
              Kostenlos testen
            </motion.button>
            <a
              href="#demo"
              className="flex items-center gap-2 px-8 py-4 border border-border rounded-xl hover:bg-gray-50 transition-colors text-lg w-full sm:w-auto justify-center"
            >
              <Play className="w-5 h-5" />
              Demo ansehen
            </a>
          </motion.div>

          {/* Trust Badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary"
          >
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
              <span>Für Microsoft 365</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="bg-dark text-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <AnimatedSection>
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
              Das E-Mail-Chaos kostet dich Zeit und Nerven
            </h2>
          </AnimatedSection>
          <div className="grid md:grid-cols-3 gap-8">
            <AnimatedSection className="text-center" delay={0.1}>
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                <AnimatedCounter target={121} />
              </div>
              <p className="text-gray-400">E-Mails pro Tag im Durchschnitt</p>
            </AnimatedSection>
            <AnimatedSection className="text-center" delay={0.2}>
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                <AnimatedCounter target={2.5} suffix="h" />
              </div>
              <p className="text-gray-400">täglich für E-Mails verschwendet</p>
            </AnimatedSection>
            <AnimatedSection className="text-center" delay={0.3}>
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                <AnimatedCounter target={23} suffix="%" />
              </div>
              <p className="text-gray-400">wichtige Mails werden übersehen</p>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-text mb-4">
            Alles was du brauchst, um E-Mails zu meistern
          </h2>
          <p className="text-lg text-text-secondary">
            Powered by GPT-4 – optimiert für deutschsprachige Geschäftskommunikation
          </p>
        </AnimatedSection>

        <FeatureGrid />
      </section>

      {/* Why MailSort Section */}
      <section className="bg-primary/5 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-text mb-4">
            Speziell für den deutschen Markt entwickelt
          </h2>
          <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto">
            MailSort wurde von Grund auf für deutschsprachige Geschäftskommunikation konzipiert
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 border border-border text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-text mb-2">Native deutsche Antworten</h3>
              <p className="text-sm text-text-secondary">
                KI-Antworten in natürlichem Deutsch – keine Übersetzungen, kein "Denglisch"
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-border text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-text mb-2">6 Business-Kategorien</h3>
              <p className="text-sm text-text-secondary">
                Dringend, Aktion, Info, Meeting, Finanzen, Intern – automatisch zugeordnet
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-border text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-text mb-2">Action Board</h3>
              <p className="text-sm text-text-secondary">
                Extrahierte Aufgaben mit Deadlines – nie wieder eine Anfrage übersehen
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-border text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-text mb-2">4 Antwort-Töne</h3>
              <p className="text-sm text-text-secondary">
                Formell, locker, freundlich oder bestimmt – du wählst den passenden Stil
              </p>
            </div>
          </div>
          <div className="mt-8 text-center">
            <p className="text-lg font-semibold text-primary">
              Kostenlos starten – ohne Kreditkarte
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <AnimatedSection className="text-center mb-12">
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
        </AnimatedSection>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
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
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium"
            >
              Beliebt
            </motion.div>
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

          {/* Enterprise Tier */}
          <div className="bg-gradient-to-br from-dark to-dark-light p-6 md:p-8 rounded-2xl border border-dark text-white">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Enterprise</h3>
            </div>
            <div className="mb-6">
              <span className="text-2xl font-bold">Individuell</span>
            </div>
            <p className="text-white/70 mb-6">Self-Hosting & Custom Solutions</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <Server className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span><strong>Self-Hosting</strong> in Ihrer Infrastruktur</span>
              </li>
              <li className="flex items-start gap-2">
                <Lock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span><strong>DSGVO</strong> & Compliance ready</span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span><strong>Custom</strong> Kategorien & Workflows</span>
              </li>
              <li className="flex items-start gap-2">
                <Headphones className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span><strong>Wartung</strong> & Support inkl.</span>
              </li>
              <li className="flex items-start gap-2">
                <Users className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span>Onboarding & Schulung</span>
              </li>
            </ul>
            <a
              href="mailto:hello@ramboeck-it.com?subject=MailSort%20Enterprise%20Anfrage"
              className="w-full py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors font-medium flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Anfrage senden
            </a>
          </div>
        </div>
      </section>

      {/* IT Admin Section */}
      <section id="admin" className="bg-white py-16 border-t border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Building2 className="w-4 h-4" />
              Für IT-Administratoren
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-text mb-4">
              MailSort für Ihr Unternehmen freigeben
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              Als IT-Admin können Sie MailSort zentral für alle Mitarbeiter Ihrer Organisation freigeben.
              Nach einmaliger Genehmigung können sich alle Benutzer selbstständig anmelden.
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-6 md:p-8 border border-border">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-text mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                  Was wird genehmigt?
                </h3>
                <ul className="space-y-3 text-text-secondary">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-1" />
                    <span><strong>Lesen</strong> von E-Mails und Ordnern</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-1" />
                    <span><strong>Kategorisieren</strong> und Verschieben von E-Mails</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-1" />
                    <span><strong>Senden</strong> von Antworten im Namen des Benutzers</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-1" />
                    <span><strong>Lesen</strong> von Postfach-Einstellungen</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-text mb-4 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-blue-600" />
                  Sicherheit & Kontrolle
                </h3>
                <ul className="space-y-3 text-text-secondary">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-1" />
                    <span>Jeder Benutzer greift nur auf <strong>eigene</strong> E-Mails zu</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-1" />
                    <span>Zugriff jederzeit im <strong>Azure Portal</strong> widerrufbar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-1" />
                    <span><strong>Keine</strong> E-Mail-Speicherung auf unseren Servern</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-1" />
                    <span>AVV für <strong>DSGVO</strong>-Compliance auf Anfrage</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-border text-center">
              <a
                href={getAdminConsentUrl()}
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-xl hover:bg-primary-dark transition-all shadow-lg hover:shadow-xl text-lg font-medium"
              >
                <Building2 className="w-5 h-5" />
                Admin Consent erteilen
              </a>
              <p className="text-sm text-text-secondary mt-4">
                Sie werden zu Microsoft weitergeleitet, um die Berechtigungen für Ihre Organisation zu genehmigen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Beta Signup Section */}
      <section className="bg-gradient-to-br from-primary to-primary-dark py-16">
        <AnimatedSection className="max-w-2xl mx-auto px-4 text-center">
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
        </AnimatedSection>
      </section>

      {/* Security & DSGVO Section */}
      <section id="security" className="bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <AnimatedSection className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <ShieldCheck className="w-4 h-4" />
              100% DSGVO-konform
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-text mb-4">
              Volle Transparenz bei Datenschutz & Sicherheit
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              Wir wissen, dass E-Mails sensible Daten enthalten. Deshalb haben wir MailSort
              von Grund auf mit Datenschutz im Fokus entwickelt.
            </p>
          </AnimatedSection>

          {/* What we DO and DON'T do */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* What we DO */}
            <div className="bg-white rounded-2xl p-6 md:p-8 border border-green-200">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-green-700 mb-6">
                <CheckCircle className="w-5 h-5" />
                Was wir tun
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Nur lesen, nie speichern</strong>
                    <p className="text-sm text-text-secondary">E-Mails werden nur zur Analyse gelesen und sofort verworfen</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Verarbeitung in der EU</strong>
                    <p className="text-sm text-text-secondary">Alle Server stehen in Deutschland (Azure West Europe)</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Verschlüsselte Übertragung</strong>
                    <p className="text-sm text-text-secondary">TLS 1.3 für alle Verbindungen, keine Ausnahmen</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Microsoft OAuth 2.0</strong>
                    <p className="text-sm text-text-secondary">Login über Microsoft – wir sehen dein Passwort nie</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Jederzeit widerrufbar</strong>
                    <p className="text-sm text-text-secondary">Zugriff in den Microsoft-Kontoeinstellungen sofort entziehen</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* What we DON'T do */}
            <div className="bg-white rounded-2xl p-6 md:p-8 border border-red-200">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-red-700 mb-6">
                <XCircle className="w-5 h-5" />
                Was wir NICHT tun
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Keine E-Mail-Speicherung</strong>
                    <p className="text-sm text-text-secondary">Wir speichern weder Inhalte noch Anhänge auf unseren Servern</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Kein Verkauf von Daten</strong>
                    <p className="text-sm text-text-secondary">Deine Daten werden niemals verkauft oder für Werbung genutzt</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Kein KI-Training</strong>
                    <p className="text-sm text-text-secondary">Deine E-Mails werden nicht zum Trainieren von KI-Modellen verwendet</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Keine versteckten Zugriffe</strong>
                    <p className="text-sm text-text-secondary">Nur die Berechtigungen, die du explizit siehst und genehmigst</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-text">Keine Datenweitergabe</strong>
                    <p className="text-sm text-text-secondary">Außer Azure OpenAI (DSGVO-konform) keine Dritten involviert</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Data Flow Diagram */}
          <div className="bg-white rounded-2xl p-6 md:p-8 border border-border mb-12">
            <h3 className="text-lg font-semibold text-text mb-6 text-center">
              So funktioniert der Datenfluss
            </h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-2">
                  <Mail className="w-8 h-8 text-blue-600" />
                </div>
                <span className="text-sm font-medium">Dein Outlook</span>
                <span className="text-xs text-text-secondary">Microsoft 365</span>
              </div>

              <ArrowRight className="w-6 h-6 text-gray-400 rotate-90 md:rotate-0" />

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-2">
                  <Eye className="w-8 h-8 text-green-600" />
                </div>
                <span className="text-sm font-medium">MailSort liest</span>
                <span className="text-xs text-text-secondary">Nur Betreff & Body</span>
              </div>

              <ArrowRight className="w-6 h-6 text-gray-400 rotate-90 md:rotate-0" />

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-2">
                  <Brain className="w-8 h-8 text-purple-600" />
                </div>
                <span className="text-sm font-medium">KI analysiert</span>
                <span className="text-xs text-text-secondary">Azure OpenAI (EU)</span>
              </div>

              <ArrowRight className="w-6 h-6 text-gray-400 rotate-90 md:rotate-0" />

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mb-2">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <span className="text-sm font-medium">Kategorie zurück</span>
                <span className="text-xs text-text-secondary">Nur das Label</span>
              </div>

              <ArrowRight className="w-6 h-6 text-gray-400 rotate-90 md:rotate-0" />

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-2">
                  <FileX className="w-8 h-8 text-red-500" />
                </div>
                <span className="text-sm font-medium">Daten gelöscht</span>
                <span className="text-xs text-text-secondary">Nichts gespeichert</span>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center p-4 md:p-6 bg-white rounded-xl border border-border">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="font-semibold text-text mb-2">DSGVO Art. 28</h3>
              <p className="text-sm text-text-secondary">AVV auf Anfrage verfügbar</p>
            </div>
            <div className="text-center p-4 md:p-6 bg-white rounded-xl border border-border">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="font-semibold text-text mb-2">SOC 2 Type II</h3>
              <p className="text-sm text-text-secondary">Azure-Infrastruktur zertifiziert</p>
            </div>
            <div className="text-center p-4 md:p-6 bg-white rounded-xl border border-border">
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Globe className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="font-semibold text-text mb-2">ISO 27001</h3>
              <p className="text-sm text-text-secondary">Informationssicherheit</p>
            </div>
            <div className="text-center p-4 md:p-6 bg-white rounded-xl border border-border">
              <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Database className="w-7 h-7 text-orange-600" />
              </div>
              <h3 className="font-semibold text-text mb-2">EU-Server</h3>
              <p className="text-sm text-text-secondary">Azure Germany West Central</p>
            </div>
          </div>

          {/* Transparency Note */}
          <div className="mt-12 text-center">
            <p className="text-text-secondary">
              Fragen zum Datenschutz? Schreib uns: {' '}
              <a href="mailto:datenschutz@ramboeck-it.com" className="text-primary hover:underline">
                datenschutz@ramboeck-it.com
              </a>
            </p>
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
                <span className="text-xl font-bold">MailSort</span>
                <p className="text-xs text-gray-400">by Ramböck IT</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-gray-400">
              <a href="https://ramboeck-it.com/impressum" className="hover:text-primary transition-colors">Impressum</a>
              <Link to="/privacy" className="hover:text-primary transition-colors">Datenschutz</Link>
              <Link to="/terms" className="hover:text-primary transition-colors">AGB</Link>
              <a href="https://ramboeck-it.com/kontakt" className="hover:text-primary transition-colors">Kontakt</a>
            </div>
            <p className="text-gray-400 text-sm">
              © 2025 Ramböck IT. Made with ❤️ and 🤖 in Bavaria.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
