# Axon’s Inventory 1.5.0

## Commit

**Titel**

`feat: persistente gridbasierte Bodenprofile und einfacher Effekteditor`

**Beschreibung**

`Ergänzt dauerhafte Bodenprofile an Items, einen Drop-Trigger, gridbasierte Größen-, Sicht- und Effektbereiche, Foundry-Zustände ohne JSON, gespeicherte Variantenwürfe sowie frei benennbare Währungen. Enthält außerdem statische Tests und aktualisierte Dokumentation für Version 1.5.0.`

## Umgesetzt

- Bodenprofil direkt am Inventar-Item über „Bodenprofil & Effekte“ konfigurieren.
- Profil bleibt bei Item → Boden → Item erhalten.
- Trigger für Fallenlassen, Anklicken, Aufheben, Berühren/Betreten, Verlassen, Annähern, Stehenbleiben und Aktivieren.
- Grid-Ringe mit diagonalen Feldern; Radius 0 bedeutet nur das eigene Kästchen.
- Sichtbare Effektfläche pro Regel.
- Größe in festen Stufen von ⅛ bis 10 Grid-Kästchen.
- Sichtweite als Grid-Slider; optionale Foundry-Sicht- und Wandprüfung.
- Attributsprobe, Rettungswurf oder Fertigkeitsprobe mit SG.
- Aktionen für Schaden, Heilung, Foundry-Zustand, eigenen Active Effect, Licht, Dunkelheit, Chat, Sound, Makro und weitere Bodenobjekte.
- Schadenstyp-Dropdown.
- Optionaler Variantenwurf wie `1d4`; Ergebnis wird am Bodenobjekt gespeichert.
- Aktionen können über Mindest- und Höchstwert auf einzelne Varianten reagieren.
- Namen und Kürzel der fünf Währungsslots als GM-Welteinstellung.
- Syntax-, Manifest- und Datenfluss-Test über `npm test`.

## Beispiel: Feuerkristall

1. Am Item „Bodenprofil & Effekte“ öffnen.
2. Regel „Stärke bestimmen“ anlegen:
   - Trigger: „Beim Fallenlassen auf die Karte“
   - Würfelformel: `1d4`
   - optional eine Lichtaktion nur bei Stärke 1, Radius 15 Fuß
3. Regel „Feuerbereich“ anlegen:
   - Trigger: „Beim Berühren / Betreten des Bereichs“
   - „Zuletzt am Objekt gewürfelte Stärke verwenden“ aktivieren
   - Grid-Bereich anzeigen
   - je eine Schadensaktion mit passenden Feldern „von/bis“, zum Beispiel 2 → `1d6`, 3 → `2d6`, 4 → `4d6`

## Bewusste Grenzen

- Die automatische Bereichsgeometrie ist für quadratische Grids ausgelegt, weil diagonale Felder ausdrücklich als derselbe Ring zählen sollen. Ein Hex-Grid erhält keine exakte Hex-Zellenfläche.
- „Direkter Schaden“ verrechnet zuerst temporäre Trefferpunkte und danach normale Trefferpunkte. Der Schadenstyp wird ausgewiesen, aber Resistenzen, Immunitäten und weitere systemabhängige Schadensautomatisierung werden nicht automatisch verrechnet.
- Eigenes Active-Effect-JSON bleibt absichtlich eine Expertenfunktion. Standardzustände benötigen kein JSON.
- Die Prüfung hier umfasst Syntax, CSS-Parsing, statische Datenflüsse und einen gemockten Foundry-Kontext. Ein echter Klicktest in einer laufenden Foundry-VTT-14-Welt ist weiterhin erforderlich.
