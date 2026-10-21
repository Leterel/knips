# Datenschutz-/Data-Safety-Arbeitsgrundlage für Knips

Stand 20.10.2026. Technische Grundlage, noch keine veröffentlichte Datenschutzerklärung.
Vor dem Betrieb fehlen die konkrete Betreiberidentität, Kontaktadresse, Server-/
Hostingangaben, tatsächliche Log-/Backupspeicherfristen und eine öffentliche Privacy-URL.

Der Knips-Server verarbeitet Kontonamen, Anzeigenamen, Passwort-Hashes, Sitzungen,
Fotos, Beschriftungen, Likes, Kommentare, Blockierungen und Meldungen sowie
technische IP-Adressen zur Verbindungs- und Missbrauchsbegrenzung. Der Betreiber
kann moderieren. Die Daten liegen auf dem konfigurierten selbst gehosteten Server.
Andere angemeldete Konten können freigegebene Inhalte sehen, soweit keine
Blockierung besteht. Passwort-Hashes und Sitzungsgeheimnisse sind nicht öffentlich.

Der Webclient kodiert Fotos vor dem Upload neu und entfernt dabei Metadaten.
Fremde Clients müssen dies selbst sicherstellen; die Server-API garantiert keine
serverseitige Metadatenbereinigung. Keine falsche allgemeine Zusicherung abgeben.

Externe Geräte verwenden HTTPS. Die einzige Android-Berechtigung ist Internet;
die System-Dateiauswahl gibt nur das vom Nutzer ausgewählte Bild frei.
Kein Kamera-/Mikrofonzugriff und keine Werbe-/Analyse-SDKs im aktuellen Client.

Kontolöschung mit Passwortbestätigung erfolgt unter „Mein Profil“. Die öffentliche
Seite /delete-account erklärt den Browserweg auch ohne installierte Android-App.
Die Lösch-URL im Play-Formular muss die tatsächliche HTTPS-Domain verwenden.
Beim Betrieb müssen der Umgang mit privaten Offline-Backups, deren Aufbewahrung
und gegebenenfalls gesetzliche Pflichten zutreffend beschrieben werden.
Keinen nicht implementierten sofortigen Löschvorgang in allen Backups versprechen.

Data-Safety-Angaben müssen Kontodaten/Nutzerkennung, Fotos, öffentliche Textinhalte
und Interaktionen entsprechend dem tatsächlichen Dienst erfassen. Sie können
nicht mit „keine Daten erhoben“ aus den Offline-Spaß-Apps übernommen werden.

Offizielle Vorgaben:
https://support.google.com/googleplay/android-developer/answer/10787469?hl=de
https://support.google.com/googleplay/android-developer/answer/13327111?hl=de
