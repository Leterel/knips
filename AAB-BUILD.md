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
