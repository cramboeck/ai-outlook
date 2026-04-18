# Evaluierungsplan: MailSort + RamboFlow Zusammenfuehrung

**Erstellt:** 2026-04-05
**Status:** Evaluierung / Ideensammlung
**Autor:** Claude + Christoph

---

## Ausgangslage

Zwei SaaS-Apps mit fast identischem Tech-Stack (React 18 + TypeScript + Vite + Tailwind + Express.js + PostgreSQL):

| | MailSort (ai-outlook) | RamboFlow (timetracking-app) |
|---|---|---|
| **Zweck** | E-Mail-Management mit KI-Dokumentenerkennung | Zeiterfassung mit Projekt-/Kundenverwaltung |
| **Auth** | Azure AD / MSAL | Username/Password + JWT |
| **Key Features** | KI-Klassifikation, Freigabe-Workflow, DMS-Integrationen | Stoppuhr, Zeiteintraege, Berichte, PDF-Export, Teams |
| **Integrationen** | Paperless, sevDesk, SharePoint, Teams/Webhooks | sevDesk (geplant), Papierkram (geplant) |
| **DB** | UUID PKs, Migration-Files, tenant_id Scoping | TEXT UUIDs, Inline-Schema, user_id Scoping |
| **Frontend** | React Router, Layout Shell, React Query | State-basiertes View-Switching, PWA |

---

## Kernproblem

Als MSP bekommt Christoph Kunden-E-Mails (MailSort), bearbeitet sie, und trackt dann **separat** die Zeit (RamboFlow). Zwei getrennte Apps = manueller Kontextwechsel, doppelte Kundenpflege, kein uebergreifendes Reporting.

---

## Bewertete Ansaetze

### Ansatz A: Full Merge (eine App)
- **Aufwand:** 3-4 Wochen
- **Pro:** Einheitliche UX, geteilte Kundendaten, native Cross-Features
- **Contra:** Auth-Vereinheitlichung komplex, grosses Risiko
- **Bewertung:** ⭐⭐⭐⭐ - Bester Langzeit-Wert, aber hoher Initialaufwand

### Ansatz B: Integration Layer (zwei Apps, API-Bruecke)
- **Aufwand:** 1-2 Wochen
- **Pro:** Geringstes Risiko, schnell umsetzbar
- **Contra:** Zwei UIs, doppelte Daten, kein einheitliches Dashboard
- **Bewertung:** ⭐⭐ - Quick Win, aber limitiertes Potenzial

### Ansatz C: Shared Backend + Unified Frontend (empfohlen)
- **Aufwand:** 3-4 Wochen in Phasen
- **Pro:** Schrittweise, jede Phase bringt eigenstaendigen Wert
- **Contra:** Mittlerer Aufwand, Auth-Middleware wird komplexer
- **Bewertung:** ⭐⭐⭐⭐⭐ - Bestes Verhaeltnis Aufwand/Nutzen

### Ansatz D: Micro-Frontends (Module Federation)
- **Aufwand:** 4-5 Wochen
- **Pro:** Saubere Trennung, unabhaengiges Deployment
- **Contra:** Overengineered fuer 2 Module + 1 Entwickler
- **Bewertung:** ⭐ - Nicht empfohlen fuer diese Groesse

---

## Empfehlung: Ansatz C - Schrittweise Zusammenfuehrung

### Phase 1: Unified Backend (Woche 1-2)

**Monorepo-Struktur:**
```
ramboflow-suite/
  backend/
    src/
      server.ts                    # Ein Express-Server
      middleware/auth.ts           # Dual-Auth: MSAL + JWT
      db/migrations/               # Alle Migrationen nummeriert
      routes/
        mail/                      # MailSort-Routes
        time/                      # RamboFlow-Routes
        shared/                    # Gemeinsam (customers, auth)
      services/                    # AI, Email, Forward, Audit
  frontend/
    src/
      modules/
        mail/                      # MailSort-Seiten
        time/                      # RamboFlow-Seiten
        shared/                    # Gemeinsame UI
```

**Dual-Auth Middleware:**
- Token-Typ erkennen: Azure AD JWT (hat `tid` Claim) → MSAL-Validierung; App-JWT → JWT_SECRET
- Unified Users: `password_hash` (nullable) + `azure_user_id` (nullable)
- Zeiterfassung funktioniert OHNE Microsoft-Konto
- E-Mail-Features erfordern verknuepftes Microsoft-Konto

**Datenbank-Merge:**
- MailSort-Tabellen bleiben: categories, rules, actions, integrations, email_templates, signatures, search_macros, processing_log
- RamboFlow-Tabellen bleiben: time_entries, projects, activities, company_info, team_invitations, notification_settings
- Merge: `customers` (RamboFlow-Schema als Basis + tenant_id)
- Merge: `audit_logs` + `activity_log` → unified `audit_log`
- Neu: `customer_email_domains` → Auto-Zuordnung E-Mail ↔ Kunde

### Phase 2: Unified Frontend (Woche 2-3)

**MailSort-Frontend als Basis** (bessere Architektur: React Router, React Query, Layout Shell)

**Erweiterte Navigation:**
```
Mail: Dashboard | Posteingang | Dokumente | Aktionen | Integrationen
Zeit: Stoppuhr | Zeiteintraege | Kalender | Berichte
Gemeinsam: Kunden & Projekte | Team | Einstellungen
```

**RamboFlow-Komponenten migrieren:**
- State-basiertes View-Switching → React Router Routen
- Manuelle fetch-Calls → React Query Hooks
- Komponenten nach `modules/time/` verschieben

### Phase 3: Cross-Feature Synergien (Woche 3-4)

**3.1 Email → Zeiteintrag (Killer-Feature)**
1. E-Mail von `kunde@firma.at` kommt rein
2. MailSort KI erkennt: Support-Anfrage fuer Kunde X, Projekt Y
3. Button "Timer starten" in der E-Mail-Ansicht
4. Stoppuhr startet, vorausgefuellt mit Projekt + Kunde + E-Mail-Betreff
5. Timer stoppen → Zeiteintrag mit email_id Referenz

**3.2 Rechnungs-Gegencheck**
- MailSort erkennt Rechnung → Query time_entries fuer gleichen Kunden/Zeitraum
- Vergleichspanel: "Rechnung: 2.400 EUR | Getrackt: 16h x 150 EUR/h = 2.400 EUR ✅"

**3.3 Unified Dashboard**
- E-Mails verarbeitet + Zeit getrackt (heute)
- Offene Aktionen + Laufende Timer
- Umsatz-Indikatoren neben Rechnungsbetraegen
- Kunden-Uebersicht: E-Mail-Aktivitaet + Zeitaufwand

**3.4 Kunden-Vereinheitlichung**
- Eine Seite: Kontaktdaten + Projekte + E-Mail-Historie + Zeitauswertung + Umsatz

### Phase 4: Deployment & Migration (Woche 4)

- Ein Docker Compose (postgres + backend + frontend)
- Datenmigration: User mergen, Kunden deduplizieren
- Outlook Add-in: API-Pfade bleiben identisch, nur Port aendern

---

## Risiken

| Risiko | Gegenmassnahme |
|--------|----------------|
| MSAL-Abhaengigkeit | Zeiterfassung komplett ohne Microsoft-Konto moeglich |
| Datenverlust bei Migration | Parallelbetrieb + Rollback-Scripts |
| Outlook Add-in bricht | API-Pfade bleiben identisch |
| RamboFlow PWA/Offline | Service Worker fuer Time-Modul beibehalten |
| Zu grosser Scope | Phasen unabhaengig - Phase 1+2 allein bringt schon Wert |

---

## Geschaeftswert

**Heute:** E-Mail → manuell Kunde identifizieren → App wechseln → Timer starten → manuell Projekt zuordnen

**Nach Merge:** E-Mail → KI erkennt Kunde + Projekt → "Timer starten" → fertig. Monatsende: Bericht mit E-Mail-Referenzen pro Kunde, Rechnungs-Gegencheck automatisch.

---

## Offene Fragen

- [ ] Soll RamboFlow auch fuer Kunden ohne Microsoft 365 nutzbar bleiben?
- [ ] Welche Domain / welcher Name fuer die vereinte App? (RamboFlow Suite? MailSort Pro?)
- [ ] Soll die PWA-Funktionalitaet (Offline-Zeiterfassung) erhalten bleiben?
- [ ] Wie mit bestehenden RamboFlow-Nutzern umgehen die kein Microsoft-Konto haben?
- [ ] openclaw.ai Integration - was genau soll das machen?
- [ ] Priorisierung: Erst Phase 1-2 (Zusammenfuehrung) oder erst alle MailSort-Features fertig?
