# Knips

Kleine selbst hostbare Foto-App mit Android-Client. Konten, Foto-Feed, Profile,
Likes, Kommentare, eigene Beiträge löschen, Melden, Blockieren und Kontolöschung.
Prototyp für einen kleinen vertrauenswürdigen Nutzerkreis; kein fertiger öffentlicher Dienst.

## Lokal starten

Node.js 24.14 oder neuer aus der 24er Reihe installieren. Keine Server-Abhängigkeiten nötig.

```sh
npm start
```

Im Browser http://127.0.0.1:8790 öffnen. Daten bleiben unter `data/` (SQLite und Fotos).
Vor einem Backup Server stoppen und den gesamten Datenordner sichern.

Für den Android-Emulator in PowerShell:

```powershell
$env:PUBLIC_ORIGIN='http://10.0.2.2:8790'
npm start
```

Dann diese Adresse in der APK eintragen. Android-Build: [ANDROID.md](ANDROID.md).
Für externe Geräte braucht ihr einen selbst gehosteten erreichbaren HTTPS-Server:
`PUBLIC_ORIGIN=https://eure-domain` setzen und einen TLS-Reverse-Proxy vor den lokalen
Node-Port schalten. Host und Origin müssen übereinstimmen. Keine Bereitstellung enthalten.

## Tests

```sh
npm test
```

Browserprüfung: Playwright installieren bzw. `PLAYWRIGHT_MODULE` auf dessen `index.mjs`
setzen; dann `node test/browser-smoke.mjs`. Benötigt installiertes Google Chrome.
Sie verwendet ausschließlich synthetische Testdaten, einen temporären Server und Datenordner.

## Grenzen

- Alle angemeldeten Konten können Fotos sehen, soweit keine Blockierung besteht.
- Registrierungen sind offen. Vor öffentlichem Betrieb fehlen Einladungen oder eine
  entsprechende Zugangskontrolle, moderierter Betrieb und belastbare Betriebsgrenzen.
- Meldungen werden gespeichert; es gibt noch keine Moderationsoberfläche und keine
  automatische Bearbeitung. Nicht als fertig moderiertes Netzwerk veröffentlichen.
- Kein Passwort-Reset, keine E-Mail-Verifikation, keine Push-Mitteilungen.
- Der Client kodiert Fotos neu und entfernt dadurch Metadaten. Die Upload-API allein
  garantiert keine Metadatenentfernung für fremde Clients.
- Kein AdMob, kein Play-Store-AAB, keine Store-Freigabe. Betreiberangaben,
  Datenschutzerklärung und öffentliche Löschmöglichkeit müssen vor Veröffentlichung ergänzt werden.
- Entwicklungs-APK; Signaturschlüssel und Nutzerdaten bleiben außerhalb von Git.

Aktuelle Prüfergebnisse: [PROGRESS.md](PROGRESS.md).
