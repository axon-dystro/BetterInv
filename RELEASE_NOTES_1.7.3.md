# Axon’s Inventory v1.7.3

## Handelspartner für normale Spieler
- Die Handelsliste verwendet **sichtbare Tokens der aktuell geöffneten Szene** statt eine Akteurliste, die für Spieler ohne Besitzrechte unvollständig sein kann.
- Spieler können neben Spielern auch nahe NSCs ohne Ownership als Handelspartner auswählen. Die konkrete Token-ID geht an den GM zur Prüfung.
- Es werden nur sichtbare Tokens innerhalb von **5 ft** angeboten. Entfernte oder verborgene Kreaturen werden nicht über die Handelsliste angezeigt.
- Alle Transfers bleiben GM-vermittelt. NSCs ohne Spielerbesitzer werden vom aktiven GM angenommen beziehungsweise abgelehnt.

## Kompaktes Handelsfenster
- Die fünf Währungsarten werden je Handelspartner als kompakte Leiste dargestellt, inklusive eigenem Bestand und editierbarem Angebotsbetrag.
- Die Item-Slots befinden sich darunter; der erste freie Plus-Slot öffnet das reguläre Axon’s Inventory zum Ziehen eines Items per Drag-and-Drop.
- Das bisherige Dropdown zur Gegenstandsauswahl bleibt verfügbar.
- Die Fensterhöhe und die übergroßen Schaltflächen im Anfragefenster wurden reduziert.
- Bei Rechtsklick auf einen nahen sichtbaren fremden Token steht ein kleiner Handels-Eintrag bereit, soweit der Foundry-Token-Hook ausgelöst wird. In der Token-HUD erscheint außerdem eine Handels-Schaltfläche.

## Sicherheit und Teststand
- Es gelten weiterhin 5 ft Reichweite, Zustimmung beider Teilnehmer, aktuelle Angebotsversionen, GM-Rechteprüfung, Mengenprüfung und Rückabwicklung.
- Automatisierte Testreihe für nahe Tokens im Spielerclient, nicht verknüpfte NSCs, Zustimmungsabläufe, Münzen und Itemtausch bestanden.
- Die konkrete Darstellung und das Rechtsklickverhalten müssen in einer echten Foundry-VTT-14-Welt überprüft werden.

## Installation
Manifest: https://github.com/axon-dystro/BetterInv/releases/latest/download/module.json

Version: **1.7.3**
