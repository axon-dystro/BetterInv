# Axon’s Inventory v1.7.1 — Handel mit NSCs und überarbeitete Handelsanfragen

## Behoben
- Die Liste möglicher Handelspartner zeigt jetzt sichtbare Spielercharakter- und NSC-Tokens innerhalb von **5 ft**. Die Prüfung berücksichtigt auch **nicht verknüpfte Tokens**.
- Handel per Item, Münzen und Token-Übergabe benötigt keine Bearbeitungsrechte am Empfänger. Der Besitzer des eigenen Angebots muss aber berechtigt sein, dieses Angebot zu bearbeiten.
- Ein NSC ohne online befindlichen Spielerbesitzer wird vom aktiven GM vertreten. **Keine automatische Annahme oder direkte Übertragung**.
- Die gemeinsame Handelsansicht verwendet bei unverknüpften Tokens den tatsächlichen Token-Akteur statt fälschlich den zugrundeliegenden Welt-Akteur.
- Das Anfragefenster mit **Annehmen / Ablehnen** nutzt nun dieselben dunklen Hintergründe, Goldlinien und Schaltflächen wie Axon's Inventory.

## Sicherheit und Spielregeln
- Handel ist nur auf derselben Szene und innerhalb von 5 ft zulässig. Die Distanz wird beim Start, bei Annahme, beim Abschluss und bei Tokenbewegungen geprüft.
- Beide Handelspartner sehen ihre Angebote nebeneinander und müssen die aktuelle Angebotsversion bestätigen.
- Geänderte Angebote widerrufen beide Bestätigungen. Mengen, Besitzrechte und Gegenstandsstände werden nochmals serverseitig geprüft.
- Der aktive GM vermittelt Transfers. Für einen Handel mit NSCs antwortet der GM als zweite Partei.

## Kompatibilität und Tests
- Foundry VTT **14**, D&D 5e **5.3.3** gemäß Modulmanifest.
- Automatisierte Prüfung für nahen nicht verknüpften NSC, GM-Zustimmung, beidseitige Bestätigung, tatsächlichen Itemtransfer und Distanzsperre bestanden.
- Ein praktischer Mehrspieler-Test innerhalb einer laufenden Foundry-Welt ist weiterhin empfehlenswert.

## Installation
- Manifest: https://github.com/axon-dystro/BetterInv/releases/latest/download/module.json
- Release-Dateien: `betterinv.zip` und `module.json`, jeweils Version **1.7.1**.
