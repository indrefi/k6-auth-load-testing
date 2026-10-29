[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("smoke", "average-load", "stress", "spike", "soak", "breakpoint")]
    [string]$Scenario = "smoke",

    [Parameter(Position = 1)]
    [string]$ConfigFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (Test-Path -LiteralPath "variable:PSNativeCommandUseErrorActionPreference") {
    $PSNativeCommandUseErrorActionPreference = $false
}

$scriptDirectory = $PSScriptRoot
$projectDirectory = Split-Path -Parent $scriptDirectory
$dockerDirectory = Join-Path $projectDirectory "docker"
$composeFile = Join-Path $dockerDirectory "docker-compose.yml"
$composeArguments = @("-f", $composeFile)
$dockerEnvironmentFile = Join-Path $dockerDirectory ".env"
if (Test-Path -LiteralPath $dockerEnvironmentFile -PathType Leaf) {
    $composeArguments = @("--env-file", $dockerEnvironmentFile) + $composeArguments
}

if ([string]::IsNullOrWhiteSpace($ConfigFile)) {
    $ConfigFile = if ([string]::IsNullOrWhiteSpace($env:K6_CONFIG_FILE)) {
        Join-Path $scriptDirectory "config.json"
    }
    else {
        $env:K6_CONFIG_FILE
    }
}

if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
    [Console]::Error.WriteLine("Configuration file not found: $ConfigFile")
    Write-Host "Create it with: Copy-Item load-tests/config.example.json load-tests/config.json"
    exit 2
}

$ConfigFile = (Resolve-Path -LiteralPath $ConfigFile).Path
$scenarioFile = "scenarios/$Scenario.js"
$scenarioPath = Join-Path $scriptDirectory $scenarioFile
if (-not (Test-Path -LiteralPath $scenarioPath -PathType Leaf)) {
    [Console]::Error.WriteLine("Unknown scenario: $Scenario")
    exit 2
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    [Console]::Error.WriteLine("Node.js 20 or newer is required to read config.json and generate reports.")
    exit 2
}

$config = Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json
$configDirectory = Split-Path -Parent $ConfigFile

function Get-ConfigValue {
    param([Parameter(Mandatory)][string]$Path)

    $current = $config
    foreach ($part in $Path.Split(".")) {
        if ($null -eq $current) {
            return $null
        }

        $property = $current.PSObject.Properties[$part]
        if ($null -eq $property) {
            return $null
        }

        $current = $property.Value
    }

    return $current
}

function Resolve-ConfigPath {
    param([Parameter(Mandatory)][string]$Path)

    $value = Get-ConfigValue $Path
    if ([string]::IsNullOrWhiteSpace([string]$value)) {
        return ""
    }

    if ([IO.Path]::IsPathRooted([string]$value)) {
        return [IO.Path]::GetFullPath([string]$value)
    }

    return [IO.Path]::GetFullPath((Join-Path $configDirectory ([string]$value)))
}

function Convert-ToDockerPath {
    param([AllowEmptyString()][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return ""
    }

    $projectFullPath = [IO.Path]::GetFullPath($projectDirectory).TrimEnd("\", "/")
    $valueFullPath = [IO.Path]::GetFullPath($Path)
    $prefix = $projectFullPath + [IO.Path]::DirectorySeparatorChar
    if (-not $valueFullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path $valueFullPath is outside the repository and cannot be mounted into the k6 container. Copy the file into load-tests/secrets/ and update config.json."
    }

    $relativePath = $valueFullPath.Substring($prefix.Length).Replace("\", "/")
    return "/work/$relativePath"
}

$savedEnvironment = @{}
function Set-TemporaryEnvironment {
    param(
        [Parameter(Mandatory)][string]$Name,
        [AllowNull()][AllowEmptyString()][string]$Value
    )

    if (-not $savedEnvironment.ContainsKey($Name)) {
        $savedEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process")
    }
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Restore-Environment {
    foreach ($entry in $savedEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }
}

function Invoke-OptionalCommand {
    param([Parameter(Mandatory)][scriptblock]$Command)

    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Optional report command exited with code $LASTEXITCODE."
    }
}

$applicationUrl = [string](Get-ConfigValue "applicationUrl")
if ([string]::IsNullOrWhiteSpace($applicationUrl)) {
    [Console]::Error.WriteLine("config.json must contain applicationUrl.")
    exit 2
}

$startDemoApi = (Get-ConfigValue "startDemoApi") -eq $true
$healthPath = [string](Get-ConfigValue "healthPath")
$p95Limit = Get-ConfigValue "testSettings.p95LimitMilliseconds"
$errorRateLimit = Get-ConfigValue "testSettings.errorRateLimit"
$localCaPath = Resolve-ConfigPath "certificate.caPath"
$localClientCertificatePath = Resolve-ConfigPath "certificate.clientCertificatePath"
$localClientKeyPath = Resolve-ConfigPath "certificate.clientKeyPath"

$testId = if (-not [string]::IsNullOrWhiteSpace($env:TEST_ID)) {
    $env:TEST_ID
}
else {
    [string](Get-ConfigValue "testId")
}
if ([string]::IsNullOrWhiteSpace($testId)) {
    $testId = "$Scenario-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))"
}

$testStartedAt = ""
$resultsRoot = Join-Path $scriptDirectory "results"
$runDirectory = Join-Path $resultsRoot $testId
$resultsRelative = "results/$testId"
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$testExitCode = 1

try {
    $localK6 = Get-Command k6 -ErrorAction SilentlyContinue
    if ($null -ne $localK6) {
        Set-TemporaryEnvironment "K6_CONFIG_FILE" $ConfigFile
        Set-TemporaryEnvironment "K6_CLIENT_CERT_FILE" $localClientCertificatePath
        Set-TemporaryEnvironment "K6_CLIENT_KEY_FILE" $localClientKeyPath
        Set-TemporaryEnvironment "TEST_ID" $testId
        Set-TemporaryEnvironment "TEST_TYPE" $Scenario
        Set-TemporaryEnvironment "RESULTS_DIR" $resultsRelative
        Set-TemporaryEnvironment "K6_WEB_DASHBOARD" "true"
        Set-TemporaryEnvironment "K6_WEB_DASHBOARD_PORT" "-1"
        Set-TemporaryEnvironment "K6_WEB_DASHBOARD_PERIOD" "1s"
        Set-TemporaryEnvironment "K6_WEB_DASHBOARD_EXPORT" "$resultsRelative/k6-native-report.html"
        if (-not [string]::IsNullOrWhiteSpace($localCaPath)) {
            Set-TemporaryEnvironment "SSL_CERT_FILE" $localCaPath
        }

        $testStartedAt = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
        Push-Location $scriptDirectory
        try {
            & $localK6.Path run --out "json=$resultsRelative/raw.json" $scenarioFile
            $testExitCode = $LASTEXITCODE
        }
        finally {
            Pop-Location
        }
    }
    else {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            throw "Neither a local k6 executable nor Docker is available."
        }

        $dockerConfigFile = Convert-ToDockerPath $ConfigFile
        $dockerClientCertificatePath = Convert-ToDockerPath $localClientCertificatePath
        $dockerClientKeyPath = Convert-ToDockerPath $localClientKeyPath
        $dockerCaPath = Convert-ToDockerPath $localCaPath

        if ($startDemoApi) {
            $dockerApplicationUrl = "https://api:8443"
        }
        else {
            $uriBuilder = [UriBuilder]$applicationUrl
            if ($uriBuilder.Host -in @("localhost", "127.0.0.1")) {
                $uriBuilder.Host = "host.docker.internal"
            }
            $dockerApplicationUrl = $uriBuilder.Uri.AbsoluteUri.TrimEnd("/")
        }

        Set-TemporaryEnvironment "DOCKER_K6_CONFIG_FILE" $dockerConfigFile
        Set-TemporaryEnvironment "DOCKER_APPLICATION_URL" $dockerApplicationUrl
        Set-TemporaryEnvironment "DOCKER_CLIENT_CERT_PATH" $dockerClientCertificatePath
        Set-TemporaryEnvironment "DOCKER_CLIENT_KEY_PATH" $dockerClientKeyPath
        Set-TemporaryEnvironment "DOCKER_CA_CERT_PATH" $(if ($dockerCaPath) { $dockerCaPath } else { "/etc/ssl/certs/ca-certificates.crt" })
        if ([string]::IsNullOrWhiteSpace($env:AUTH_USERNAME)) {
            Set-TemporaryEnvironment "AUTH_USERNAME" ([string](Get-ConfigValue "jwt.username"))
        }
        if ([string]::IsNullOrWhiteSpace($env:AUTH_PASSWORD)) {
            Set-TemporaryEnvironment "AUTH_PASSWORD" ([string](Get-ConfigValue "jwt.password"))
        }

        Push-Location $projectDirectory
        try {
            if ($startDemoApi) {
                & docker compose @composeArguments up -d --build api
                if ($LASTEXITCODE -ne 0) {
                    throw "Unable to start the demo API."
                }
            }

            if ($startDemoApi -and -not [string]::IsNullOrWhiteSpace($healthPath)) {
                $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
                if ($null -eq $curl) {
                    throw "curl.exe is required for the demo API readiness check on Windows."
                }

                $ready = $false
                $curlArguments = @("-fsS")
                if (-not [string]::IsNullOrWhiteSpace($localCaPath)) {
                    $curlArguments += @("--cacert", $localCaPath)
                }
                for ($attempt = 0; $attempt -lt 60; $attempt++) {
                    & $curl.Path @curlArguments "$applicationUrl$healthPath" *> $null
                    if ($LASTEXITCODE -eq 0) {
                        $ready = $true
                        break
                    }
                    Start-Sleep -Seconds 1
                }
                if (-not $ready) {
                    throw "The configured API did not become healthy within 60 seconds."
                }
            }

            $testStartedAt = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
            & docker compose @composeArguments run --rm `
                -e "TEST_ID=$testId" `
                -e "TEST_TYPE=$Scenario" `
                -e "RESULTS_DIR=$resultsRelative" `
                -e "K6_WEB_DASHBOARD_EXPORT=$resultsRelative/k6-native-report.html" `
                k6 run --out "json=$resultsRelative/raw.json" $scenarioFile
            $testExitCode = $LASTEXITCODE
        }
        finally {
            Pop-Location
        }
    }

    Set-TemporaryEnvironment "K6_CONFIG_FILE" $ConfigFile
    Set-TemporaryEnvironment "RUN_DIRECTORY" $runDirectory
    Set-TemporaryEnvironment "TEST_ID" $testId
    Set-TemporaryEnvironment "TEST_TYPE" $Scenario
    Set-TemporaryEnvironment "TEST_STARTED_AT" $testStartedAt

    Push-Location $scriptDirectory
    try {
        $excelPackage = Join-Path $scriptDirectory "node_modules/exceljs/package.json"
        $playwrightPackage = Join-Path $scriptDirectory "node_modules/playwright/package.json"
        $reportingReady = (Test-Path -LiteralPath $excelPackage -PathType Leaf) -and (Test-Path -LiteralPath $playwrightPackage -PathType Leaf)
        if (-not $reportingReady) {
            Write-Host "Reporting packages are missing; installing locked dependencies with npm ci..."
            $npm = Get-Command npm -ErrorAction SilentlyContinue
            if ($null -eq $npm) {
                Write-Warning "npm is unavailable; XLSX and PDF exports will be skipped."
            }
            else {
                & $npm.Path ci
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "Unable to install reporting packages; XLSX and PDF exports will be skipped."
                }
            }
            $reportingReady = (Test-Path -LiteralPath $excelPackage -PathType Leaf) -and (Test-Path -LiteralPath $playwrightPackage -PathType Leaf)
        }

        & node reporting/write-run-metadata.mjs
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to write run metadata."
        }

        if ($reportingReady) {
            Set-TemporaryEnvironment "K6_RAW_RESULTS" (Join-Path $runDirectory "raw.json")
            Set-TemporaryEnvironment "K6_SUMMARY" (Join-Path $runDirectory "end-summary.json")
            Set-TemporaryEnvironment "XLSX_OUTPUT" (Join-Path $runDirectory "load-test-results.xlsx")
            Set-TemporaryEnvironment "P95_LIMIT_MS" $(if ($null -ne $p95Limit) { [string]$p95Limit } else { "500" })
            Set-TemporaryEnvironment "ERROR_RATE_LIMIT" $(if ($null -ne $errorRateLimit) { [string]$errorRateLimit } else { "0.01" })
            Invoke-OptionalCommand { & npm run export:xlsx }

            Set-TemporaryEnvironment "RESULTS_ROOT" $resultsRoot
            Set-TemporaryEnvironment "DEFAULT_RUN_ID" $testId
            Set-TemporaryEnvironment "RUN_DASHBOARD_OUTPUT" (Join-Path $runDirectory "dashboard.html")
            Invoke-OptionalCommand { & npm run dashboard }

            Set-TemporaryEnvironment "HISTORY_XLSX_OUTPUT" (Join-Path $resultsRoot "load-test-history.xlsx")
            Invoke-OptionalCommand { & npm run export:history-xlsx }

            Set-TemporaryEnvironment "HTML_REPORT" (Join-Path $runDirectory "dashboard.html")
            Set-TemporaryEnvironment "PDF_REPORT" (Join-Path $runDirectory "load-test-report.pdf")
            Invoke-OptionalCommand { & npm run export:pdf }

            Set-TemporaryEnvironment "HTML_REPORT" (Join-Path $resultsRoot "dashboard.html")
            Set-TemporaryEnvironment "PDF_REPORT" (Join-Path $resultsRoot "load-test-history.pdf")
            Invoke-OptionalCommand { & npm run export:pdf }
        }
        else {
            Set-TemporaryEnvironment "RESULTS_ROOT" $resultsRoot
            Set-TemporaryEnvironment "DEFAULT_RUN_ID" $testId
            Set-TemporaryEnvironment "RUN_DASHBOARD_OUTPUT" (Join-Path $runDirectory "dashboard.html")
            Invoke-OptionalCommand { & node reporting/generate-dashboard.mjs }
            Write-Host 'Reporting packages are unavailable; run "Set-Location load-tests; npm ci" to generate XLSX/PDF exports.'
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Restore-Environment
}

Write-Host "Test ID: $testId"
Write-Host "Configuration: $ConfigFile"
Write-Host "Run report: $(Join-Path $runDirectory 'dashboard.html')"
Write-Host "Historical dashboard: $(Join-Path $resultsRoot 'dashboard.html')"
Write-Host "k6 exit code: $testExitCode (99 indicates a threshold failure)"
exit $testExitCode
