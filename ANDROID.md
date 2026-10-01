# Knips auf Android

Der Android-Prototyp enthält eine native Serverauswahl und zeigt die responsive
Knips-App in Androids WebView. Konten, Fotos und Beiträge liegen auf eurem
selbst gehosteten Knips-Server. Die APK enthält keinen öffentlich bereitgestellten
Server und funktioniert nicht als unabhängiges soziales Netzwerk ohne Backend.

## Starten

1. Den Server nach [README.md](README.md) starten.
2. `knips-0.1.0.apk` auf Android 8 oder neuer installieren und öffnen.
3. Über **Server** die HTTPS-Adresse eintragen. Konto erstellen oder anmelden.
4. Ein Foto über die System-Dateiauswahl auswählen, beschriften und veröffentlichen.

Für den Android-Emulator kann der lokal auf dem PC laufende Server über
`http://10.0.2.2:8790` erreicht werden. Das ist die spezielle Host-Adresse des
Android-Emulators; sie ist keine Adresse für ein echtes Handy. Für entfernte
Server wird HTTPS verlangt. Ein Serverwechsel meldet die App durch das Löschen
ihrer Sitzungscookies ab.

Die einzige Android-Berechtigung ist **Internet**. Kamera, Mikrofon und der
gesamte Fotoordner werden nicht angefordert. Die System-Dateiauswahl erteilt
Zugriff auf das ausdrücklich ausgewählte Bild. Es gibt keine JavaScript-Brücke
zu nativen Gerätefunktionen. Webseiten-Navigation bleibt beim gewählten Server;
gemischte HTTP-Inhalte und unsichere Zertifikate sind nicht freigegeben.

## Bauen

Voraussetzungen: PowerShell 7, JDK 17+ (geprüft mit 21), Android-SDK API 36 und
Build-Tools 36.0.0. Keine Gradle- oder zusätzliche Android-Bibliotheken nötig.

```powershell
./android/build.ps1 -SdkPath 'C:/Android/Sdk' -JavaHome 'C:/Program Files/Java/jdk-21'
```

Ergebnis: `android/build/outputs/knips-0.1.0.apk`. Der Build prüft zuerst
24 Serveradressen-/Navigationsfälle, anschließend Signatur und ZIP-Alignment.
Der Entwicklungsschlüssel unter `android/build/debug.keystore` bleibt lokal
und muss für spätere Updates bewahrt werden. Buildordner und Schlüssel gehören
nicht in Git. Die APK ist kein Play-Store-Release.

## Tests und Grenzen

Android-Tests werden ausschließlich auf einem ausdrücklich ausgewählten Emulator
mit überprüfter QEMU-Eigenschaft ausgeführt. Aktuelle Laufzeitbelege und noch
offene Prüfungen stehen in [PROGRESS.md](PROGRESS.md). Andere Android-Versionen,
Hersteller-Geräte und der Betrieb über einen öffentlichen HTTPS-Server brauchen
zusätzliche Tests. Die Benutzeroberfläche ist eine WebView-App, keine vollständig
native Android-Oberfläche.
