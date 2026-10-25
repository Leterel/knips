# Knips

Erster eigener Test: [Kurzanleitung](ERSTTEST.md).

Kleine selbst hostbare Foto-App mit Android-Client. Konten, Foto-Feed, Profile,
Likes, Kommentare, eigene Beiträge löschen, Melden, Blockieren und Kontolöschung.
Prototyp für einen kleinen vertrauenswürdigen Nutzerkreis; kein fertiger öffentlicher Dienst.

## Schnell ausprobieren, ohne bestehende Daten

`Start-Demo.cmd` doppelt anklicken oder `npm run demo` ausführen. Die angezeigte
lokale Adresse im Browser öffnen. Keine npm-Installation und keine Konfiguration
nötig; Node.js 24.14 oder neuer aus der 24er Reihe verwenden.
Jeder Start erzeugt einen eigenen Testdatenordner und freien Loopback-Port,
unabhängig von bestehenden Server-Umgebungsvariablen. Strg+C beendet den
Testserver. Der Testordner bleibt erhalten; ein späterer Demo-Start beginnt neu.
Für normalen dauerhaften Betrieb den folgenden Startweg verwenden.

## Lokal starten

Node.js 24.14 oder neuer aus der 24er Reihe installieren. Keine Server-Abhängigkeiten nötig.

```sh
npm start
```

Im Browser http://127.0.0.1:8790 öffnen. Daten bleiben unter `data/` (SQLite und Fotos).
Sicherung und Wiederherstellung sind unten beschrieben. Vor der Sicherung Server stoppen.

Für den Android-Emulator in PowerShell:

```powershell
$env:PUBLIC_ORIGIN='http://10.0.2.2:8790'
npm start
```

Dann diese Adresse in der APK eintragen. Android-Build: [ANDROID.md](ANDROID.md).
Für externe Geräte braucht ihr einen selbst gehosteten erreichbaren HTTPS-Server:
`PUBLIC_ORIGIN=https://eure-domain` setzen und einen TLS-Reverse-Proxy vor den lokalen
Node-Port schalten. Host und Origin müssen übereinstimmen. Dafür enthält
[DEPLOYMENT.md](DEPLOYMENT.md) einen Docker-Compose-Weg mit Caddy-TLS,
privater Einladungskonfiguration, Datensicherung und Wiederherstellung.

## Tests

### Einen laufenden Server prüfen

```powershell
$env:KNIPS_SERVER_URL='https://deine-knips-domain.example'
node tools/check-server.mjs
```

Prüft Knips-Kennung, Registrierungsmodus und anonyme Sitzung, ohne Konten,
Fotos oder Anmeldesitzungen anzulegen. HTTPS ist vorgeschrieben; für lokale
Tests sind `http://127.0.0.1:8790`, `http://localhost:8790` und IPv6-Loopback erlaubt.
Weiterleitungen, ungültige Zertifikate, fremde Loginportale, übergroße Antworten
und ausbleibende Antworten gelten als Fehler. Exitcode 0 bedeutet erreichbar,
Exitcode 1 fehlgeschlagen. Dies ersetzt keinen echten Upload-/Browsertest.
Ältere Server ohne Knips-Kennung in `/health` zuerst aktualisieren.

### Automatisierte Tests

```sh
npm test
```

Browserprüfung: Playwright installieren bzw. `PLAYWRIGHT_MODULE` auf dessen `index.mjs`
setzen; dann `node test/browser-smoke.mjs`. Benötigt installiertes Google Chrome.
Sie verwendet ausschließlich synthetische Testdaten, einen temporären Server und Datenordner.

## Moderation

Neue Konten lassen sich mit `KNIPS_REGISTRATION=closed` sperren. Bestehende
Konten können sich weiterhin anmelden. Mit `KNIPS_REGISTRATION=invite` und einem
privaten `KNIPS_INVITATION_CODE` (16 bis 256 Zeichen) ist für neue Konten ein
Einladungscode nötig. Ohne diese Einstellung bleibt der lokale Prototyp offen.
Den Code nur privat weitergeben und niemals in Git einchecken.

Zuerst ein eigenes Moderatorkonto normal anlegen. Anschließend den Server stoppen,
`KNIPS_MODERATORS=dein_nutzername` setzen und neu starten (mehrere Namen mit Komma).
Nicht vorhandene Konten werden abgelehnt; niemand erhält die Rolle über ein Formular.
Unter **Mein Profil → Meldungen prüfen** lassen sich gemeldete Bilder ansehen,
Meldungen schließen oder Beiträge samt Foto, Likes und Kommentaren entfernen.
Jeweils bis zu 50 Meldungen werden geladen. Beim Löschen eines Moderatorkontos
dessen Namen auch aus der Serverkonfiguration entfernen, bevor der Server neu startet.
Die ursprüngliche Moderatoridentität wird gespeichert: Ein neu angelegtes Konto
mit demselben Namen erhält auch nach Neustart keine alte Rolle. Für einen neuen
Moderator ein Konto mit anderem Namen verwenden.
Browserprüfung: `node test/moderation-browser.mjs` mit derselben Playwright-Einrichtung.

## Grenzen

- Alle angemeldeten Konten können Fotos sehen, soweit keine Blockierung besteht.
- Registrierungen sind standardmäßig offen; Einladungscode oder geschlossene
  Registrierung vor einem privaten Betrieb ausdrücklich konfigurieren.
- Moderation erfolgt manuell durch konfigurierte Konten. Betreiber, Regeln und
  verlässliche Bearbeitung müssen vor öffentlichem Betrieb festgelegt werden.
- Kein Passwort-Reset, keine E-Mail-Verifikation, keine Push-Mitteilungen.
- Der Client kodiert Fotos neu und entfernt dadurch Metadaten. Die Upload-API allein
  garantiert keine Metadatenentfernung für fremde Clients.
- Kein AdMob und keine Store-Freigabe. Ein unsigniertes, validiertes AAB existiert.
  Betreiberangaben,
  Datenschutzerklärung und die öffentliche Domain müssen vor Veröffentlichung ergänzt werden.
  Die anonyme Seite `/delete-account` verlinkt zur bestehenden passwortbestätigten
  Kontolöschung im Browser, ohne dass die Android-App installiert sein muss.
  Betreiberkontakt und Sicherungsaufbewahrung müssen für den realen Betrieb festgelegt werden.
- Entwicklungs-APK; Signaturschlüssel und Nutzerdaten bleiben außerhalb von Git.

Aktuelle Prüfergebnisse: [PROGRESS.md](PROGRESS.md).

## Datensicherung und Wiederherstellung

Server beenden, dann mit Node 24 eine neue Sicherung erstellen:

```sh
node tools/backup.mjs ./data ./backup-2026-10-17
node tools/backup-check.mjs ./backup-2026-10-17
node tools/restore.mjs ./backup-2026-10-17 ./restored-data
```

Die Elternordner der Ziele müssen existieren. Beide Werkzeuge verlangen neue
Zielordner und überschreiben keine bestehenden Daten. Danach `DATA_DIR` auf
den wiederhergestellten Ordner setzen und normal starten. Konten, Fotos und
Moderatoridentitäten bleiben erhalten. Alle müssen sich nach der Wiederherstellung
neu anmelden; aktive Sitzungen werden nicht gesichert. Das ursprüngliche Datenverzeichnis
bleibt unverändert. Backups enthalten private Kontodaten und Fotos: privat aufbewahren.

`backup.json` enthält Prüfsummen für Datenbank und referenzierte Fotos. Ein
`INCOMPLETE`-Marker kennzeichnet eine fehlgeschlagene Sicherung. Unvollständige
Wiederherstellungen bleiben gesperrt. Der Server und Wartungswerkzeuge teilen
eine `.knips.lock`-Datei; Sicherungen während des Serverbetriebs werden abgelehnt.
Nach einem Absturz erst sicherstellen, dass kein Knips-Prozess diesen Ordner
verwendet, dann eine zurückgebliebene `.knips.lock` manuell entfernen. Die Sperre
wird absichtlich nicht allein anhand einer möglicherweise wiederverwendeten PID entfernt.

### Sicherung prüfen, ohne sie wiederherzustellen

`node tools/backup-check.mjs BACKUPORDNER` prüft Manifest, SHA256 jeder Datei,
SQLite-Integrität und Fremdschlüssel, leere Sitzungen sowie die Übereinstimmung
zwischen Fotoliste und Datenbank. Exitcode 0 und `passed:true` bedeuten bestanden;
Fehler liefern Exitcode 1. Der Bericht nennt nur Format und Anzahl von Dateien/
Fotos, keine Kontonamen, Passworthashes oder Fotoinhalte. Es entsteht kein
Wiederherstellungsordner. Ziel ist eine eigene Knips-Sicherung, kein fremdes SQL.

Während der Prüfung schützt die übliche temporäre `.knips.lock` vor paralleler
Wartung; danach wird sie entfernt. Die Datenbank wird in einem eigenen temporären
Prüfordner gelesen, der anschließend gelöscht wird. Das vermeidet SQLite-WAL-/
SHM-Hilfsdateien im Backup. Foto-Prüfsummen werden als Datenstrom berechnet.
Eine erfolgreiche Prüfung ersetzt keine zweite Sicherung oder Probe-Anmeldung
nach einer echten Wiederherstellung. Restore benutzt dieselbe Prüflogik.
