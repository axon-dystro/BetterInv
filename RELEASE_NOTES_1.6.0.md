# Axon’s Inventory 1.6.0

## Neu

- GM-Währungen besitzen neben Name und Kürzel einen Faktor zur jeweils nächstkleineren Währung.
- Die Standardkette bleibt ohne eigene Eingabe bei `PP ×10 → GP ×2 → EP ×5 → SP ×10 → CP`.
- Rechner, Aufrunden, Abrunden, Bezahlen, Handel und Bodenmünzen verwenden dieselben konfigurierten Weltkurse.
- Der Stärke-/Variantenwurf wird über `1d2`, `1d4`, `1d6`, `1d8`, `1d10`, `1d12` oder `1d20` gewählt.
- Der Editor erzeugt für jedes mögliche Ergebnis eine eigene aufklappbare Variante.
- Jede Variante besitzt einen eigenen optionalen Attributs-, Fertigkeits- oder Rettungswurf sowie beliebig viele Aktionen.
- Nach dem Würfelwurf wird nur die tatsächlich gewürfelte Variante ausgeführt.
- Licht, Dunkelheit, Schaden, Heilung, Foundry-Zustände, Chat, Sound, Makros, Sichtbarkeit und weitere vorhandene Aktionstypen stehen auch innerhalb jeder Variante zur Verfügung.
- Regeln und Varianten lassen sich unabhängig ein- und ausklappen.
- Effekt- und Bodenprofilfenster sind kompakter, scrollbar, verschiebbar und horizontal wie vertikal skalierbar.
- Das Inventar-Einstellungsfenster bleibt beim Arbeiten geöffnet und merkt sich Position und Größe lokal pro Foundry-Nutzer.

## Kompatibilität

- Regeln aus 1.5.0 mit einer exakten Stärkegrenze wie `4 bis 4` werden automatisch in Variante 4 übernommen.
- Freie ältere Würfelformeln werden beim Laden nicht gelöscht; für neue Konfigurationen bietet der Editor nur die unterstützten Würfel an.
- Bestehende Währungsnamen ohne Faktoren erhalten automatisch die bisherigen Standardwerte.
- Actor-Währungspfade und die fünf technischen D&D-Währungsschlüssel bleiben unverändert.

## Geprüft

- JavaScript-Syntax beider Laufzeitskripte
- CSS-Syntax
- Manifest-Dateien und Versionsgleichstand
- doppelte statische Foundry-Hooks
- doppelte Top-Level-Funktionen und Objektschlüssel
- frei konfigurierte Währungswerte sowie Auf- und Abrundungsrechnung
- Standardfaktoren für bestehende Welten
- Erzeugung von vier beziehungsweise zwölf Varianten
- Übernahme alter Stärkeaktionen
- variantenspezifische Rettungswürfe, Schadenstypen und Aktionsdaten
- Grid-Rundung, dauerhafte Item-Bodenprofile und Drop-Trigger

## Nicht automatisiert verifizierbar

In dieser Arbeitsumgebung läuft keine vollständige Foundry-VTT-14-Oberfläche mit einer echten D&D-5e-Welt. Die Browserdarstellung, Drag-Positionierung und tatsächliche Dialogskalierung wurden deshalb über Foundry-kompatible Dialogoptionen, CSS-Parsing und statische Laufzeittests geprüft, aber nicht in einer live gestarteten Foundry-Welt angeklickt. Vor einer öffentlichen Veröffentlichung empfiehlt sich ein kurzer GM-Smoke-Test in Foundry 14.
