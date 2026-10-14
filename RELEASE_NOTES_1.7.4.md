# Axon's Inventory 1.7.4

## Handel und Berechtigungen
- Den veralteten `peer-transfers.js`-Patch entfernt: keine konkurrierende Besitzerprüfung und keine direkte Übergabe ohne Zustimmung mehr.
- Eine gemeinsame sichtbare Token-Auswahl für Spieler, GM, NSCs und unverknüpfte Tokens. Nur am eigenen Charakter werden Besitzrechte verlangt. Online-Spielerbesitzer erhalten die Anfrage; sonst übernimmt der GM.
- Konkrete Token-IDs bleiben bei Empfängerauswahl und Kartendrop erhalten. Keine Verwechslung mehr zwischen gleichnamigen unverknüpften NSCs.
- Diagonal angrenzende Felder zählen auf quadratischen Rastern als 5 ft. Token-Größe, Szeneneinheiten, Höhe und Ebenen bleiben berücksichtigt.
- Die Token-Schnellaktion verwendet ein Canvas-Zeigerereignis statt des nicht dokumentierten `rightClickToken`-Hooks. Rechtsziehen zum Verschieben der Karte bleibt unverändert. Die HUD-Aktion bleibt zusätzlich verfügbar.

## Oberfläche und Währungen
- Überlagerte CSS-Versionen durch ein gemeinsames Handelslayout ersetzt. Leere Foundry-Buttonleisten belegen keinen Platz mehr; Münzeingaben werden nicht mehr durch alte Grid-Spalten zusammengequetscht.
- Beide Angebote nebeneinander, lesbare Itemnamen und Icons, kompakte Empfängerauswahl und Aktionen für Handel/Boden.
- Währungsnamen und Kürzel verwenden dieselbe Konfiguration und dieselben Speicherpfade wie das Inventar, einschließlich benutzerdefinierter Namen wie Redinium. Es findet keine automatische Umrechnung beim Handel statt; die konfigurierte Münze wird in der eingetragenen Menge übertragen.
- Plus öffnet und aktualisiert das vorhandene Inventar für den richtigen Actor und hebt es nach dem Rendern an.

## Prüfung und Grenzen
- `npm test`: Syntax/Manifest, Währungskurse, Rechte und Empfängerrouting, fremde sichtbare Tokens, NSC-Transfer, Menge/Bestand, beidseitige Zustimmung, Angebotsrevisionen, Ablehnung, Bewegung, Höhen/Ebenen, metrische Raster, Rollback, kein GM, Legacy-Transferblockade und Canvas-Rechtsklick-Gesten.
- Chromium-Layoutprüfung des tatsächlich erzeugten Handels-HTML mit dem vollständigen Modul-CSS bei 1280 und 600 Pixeln: Münzeingaben breit genug, leere Buttonleiste ausgeblendet, kein horizontaler Überlauf; Screenshot visuell geprüft. Wiederholbar mit Playwright und `node tests/trade-layout.cjs` (optional `CHROMIUM_EXECUTABLE`).
- Keine echte Foundry-v14-Welt mit getrennten GM-/Spielerclients verfügbar. Die Tests verwenden simulierte Foundry-Dokumente und Ereignisse; sie ersetzen keinen Mehrclient-Test in einer laufenden Welt.

Nach dem Modulupdate alle beteiligten Foundry-Clients vollständig neu laden. Im Modulmanager muss 1.7.4 stehen.
