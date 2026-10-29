[CmdletBinding()]
param(
    [string]$CertificatePassword = $env:CERTIFICATE_PASSWORD
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (Test-Path -LiteralPath "variable:PSNativeCommandUseErrorActionPreference") {
    $PSNativeCommandUseErrorActionPreference = $false
}

if ([string]::IsNullOrWhiteSpace($CertificatePassword)) {
    $CertificatePassword = "changeit"
}

$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if ($null -eq $openssl) {
    [Console]::Error.WriteLine("OpenSSL is required and must be available on PATH.")
    exit 2
}

$scriptDirectory = $PSScriptRoot
$outputDirectory = Join-Path $scriptDirectory "generated"
$serverExtensions = Join-Path $scriptDirectory "server.ext"
$clientExtensions = Join-Path $scriptDirectory "client.ext"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

function Invoke-OpenSsl {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & $openssl.Path @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "OpenSSL exited with code $LASTEXITCODE while running: openssl $($Arguments -join ' ')"
    }
}

function Generated-Path {
    param([Parameter(Mandatory)][string]$Name)
    return Join-Path $outputDirectory $Name
}

$temporaryFiles = @(
    (Generated-Path "server.csr"),
    (Generated-Path "client.csr"),
    (Generated-Path "ca-cert.srl")
)
foreach ($temporaryFile in $temporaryFiles) {
    if (Test-Path -LiteralPath $temporaryFile) {
        Remove-Item -LiteralPath $temporaryFile -Force
    }
}

try {
    Invoke-OpenSsl @(
        "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
        "-keyout", (Generated-Path "ca-key.pem"),
        "-out", (Generated-Path "ca-cert.pem"),
        "-days", "3650",
        "-subj", "/CN=AuthLoadDemo Local CA/O=AuthLoadDemo"
    )

    Invoke-OpenSsl @(
        "req", "-newkey", "rsa:2048", "-sha256", "-nodes",
        "-keyout", (Generated-Path "server-key.pem"),
        "-out", (Generated-Path "server.csr"),
        "-subj", "/CN=localhost/O=AuthLoadDemo"
    )

    Invoke-OpenSsl @(
        "x509", "-req", "-sha256",
        "-in", (Generated-Path "server.csr"),
        "-CA", (Generated-Path "ca-cert.pem"),
        "-CAkey", (Generated-Path "ca-key.pem"),
        "-CAcreateserial",
        "-out", (Generated-Path "server-cert.pem"),
        "-days", "825",
        "-extfile", $serverExtensions
    )

    Invoke-OpenSsl @(
        "pkcs12", "-export",
        "-out", (Generated-Path "server-cert.pfx"),
        "-inkey", (Generated-Path "server-key.pem"),
        "-in", (Generated-Path "server-cert.pem"),
        "-certfile", (Generated-Path "ca-cert.pem"),
        "-keypbe", "AES-256-CBC",
        "-certpbe", "AES-256-CBC",
        "-macalg", "sha256",
        "-passout", "pass:$CertificatePassword"
    )

    Invoke-OpenSsl @(
        "req", "-newkey", "rsa:2048", "-sha256", "-nodes",
        "-keyout", (Generated-Path "client-key.pem"),
        "-out", (Generated-Path "client.csr"),
        "-subj", "/CN=k6-client/O=AuthLoadDemo"
    )

    Invoke-OpenSsl @(
        "x509", "-req", "-sha256",
        "-in", (Generated-Path "client.csr"),
        "-CA", (Generated-Path "ca-cert.pem"),
        "-CAkey", (Generated-Path "ca-key.pem"),
        "-CAcreateserial",
        "-out", (Generated-Path "client-cert.pem"),
        "-days", "825",
        "-extfile", $clientExtensions
    )

    Invoke-OpenSsl @(
        "pkcs12", "-export",
        "-out", (Generated-Path "client-cert.pfx"),
        "-inkey", (Generated-Path "client-key.pem"),
        "-in", (Generated-Path "client-cert.pem"),
        "-certfile", (Generated-Path "ca-cert.pem"),
        "-keypbe", "AES-256-CBC",
        "-certpbe", "AES-256-CBC",
        "-macalg", "sha256",
        "-passout", "pass:$CertificatePassword"
    )
}
finally {
    foreach ($temporaryFile in $temporaryFiles) {
        if (Test-Path -LiteralPath $temporaryFile) {
            Remove-Item -LiteralPath $temporaryFile -Force
        }
    }
}

if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $icacls = Get-Command icacls.exe -ErrorAction SilentlyContinue
    if ($null -ne $icacls) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        foreach ($sensitiveFile in @("ca-key.pem", "server-key.pem", "client-key.pem", "server-cert.pfx", "client-cert.pfx")) {
            & $icacls.Path (Generated-Path $sensitiveFile) "/inheritance:r" "/grant:r" "${identity}:(F)" | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Could not restrict permissions for $sensitiveFile."
            }
        }
    }
}

Write-Host "Certificates generated in $outputDirectory"
Write-Host "PFX password: $CertificatePassword"
