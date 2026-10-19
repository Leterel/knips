# Fortschritt — 2026-10-01

## 19.10.2026 — Erreichbarkeit prüfen

Neues Werkzeug `tools/check-server.mjs` prüft einen laufenden Knips-Server ohne
Schreibzugriffe. HTTPS außer Loopback, feste Zeit-/Antwortgrößenlimits und keine
Weiterleitungen. Health-Antwort nennt jetzt den Dienst. Fremde Server,
fehlerhafte Konfiguration/Sitzungen und hängende Antworten werden abgelehnt.
Alle 15 Backend-, Backup- und Serverprüfungen bestanden, ausschließlich lokal
mit synthetischen Daten. Ein öffentlicher HTTPS-Server ist weiterhin nicht getestet.

## 17.10.2026 — Datenbetrieb

Offline-Backup und Wiederherstellung implementiert: Datenbank plus referenzierte
Fotos, Prüfsummen, neue Zielordner, keine alten Sitzungen im Backup.
Gemeinsame Datenordnersperre für Server und Wartung; Fehler beim Start räumen
die eigene Sperre auf. Bestehende Daten und Backups werden nicht überschrieben.
Zwölf Backend-/Sicherungsprüfungen bestanden; darunter echter Login und Fotoabruf
aus einer wiederhergestellten Sicherung sowie abgelehnte unvollständige/manipulierte
Backups. Nur temporäre synthetische Testdaten verwendet.

Am 19.10.2026 erneut bestanden: alle zwölf Prüfungen sowie die Chrome-Abläufe
für Upload, Sitzung, Interaktionen, Kontolöschung und Einladungsregistrierung.

## 08.10.2026 — Zugang und Sitzungen

Optionale Einladungscodes und geschlossene Registrierungen implementiert.
Moderatorrollen bleiben an die ursprüngliche Kontoidentität gebunden, auch wenn
ein Name nach Kontolöschung neu vergeben wird. Laufende Uploads und Kommentare
prüfen vor dem Speichern erneut Sitzung und Blockierung.
Acht HTTP/SQLite-Szenarien und mobiler Chrome-Test für Einladung/Anmeldung bestanden.
Die Sandbox blockierte lokale Verbindungen; der genehmigte Lauf außerhalb bestand.

## Umgesetzt

Persistente Konten/Sitzungen und SQLite-Datenbank; Foto-Upload, chronologischer Feed,
Profile, Likes, Kommentare, Beitragslöschung. Meldungen werden gespeichert.
Blockierung verhindert gegenseitigen Zugriff auch auf direkte Foto-URLs.
Kontolöschung prüft das Passwort und entfernt abhängige Datensätze und Fotos.
Responsive Oberfläche mit Blockierliste und Kontolöschdialog.
Android-WebView-Client mit Serverauswahl und System-Dateiauswahl.

## Heute tatsächlich geprüft

- Alle 5 HTTP/SQLite-Integrationsszenarien bestanden, einschließlich Serverneustart,
  Zugriffsgrenzen, CSRF, Host-Validierung, Pagination und Kontolöschung.
- Echter Chrome-Browser: Registrierung, Bildauswahl und JPEG-Neukodierung, Upload,
  sichere Textdarstellung, Sitzung nach Reload, Like, Kommentar und Kontolöschung.
- Mobile Ansicht 390 x 844 ohne horizontalen Überlauf; Desktop 1280 x 900.
  Screenshots unter `test-results/browser/` (lokale Testbelege).

## Noch offen

Öffentlicher HTTPS-Betrieb; Betriebsrichtlinien; Play-Store-Paket und Werbeintegration.
Die bestehende APK vom 28.09. ist ein Entwicklungsbuild, kein Store-Release.

## Android-Emulator am 01.10.2026
API-34-Emulator emulator-5570, QEMU vor jeder Aktion geprüft: APK installiert,
lokaler Server verbunden, Testkonto in WebView registriert, System-Dateiauswahl
geöffnet, synthetische PNG gewählt, Vorschau angezeigt, Beitrag hochgeladen und
im Feed wiedergefunden. Kein physisches Gerät verwendet. Andere Android-Versionen,
öffentlicher HTTPS-Betrieb und Android-Löschdialoge bleiben offen.
Die oben genannte offene Android-Upload-Prüfung ist damit erledigt.
Belege: outputs/knips/emulator-verification-20260928/oct01-* im Projekt-Arbeitsbereich.

## 07.10.2026 — Moderation

Geschützte Moderationsansicht mit gemeldeten Bildern und Gründen. Meldungen schließen
oder den Beitrag entfernen; Rollen ausschließlich über Serverkonfiguration für
bestehende Konten. Sechs HTTP/SQLite-Tests bestanden, einschließlich Rollen-/Bildzugriff.
Neuer mobiler Chrome-Test prüft Anmeldung, Bildansicht, sichere Textdarstellung,
bestätigte Entfernung und aktualisierte Warteschlange. Der bisherige Browserablauf
mit Upload/Like/Kommentar/Kontolöschung besteht ebenfalls. Keine neuen Gerätetests.

Browser-`prompt`/`confirm` wurden für Melden, Blockieren und Löschen durch eigene
HTML-Dialoge ersetzt, damit Android WebView und Desktop dieselbe Bedienung verwenden.
Die Moderations- und Browserabläufe bestehen nach dieser Änderung erneut.

Zusätzlich wurde ein unsigniertes Android-AAB gebaut (11.875 Bytes). BundleConfig,
Manifest, DEX und Ressourcen sind vorhanden. Kein Play-Upload oder Produktionsschlüssel.
