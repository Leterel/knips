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

## 19.10.2026 — Eigener Ersttest und erneute Regression

ERSTTEST.md ergänzt: lokaler Browserablauf mit getrenntem zufälligem Testdatenordner,
Android-Emulator-Adresse und klare HTTPS-Voraussetzung für externe Geräte.
Node 24.19.0: alle 15 Backend-/Backup-/Servertests erneut bestanden.
Chrome-Browserprüfung mit synthetischem Bild bestanden: Registrierung, Neukodierung,
Upload, sichere Beschriftung, Sitzung nach Reload, Like, Kommentar, mobile Ansicht
und Kontolöschung. Der erste Sandbox-Lauf scheiterte an Loopback-EACCES; derselbe
Testlauf außerhalb bestand. Kein neuer Android- oder öffentlicher HTTPS-Test.

## 19.10.2026 — HTTPS-Paket und öffentliche Kontolöschung

Echten selbst hostbaren Compose-Stack ergänzt: nicht privilegierter Node-Container,
schreibgeschütztes Programmverzeichnis, isoliertes Backend ohne veröffentlichten
App-Port, persistente Daten-/TLS-Volumes, Caddy mit automatischem TLS. Neuer
Konfigurationsgenerator erstellt exklusiv eine private `.env` mit zufälligem
256-Bit-Einladungscode; lehnt ungeeignete Domain-/Konfigurations-Eingaben ab und
überschreibt keine vorhandenen Dateien. Deployment-, Update-, Backup- und
Restore-Ablauf in DEPLOYMENT.md beschrieben. Docker Compose akzeptiert die
Konfiguration (`config --quiet`); Linux-Docker-Daemon hier nicht gestartet,
deshalb Container-Build und öffentliche Zertifikatserteilung nicht ausgeführt.

Proxy-Ratenbegrenzung korrigiert: der isolierte Caddy übergibt eine überschriebene
Client-IP; normales lokales Knips vertraut fremden IP-Headern weiterhin nicht.
Tests prüfen getrennte IP-Limits, manipulierte Header und ungültige Adressen.
Container-Healthcheck prüft den realen Knips-Health-Endpunkt mit dem öffentlichen
Host und Knips-Kennung, einschließlich Negativtest mit falschem Host.

Neue öffentlich erreichbare Seite `/delete-account`: Erklärung der gelöschten
Daten und verbleibender Sicherungen/Moderatorschutzmarkierung, Link zur Anmeldung
direkt ins eigene Profil. Dort bleibt das bestehende passwortbestätigte Löschen
maßgeblich. Kein Android-Download nötig. Aktuelle offizielle Google-Play-Vorgabe
geprüft: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
Noch keine Store-Freigabe: Betreiberkontakt, Sicherungsaufbewahrung und echte
öffentliche Domain bleiben Betreiberentscheidungen.

Node 24.19.0: **18/18 Tests bestanden** außerhalb der Loopback-blockierenden
Sandbox. Chrome-Smoketest mit synthetischem Foto bestanden, jetzt zusätzlich
anonyme Löschseite, korrekter Anmeldemodus, mobiler Überlaufcheck und Link von der
Löschseite bis zur tatsächlichen bestätigten Kontolöschung. Mobile Löschseite
anhand Screenshot visuell geprüft. Kein physisches Gerät verwendet.
