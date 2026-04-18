import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, FileText, AlertCircle, CheckCircle, XCircle, Scale } from 'lucide-react';

export const Terms = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-text-secondary hover:text-text transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Zurück
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-dark rounded-lg flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-text">MailSort</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="bg-white rounded-2xl border border-border p-6 md:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-text">Allgemeine Geschäftsbedingungen</h1>
              <p className="text-text-secondary">Stand: Januar 2025</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <Scale className="w-5 h-5 text-primary" />
                1. Geltungsbereich
              </h2>
              <p className="text-text-secondary">
                Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung des Dienstes
                "MailSort", bereitgestellt von Ramböck IT. Mit der Registrierung oder Nutzung
                von MailSort akzeptieren Sie diese Bedingungen.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-text mb-4">2. Leistungsbeschreibung</h2>
              <p className="text-text-secondary mb-4">
                MailSort ist ein KI-gestützter E-Mail-Assistent für Microsoft 365, der folgende
                Funktionen bietet:
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li>Automatische Kategorisierung von E-Mails</li>
                <li>KI-gestützte Antwortvorschläge</li>
                <li>Intelligente Ordnervorschläge</li>
                <li>Dashboard mit E-Mail-Insights</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-text mb-4">3. Registrierung und Konto</h2>
              <p className="text-text-secondary mb-4">
                Die Nutzung von MailSort erfordert ein Microsoft 365-Konto. Bei der Registrierung:
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li>Müssen Sie wahrheitsgemäße Angaben machen</li>
                <li>Sind Sie für die Sicherheit Ihrer Zugangsdaten verantwortlich</li>
                <li>Erteilen Sie MailSort die erforderlichen Berechtigungen über Microsoft OAuth</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-text mb-4">4. Preise und Zahlung</h2>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
                <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Beta-Phase
                </h3>
                <p className="text-yellow-700 text-sm">
                  Während der Beta-Phase gelten reduzierte Preise. Early-Bird-Nutzer behalten
                  ihre Konditionen auch nach Ende der Beta.
                </p>
              </div>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li><strong>Free:</strong> Kostenlos, 50 E-Mails/Monat</li>
                <li><strong>Pro:</strong> 4,50€/Monat (9€ nach Beta), unbegrenzte E-Mails</li>
                <li><strong>Business:</strong> 14,50€/User/Monat (29€ nach Beta), Team-Features</li>
                <li><strong>Enterprise:</strong> Individuell nach Anfrage</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <CheckCircle className="w-5 h-5 text-green-600" />
                5. Erlaubte Nutzung
              </h2>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li>Private und geschäftliche E-Mail-Verwaltung</li>
                <li>Nutzung der KI-Funktionen für legitime Kommunikation</li>
                <li>Integration in bestehende Microsoft 365-Workflows</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <XCircle className="w-5 h-5 text-red-600" />
                6. Verbotene Nutzung
              </h2>
              <p className="text-text-secondary mb-4">
                Folgende Nutzungen sind untersagt:
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li>Spam oder Massen-E-Mails</li>
                <li>Automatisierung ohne menschliche Kontrolle</li>
                <li>Verwendung für illegale Aktivitäten</li>
                <li>Verbreitung von schädlichen Inhalten</li>
                <li>Reverse Engineering oder Manipulation des Dienstes</li>
                <li>Weitergabe von Zugangsdaten an Dritte</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-text mb-4">7. Haftungsausschluss</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                <p className="text-text-secondary text-sm">
                  MailSort ist ein KI-gestützter Dienst. KI-generierte Inhalte (Kategorisierungen,
                  Antwortvorschläge) sind Empfehlungen und sollten vor dem Versenden überprüft werden.
                  Ramböck IT übernimmt keine Haftung für Schäden durch KI-generierte Inhalte.
                </p>
              </div>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li>Der Dienst wird "wie besehen" bereitgestellt</li>
                <li>Keine Garantie für 100% Verfügbarkeit</li>
                <li>Haftung beschränkt auf den Vertragswert</li>
                <li>Keine Haftung für indirekte Schäden</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-text mb-4">8. Kündigung</h2>
              <p className="text-text-secondary mb-4">
                Sie können Ihr Konto jederzeit kündigen:
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li>Free-Accounts: Sofortige Kündigung möglich</li>
                <li>Pro/Business: Kündigung zum Monatsende</li>
                <li>Nach Kündigung werden alle Daten innerhalb von 30 Tagen gelöscht</li>
              </ul>
              <p className="text-text-secondary mt-4">
                Wir behalten uns das Recht vor, Accounts bei Verstoß gegen diese AGB ohne
                Vorankündigung zu sperren.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-text mb-4">9. Änderungen der AGB</h2>
              <p className="text-text-secondary">
                Wir können diese AGB mit einer Ankündigungsfrist von 30 Tagen ändern.
                Bei wesentlichen Änderungen werden Sie per E-Mail informiert. Die weitere
                Nutzung nach Inkrafttreten gilt als Zustimmung.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-text mb-4">10. Anwendbares Recht</h2>
              <p className="text-text-secondary">
                Es gilt deutsches Recht. Gerichtsstand ist [Ort], soweit gesetzlich zulässig.
                EU-Streitbeilegung:{' '}
                <a
                  href="https://ec.europa.eu/consumers/odr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  ec.europa.eu/consumers/odr
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-text mb-4">11. Kontakt</h2>
              <p className="text-text-secondary">
                Ramböck IT<br />
                E-Mail:{' '}
                <a href="mailto:hello@ramboeck-it.com" className="text-primary hover:underline">
                  hello@ramboeck-it.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
