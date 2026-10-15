$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'NfcPcscBridge.cs'
$directory = Join-Path (Split-Path $PSScriptRoot -Parent) 'bin'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$output = Join-Path $directory 'NfcPcscBridge.exe'
if (Test-Path $output) { Remove-Item $output -Force }
# Windows PowerShell 5.1 invokes the .NET Framework C# compiler built into Windows.
# No Python, node-gyp, native npm package, or Visual Studio is required.
Add-Type -Path $source -OutputAssembly $output -OutputType ConsoleApplication -ErrorAction Stop
if (-not (Test-Path $output)) { throw 'Compilazione del bridge PC/SC non riuscita.' }
Write-Host "Bridge WinSCard creato: $output"
