# AAB für den Play-Upload signieren

Der normale Build bleibt unsigniert. Das separate Werkzeug signiert ausschließlich
ein bereits gültiges unsigniertes AAB mit einem eigenen Upload-Schlüssel und prüft
die Signatur streng sowie anschließend erneut mit bundletool. Node.js 24 und JDK 21
werden benötigt. Es überträgt nichts an Google Play.

## Eigenen Schlüssel außerhalb des Repositorys verwenden

In einem frischen PowerShell-Terminal die Pfade setzen und die Passwörter verdeckt
eingeben. Keine Passwörter in Skripte, Git, Kommandozeilenargumente oder Chat schreiben.

```powershell
$env:JAVA_HOME = 'C:/Java/jdk-21'
$env:UPLOAD_KEYSTORE = 'D:/private-keys/meine-app-upload.p12'
$env:UPLOAD_KEY_ALIAS = 'upload'
$env:UPLOAD_STORE_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Keystore-Passwort')).Password
$env:UPLOAD_KEY_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Schluessel-Passwort')).Password
node tools/sign-bundle.mjs --bundle 'C:/Builds/app-release-unsigned.aab' --bundletool 'C:/Tools/bundletool-all-1.18.3.jar' --output 'C:/Builds/upload-neu'
```

Passwörter anschließend mit `Remove-Item Env:UPLOAD_STORE_PASSWORD, Env:UPLOAD_KEY_PASSWORD`
entfernen und das Terminal schließen. Das Ausgabeziel muss neu sein. Im Erfolgsfall
entstehen `app-upload-signed.aab` und `signing-result.json` mit Datei- und Zertifikathash.
Es werden keine Passwörter oder Keystores in den Ergebnisbericht kopiert.

Falls noch kein Upload-Schlüssel existiert, kann er nach dem Setzen der obigen
Umgebungsvariablen lokal erzeugt werden. Einen **neuen** Pfad wählen; keine bestehenden
Schlüssel ersetzen. Keystore und Passwörter getrennt und offline sichern.

```powershell
& "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -storetype PKCS12 -keystore $env:UPLOAD_KEYSTORE -alias $env:UPLOAD_KEY_ALIAS -storepass:env UPLOAD_STORE_PASSWORD -keypass:env UPLOAD_KEY_PASSWORD -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Upload Key' -noprompt
```

Bei PKCS12 dasselbe Passwort für Store und Schlüssel verwenden. Für ein bereits in
Play registriertes Paket muss der dort registrierte Upload-Schlüssel verwendet
werden; ein beliebig neu erzeugter Schlüssel ersetzt ihn nicht. Das Werkzeug
akzeptiert keine Android-Debugschlüssel, abgelaufenen/kurzlebigen Zertifikate oder
schwachen Schlüssel. Es überschreibt keine frühere Ausgabe und signiert kein bereits
signiertes Eingabepaket erneut.

## Geprüfter Umfang

Regressionen mit echtem AAB und eigens erzeugtem temporärem Testschlüssel:

```powershell
$env:SIGN_TEST_BUNDLE = 'C:/Builds/app-release-unsigned.aab'
$env:SIGN_TEST_BUNDLETOOL = 'C:/Tools/bundletool-all-1.18.3.jar'
node --test test/sign-bundle.test.mjs
```

Geprüft: echte Signatur, Zertifikatabgleich, strenge jarsigner-Prüfung,
bundletool-Validierung, Zurückweisung von Debugalias, Wiederholung, bereits
signiertem Input und ungültigem Bundle. Testschlüssel werden anschließend entfernt.
Ohne die Testpfade werden die beiden Integrationstests ausdrücklich ausgelassen.

Ein signiertes AAB ist noch kein Store-Release. Betreiberangaben, Privacy-URL,
Data Safety, Inhaltseinstufung, Grafiken, Play-Console-Einrichtung und bei Werbung
Produktivkennungen/Consent-Nachweise müssen zum tatsächlich gewählten Build passen.
Die Signierung allein bestätigt weder Zulassung noch Monetarisierung.
