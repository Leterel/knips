# Knips mit HTTPS selbst hosten

Voraussetzungen: eigener Linux-Server mit Docker Engine und Compose v2, eigene
Domain und DNS-Zugriff. Diese Dateien bestellen keinen Server und verursachen
keine Dienstbuchung. Für einen kleinen privaten Nutzerkreis gedacht.

## Erster Start

1. Repository auf dem Server auschecken. DNS-A/AAAA-Einträge der Domain auf den
   Server setzen; einen AAAA-Eintrag nur mit funktionierendem IPv6 verwenden.
   TCP 80 und 443 sowie optional UDP 443 müssen erreichbar und frei sein.
2. Mit Node 24 die Konfiguration erstellen:

   ```sh
   node tools/configure-deployment.mjs fotos.deine-domain.de
   ```

   Alternativ ohne lokale Node-Installation (Linux; UID/GID des aktuellen Nutzers):

   ```sh
   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/app" -w /app node:24.19.0-bookworm-slim node tools/configure-deployment.mjs fotos.deine-domain.de
   ```

   Der Generator erstellt exklusiv `.env`, auf Linux mit Modus 0600, mit einem
   zufälligen 256-Bit-Einladungscode. Vorhandene Dateien werden nicht überschrieben.
   Den Code privat aus `.env` weitergeben. Die Datei bleibt durch `.gitignore`
   außerhalb von Git und durch `.dockerignore` außerhalb des Container-Builds.
3. Konfiguration und Start:

   ```sh
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   docker compose logs --tail=50 caddy knips
   ```

   Caddy beschafft und erneuert automatisch ein öffentliches TLS-Zertifikat.
   Knips veröffentlicht keinen eigenen Host-Port. Datenbank/Fotos und TLS-Daten
   liegen in getrennten persistenten Docker-Volumes. Die App läuft ohne Root,
   ohne Linux-Capabilities und mit schreibgeschütztem Programmverzeichnis.
4. In einem Browser `https://fotos.deine-domain.de` öffnen. Mit Node 24 vom
   eigenen Rechner die anonyme Prüfung ausführen:

   ```sh
   KNIPS_SERVER_URL=https://fotos.deine-domain.de node tools/check-server.mjs
   ```

   Dann Registrierung mit Einladung, synthetischen Foto-Upload, Reload,
   Anmeldung und Kontolöschung nach ERSTTEST.md prüfen. Einen zweiten Browser
   beziehungsweise ein zweites Netzwerk verwenden. Android bekommt dieselbe
   HTTPS-Adresse. Ein erfolgreicher `/health`-Check allein belegt keinen Upload.

## Moderation und Zugang

Eigenes Moderatorkonto zunächst mit Einladung registrieren. In `.env`
`KNIPS_MODERATORS=dein_nutzername` eintragen und `docker compose up -d` ausführen.
Für mehrere Namen Kommas verwenden. Nicht vorhandene Konten verhindern den Start.
Mit `KNIPS_REGISTRATION=closed` und `docker compose up -d` neue Registrierungen
sperren. Bereits registrierte Nutzer behalten ihren Zugang.

`KNIPS_TRUST_PROXY=1` ist nur im isolierten Compose-Netz gesetzt: Caddy überschreibt
`X-Knips-Client-IP` mit der tatsächlich verbundenen IP. Dadurch sperrt das
Anmeldelimit nicht alle Nutzer gemeinsam. Niemals den Knips-Port bei aktivem
Proxyvertrauen direkt veröffentlichen. Bei einem zusätzlichen vorgeschalteten
Proxy/CDN muss das IP-Vertrauensmodell angepasst werden; die mitgelieferte
Konfiguration erwartet direkte Verbindungen zu Caddy.

## Sicherung, Update und Wiederherstellung

Einmal einen privaten Sicherungsordner erstellen, für den Container-Nutzer UID
1000 beschreibbar. Die folgenden Befehle sind für Linux und das Projektverzeichnis:

```sh
sudo install -d -m 700 -o 1000 -g 1000 /srv/knips-backups
docker compose stop knips
docker compose run --rm --no-deps -v /srv/knips-backups:/backups knips node tools/backup.mjs /data /backups/vor-update-2026-10-19
docker compose up -d knips
```

Immer einen neuen Sicherungsnamen wählen. Der Server muss bis zum erfolgreichen
Backup beendet bleiben. Bei einem Backup-Fehler Ursache prüfen und nicht blind
aktualisieren. Backups enthalten Passworthashes und private Fotos; zusätzlich auf
einem zweiten privaten Datenträger sichern. Nach einem harten Abbruch kann eine
Datensperre verbleiben; dafür gilt die Lock-Anleitung in README.md.

Nach erfolgreichem Backup `git pull --ff-only` und `docker compose up -d --build`
ausführen. Erreichbarkeit und Foto-Upload erneut prüfen. **Kein** `docker compose
down -v` verwenden: Das würde auch Daten und TLS-Volumes löschen.

Ein Backup zuerst in einen neuen Ordner wiederherstellen:

```sh
docker compose stop knips
docker compose run --rm --no-deps -v /srv/knips-backups:/backups knips node tools/restore.mjs /backups/vor-update-2026-10-19 /data/restored-2026-10-19
```

Anschließend in `compose.yaml` unter der Knips-Umgebung
`DATA_DIR: /data/restored-2026-10-19` ergänzen und `docker compose up -d knips`
ausführen. Der alte Datenbestand bleibt erhalten. Bei weiteren Backups den
neuen DATA_DIR-Pfad statt `/data` angeben. Wiederhergestellte Sitzungen sind
widerrufen, alle Nutzer müssen sich neu anmelden.

## Verifizierungsstand

Generator und Proxy-Ratenbegrenzung sind automatisiert getestet; die Compose-Datei
ist syntaktisch mit Docker Compose geprüft. In der aktuellen Arbeitsumgebung
läuft kein Docker-Linux-Daemon. Container-Build, Caddy-Start, DNS, Zertifikatserteilung
und echte externe HTTPS-/Android-Verbindungen sind deshalb noch nicht praktisch
bestätigt. Ohne eigene Domain und Server ist der öffentliche Betrieb weiterhin offen.

Am 21.10.2026 erneut tatsächlich geprüft: Docker Desktop ist installiert,
sein Backend beendet sich jedoch vor Enginebereitschaft beim Zugriff auf
`sailor-ingest.sock`. Auch der zweite Docker-Kontext und Ubuntu/WSL bieten
keine erreichbare eigenständige Engine. Es wurden keine Container/Volumes
oder öffentlichen Ports angelegt. Vollständiger Befund:
[CONTAINER-CHECK-20261021.md](CONTAINER-CHECK-20261021.md).

Für die spätere Play-Console-Angabe ist die eigene HTTPS-Adresse mit
`/delete-account` vorgesehen. Die Seite ist ohne Anmeldung erreichbar und führt
zur geschützten Browser-Kontolöschung. Vor Veröffentlichung Betreiberkontakt,
konkrete Sicherungsaufbewahrung und Datenschutzerklärung ergänzen. Die Seite
ersetzt keine Store-Prüfung. Grundlage: [Google Play: Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), geprüft am 19.10.2026.

Vor einem Restore kann das Backup ohne Zielordner geprüft werden:
`node tools/backup-check.mjs /backups/vor-update-2026-10-19` im selben
Wartungscontainer ausführen. Die Sicherung muss für die temporäre Wartungssperre
beschreibbar sein. Danach gilt weiterhin die Probe-Anmeldung/Foto-Prüfung im
wiederhergestellten Server. Dieser Befehl ist lokal getestet; kein neuer
Containerlauf oder öffentlicher Servernachweis wird damit behauptet.
