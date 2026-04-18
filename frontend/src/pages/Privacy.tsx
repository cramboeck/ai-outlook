import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Shield, Lock, Database, Eye, Server, Trash2 } from 'lucide-react';

export const Privacy = () => {
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
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-text">Datenschutzerklärung</h1>
              <p className="text-text-secondary">Stand: Januar 2025</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <Eye className="w-5 h-5 text-primary" />
                1. Verantwortlicher
              </h2>
              <p className="text-text-secondary">
                Ramböck IT<br />
                [Adresse]<br />
                E-Mail: datenschutz@ramboeck-it.com
              </p>
            </section>

            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <Database className="w-5 h-5 text-primary" />
                2. Welche Daten wir verarbeiten
              </h2>
              <p className="text-text-secondary mb-4">
                Bei der Nutzung von MailSort verarbeiten wir folgende Daten:
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li><strong>Microsoft-Kontodaten:</strong> Name, E-Mail-Adresse (über Microsoft OAuth 2.0)</li>
                <li><strong>E-Mail-Inhalte:</strong> Betreff, Absender, Vorschautext zur KI-Kategorisierung (temporär, nicht gespeichert)</li>
                <li><strong>Nutzungsdaten:</strong> Anonymisierte Statistiken zur Verbesserung des Dienstes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <Lock className="w-5 h-5 text-primary" />
                3. Wie wir Ihre Daten schützen
              </h2>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <h3 className="font-semibold text-green-800 mb-2">Wichtig: Keine E-Mail-Speicherung</h3>
                <p className="text-green-700 text-sm">
                  MailSort speichert keine E-Mail-Inhalte auf eigenen Servern. E-Mails werden nur
                  temporär zur Verarbeitung durch die KI gelesen und sofort wieder verworfen.
                </p>
              </div>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li>Alle Verbindungen sind TLS 1.3 verschlüsselt</li>
                <li>Authentifizierung ausschließlich über Microsoft OAuth 2.0</li>
                <li>Keine Speicherung von Zugangsdaten oder Passwörtern</li>
                <li>Server in der EU (Azure Germany West Central)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <Server className="w-5 h-5 text-primary" />
                4. Drittanbieter und Unterauftragnehmer
              </h2>
              <p className="text-text-secondary mb-4">
                Wir nutzen folgende Dienste zur Bereitstellung von MailSort:
              </p>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-text mb-1">Microsoft Azure</h4>
                  <p className="text-sm text-text-secondary">
                    Hosting und Infrastruktur. Server in Deutschland (Germany West Central).
                    Microsoft ist DSGVO-zertifiziert.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-text mb-1">Azure OpenAI Service</h4>
                  <p className="text-sm text-text-secondary">
                    KI-Verarbeitung für Kategorisierung und Antwortgenerierung. Daten werden
                    nicht zum Training verwendet. Verarbeitung in der EU.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-text mb-1">Microsoft Graph API</h4>
                  <p className="text-sm text-text-secondary">
                    Zugriff auf E-Mails über Ihre Microsoft 365-Berechtigung. Wir speichern
                    keine Tokens dauerhaft.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <Shield className="w-5 h-5 text-primary" />
                5. Ihre Rechte (DSGVO)
              </h2>
              <p className="text-text-secondary mb-4">
                Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:
              </p>
              <ul className="list-disc list-inside text-text-secondary space-y-2 ml-4">
                <li><strong>Auskunft:</strong> Sie können jederzeit erfahren, welche Daten wir über Sie speichern</li>
                <li><strong>Berichtigung:</strong> Unrichtige Daten können korrigiert werden</li>
                <li><strong>Löschung:</strong> Sie können die Löschung Ihrer Daten verlangen</li>
                <li><strong>Einschränkung:</strong> Sie können die Verarbeitung einschränken lassen</li>
                <li><strong>Datenübertragbarkeit:</strong> Sie können Ihre Daten in einem gängigen Format erhalten</li>
                <li><strong>Widerspruch:</strong> Sie können der Verarbeitung widersprechen</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-text mb-4">
                <Trash2 className="w-5 h-5 text-primary" />
                6. Zugriff widerrufen
              </h2>
              <p className="text-text-secondary mb-4">
                Sie können den Zugriff von MailSort auf Ihr Microsoft-Konto jederzeit widerrufen:
              </p>
              <ol className="list-decimal list-inside text-text-secondary space-y-2 ml-4">
                <li>Gehen Sie zu <a href="https://account.live.com/consent/Manage" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Microsoft Konto-Einstellungen</a></li>
                <li>Suchen Sie "MailSort" in der Liste der Apps</li>
                <li>Klicken Sie auf "Entfernen" um alle Berechtigungen zu widerrufen</li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-text mb-4">7. Kontakt</h2>
              <p className="text-text-secondary">
                Bei Fragen zum Datenschutz kontaktieren Sie uns unter:<br />
                <a href="mailto:datenschutz@ramboeck-it.com" className="text-primary hover:underline">
                  datenschutz@ramboeck-it.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
