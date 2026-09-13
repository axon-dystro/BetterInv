# Axon’s Inventory

Ein modernes, frei konfigurierbares D&D-5e-Inventar für Foundry VTT.

Axon’s Inventory ergänzt Kategorien und Unterkategorien, Rucksackkapazitäten, Währungsverwaltung, Kompendium-Import, Drag-and-drop, Gegenstands- und Geldhandel, persönliche Einstellungen, granulare GM-Sperren, verschiebbare und skalierbare Bodenobjekte, Reichweiten-Sichtbarkeit, Ruhemodus und eine lokale Performance-Diagnose.

Eine kompakte Übersicht aller Funktionen steht in [MODULE_DESCRIPTION.md](MODULE_DESCRIPTION.md).

## Kompatibilität

- Foundry VTT 14
- D&D 5e 5.3.3

## Bedienung

- Inventar öffnen: Taste `I`
- Alternativ: Rucksack-Symbol in Foundrys Oberfläche
- Einstellungen: Zahnrad im Inventar-Header
- GM-Spielerregeln: Im Einstellungsfenster global, pro Spieler oder im geöffneten Rucksack
- Bodenbeute: Gegenstand auf freie Karte ziehen; ein Klick markiert das vollständige Tile-Rechteck, Ziehen verschiebt es und Doppelklick oder Rechtsklick öffnet die Aktionen. Am markierten Objekt ändert `M` + Mausrad die Größe und `N` + Mausrad die Drehung in 15-Grad-Schritten.
- Spielerrechte für Bodenobjekte: Der GM kann Verschieben, Größenänderung, Drehung, Aktivierung und Effektbearbeitung getrennt global, pro Spieler und zusätzlich pro Bodenobjekt erlauben oder sperren.
- Dauerhafte Transformation: Die Option „Aktuelle Größe und Drehung am Item speichern“ übernimmt beide Werte beim Aufheben und erneuten Fallenlassen.
- Dauerhafte Bodenprofile: Im Drei-Punkte-Menü eines Items kann der GM Regeln schon im Inventar speichern. Das Profil bleibt beim Fallenlassen, Aufheben und erneuten Fallenlassen am Gegenstand.
- Einfache Effekte: Rettungswürfe, Schadenstypen und Foundry-Zustände wie Blind, Unsichtbar, Liegend oder Bewusstlos werden über Dropdowns gewählt. Eigenes Active-Effect-JSON bleibt als Expertenoption verfügbar.
- Variantenwürfe: Über ein Dropdown wird `1d2` bis `1d20` gewählt. Für jedes mögliche Ergebnis erscheint eine eigene aufklappbare Variante mit optionalem Wurf und beliebig vielen Aktionen; ausgeführt wird nur das tatsächlich gewürfelte Ergebnis.
- Eigene Währungen: Der GM kann Name, Kürzel und den Umrechnungsfaktor zur jeweils nächstkleineren der fünf Währungen ändern. Rechner sowie Auf- und Abrunden verwenden diese Weltkurse sofort.
- Fenster: Einstellungen bleiben als unabhängiges Hilfsfenster offen und merken sich Position und Größe. Bodenprofil- und Effektfenster sind verschiebbar, frei skalierbar, kompakt und scrollbar.
- Bodenobjekt-Trefferflächen: standardmäßig `Shift + H`, frei in Foundrys Tastenbelegung konfigurierbar
- Support und Diagnose: Symbole im Inventar-Header

## Support und freiwillige Unterstützung

Fehler und Funktionswünsche können über das integrierte Support-Menü oder über GitHub Issues gemeldet werden.

Axon’s Inventory bleibt kostenlos. Wer die weitere Entwicklung freiwillig unterstützen möchte, kann Axon über den im Support-Menü hinterlegten Discord-Kontakt anschreiben. Eine Unterstützung ist freiwillig und schaltet keine zusätzlichen Funktionen frei.

Axon’s Inventory überträgt selbst keine Diagnose- oder Nutzerdaten. Exportierte Fehlerberichte werden lokal erstellt und erst nach ausdrücklicher Bestätigung durch den Nutzer weitergegeben.

## Lizenz

Die Nutzung ist kostenlos, das Modul bleibt jedoch proprietär. Weiterverbreitung, Verkauf, Neuverpackung und Veröffentlichung veränderter Versionen sind ohne ausdrückliche Genehmigung nicht erlaubt. Die vollständigen Bedingungen stehen in [LICENSE](LICENSE).
