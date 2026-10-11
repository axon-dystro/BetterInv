# Axon's Inventory v1.6.4

Dieses Release veröffentlicht die zehn seit v1.6.3 hinzugekommenen Commits vom 10. bis 13. September 2026.

## Neu
- Eigene Item-Bilder beim Erstellen direkt vom PC nach Foundry hochladen.
- Bodenobjekte automatisch an ausgerüstete Gegenstände und Charakter-Tokens koppeln, ohne das eigentliche Item aus dem Inventar zu entfernen.
- Angeheftete Objekte folgen Tokens; manuelles Verschieben löst sie wieder. Der Aktionsdialog kann Objekte erneut anheften oder lösen.
- Lichtaktionen auf Bodenobjekten funktionieren auch bei automatisch an Tokens befestigten Items.
- Spieler können Bodenobjekte auswählen, verschieben, frei skalieren und drehen, sofern die GM-Rechte dies erlauben. `M` + Mausrad skaliert, `N` + Mausrad dreht.
- Größe und Drehung können direkt im Item-Bodenprofil erhalten bleiben.

## Korrekturen und Leistung
- Licht- und Dunkelheitsradien werden für metrische Szenen und andere Szeneneinheiten korrekt aus Fuß umgerechnet.
- An Bodenobjekte gebundene Lichtquellen bewegen sich flüssiger und verursachen weniger Render-Aufwand beim Ziehen.
- Bodenbeute mit Sichtbarkeit „Immer“ wird Spielern nicht fälschlich durch eine zusätzliche Sichtlinienprüfung verborgen.
- Verbesserungen an Foundry-VTT-14-Dialogen und der Übertragung von Items zwischen Spielern.
- Zusätzliche GM-Sperren für Bewegung, Skalierung, Rotation, Aktivierung und Bearbeitung der Bodeneffekte.

## Kompatibilität
- Foundry VTT 14
- D&D 5e 5.3.3
- Ausgehend von den Angaben im Modulmanifest; keine Live-Tests einer vollständigen Foundry-Welt.

## Installation / Update
Manifest-URL: https://github.com/axon-dystro/BetterInv/releases/latest/download/module.json

Diese Veröffentlichung enthält `betterinv.zip` und das zugehörige `module.json` (Version 1.6.4). 
