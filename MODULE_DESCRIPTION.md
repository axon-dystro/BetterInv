# Axon’s Inventory – Kurzbeschreibung

**Axon’s Inventory** ersetzt die unübersichtliche Standard-Inventaransicht von D&D 5e durch ein frei konfigurierbares Inventar mit Kategorien, Rucksäcken, Währungen, Kompendium-Import und direktem Handel zwischen Spielercharakteren und sichtbarer Bodenbeute auf der Karte.

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

- **Fünf frei benennbare Währungsslots:** Standardmäßig Platin, Gold, Elektrum, Silber und Kupfer; Name, Kürzel und Faktor zur jeweils nächstkleineren Währung kann der GM für die Welt ändern.
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
- **Bodenbeute:** Gegenstände aus Axon’s Inventory oder einem Foundry-Charakterbogen auf freie Kartenfläche ziehen; das Item-Bild bleibt dort sichtbar und kann von berechtigten Spielern aufgehoben werden.
- **Münzhaufen:** Beim Geldhandel statt eines Spielers den Boden wählen und die eingegebenen Münzen als sichtbaren Haufen ablegen.

## Einstellungen und Leistung

- **Pro Nutzer gespeichert:** Jeder Spieler kann seine eigene Ansicht festlegen.
- **Alles einzeln abschaltbar:** Geld, Gegenstände, Kategorien, Rucksäcke, Suche, Preise, Mengensteuerung, Handel und weitere Funktionen.
- **Gruppenschalter:** Ganze Bereiche oder alle Haken gleichzeitig aktivieren beziehungsweise deaktivieren.
- **GM-Spielerregeln:** Der GM kann Funktionen global für alle Spieler, pro Nutzer oder für den aktuell geöffneten Rucksack sperren.
- **Nicht umgehbar über die Modul-Einstellungen:** Gesperrte Schalter werden beim Spieler deaktiviert und können dort nicht wieder eingeschaltet werden.
- **Feingranulare Aktionen:** Hinzufügen, Bezahlen, Aufrunden, Abrunden, Geldhandel, Gegenstandshandel, Gegenstand fallen lassen, Boden-Gegenstand aufheben, Geld fallen lassen, Münzhaufen aufheben, Duplizieren, Löschen, Öffnen, Bearbeiten und Sortieren sind getrennt steuerbar.
- **Ruhemodus:** Das Modul vollständig pausieren; nur Diagnose und Reaktivierung bleiben verfügbar.
- **Performance-Optimierung:** Gefilterte Hooks, gebündelte Render-Vorgänge, reduzierte Listener, kleineres DOM und kontrolliertes Caching.
- **Live-Diagnose:** Renderzeiten, DOM-Größe, Hauptthread-Verzögerung und lokale Fehlercodes anzeigen und als Issue-Bericht exportieren.

## Support und Datenschutz

- **Support-Menü:** Discord, GitHub-Issues, Bugmeldung, Featurewunsch und Dokumentation direkt erreichbar.
- **Keine automatische Übertragung:** Das Modul versendet selbst keine Nachrichten, Diagnosewerte oder Nutzerdaten.

## Kompatibilität

- **Foundry VTT:** Version 14
- **Spielsystem:** D&D 5e 5.3.3

## Bodenobjekte

Gegenstände und Währungen können sichtbar auf Szenen abgelegt werden. Das vollständige Tile ist die gemeinsame Trefferfläche für Klick, Aufheben und Ziehen, einschließlich transparenter Bildstellen. Größe und Sichtweite verwenden feste Grid-Stufen: Reichweite 0 bezeichnet nur das eigene Kästchen, jeder weitere Schritt einen vollständigen Ring einschließlich Diagonalen. Foundry-Sicht und Wände können berücksichtigt werden.

Der GM kann ein dauerhaftes Bodenprofil direkt am Item speichern. Es bleibt beim Weg Item → Boden → Item erhalten. Regeln reagieren auf Fallenlassen, Anklicken, Aufheben, Berühren/Betreten, Verlassen, Annähern, Stehenbleiben oder manuelles Aktivieren. Rettungswürfe, Schadenstypen und Foundry-Zustände werden über Dropdowns gewählt; eigenes Active-Effect-JSON ist nur noch eine Expertenoption. Für einen optionalen Stärke-/Variantenwurf wird `1d2` bis `1d20` gewählt; jedes mögliche Ergebnis besitzt eine aufklappbare Variante mit eigenem optionalen Wurf und eigenen Aktionen. Sichtbare Grid-Flächen, verankertes Licht oder Dunkelheit, Schaden, Heilung, Zustände, Sound, Makros und verkettete Bodenobjekte werden unterstützt.
