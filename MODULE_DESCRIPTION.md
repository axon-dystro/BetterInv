# Axon’s Inventory – Kurzbeschreibung

**Axon’s Inventory** ersetzt die unübersichtliche Standard-Inventaransicht von D&D 5e durch ein frei konfigurierbares Inventar mit Kategorien, Rucksäcken, Währungen, Kompendium-Import und direktem Handel zwischen Spielercharakteren.

## Inventar und Gegenstände

- **Eigene Inventaransicht:** Öffnet sich per `I` oder über den Rucksack-Button.
- **Gegenstände verwalten:** Erstellen, bearbeiten, duplizieren und mit Bestätigung löschen.
- **Mengensteuerung:** Anzahl per Plus, Minus oder direkter Eingabe ändern – auch bis 0.
- **Ausrüsten und Ablegen:** Unterstützte Waffen und Ausrüstung direkt umschalten.
- **Favoriten:** Wichtige Gegenstände zusätzlich in einem eigenen Bereich anzeigen.
- **Unbekannte Gegenstände:** Nicht identifizierte Gegenstände werden getrennt und ausgegraut dargestellt.
- **Werte und Gewichte:** Gegenstandswert, Kategoriegewicht und Gesamttraglast übersichtlich anzeigen.
- **Suche:** Gegenstände und Rucksäcke schnell nach Namen finden.

## Kategorien und Sortierung

- **Eigene Kategorien:** Beliebig erstellen, umbenennen, sortieren und löschen.
- **Unterkategorien:** Gegenstände noch genauer strukturieren.
- **Drag-and-drop:** Gegenstände direkt in Kategorien, Unterkategorien oder Rucksäcke ziehen.
- **Gespeicherte Reihenfolge:** Sortierung bleibt am Charakter erhalten.

## Rucksäcke und Behälter

- **Rucksackkarten:** Alle Behälter kompakt über dem Inventar anzeigen.
- **Kapazitätsanzeige:** Aktuelles Gewicht beziehungsweise Inhalt und maximales Fassungsvermögen sehen.
- **Mehrere Rucksäcke:** Frei anordnen und über Layer strukturieren.
- **Verschachtelte Behälter:** Werden unterstützt, sofern D&D 5e die Containerzuordnung erlaubt; Kreise und Selbstverschachtelung werden verhindert.
- **Eigene Anzeigenamen:** Rucksäcke können innerhalb des Moduls umbenannt werden, ohne den eigentlichen Gegenstandsnamen zu verändern.

## Geld und Währungen

- **Alle D&D-Währungen:** Platin, Gold, Elektrum, Silber und Kupfer.
- **Hinzufügen:** Münzen exakt in der eingegebenen Währung hinzufügen.
- **Bezahlen / Entfernen:** Gesamtwert bezahlen; höhere Münzen werden automatisch aufgebrochen und Rückgeld sinnvoll ausgegeben.
- **Aufrunden:** Gewünschte höhere Münzen eingeben; das Modul bezahlt sie automatisch aus niedrigeren Münzen.
- **Abrunden:** Münzen gezielt in niedrigere Währungen wechseln.
- **Geld handeln:** Eingegebene Münzen direkt und ohne Umrechnung an einen anderen berechtigten Spielercharakter übertragen.

## Kompendien und Handel

- **Kompendium-Browser:** Zugängliche Gegenstands-Kompendien durchsuchen und nach Kompendium oder Gegenstandsart filtern.
- **Direkter Import:** Gegenstände aus Kompendien auf den Charakter kopieren.
- **Externes Drag-and-drop:** Gegenstände aus Foundrys Seitenleiste direkt in das Inventar, eine Kategorie oder einen Rucksack ziehen.
- **Gegenstände übertragen:** Ganze Stapel oder Teilmengen über das Drei-Punkte-Menü an andere Charaktere geben.
- **Token-Übergabe:** Gegenstand auf einen Spieler-Token ziehen und die Übergabe bestätigen.

## Einstellungen und Leistung

- **Pro Nutzer gespeichert:** Jeder Spieler kann seine eigene Ansicht festlegen.
- **Alles einzeln abschaltbar:** Geld, Gegenstände, Kategorien, Rucksäcke, Suche, Preise, Mengensteuerung, Handel und weitere Funktionen.
- **Gruppenschalter:** Ganze Bereiche oder alle Haken gleichzeitig aktivieren beziehungsweise deaktivieren.
- **GM-Spielerregeln:** Der GM kann Funktionen global für alle Spieler, pro Nutzer oder für den aktuell geöffneten Rucksack sperren.
- **Nicht umgehbar über die Modul-Einstellungen:** Gesperrte Schalter werden beim Spieler deaktiviert und können dort nicht wieder eingeschaltet werden.
- **Feingranulare Aktionen:** Hinzufügen, Bezahlen, Aufrunden, Abrunden, Geldhandel, Gegenstandshandel, Duplizieren, Löschen, Öffnen, Bearbeiten und Sortieren sind getrennt steuerbar.
- **Ruhemodus:** Das Modul vollständig pausieren; nur Diagnose und Reaktivierung bleiben verfügbar.
- **Performance-Optimierung:** Gefilterte Hooks, gebündelte Render-Vorgänge, reduzierte Listener, kleineres DOM und kontrolliertes Caching.
- **Live-Diagnose:** Renderzeiten, DOM-Größe, Hauptthread-Verzögerung und lokale Fehlercodes anzeigen und als Issue-Bericht exportieren.

## Support und Datenschutz

- **Support-Menü:** Discord, GitHub-Issues, Bugmeldung, Featurewunsch und Dokumentation direkt erreichbar.
- **Keine automatische Übertragung:** Das Modul versendet selbst keine Nachrichten, Diagnosewerte oder Nutzerdaten.

## Kompatibilität

- **Foundry VTT:** Version 14
- **Spielsystem:** D&D 5e 5.3.3
