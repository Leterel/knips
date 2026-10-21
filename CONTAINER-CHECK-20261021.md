# Knips — tatsächliche Container-Prüfung, 21.10.2026

## Ergebnis: vor dem Containerbuild blockiert

Die vorhandene Docker-Installation wurde live geprüft: Docker CLI **29.8.0**,
Compose **5.5.1**, Kontext `desktop-linux`. `docker version` meldet keinen
Server, weil die Named Pipe `dockerDesktopLinuxEngine` nicht existiert.
Auch der alternative bereits vorhandene Kontext `default` erreicht keine
Engine (`docker_engine` fehlt ebenfalls).

Der vorhandene Docker Desktop wurde einmal im Hintergrund gestartet, ohne
Installation, Adminschalter oder Konfigurationsänderung. Sein Backend beendet
sich beim Start des Ingestservers. Die aktuelle lokale Logmeldung lautet:

```text
starting services: initializing Ingest server:
.../Docker/run/sailor-ingest.sock -> .../Docker/run/sailor-ingest.sock.stale:
Das System kann auf die Datei nicht zugreifen.
```

Beleg: jüngster Backendstart am 21.10.2026 gegen 19:03 Uhr Europe/Berlin,
lokales `%LOCALAPPDATA%/Docker/log/host/com.docker.backend.exe.log`.
Danach kein laufender Docker-Desktop-/Backendprozess und keine Engine-Pipe.
Die genaue Ursache des Socketzugriffs ist damit noch nicht bestimmt.

Ubuntu/WSL wurde zusätzlich rein lesend geprüft: kein installiertes `docker`,
`dockerd` oder `podman` im PATH und kein `/var/run/docker.sock`. Es gibt dort
keine bereits verfügbare eigenständige Engine für einen alternativen Test.
Die WSL-Distribution wurde für diese Abfrage gestartet; kein Dienst installiert
oder eingeschaltet.

## Was ausdrücklich nicht ausgeführt wurde

Kein Imagebuild, Containerstart, Volume-/Persistenzlauf oder Container-Healthtest
war möglich. Es wurden keine Container/Volumes angelegt, vorhandene beendet
oder gelöscht, keine Ports geöffnet und keine Domains/DNS-Einträge eingerichtet.
Kein Reset, Socket-Löschen, WSL-Neuregistrieren oder Docker-Neuinstallieren.
Öffentliche TLS-/Caddy-Zertifikate und externer HTTPS-Betrieb bleiben ungeprüft.

Nach Wiederherstellung einer funktionierenden Engine ist der nächste konkrete
Test ein Imagebuild und ein isolierter lokaler Container mit einem eigenen
neuen Datenvolume: Healthcheck, synthetische Registrierung/Fotoupload,
Container-Neuerstellung bei erhaltenem Volume, erneute Anmeldung und Fotolesen.
Das darf ausschließlich Loopback/Testnetz verwenden und ersetzt keine
öffentliche TLS-Prüfung. Die hier dokumentierte Blockierung ist kein Erfolg
dieses noch ausstehenden Ablaufs.
