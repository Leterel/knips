# Android-App-Bundle — 07.10.2026

Der native WebView-Client lässt sich als unsigniertes AAB bauen. Der Server bleibt
ein eigenes Node-Programm; das AAB enthält keinen Server.

```powershell
$env:JAVA_HOME='C:/Pfad/zum/jdk-21'
$env:ANDROID_HOME='C:/Pfad/zum/android-sdk'
$env:GRADLE_USER_HOME='C:/Pfad/zum/gradle-cache'
$env:ANDROID_USER_HOME='C:/Pfad/zum/android-benutzerordner'
$aapt=Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/aapt2.exe'
Set-Location android
./gradlew.bat --offline --no-daemon "-Pandroid.aapt2FromMavenOverride=$aapt" bundleRelease
```

Ergebnis: `android/app/build/outputs/bundle/release/app-release.aab` (11.875 Bytes).
BundleConfig, Manifest, DEX und Ressourcen sind im Archiv vorhanden. Das AAB ist
nicht für den Play-Upload signiert. AGP 8.7.3 meldet für compileSdk 36 eine
Kompatibilitätswarnung. Noch offen: Produktionsschlüssel, Play-Signierung,
öffentlicher HTTPS-Server, Consent/Werbung und Store-Checks.

## Bundletool-Prüfung am 08.10.2026

Offizielles bundletool-all 1.18.3 akzeptiert das Bundle. Daraus erzeugte, lokal
testsignierte APKs im API-34-Emulator emulator-5570 installiert und gestartet;
Serverauswahl sichtbar, kein fataler App-Fehler im geprüften Logausschnitt.
Kein neuer Ende-zu-Ende-Uploadlauf mit diesem APK-Set; dessen Nachweis vom 01.10.
gehört zur direkt gebauten APK. Produktionssignierung bleibt ungetestet.
Belege: outputs/knips/aab-verification-20261008 im Workspace.
Runner: android/tests/test-app-bundle.ps1 mit explizitem Emulator und QEMU-Prüfung.
