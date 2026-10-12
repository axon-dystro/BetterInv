# Axon’s Inventory v1.7.0 — Gemeinsamer Spielerhandel

## Neu
- Handel mit Spielercharakteren anderer Spieler ohne eigene Bearbeitungsrechte am Empfänger.
- Gemeinsames Handelsfenster im Inventarstil: dunkle Flächen, Goldlinien, Item-Slots und Münzen auf beiden Seiten.
- Jeder Spieler sieht links sein eigenes Angebot und rechts das Gegenangebot, jeweils mit Mengen und Bestätigungsstatus.
- Items per Drag-and-drop oder Auswahl hinzufügen; Item gegen Gold, Item gegen Item und Geschenke sind möglich.
- Empfänger erhalten zuerst eine Anfrage mit Annehmen/Ablehnen. Ein beim Start ausgewähltes Item ist direkt im Angebot vorbelegt.
- Beide Tokens müssen auf derselben Szene innerhalb von 5 ft stehen. Nur nahe Spielercharaktere erscheinen in der Auswahl; Weggehen beendet offene Anfragen und Handel.
- Token-Übergaben verwenden ebenfalls den Anfrageablauf. Münzänderungen werden beim Verlassen des Felds und Itemänderungen direkt synchronisiert.

## Abwicklung
- Der aktive Haupt-GM führt den Austausch erst aus, wenn beide Seiten dieselbe Angebotsversion bestätigt haben.
- Jede Änderung hebt beide Bestätigungen auf.
- Besitzrechte, GM-Handelssperren, Mengen, Münzbeträge und geänderte Item-Dokumente werden geprüft.
- Fehlgeschlagene Dokumentänderungen lösen einen Rücklauf aus. Falls der Rücklauf selbst fehlschlägt, wird der Handel gesperrt und der GM zur Prüfung beider Charakterbögen aufgefordert.

## Voraussetzungen und Prüfung
- Foundry VTT 14 und D&D 5e 5.3.3 laut Modulmanifest.
- GM und Besitzer des Empfängercharakters müssen online sein; die beteiligten Tokens müssen sichtbar und mit ihren Charakteren verknüpft sein.
- Offene Sitzungen liegen im Arbeitsspeicher des GM; Neuladen verwirft sie.
- Automatisierte Modul-, Handels- und Ansichtstests bestanden. Keine laufende Foundry-Welt für einen Live-Test verfügbar.

## Installation / Update
Manifest-URL: https://github.com/axon-dystro/BetterInv/releases/latest/download/module.json

Dieses Release enthält `betterinv.zip` und `module.json` mit Version 1.7.0.
