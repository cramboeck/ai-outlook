# MailSort - Naechste Schritte

## Stand: 06.04.2026

### Heute erledigt (Session 05./06.04.)
- [x] Bug: `enabled = 1` → `enabled = true` in processing.ts (Postgres-kompatibel)
- [x] DRY: Forward-Endpoint nutzt jetzt zentral `forwardToIntegration()` (kein duplizierter Code mehr)
- [x] SharePoint Metadaten: Nach Upload werden Spalten automatisch gesetzt (via Graph API listItem/fields)
- [x] Metadaten-Mapping UI: SharePoint Config hat jetzt "Metadaten-Spalten" Sektion
- [x] To-Do Sync: Bessere Fehlermeldung + Azure AD Berechtigungshinweis
- [x] Erweiterte Auto-Forward-Regeln: V2-Format mit Bedingungen (Betrag > X, Lieferant enthaelt Y)
- [x] Visueller Regel-Editor: Feld/Operator/Wert-Zeilen im Integration-Config Dialog

---

## Morgen: Build & Test Plan

### Schritt 1: Vorbereitung (5 Min)
1. Backend neustarten: `cd backend && npm run dev`
2. Frontend neustarten: `cd frontend && npm run dev`
3. Ollama pruefen: `curl http://192.168.2.129:11434/api/tags` (muss qwen2.5:14b zeigen)

### Schritt 2: Azure AD Berechtigungen pruefen (10 Min)
1. Azure Portal → App-Registrierungen → MailSort App → API-Berechtigungen
2. Pruefen ob vorhanden:
   - [x] Mail.ReadWrite (sollte schon da sein)
   - [x] Sites.ReadWrite.All (fuer SharePoint)
   - [ ] **Tasks.ReadWrite** ← DIESES FEHLT WAHRSCHEINLICH
3. Falls Tasks.ReadWrite fehlt: "Berechtigung hinzufuegen" → Microsoft Graph → Delegiert → Tasks.ReadWrite
4. "Admin-Zustimmung erteilen" klicken

### Schritt 3: Webhook/Teams testen (5 Min)
1. Integrationen → Webhook-Integration oeffnen (Power Automate URL)
2. Test-Button klicken → muss "Verbunden" zeigen
3. Dokumente-Seite → beliebiges Dokument → Weiterleiten → Webhook waehlen
4. **Erwartung:** Teams-Channel bekommt Adaptive Card mit Dokumentinfos
5. Falls Fehler: Browser Console (F12) pruefen

### Schritt 4: To-Do Sync testen (5 Min)
1. Aktionen-Seite → "Tasks synchronisieren" Button
2. **Wenn Popup erscheint:** Tasks.ReadWrite Consent erteilen
3. **Erwartung:** Sync-Ergebnis zeigt importierte/aktualisierte Tasks
4. Microsoft To-Do App oeffnen → MailSort-Tasks pruefen
5. Falls Fehler: Console zeigt "Tasks.ReadWrite Berechtigung..." → Azure AD pruefen (Schritt 2)

### Schritt 5: KI-Analyse testen (5 Min)
1. Dokumente-Seite → Dokument mit PDF-Anhang auswaehlen (z.B. Rechnung)
2. "KI-Analyse" Button klicken
3. **Erwartung:** Animierter Dialog mit 4 Schritten, danach Felder ausgefuellt
4. Pruefen: Lieferant, Betrag, Rechnungsnummer, Datum, IBAN
5. Falls Fehler: Ollama erreichbar? `curl http://192.168.2.129:11434/v1/models`

### Schritt 6: SharePoint Metadaten testen (10 Min)
1. **Vorbereitung in SharePoint:**
   - Site oeffnen: https://ramboeckde.sharepoint.com/sites/intern
   - Bibliothek "Dokumente" → Spalten hinzufuegen:
     - "Lieferant" (Einzelne Textzeile)
     - "Betrag" (Einzelne Textzeile)
     - "Rechnungsnummer" (Einzelne Textzeile)
     - "Datum" (Einzelne Textzeile)
2. **In MailSort:**
   - Integrationen → SharePoint bearbeiten
   - "Metadaten-Spalten" Sektion: 4 Mappings hinzufuegen:
     - vendor → Lieferant
     - amount → Betrag
     - invoiceNumber → Rechnungsnummer
     - date → Datum
   - Speichern
3. Dokument mit erkannten Feldern an SharePoint weiterleiten
4. **In SharePoint pruefen:** Datei oeffnen → Properties → Spalten muessen befuellt sein

### Schritt 7: Auto-Forward Regeln testen (10 Min)
1. Integrationen → z.B. sevDesk oder Webhook bearbeiten
2. Auto-Weiterleitung: "Rechnung" Checkbox aktivieren
3. Bedingung hinzufuegen: Betrag > 500
4. Speichern
5. E-Mail mit Rechnung (Betrag 1.200 EUR) verarbeiten → muss auto-forwarden
6. E-Mail mit Rechnung (Betrag 200 EUR) verarbeiten → darf NICHT forwarden
7. E-Mail mit Bestellung → darf NICHT forwarden (falscher Dokumenttyp)

---

## Weitere Schritte (nach Tests)

### Prio 2: Feature-Erweiterungen

1. **Paperless-ngx bidirektionale Verlinkung**
   - Rueck-Link von Paperless zu MailSort (Correspondent/Tag-Mapping)
   - Task-Polling funktioniert bereits

2. **DATEV-Integration**
   - Typ in DB vorgesehen, Backend-Case existiert als Placeholder
   - DATEV-Online API oder XML-Export

3. **Dashboard-Verbesserungen**
   - Grafische Auswertung: Dokumente pro Tag/Woche, Verteilung nach Typ
   - Integration-Status-Uebersicht
   - Letzte Weiterleitungen mit Status

### Prio 3: UX & Qualitaet

4. **Error Handling & Retry**
   - Queue-System fuer fehlgeschlagene Weiterleitungen
   - Benachrichtigung bei wiederholtem Fehler

5. **E-Mail-Vorlagen & Antworten**
   - KI-basierte Antwort-Vorschlaege
   - Template-System

6. **Batch-Verarbeitung**
   - Mehrere Dokumente gleichzeitig freigeben/weiterleiten
   - Bulk-KI-Analyse

### Prio 4: Enterprise & Zusammenfuehrung

7. **RamboFlow-Integration** (siehe EVALUIERUNG_RAMBOFLOW_MERGE.md)
   - Shared Backend + Unified Frontend
   - Email → Timer starten (Killer-Feature)
   - Gemeinsame Kundenverwaltung

8. **openclaw.ai** - Noch zu klaeren

## Technische Schulden

- [x] ~~Forward-Endpoint duplizierte Logik~~ → erledigt (nutzt jetzt forwardService)
- [ ] PDF-Text-Extraktion: regex-basiert → evtl. pdf-parse Library
- [ ] Tests fehlen komplett (Unit + Integration)
- [ ] .env.example Dokumentation
- [ ] API-Dokumentation (Swagger/OpenAPI)
