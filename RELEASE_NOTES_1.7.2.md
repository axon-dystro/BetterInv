# Axon’s Inventory v1.7.2 — Handelspartner wieder sichtbar

## Behoben
- Beim Öffnen von **Handel eröffnen** und **Gegenstand übertragen** verwenden jetzt beide Suchdialoge zuverlässig die aktuelle Handelspartnerliste statt der alten, nur auf Spielercharaktere beschränkten Aufzählung.
- Sichtbare NSCs und Spielercharaktere innerhalb von **5 ft** erscheinen in der Liste, einschließlich nicht verknüpfter Foundry-Tokens.
- Die irreführende Meldung, es gebe keine anderen Spielercharaktere in Reichweite, wurde entfernt.
- Hat der eigene Charakter auf der aktuellen Szene keinen Token, zeigt das Modul eine konkrete Diagnose statt eine irreführende Empfängermeldung.
- Fehlt eine aktive Szene oder ist das Handelsmodul nicht vollständig geladen, erscheint ebenfalls eine gezielte Meldung.

## Weiterhin gültige Handelsregeln
- Handel erfolgt ausschließlich innerhalb von 5 ft auf derselben Szene.
- Die Gegenpartei muss die Anfrage annehmen, danach müssen beide ihre Angebote bestätigen.
- Für NSCs ohne berechtigten Spieler übernimmt der aktive GM die Annahme und Bestätigung.
- Beim Austausch bleiben Besitzrechte, GM-Einstellungen, verfügbare Mengen und die Reichweite überprüft.

## Tests
- Neue Tests der beiden tatsächlichen Foundry-Auswahlfenster und ihres Aufrufs der NSC-fähigen Suchfunktion.
- Simulation eines NSC-Ziels in Reichweite, einer fehlenden eigenen Token-Platzierung und einer leeren Empfängerliste.
- Die bisherigen Tests zu Handelssitzung, Token-Abstand, GM-Zustimmung und Rollback bleiben enthalten.
- Ein praktischer Mehrspieler-Test in einer Foundry-Welt bleibt erforderlich.

## Voraussetzungen
- Foundry VTT 14, D&D 5e 5.3.3 gemäß Modulmanifest.
- Installationsmanifest: https://github.com/axon-dystro/BetterInv/releases/latest/download/module.json
