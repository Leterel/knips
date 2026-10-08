param(
    [Parameter(Mandatory=$true)][string]$BundlePath,
    [Parameter(Mandatory=$true)][string]$BundleToolJar,
    [Parameter(Mandatory=$true)][string]$JavaHome,
    [Parameter(Mandatory=$true)][string]$TestKeyStorePath,
    [Parameter(Mandatory=$true)][string]$PackageId,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [ValidatePattern('^emulator-[0-9]+$')][string]$Serial,
    [string]$AdbPath,
    [string]$ExpectedText = '',
    [string]$Activity = '.MainActivity'
)
# Local test signing only. Never supply a production signing key to this script.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$java = Join-Path (Resolve-Path -LiteralPath $JavaHome).Path 'bin/java.exe'
$BundlePath = (Resolve-Path -LiteralPath $BundlePath).Path
$BundleToolJar = (Resolve-Path -LiteralPath $BundleToolJar).Path
$TestKeyStorePath = (Resolve-Path -LiteralPath $TestKeyStorePath).Path
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Choose a new output directory so previous evidence is preserved.' }
if ($Serial -and !$AdbPath) { throw 'AdbPath is mandatory for an emulator check.' }
if ($AdbPath) { $AdbPath = (Resolve-Path -LiteralPath $AdbPath).Path }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
function Bundle([string[]]$Arguments, [string]$LogName) {
    $result = & $java -jar $BundleToolJar @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $result | Out-File -LiteralPath (Join-Path $OutputDirectory $LogName) -Encoding utf8
    if ($exitCode -ne 0) { throw "bundletool failed: $($Arguments[0]). See $LogName." }
    return $result
}
function Assert-Emulator {
    if (!$Serial -or $Serial -notmatch '^emulator-[0-9]+$') { throw 'An explicit emulator serial is required.' }
    $qemu = & $AdbPath -s $Serial shell getprop ro.kernel.qemu
    if ($LASTEXITCODE -ne 0 -or "$qemu".Trim() -ne '1') { throw "Refusing device action: $Serial is not a QEMU emulator." }
}
function Adb([string[]]$Arguments) {
    Assert-Emulator
    $result = & $AdbPath -s $Serial @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Emulator action failed: $($Arguments -join ' '): $result" }
    return $result
}
$version = (Bundle @('version') 'bundletool-version.txt' | Out-String).Trim()
Bundle @('validate',"--bundle=$BundlePath") 'validate.txt' | Out-Null
$manifestText = Bundle @('dump','manifest',"--bundle=$BundlePath",'--module=base') 'manifest.xml'
[xml]$manifest = $manifestText -join [Environment]::NewLine
if ($manifest.manifest.package -ne $PackageId) { throw 'The bundle belongs to a different package.' }
$apks = Join-Path $OutputDirectory 'test.apks'
Bundle @('build-apks',"--bundle=$BundlePath","--output=$apks","--ks=$TestKeyStorePath",
    '--ks-key-alias=androiddebugkey','--ks-pass=pass:android','--key-pass=pass:android') 'build-apks.txt' | Out-Null
$result = [ordered]@{
    bundle = [IO.Path]::GetFileName($BundlePath)
    bundleSha256 = (Get-FileHash -LiteralPath $BundlePath -Algorithm SHA256).Hash
    bundletoolVersion = $version
    bundletoolSha256 = (Get-FileHash -LiteralPath $BundleToolJar -Algorithm SHA256).Hash
    validated = $true
    apkSetBuilt = $true
    apkSetSha256 = (Get-FileHash -LiteralPath $apks -Algorithm SHA256).Hash
    package = $PackageId
    localTestSignature = $true
    productionSigningTested = $false
    emulator = $null
    installed = $false
    launched = $false
}
if ($Serial) {
    Assert-Emulator
    $bootDeadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $booted = (Adb @('shell','getprop','sys.boot_completed') | Out-String).Trim() -eq '1'
        if (!$booted) { Start-Sleep -Seconds 2 }
    } while (!$booted -and [DateTime]::UtcNow -lt $bootDeadline)
    if (!$booted) { throw 'Emulator has not finished booting. Wait for boot before running this check.' }
    $specPath = Join-Path $OutputDirectory 'device-spec.json'
    Bundle @('get-device-spec',"--device-id=$Serial","--adb=$AdbPath","--output=$specPath") 'device-spec.txt' | Out-Null
    Assert-Emulator
    Bundle @('install-apks',"--device-id=$Serial","--adb=$AdbPath","--apks=$apks") 'install-apks.txt' | Out-Null
    $result.emulator = $Serial
    $result.installed = $true
    Adb @('shell','am','force-stop',$PackageId) | Out-Null
    $launch = Adb @('shell','am','start','-W','-n',"$PackageId/$Activity")
    $launch | Out-File -LiteralPath (Join-Path $OutputDirectory 'launch.txt') -Encoding utf8
    if (($launch -join ' ') -notmatch 'Status: ok') { throw 'Android did not report a successful activity launch.' }
    $result.launched = $true
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 1500
        Adb @('shell','uiautomator','dump','/sdcard/codex-bundle-check.xml') | Out-Null
        $uiPath = Join-Path $OutputDirectory 'ui.xml'
        Adb @('pull','/sdcard/codex-bundle-check.xml',$uiPath) | Out-Null
        [xml]$ui = Get-Content -LiteralPath $uiPath -Raw
        $texts = @($ui.SelectNodes('//node') | ForEach-Object { $_.text }) -join ' '
        $found = (!$ExpectedText -or $texts -match $ExpectedText)
    } while (!$found -and [DateTime]::UtcNow -lt $deadline)
    if (!$found) { throw "Expected UI content was not shown: $ExpectedText" }
    $appPid = (Adb @('shell','pidof',$PackageId) | Out-String).Trim()
    if (!$appPid) { throw 'App process is no longer running.' }
    Adb @('shell','screencap','-p','/sdcard/codex-bundle-check.png') | Out-Null
    Adb @('pull','/sdcard/codex-bundle-check.png',(Join-Path $OutputDirectory 'screen.png')) | Out-Null
    $logs = Adb @('logcat','-d','-t','200',"--pid=$appPid")
    $logs | Out-File -LiteralPath (Join-Path $OutputDirectory 'app-logcat.txt') -Encoding utf8
    if (($logs -join ' ') -match 'FATAL EXCEPTION') { throw 'App logged a fatal exception.' }
    $result.uiTextMatched = $true
    $result.expectedTextPattern = $ExpectedText
    $result.apiLevel = (Adb @('shell','getprop','ro.build.version.sdk') | Out-String).Trim()
}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'result.json') -Encoding utf8
Write-Output ($result | ConvertTo-Json -Depth 5)

