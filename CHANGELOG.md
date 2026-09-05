# MailSort - Changelog

## Session 2026-04-05: Integrationen & Dokumentenverarbeitung

### Neue Features

#### 1. sevDesk Integration (vollstaendig)
- **Test Connection**: Prueft API-Token via `GET /SevUser`
- **Dokumenten-Upload**: Beleg-Erstellung mit PDF-Datei-Upload via `Voucher/Factory/saveVoucher` + `uploadTempFile`
- **Duplikat-Pruefung**: Automatische Pruefung ob Rechnungsnummer bereits in sevDesk vorhanden ist (Belegnummer-Vergleich)
- **Konfigurierbarer Steuersatz**: Standard 19%, anpassbar pro Integration
- **Datei**: `backend/src/routes/integrations.ts` (Helper-Funktionen), `backend/src/services/forwardService.ts` (sevdesk-Case)

#### 2. SharePoint Integration (vollstaendig)
- **Test Connection**: Site-Aufloesung via Graph API
- **PDF-Upload**: Echter Datei-Upload (nicht nur Text-Fallback) via Graph API `drives/{id}/root:/{path}:/content`
- **Ordner-Erstellung**: Automatische Ordnerstruktur (z.B. nach Dokumenttyp)
- **Separate MSAL Scopes**: `Sites.ReadWrite.All` wird separat angefordert (vermeidet Admin-Consent-Blockade)
- **Dateien**: `frontend/src/config/msalConfig.ts` (sharepointScopes), `frontend/src/pages/Documents.tsx`, `backend/src/services/forwardService.ts`

#### 3. Webhook / Teams / Power Automate Integration
- **Adaptive Cards**: Automatische Erkennung von Teams/Power Automate URLs → sendet Microsoft Adaptive Card Format
- **Standard JSON**: Fuer andere Webhook-Endpunkte wird strukturiertes JSON gesendet
- **URL-Erkennung**: `powerplatform.com`, `powerautomate`, `webhook.office.com`, `logic.azure.com` → Teams-Format
- **Format-Auswahl**: Frontend bietet "Auto-Erkennung", "Microsoft Teams", "Standard JSON"
- **Datei**: `backend/src/services/forwardService.ts` (webhook-Case), `frontend/src/pages/Integrations.tsx`

#### 4. KI-Analyse Dialog (Dokumentenerkennung)
- **PDF-Feldextraktion**: Sendet PDF an Ollama (qwen2.5:14b) zur automatischen Felderkennung
- **Extrahierte Felder**: Lieferant, Betrag, Nettobetrag, Steuersatz, Rechnungsnummer, Datum, Faelligkeitsdatum, IBAN, BIC, Positionen
- **Animierter Dialog**: Purple-Gradient Panel mit Schritt-Anzeige (PDF laden → Text extrahieren → KI analysieren → Felder befuellen)
- **Endpoint**: `POST /api/process-extract-document` in `backend/src/routes/processing.ts`
- **Frontend**: `frontend/src/pages/Documents.tsx` (runAiExtraction, KI-Analyse UI)

#### 5. Erweiterte Dokumente-Seite
- **Neue Felder**: Nettobetrag, Faelligkeitsdatum, IBAN, Positionen-Liste, KI-Hinweise
- **Forwarded-To Anzeige**: Klickbare Links zu Paperless (Dokument #ID), sevDesk (Beleg #ID), SharePoint (Oeffnen)
- **Access-Token Handling**: Automatische Token-Beschaffung fuer SharePoint bei Approve/Forward

### Bugfixes

#### 6. Webhook Forward "Weiterleitung fehlgeschlagen" behoben
- **Problem**: `POST /api/integrations/:id/forward` hatte keinen `webhook`-Case im Switch-Statement
- **Loesung**: Default-Case nutzt jetzt `forwardToIntegration()` aus `forwardService.ts` (behandelt alle Typen inkl. Webhook)
- **Datei**: `backend/src/routes/integrations.ts` (Zeile ~829)

#### 7. SharePoint PDF-Upload (nur Text statt PDF)
- **Problem**: `handleApprove` hat keinen `access_token` an Backend gesendet → SharePoint erhielt nur Text-Fallback
- **Loesung**: Token-Akquise vor Approve, Token wird im PATCH-Body mitgesendet
- **Zusaetzlich**: `Buffer` → `new Uint8Array(buffer)` fuer fetch-Body (TypeScript-Kompatibilitaet)

#### 8. sevDesk Duplikat als Fehler statt Info
- **Problem**: Duplikat-Erkennung setzte Integration-Status auf "error"
- **Loesung**: Duplikat gibt jetzt `success: true` zurueck (Info, kein Fehler)

#### 9. To-Do Sync FK-Constraint
- **Problem**: `req.userId` (Azure AD OID) passte nicht auf `users.id` (interner UUID)
- **Loesung**: User-Lookup via `azure_user_id` vor INSERT in `todoSync.ts`

### Architektur-Entscheidungen
- **MSAL Scope Separation**: Separate Scope-Objekte (graphScopes, todoScopes, sharepointScopes) vermeiden Admin-Consent-Blockaden
- **Zentraler ForwardService**: `forwardService.ts` als Single Source of Truth fuer alle Weiterleitungstypen
- **PDF-Text-Extraktion**: Regex-basiert (BT/ET Blocks) statt externer Library → keine zusaetzliche Dependency
