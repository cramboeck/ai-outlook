# MailSort — Setup-Anleitung

Diese Datei beschreibt, was du im Azure-Portal, in SharePoint, Paperless, sevDesk etc. einrichten musst, damit die Features von MailSort korrekt funktionieren. Der Code selbst ist fertig — hier geht es nur um die **externen Konfigurationen**.

---

## 🗂️ Inhalt

1. [SharePoint — Metadaten-Spalten](#1-sharepoint--metadaten-spalten)
2. [Paperless-NGX — Custom Fields](#2-paperless-ngx--custom-fields)
3. [sevDesk — API-Token](#3-sevdesk--api-token)
4. [Microsoft 365 Copilot — Premium-Feature](#4-microsoft-365-copilot--premium-feature)
5. [Azure AD App Registration — Basis-Scopes](#5-azure-ad-app-registration--basis-scopes)

---

## 1. SharePoint — Metadaten-Spalten

### Warum
Damit ein weitergeleitetes Dokument in SharePoint nicht nur als Datei, sondern mit **durchsuchbaren Spalten** (Lieferant, Betrag, Kunde, Projekt, …) abgelegt wird. Ein Quick-Forward mit „Metadaten ergänzen" schreibt diese Spalten.

### Schritt-für-Schritt

1. **In SharePoint** (Browser → deine Site → Bibliothek öffnen):
   - Oben auf **„+ Spalte hinzufügen"** klicken
   - Typ wählen: **Einzelne Textzeile**
   - Folgende Spalten anlegen (Namen anpassen wie du willst):

   | Spaltenname in SP | Feldname in MailSort | Kommt von |
   |---|---|---|
   | Lieferant | `vendor` | Automatisch aus KI |
   | Betrag | `amount` | Automatisch aus KI |
   | Rechnungsnummer | `invoiceNumber` | Automatisch aus KI |
   | Datum | `date` | Automatisch aus KI |
   | **Kunde** | `customer` | **Manuell vom User** |
   | **Projekt** | `project` | **Manuell vom User** |
   | **Kostenstelle** | `costCenter` | **Manuell vom User** |

2. **In MailSort** (Sidebar → Integrationen → SharePoint bearbeiten):
   Im Feld **Metadaten-Spalten** das Mapping als JSON pflegen:

   ```json
   {
     "vendor": "Lieferant",
     "amount": "Betrag",
     "invoiceNumber": "Rechnungsnummer",
     "date": "Datum",
     "customer": "Kunde",
     "project": "Projekt",
     "costCenter": "Kostenstelle"
   }
   ```

   **Links** = Feldname wie der KI-Extraktor ihn liefert (oder dein freier Schlüssel für manuelle Felder).
   **Rechts** = der exakte SharePoint-Spalten-Name — **Groß-/Kleinschreibung beachten**.

3. **Speichern** & Integration testen.

### Ergebnis
Wenn du jetzt „Schnell senden → SharePoint" klickst, öffnet sich ein Modal mit allen Spalten. Auto-Felder sind mit ✨ markiert und bereits ausgefüllt; manuelle Felder (Kunde, Projekt, …) kannst du eintragen. Nach dem Senden liegt die Datei in der Library und alle Spalten sind befüllt.

---

## 2. Paperless-NGX — Custom Fields

### Warum
Damit die strukturierten Infos (Rechnungsnr., Betrag, …) in Paperless nicht nur im Titel stehen, sondern als echte Custom Fields suchbar sind.

### Schritte

1. **In Paperless** (Administration → Custom Fields):
   - Neue Felder anlegen (jeweils Typ: **String**):
     - `Email-ID`
     - `Rechnungsnummer`
     - `Betrag`
     - `Absender`
     - `MailSort-Ref`

2. **In MailSort**: keine weitere Konfiguration nötig. MailSort erkennt die Felder anhand des Namens und befüllt sie automatisch beim Upload.

### Hinweis
Wenn du die Feldnamen abweichend schreibst, findet MailSort sie nicht — dann wird nur das Dokument selbst hochgeladen und ein Warning im Backend-Log geschrieben (`Failed to set custom fields`).

---

## 3. sevDesk — API-Token

### Schritte
1. In sevDesk einloggen → **Profil** (oben rechts) → **API-Zugriff**.
2. Neuen Token generieren, **Klartext kopieren** (nur einmal sichtbar).
3. In MailSort: Integrationen → sevDesk → `apiToken` einfügen. Speichern.
4. Test-Button drücken: Status sollte **„connected"** zeigen.

### Empfohlene Config-Felder
```json
{
  "apiToken": "<token>",
  "defaultTaxRate": 19,
  "defaultTaxType": "default"
}
```
`defaultTaxType` darf einer der sevDesk-Werte sein: `default | eu | noteu | ss | custom`. Der KI-Extraktor übersteuert das automatisch bei Reverse-Charge- oder §19-Rechnungen.

---

## 4. Microsoft 365 Copilot — Premium-Feature

Context-Aware Drafts nutzt `/copilot/retrieval` um für jede antwortpflichtige E-Mail zusätzlich Kontext aus Teams / SharePoint / OneDrive zu ziehen und daraus einen Antwortentwurf mit Quellenangaben zu bauen.

### Voraussetzungen
- Dein Tenant hat eine **Microsoft 365 Copilot Lizenz** (30 $/User/Monat).
- Du bist Azure-AD-Admin für deinen Tenant.

### Schritt-für-Schritt

#### 4.1 Graph-Scopes zur App-Registration hinzufügen
1. **Azure Portal** → **App-Registrierungen** → MailSort-App auswählen.
2. Linke Navigation: **API-Berechtigungen**.
3. **„Berechtigung hinzufügen"** → **Microsoft Graph** → **Delegierte Berechtigungen**.
4. Folgende Scopes auswählen:
   - `Chat.Read`
   - `Files.Read.All`
   - `Sites.Read.All`
5. **„Hinzufügen"** klicken.
6. Auf der Berechtigungsliste: **„Admin-Zustimmung für <dein Tenant> erteilen"** klicken (grüner Haken muss erscheinen).

#### 4.2 Client Secret anlegen
1. Linke Navigation: **Zertifikate & Geheimnisse**.
2. **„Neuer geheimer Clientschlüssel"** → Beschreibung z.B. `MailSort OBO`, Gültigkeit 24 Monate.
3. **Wert** kopieren — ist nur einmal sichtbar, NICHT die ID.

#### 4.3 Backend .env ergänzen
Öffne `backend/.env` und füge hinzu:

```dotenv
AZURE_CLIENT_SECRET=<der-kopierte-wert>
AZURE_TENANT_ID=common
```

Wenn du nur deinen eigenen Tenant bedienst, kannst du statt `common` auch die Tenant-GUID eintragen — macht die Auth marginal schneller.

#### 4.4 Backend neu starten
```powershell
# im Backend-Fenster: Ctrl+C, dann
npm run dev
```

#### 4.5 Flag in MailSort aktivieren
Zwei Wege:

**Einfach (UI):** MailSort öffnen → **Einstellungen** → Abschnitt **„Microsoft 365 Copilot"** → Toggle auf **Ein**.
Wenn der Toggle ausgegraut ist mit Warning „Backend noch nicht konfiguriert", dann ist Schritt 4.3 oder 4.4 nicht durch.

**Direkt via SQL:**
```powershell
docker compose exec postgres psql -U postpilot -d postpilot -c "UPDATE tenants SET has_copilot_license=true WHERE id='00000000-0000-4000-a000-000000000001'"
```
(Ersetze die ID durch deine Tenant-ID.)

#### 4.6 Test
1. Eine E-Mail öffnen, die eine Antwort erfordert (z.B. eine Anfrage vom Kollegen).
2. „Analysieren" klicken — die Pipeline erkennt `isActionRequired=true` und generiert im Hintergrund einen Copilot-Draft.
3. „Antworten" klicken → Reply-Modal öffnet sich mit einem zusätzlichen **Indigo-Panel „Context-Aware Draft"** oben. Darunter die Quellen (Teams / SharePoint / OneDrive).
4. Falls kein Panel erscheint, im Backend-Log nach `copilot:` suchen:
   - `consent_required` → Schritt 4.1 (Admin-Consent) wiederholen
   - `no_copilot_license` → User hat keine M365-Copilot-Lizenz
   - `retrieval_failed` → Netz/Graph-Problem, nochmal versuchen

---

## 5. Azure AD App Registration — Basis-Scopes

Zusätzlich zu den Copilot-Scopes braucht MailSort für die normalen Features:

### Pflicht-Scopes (Microsoft Graph, delegiert)
- `Mail.ReadWrite` — Mails lesen + kategorisieren + verschieben
- `Mail.Send` — Antworten senden
- `User.Read` — Profil

### Empfohlen
- `Sites.ReadWrite.All` — SharePoint-Forwards
- `Tasks.ReadWrite` — Microsoft-To-Do-Sync

Nach jeder Scope-Änderung **Admin-Zustimmung erteilen** (sonst bekommst du beim ersten Login des Users `consent_required`).

### Redirect-URIs
Unter **Authentifizierung** müssen alle URLs deiner Frontends hinterlegt sein:
- Lokal: `http://localhost:5173`
- Produktiv: deine echte Domain, z.B. `https://app.mailsort.example`

---

## Troubleshooting-Kurzreferenz

| Symptom | Wahrscheinliche Ursache |
|---|---|
| Quick-Forward legt nur `.txt` in SharePoint ab | Frontend konnte kein PDF aus der Mail holen → Mail hat evtl. gar keinen Anhang, oder contentType nicht in Liste. Fix: Frontend-Änderung vom 19.04.2026 sollte das abdecken. |
| SharePoint-Spalten leer nach Forward | `metadata_columns` in Integration nicht gepflegt, oder Spalten in SharePoint heißen anders als im Mapping. |
| Paperless-Upload OK, aber keine Custom Fields | Fields in Paperless nicht unter exakt den Namen `Email-ID`, `Rechnungsnummer`, `Betrag`, `Absender`, `MailSort-Ref` angelegt. |
| sevDesk-Beleg ohne Steuer | taxRate fehlte in document_data (KI hat nichts gefunden) — Beleg nutzt `defaultTaxRate` aus Config. |
| Copilot-Panel erscheint nicht | Siehe Abschnitt 4.6 Log-Suche. |

---

Letzte Aktualisierung: 19.04.2026
