# Fortschritt — 2026-10-01

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
