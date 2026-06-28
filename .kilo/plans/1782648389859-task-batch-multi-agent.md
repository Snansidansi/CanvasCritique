# Plan: 33-Task-Batch mit 6 fokussierten Agenten

## Ausführungsstrategie

**Sequentiell** – 6 Agenten nacheinander auf demselben Branch. Kein Parallelbetrieb, weil:
- `de.json` / `en.json` von allen Agenten berührt werden (Merge-Konflikte wären garantiert)
- `PracticeCanvas.svelte` (1968 LOC) von Gruppen 4+5 geteilt
- `ProjectDetail.svelte` (860 LOC) von Gruppen 2+3 geteilt

Jeder Agent lädt nur die für seine Gruppe relevanten Dateien → Token-Ersparnis pro Session.
Nach jedem Agenten: Review + ggfs. Fixes, dann nächster Agent.

---

## Agent 1: Home Screen (Dashboard)

**Tasks**: #1, #20, #29, #30
**Dateien**: `Dashboard.svelte`, `ProfileModal.svelte`, `i18n/de.json`, `i18n/en.json`

| # | Task |
|---|------|
| 1 | Save-Button beim Profil bearbeiten zeigt i18n-Code statt Text an |
| 20 | Home-Screen: Sektions-Reihenfolge wie auf Lesson-Screen, Sektionen einklappbar, default-collapsed wenn alle Tasks completed. Kleiner Dreieckspfeil rechts in Zeile (Farbe wie Lektionsschrift) |
| 29 | Lessons auf Home-Screen per Drag-and-Drop in Reihenfolge verschieben (Touch/Stylus) |
| 30 | Lesson-Kacheln nicht auf 3 pro Reihe beschränkt – so viele nebeneinander wie Platz |

---

## Agent 2: Lesson Screen + Task Editor

**Tasks**: #7, #18, #21, #23, #24, #25, #27
**Dateien**: `ProjectDetail.svelte`, `TaskEditor.svelte`, `store.svelte.ts`, `i18n/de.json`, `i18n/en.json`

| # | Task |
|---|------|
| 7 | Lessons per Drag-and-Drop in Reihenfolge ändern (Touch/Stylus). Nur verfügbar wenn Suche nicht aktiv. |
| 18 | Sektionen im Lesson-Screen in Reihenfolge ändern |
| 21 | Play-Symbol: nächste Aufgabe nach Sektion+Task-Reihenfolge starten (wie im Lesson-Screen definiert) |
| 23 | Nach Task-Erstellung zurück zum Lesson-Screen: zur entsprechenden Sektion scrollen |
| 24 | Sektionen im Lesson-Screen einklappbar (Zustand gespeichert) |
| 25 | Drag-and-Drop für Attachments im Task-Creation-Screen (Maus, Touch, Stylus) |
| 27 | Audiodateien einfügbar (play/pause, Time-Slider, Volume-Slider). Neue globale+Lesson-Toggles für "Audio an LLM senden" (getrennt von Medien-Toggle). |

---

## Agent 3: Import/Export

**Tasks**: #2, #13, #19
**Dateien**: `store.svelte.ts` (import/export logic), `ProjectDetail.svelte`, `DataManagement.svelte`, `i18n/de.json`, `i18n/en.json`

| # | Task |
|---|------|
| 2 | Import-Merge überarbeiten: Section-für-Section durchgehen. Überschreiben = alle Tasks in Section überschreiben (nur namentlich matchende), lokale Tasks bleiben. Überspringen = nur namentlich fehlende Tasks importieren. |
| 13 | Settings-Export prüfen: Stift-Settings (Farben, Größen) werden mit exportiert/importiert |
| 19 | Export-Button pro Lektion, Import-Button pro Lektion/Sektion, Drag-and-Drop JSON in Sektionen. Export immer mit Sektion, Import erstellt Sektion wenn nicht vorhanden. |

---

## Agent 4: Canvas Tools, Drawing & Performance

**Tasks**: #6, #8, #10, #11, #14, #17, #31
**Dateien**: `PracticeCanvas.svelte`, `FloatingToolPalette.svelte`, `canvas.ts`, `touchDragPolyfill.ts`, `i18n/de.json`, `i18n/en.json`

| # | Task |
|---|------|
| 6 | Trenner in Canvas-Mitte per Touch/Stylus verschiebbar (wie Task-Verschieben lösen) |
| 8 | Medien-Vorschaubild auf Canvas: Zoomen + Verschieben möglich (nicht nur im Popout) |
| 10 | Stylus-Hover + Tastendruck: Tool soll schon beim Hovern wechseln, nicht erst wenn Stylus Screen verlässt |
| 11 | Vollständig wegradierte Linien verschwinden komplett (nicht mehr vom Selection-Tool erfassbar) |
| 14 | Neues Shape-Tool (Kreis, Ellipse, Linie, Viereck, Rechteck, Dreieck). Persistenz: nach Radieren/Selection springt es zurück zum letzten Shape, erst expliziter Klick auf Pen-Tool beendet Shape-Modus. |
| 17 | Canvas-Performance verbessern (unperformant sobald etwas gezeichnet wurde) |
| 31 | Collapsed Tool-Settings: einfaches Antippen öffnet, Halten/Draggen geht in Verschiebemodus |

---

## Agent 5: Canvas AI Critique UI

**Tasks**: #3, #4, #5, #15, #16, #26
**Dateien**: `PracticeCanvas.svelte`, `PracticeInfoPanels.svelte`, `CritiqueOverlay.svelte`, `MarkerTooltip.svelte`, `i18n/de.json`, `i18n/en.json`

| # | Task |
|---|------|
| 3 | Hardcoded englische Texte auf Deutsch: "Evaluation Goal/Solution" → i18n, "No instructions provided" + "Review drawing output" + "No solution provided" |
| 4 | "No instructions/solution provided" nur anzeigen wenn weder Text NOCH Medien hinterlegt sind (jeweils für Aufgabe und Solution) |
| 5 | "Instructions"-Label ganz weg. Stattdessen: "Sektionsname - Taskname" |
| 15 | AI-Korrektur: Task auf "nicht abgeschlossen" setzen wenn nicht 100% richtig (falls vorher als fertig markiert) |
| 16 | AI soll beliebig viele Stellen pro Aufgabe unterstreichen können. Pro Unterstreichung: Info was falsch ist. User kann auf Unterstreichung klicken für Detail-Popup. |
| 26 | AI-Korrektur-Popup: nur Ladekreis anzeigen, nach API-Antwort automatisch schließen (Auswertung ist schon im Seitenpanel) |

---

## Agent 6: Settings & LLM Backend

**Tasks**: #9, #12, #22, #28, #32, #33
**Dateien**: `ai.ts`, `Settings.svelte`, `AiModelConfig.svelte`, `StatisticsSettings.svelte`, `EvaluationDetailsSettings.svelte`, `types.ts`, `defaults.ts`, `store.svelte.ts`, `i18n/de.json`, `i18n/en.json`

| # | Task |
|---|------|
| 9 | Neue globale Einstellung: Schriftgröße für Aufgabenstellung, Lösung und AI-Kritik (Text) im Canvas-Screen. Überschreibbar pro Lesson (neuer Tab). |
| 12 | Zwei Radierer-Modi: (a) aktuell (default), (b) OneNote-Style (ganze Linie löschen bei Berührung). Pro Modus eigener Radierradius. Global + Lesson-override. |
| 22 | LLM-Request: zusätzlich zum Task-Namen auch den Sektions-Namen senden ("Topic/Section: name") |
| 28 | LLM-Prompt: LaTeX erlauben. LaTeX-Rendering auf Canvas (Critique-Text links + Popups). |
| 32 | Gemini-Kostenberechnung korrigieren. User kann Input/Output-Token-Preise pro Million angeben (nur für Statistik). Ausgeblendet wenn Statistik deaktiviert. |
| 33 | OpenRouter Reasoning-Schalter funktioniert nicht. Zu offiziellem TypeScript-Package wechseln falls noch nicht verwendet. |

---

## Globale Vorgaben (gelten für jeden Agenten)

1. **Touch + Stylus**: Alle Drag-and-Drop- und Interaktionsfunktionen müssen mit Maus, Touch und Stylus funktionieren (analog zum existierenden Task-Verschieben in `ProjectDetail.svelte`)
2. **i18n**: Jeder neue/lokalisierte Text muss in `de.json` UND `en.json` eingetragen werden. `t()`-Funktion aus `services/i18n.ts` verwenden.
3. **Commit pro Task**: Nach jedem abgeschlossenen Task (1., 2., ...) committen mit beschreibender Message.
4. **Komponenten**: Svelte-Components so klein wie möglich halten, neue in `src/lib/components/` ablegen.
5. **Kein Code-Style ändern**: Existierende Patterns, Imports und Formatierung beibehalten.

---

## Ausführungsreihenfolge

1. **Agent 1** → Home Screen (Dashboard)
2. **Agent 2** → Lesson Screen + Task Editor
3. **Agent 3** → Import/Export
4. **Agent 4** → Canvas Tools, Drawing & Performance
5. **Agent 5** → Canvas AI Critique UI
6. **Agent 6** → Settings & LLM Backend

Jeder Agent arbeitet auf dem aktuellen Branch. Vor Start des nächsten Agenten: `git status` / `git diff` prüfen.

---

## Risiken

- **PracticeCanvas.svelte (1968 LOC)**: Agent 4 + 5 teilen sich diese Datei. Reihenfolge ist so gewählt, dass Agent 4 (Tools/Performance) zuerst läuft, dann Agent 5 (AI/UI). Agent 5 baut auf den Änderungen von Agent 4 auf.
- **store.svelte.ts**: Agent 2 + 3 teilen sich diese Datei. Agent 2 (Lesson Screen) läuft zuerst, dann Agent 3 (Import/Export).
- **i18n-Konflikte**: Agenten fügen Keys nur am Ende der JSON-Dateien hinzu → minimale Merge-Konflikte.
