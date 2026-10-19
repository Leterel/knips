# Knips zum ersten Mal ausprobieren

## Am Windows-PC im Browser

Node.js 24.14 oder neuer aus der 24er Reihe verwenden. In diesem Repository ein
neues PowerShell-Terminal öffnen. Ein eigener zufälliger Testdatenordner erhält
bestehende Konten und Fotos im normalen `data`-Ordner:

```powershell
$env:DATA_DIR = Join-Path ([System.IO.Path]::GetTempPath()) ('knips-ersttest-' + [guid]::NewGuid().ToString('N'))
$env:HOST = '127.0.0.1'
$env:PORT = '8790'
$env:PUBLIC_ORIGIN = 'http://127.0.0.1:8790'
$env:KNIPS_REGISTRATION = 'open'
Remove-Item Env:KNIPS_MODERATORS, Env:KNIPS_INVITATION_CODE -ErrorAction SilentlyContinue
$env:DATA_DIR
npm start
```

Den ausgegebenen Testordner notieren. Im Browser **http://127.0.0.1:8790** öffnen:

1. Ein Testkonto anlegen und ein eigens dafür ausgewähltes Testbild hochladen.
2. Seite neu laden: Anmeldung und Beitrag müssen erhalten bleiben.
3. In einem privaten Browserfenster ein zweites Konto anlegen, den Beitrag liken
   und kommentieren. Im ersten Fenster müssen die Änderungen nach Aktualisierung erscheinen.
4. Mit dem zweiten Konto den ersten Nutzer blockieren: dessen Beitrag darf dort
   auch nach Neuladen nicht mehr erscheinen. Blockierung wieder aufheben.
5. Mit dem ersten Konto den eigenen Beitrag löschen. Danach das Testkonto unter
   „Mein Profil“ mit Passwortbestätigung löschen und die Abmeldung prüfen.

Server mit Strg+C stoppen. Das normale `data/` bleibt unberührt. Die Daten im
notierten Testordner bleiben für eine spätere Prüfung erhalten. Dieses Terminal
schließen, damit seine Testkonfiguration nicht für den normalen Betrieb gilt.
Port belegt? Den bereits laufenden Server identifizieren; nicht blind beenden.

## Android-Emulator

Den Browser-Testserver zuerst stoppen. Im selben Testterminal
`$env:PUBLIC_ORIGIN = 'http://10.0.2.2:8790'` setzen und `npm start` erneut starten.
Im ausdrücklich ausgewählten Android-Emulator die Entwicklungs-APK öffnen und
`http://10.0.2.2:8790` als Server eintragen. Ein Testbild über die System-Dateiauswahl
hochladen und nach Neuladen prüfen. Diese Adresse funktioniert nur im Emulator.
Bauen und weitere Grenzen: [ANDROID.md](ANDROID.md).

## Externe Geräte

Dafür fehlt noch ein erreichbarer HTTPS-Server. Die APK enthält kein Backend.
Nach Einrichtung zuerst [die Serverprüfung](README.md#einen-laufenden-server-prüfen)
ausführen. Vor privatem Betrieb Einladungsregistrierung konfigurieren und
Datensicherung nach [README.md](README.md) einrichten. Der lokale Browser-Test
belegt weder öffentlichen Betrieb noch einen Android-Upload.
