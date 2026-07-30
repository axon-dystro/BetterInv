# Changelog

## 1.4.3

- Neues sauberes Münzhaufen-Symbol statt des fehlerhaft wirkenden alten SVG-Symbols.
- Eigene Boden-Symbole für Platin, Gold, Elektrum, Silber und Kupfer; nur Haufen mit mehreren Währungsarten verwenden das gemischte Symbol.
- Bereits vorhandene Münzhaufen werden beim Laden durch den GM automatisch auf das passende Währungssymbol migriert.
- Münzvorschau im Bodenobjekt-Editor ergänzt.
- Attributs-, Fertigkeits- und Rettungswürfe verwenden jetzt vollständige Dropdowns mit den D&D-5e-Standardwerten.
- Trigger-Reichweite und Aktionsradius werden eindeutig in Fuß beschriftet.
- Betreten/Verlassen prüft die vollständige Tokenfläche gegen die vollständige Bodenobjektfläche statt nur den Tokenmittelpunkt.
- Tokenbewegungen werden während der visuellen Animation fortlaufend geprüft, sodass auch kleine Bodenobjekte beim Darüberlaufen zuverlässig auslösen.
- Der erste Trigger nach dem Speichern wird nicht mehr durch einen uninitialisierten Zustandswert verschluckt.
- Szenenaktionen wie Dunkelheit und Licht funktionieren auch bei Tokens ohne verknüpften Actor; Fehler beim Erstellen einer Lichtquelle werden konkret gemeldet.
- Erzeugte Licht- und Dunkelheitsquellen folgen beim Verschieben dem tatsächlichen visuellen Mittelpunkt des Bodenobjekts.

## 1.4.2

- Trefferfläche und goldener Auswahlrahmen werden aus dem tatsächlich gerenderten Tile-Mesh berechnet und liegen dadurch exakt auf dem sichtbaren Bodenobjekt.
- Bodenobjekte bewegen sich während des Ziehens live mit der Maus; Tile-Steuerung und separater Foundry-SpriteMesh werden gemeinsam verschoben.
- Sichtbarkeitsreichweite wird im Editor eindeutig in Fuß angegeben; leere Szenen-Einheiten erzeugen keine leere Beschriftung mehr.
- Einstellbare Einblend- und Ausblend-Verzögerung sowie konfigurierbare weiche Übergangsdauer ergänzt.
- Reichweitenprüfung läuft während Tokenbewegungen kontinuierlich über die visuelle Tokenposition, sodass Ein- und Ausblenden an derselben Grenze und ohne verzögertes Nachziehen erfolgen.

## 1.4.1

- Effekt-Editor wird nun über den offiziellen Dialog-Render-Hook gebunden und reagiert zuverlässig auf den Button.
- Initialisierungs-Rennen zwischen `main.js` und `ground-effects.js` behoben; die neue Bodenobjekt-Interaktion wird nach dem Laden sicher aktiviert.
- Sichtbarkeit blendet in Foundry v14 sowohl den Tile-Container als auch den separaten SpriteMesh aus.
- Neue lokale Schaltfläche „Spielersicht testen“ im GM-Editor, weil GMs Bodenobjekte regulär immer sehen.

## 1.4.0

- Einheitliche rechteckige Trefferfläche für Klick, Aufheben, Auswahl und Verschieben; transparente Bildbereiche zählen vollständig
- Exakte 6-Pixel-Schwelle zwischen Klick und Ziehen sowie Hand-/Greifcursor über Bodenobjekten
- Goldener Auswahlrahmen und konfigurierbarer Hotkey „Bodenobjekt-Bereiche anzeigen“ mit Standard Shift+H
- Effekt-Editor direkt im GM-Bodenobjektfenster aktiviert
- Trigger: Anklicken, Aufheben, Betreten, Verlassen, Annähern, Stehenbleiben und manuelles Aktivieren
- Regeln unterstützen einmalige Auslösung, Abklingzeit und einen optionalen Attributs-, Fertigkeits- oder Rettungswurf
- Mehrere geordnete Aktionen pro Regel mit getrennten Zweigen für immer, Erfolg und Fehlschlag
- Aktionen für Sichtbarkeit, Löschen, Aufheben erlauben/verhindern, Schaden, Heilung, Active Effects, Licht, Dunkelheit, Sound, Chat, Makros und andere Bodenobjekte
- Spieler-Aktivierung pro Bodenobjekt separat erlaubbar

## 1.3.0

- Klick auf Bodenbeute reagiert jetzt über einen einzigen Canvas-Handler ohne zufällige Mehrfachklicks
- GMs können Bodenobjekte per gehaltenem Linksklick direkt auf der Karte verschieben
- Neuer GM-Editor für Bodenobjekte mit logarithmischer Größe von 0,01× bis 100×
- Sichtbarkeit pro Bodenobjekt: immer sichtbar, nur in Reichweite oder für Spieler verborgen
- Optionale Foundry-Sichtlinienprüfung zusätzlich zur Reichweite
- Aufheben kann pro Bodenobjekt ein- oder ausgeschaltet werden
- GMs können Spielern das Verschieben einzelner Bodenobjekte erlauben
- Spieler können Bodenbeute auch ohne aktiven GM aufheben; die Entfernung vom Canvas wird persistent vorgemerkt und beim nächsten GM-Login bereinigt
- Sehr kleine Bodenobjekte behalten eine unsichtbare Mindest-Klickfläche, damit sie weiterhin bearbeitet werden können

## 1.2.1

- Bodenbeute reagiert jetzt unabhängig vom aktiven Canvas-Layer auf Links- und Rechtsklick.
- Klick öffnet ein Aktionsfenster zum Aufheben.
- GMs können Bodenbeute über das Fenster sicher und endgültig entfernen.
- Boden-Tiles sind für die normale GM-Verwaltung nicht mehr gesperrt.

## 1.2.0

- Gegenstände können aus Axon’s Inventory oder einem normalen Foundry-Charakterbogen direkt auf die Karte gezogen und dort als sichtbares Item-Symbol abgelegt werden
- Ein Drop auf einen erlaubten Spieler-Token überträgt weiterhin direkt; ein Drop auf freie Karte erzeugt Bodenbeute
- Gegenstandsmenü bietet jetzt die Wahl zwischen Spieler-Übergabe und Fallenlassen
- Der Geldhandel bietet zusätzlich „Auf den Boden legen“ und erzeugt einen sichtbaren Münzhaufen
- Bodenbeute kann von jedem berechtigten Spieler angeklickt, bestätigt und mit dem aktuell gewählten Charakter aufgehoben werden
- Gleichzeitiges doppeltes Aufheben wird serverseitig über den aktiven GM verhindert
- Erstellen, Entfernen und Aufheben von Bodenbeute läuft bei Spielern über einen aktiven GM, damit die Szenenrechte sauber eingehalten werden
- Neue getrennte GM-Sperren: Gegenstand fallen lassen, Boden-Gegenstand aufheben, Geld fallen lassen und Münzhaufen aufheben
- Erste Version legt bei Gegenständen immer den vollständigen Stapel ab

## 1.1.0

- Granulare GM-Funktionssperren als geschützte Weltregeln hinzugefügt
- Regeln können global für alle Spieler, pro Foundry-Nutzer oder für den aktuell geöffneten Rucksack gesetzt werden
- Vom GM gesperrte Funktionen können Spieler in ihren persönlichen Einstellungen nicht wieder aktivieren
- Geldaktionen getrennt schaltbar: Hinzufügen, Bezahlen, Aufrunden, Abrunden und Handeln
- Gegenstandsaktionen getrennt schaltbar: Öffnen, Bearbeiten, Hinzufügen, Übertragen, Duplizieren, Löschen und Ausrüsten
- Kategorien, Sortierung, Rucksack-Layer, Umbenennen und Verschieben in Rucksäcke separat steuerbar
- GM-Regelbereich direkt in das bestehende Einstellungsfenster integriert
- Rucksackregeln wirken nur innerhalb des jeweiligen geöffneten Rucksacks und eignen sich dadurch für Soulbound-, Fluch- oder One-Shot-Regeln

## 1.0.1

- Proprietäre Freeware-Lizenz hinzugefügt und im Modulmanifest verknüpft
- Lizenzbedingungen direkt über das Supportfenster erreichbar gemacht
- Bereich „Projekt freiwillig unterstützen“ im Supportfenster ergänzt
- README und Support-Dokumentation um Lizenz- und Unterstützungshinweise erweitert

## 1.0.0

Erste vollständige Version von Axon’s Inventory für Foundry VTT 14 und D&D 5e 5.3.3.

### Enthalten

- Eigene Inventaroberfläche mit Kategorien, Unterkategorien, Suche und Favoriten
- Mengen-, Ausrüstungs-, Bearbeitungs-, Duplizier- und Löschfunktionen
- Unbekannte Gegenstände, Gegenstandswerte, Kategoriegewichte und Traglast
- Rucksäcke, Kapazitätsanzeige, mehrere Layer und verschachtelte Container
- Vollständiges D&D-Währungssystem mit Bezahlen, Aufrunden, Abrunden und Handel
- Kompendium-Browser mit Suche, Filtern und Import
- Drag-and-drop aus Foundry sowie Übergabe an Spieler-Tokens
- Teil- und Komplettübertragung von Gegenständen
- Persönliche Einstellungen, Gruppenschalter und vollständiger Ruhemodus
- Supportfenster und lokale Performance-/Fehlerdiagnose
- Performance-Optimierungen für Hooks, Listener, Render-Vorgänge, DOM und Caching
- Responsive Desktop- und Schmalfensterdarstellung

### Abschlussarbeiten

- Besitzer- und GM-Rechte vereinheitlicht und zentral abgesichert
- Foundry-Kompatibilität auf Version 14 gesetzt
- D&D-5e-Gegenstandsarten und Datenpfade statisch geprüft
- Stylesheet-Pfad für Linux-Systeme auf Kleinschreibung korrigiert
- Leere Entwicklungsdateien entfernt
