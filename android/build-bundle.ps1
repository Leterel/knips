param(
    [Parameter(Mandatory=$true)][string]$SdkPath,
    [Parameter(Mandatory=$true)][string]$JavaHome,
    [Parameter(Mandatory=$true)][string]$GradleCache,
    [Parameter(Mandatory=$true)][string]$AndroidUserHome,
    [Parameter(Mandatory=$true)][string]$BundleToolJar,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [switch]$Online
)
# Builds UNSIGNED bundles only. No signing credentials are accepted.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$project = $PSScriptRoot
$SdkPath = (Resolve-Path -LiteralPath $SdkPath).Path
$JavaHome = (Resolve-Path -LiteralPath $JavaHome).Path
$GradleCache = [IO.Path]::GetFullPath($GradleCache)
$AndroidUserHome = [IO.Path]::GetFullPath($AndroidUserHome)
$BundleToolJar = (Resolve-Path -LiteralPath $BundleToolJar).Path
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Use a new output directory to preserve prior evidence.' }
$configuration = Get-Content -LiteralPath (Join-Path $project 'app/build.gradle.kts') -Raw
$toolsMatch = [regex]::Match($configuration, 'buildToolsVersion\s*=\s*"([^"]+)"')
$packageMatch = [regex]::Match($configuration, 'applicationId\s*=\s*"([^"]+)"')
if (!$toolsMatch.Success -or !$packageMatch.Success) { throw 'Cannot determine configured build tools and package.' }
$aapt = Join-Path $SdkPath ("build-tools/" + $toolsMatch.Groups[1].Value + "/aapt2.exe")
$java = Join-Path $JavaHome 'bin/java.exe'
foreach ($tool in @($java, $aapt)) { if (!(Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Missing tool: $tool" } }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$previous = @{}
foreach ($name in @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','GRADLE_USER_HOME','ANDROID_USER_HOME')) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $SdkPath
    $env:ANDROID_SDK_ROOT = $SdkPath
    $env:GRADLE_USER_HOME = $GradleCache
    $env:ANDROID_USER_HOME = $AndroidUserHome
    $gradleArguments = @('--no-daemon', "-Pandroid.aapt2FromMavenOverride=$aapt", 'bundleRelease')
    if (!$Online) { $gradleArguments = @('--offline') + $gradleArguments }
    Push-Location $project
    try {
        & (Join-Path $project 'gradlew.bat') @gradleArguments *> (Join-Path $OutputDirectory 'build.txt')
        if ($LASTEXITCODE -ne 0) { throw 'Gradle failed. See build.txt.' }
    } finally { Pop-Location }
    $bundle = Join-Path $project 'app/build/outputs/bundle/release/app-release.aab'
    if (!(Test-Path -LiteralPath $bundle -PathType Leaf)) { throw 'Gradle did not produce app-release.aab.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($bundle)
    try {
        if (@($zip.Entries | Where-Object { $_.FullName -match '(?i)^META-INF/[^/]+\.(SF|RSA|DSA|EC)$' }).Count) {
            throw 'Release bundle is signed. This pipeline only exports unsigned bundles.'
        }
        foreach ($required in @('BundleConfig.pb','base/manifest/AndroidManifest.xml','base/dex/classes.dex')) {
            if (!$zip.GetEntry($required)) { throw "Incomplete bundle: $required missing." }
        }
    } finally { $zip.Dispose() }
    & $java -jar $BundleToolJar validate "--bundle=$bundle" *> (Join-Path $OutputDirectory 'validate.txt')
    if ($LASTEXITCODE -ne 0) { throw 'bundletool validation failed. See validate.txt.' }
    $manifest = & $java -jar $BundleToolJar dump manifest "--bundle=$bundle" --module=base 2> (Join-Path $OutputDirectory 'manifest-errors.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read bundle manifest.' }
    [xml]$manifestXml = $manifest -join [Environment]::NewLine
    if ($manifestXml.manifest.package -ne $packageMatch.Groups[1].Value) { throw 'Package mismatch in built bundle.' }
    $manifest | Out-File -LiteralPath (Join-Path $OutputDirectory 'manifest.xml') -Encoding utf8
    $destination = Join-Path $OutputDirectory 'app-release-unsigned.aab'
    Copy-Item -LiteralPath $bundle -Destination $destination
    $result = [ordered]@{
        package = $packageMatch.Groups[1].Value
        unsigned = $true
        bundletoolValidated = $true
        bundleSha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
        bundletoolSha256 = (Get-FileHash -LiteralPath $BundleToolJar -Algorithm SHA256).Hash
        offline = !$Online
        productionSigningTested = $false
        storeReady = $false
    }
    $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'result.json') -Encoding utf8
    $result | ConvertTo-Json
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
