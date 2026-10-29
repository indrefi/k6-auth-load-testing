# AuthLoadDemo

AuthLoadDemo is a .NET 10 HTTPS API with a .NET xUnit integration-test project and a separate k6 black-box load-testing project. It demonstrates four authentication modes, gives each mode GET and POST operations, generates its own local certificate authority and client certificate, and exports permanent historical dashboards and results as JSON, HTML, PDF, and Excel (`.xlsx`).

> This repository is a runnable authentication and capacity-testing example. Its built-in users, passwords, signing key, local CA, and in-memory data store are for development and load testing, not production identity management.

## What is included

- Anonymous, JWT HMAC-SHA256, mutual-TLS client certificate, and HTTP Basic authentication.
- JWT login using username/password, with automatic token refresh in long k6 tests.
- GET and POST operations for every authentication type.
- A generated local CA, HTTPS server certificate, and client certificate in PEM and PFX formats.
- Smoke, average-load, stress, spike, soak, and breakpoint k6 scenarios.
- A standalone historical dashboard that compares every saved test run without Grafana or Prometheus.
- Filters for test type, run, authentication type and API request, with per-request latency, errors and status codes.
- Raw JSON, summary JSON, self-contained HTML, PDF, and XLSX reports.
- An XLSX breakpoint detector based on sustained latency, error, or dropped-iteration SLO violations.
- Interactive Scalar interface and an OpenAPI 3.1.1 document for manual API calls.
- Fourteen black-box xUnit integration tests covering health, API documentation, successful requests, and authentication rejection.

## Project structure

```text
.
├── AuthLoadDemo.slnx                 .NET solution
├── global.json                       .NET 10 SDK and Microsoft Testing Platform selection
├── docker/
│   ├── docker-compose.yml            Demo API and k6 services
│   ├── AuthApi.Dockerfile             Multi-stage API image build
│   ├── AuthApi.Dockerfile.dockerignore Docker build-context exclusions
│   └── .env.example                  Docker environment template
├── src/
│   ├── AuthApi/
│   │   ├── Program.cs                Kestrel and application service pipeline
│   │   ├── Controllers/              API routes and authorization attributes
│   │   ├── Security/                 JWT, Basic, and certificate handlers
│   │   ├── Services/                 Thread-safe in-memory data store
│   │   ├── Models/                   Request and response contracts
│   │   └── Configuration/            Strongly typed settings
│   └── IntegrationTests/
│       ├── AuthApi.IntegrationTests.csproj .NET xUnit integration test project
│       └── ApiIntegrationTests.cs    Black-box API authentication tests
├── certificates/
│   ├── generate-certificates.sh      Creates the CA/server/client certificates
│   ├── generate-certificates.ps1     Windows PowerShell certificate generator
│   ├── server.ext                    Server certificate extensions and SANs
│   ├── client.ext                    Client Authentication EKU
│   └── generated/                    Generated secrets; ignored by Git
└── load-tests/
    ├── config.json                   User-editable external API configuration
    ├── config.example.json           Safe template for new environments
    ├── secrets/                      Git-ignored external CA/client certificates
    ├── scenarios/                    Six independent k6 entry points
    ├── modules/                      Shared workload/authentication logic
    ├── reporting/                    Dashboard, XLSX and PDF generators
    ├── results/                      One folder per run plus historical reports
    ├── run-load-test.sh              macOS/Linux local-k6/Docker runner
    ├── run-load-test.ps1             Windows PowerShell local-k6/Docker runner
    └── package.json                  Reporting dependencies
```

## API routes

| Authentication | Method | Route | Expected success |
|---|---|---|---|
| None | GET | `/api/open/data` | `200 OK` |
| None | POST | `/api/open/data` | `201 Created` |
| JWT | POST | `/api/auth/login` | `200 OK` with token |
| JWT | GET | `/api/jwt/data` | `200 OK` |
| JWT | POST | `/api/jwt/data` | `201 Created` |
| Client certificate | GET | `/api/certificate/data` | `200 OK` |
| Client certificate | POST | `/api/certificate/data` | `201 Created` |
| Basic | GET | `/api/basic/data` | `200 OK` |
| Basic | POST | `/api/basic/data` | `201 Created` |
| None | GET | `/health` | API health |
| None | GET | `/scalar/` | Interactive API interface |
| None | GET | `/openapi/v1.json` | OpenAPI 3.1.1 document |

POST bodies use this shape:

```json
{ "value": "some data" }
```

## Default development credentials

These values make the demo runnable without additional setup. They are public development defaults and must not be used in a production or shared environment.

| Purpose | Username or identity | Password or secret | Where it is used |
|---|---|---|---|
| JWT login | `load-user` | `change-me-now` | `POST /api/auth/login`; a successful login returns the bearer token |
| HTTP Basic authentication | `load-user` | `change-me-now` | Basic `Authorization` header for `/api/basic/data` |
| JWT HMAC signing, local default and Compose fallback | — | `development-only-signing-key-change-this-32-bytes` | Signs and validates JWTs with HS256; this is a signing key, not a user password |
| JWT HMAC signing, `.env.example` placeholder | — | `replace-with-at-least-32-random-characters` | Replace this value after copying `docker/.env.example`; do not use the placeholder outside local development |
| Client certificate PFX | Certificate common name `k6-client` | `changeit` | Imports `client-cert.pfx` into a browser or tool |
| HTTPS server certificate PFX | Certificate common name `localhost` | `changeit` | Opens `server-cert.pfx` in tools that require PFX |
| CA, client and server PEM private keys | Certificate identity only | No password | The generated `*-key.pem` files are intentionally unencrypted for local automation |

Additional JWT defaults are issuer `AuthLoadDemo`, audience `AuthLoadDemoClients`, and a 15-minute token lifetime. Certificate authentication does not use a username/password: the API validates the certificate chain and requires the client certificate common name `k6-client`.

For Docker, copy `docker/.env.example` to `docker/.env`, then replace `AUTH_USERNAME`, `AUTH_PASSWORD`, and `JWT_SIGNING_KEY`. For a local .NET run, override `Auth__Username`, `Auth__Password`, and `Auth__JwtSigningKey`. The JWT and Basic sections in `load-tests/config.json` must match the target API credentials.

`CERTIFICATE_PASSWORD` changes the password of both generated PFX files. It is read only while either certificate generator is running and is not saved automatically. On macOS/Linux:

```bash
CERTIFICATE_PASSWORD='a-strong-password' ./certificates/generate-certificates.sh
```

On Windows PowerShell, use the equivalent parameter:

```powershell
.\certificates\generate-certificates.ps1 -CertificatePassword "a-strong-password"
```

## Dependencies

### Recommended Docker workflow

- Docker Desktop or Docker Engine with Compose v2
- OpenSSL (LibreSSL on macOS also works)
- Node.js 20 or newer and npm, used by the runner to read JSON configuration and generate reports
- .NET SDK 10, for the integration test project
- Windows PowerShell 5.1 or PowerShell 7 plus `curl.exe` when using `run-load-test.ps1` on Windows
- OpenSSL available on `PATH` when generating certificates with PowerShell

The API and k6 run in containers, so a local k6 installation is not required. The .NET SDK is required to build and run the integration test project.

### Fully local workflow

- .NET SDK 10
- k6
- OpenSSL
- Node.js 20 or newer
- Google Chrome, or a Playwright Chromium installation, for PDF export

The API uses Microsoft's ASP.NET Core OpenAPI generator and Scalar for its interactive interface. The Scalar AI agent is disabled, so the interface does not require or expose an external agent key. Integration tests use xUnit v3 and Microsoft Testing Platform; `global.json` selects the required test runner for .NET 10. Reporting uses `exceljs` and `playwright`; exact versions are pinned in the project and `load-tests/package-lock.json`.

### Pinned project dependencies

| Component | Version | Location |
|---|---:|---|
| .NET SDK | `10.0.301` with latest-feature roll-forward | `global.json` |
| ASP.NET Core OpenAPI | `10.0.13` | `src/AuthApi/AuthApi.csproj` |
| Scalar.AspNetCore | `2.18.5` | `src/AuthApi/AuthApi.csproj` |
| Microsoft.NET.Test.Sdk | `18.11.0` | `src/IntegrationTests/AuthApi.IntegrationTests.csproj` |
| xUnit v3 | `4.0.2` | `src/IntegrationTests/AuthApi.IntegrationTests.csproj` |
| xUnit Visual Studio runner | `4.0.1` | `src/IntegrationTests/AuthApi.IntegrationTests.csproj` |
| ExcelJS | `4.4.0` | `load-tests/package.json` |
| Playwright | `1.56.1` | `load-tests/package.json` |

The Docker load-test service uses `grafana/k6:latest`; pin that image to a known k6 release when reproducibility across environments is required.

## Installation

1. Generate the certificates:

   macOS/Linux:

   ```bash
   ./certificates/generate-certificates.sh
   ```

   Windows PowerShell:

   ```powershell
   .\certificates\generate-certificates.ps1
   ```

   Both scripts generate the same CA, server, and client PEM/PFX files. The default PFX password is `changeit`.

   To select a different PFX password on macOS/Linux:

   ```bash
   CERTIFICATE_PASSWORD='a-strong-password' ./certificates/generate-certificates.sh
   ```

   On Windows PowerShell:

   ```powershell
   .\certificates\generate-certificates.ps1 -CertificatePassword "a-strong-password"
   ```

2. Create local environment settings:

   ```bash
   cp docker/.env.example docker/.env
   ```

   Change `AUTH_PASSWORD` and `JWT_SIGNING_KEY` before using the stack outside an isolated development machine. To protect generated PFX files with another password, use the certificate-password option shown above; it is not read from `docker/.env`.

3. Restore the .NET API and integration-test packages:

   ```bash
   dotnet restore AuthLoadDemo.slnx
   ```

4. Install the locked reporting dependencies:

   ```bash
   cd load-tests
   npm ci
   cd ..
   ```

   This step can be skipped when using either load-test runner: if the reporting packages are missing, the runner executes `npm ci` automatically before generating reports. Installing them during setup avoids that one-time delay after the first test.

5. If neither Google Chrome nor another supported Chrome channel is installed, install Playwright Chromium:

   ```bash
   cd load-tests
   npx playwright install chromium
   cd ..
   ```

On Windows, use `Copy-Item` instead of `cp` and `Set-Location` instead of `cd` if preferred. The certificate and load-test runners both have native PowerShell versions. External targets can place their CA and client-certificate files in `load-tests/secrets/` and set `startDemoApi` to `false`.

## Run with Docker

Generate the certificates first, then start the demo API:

```bash
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d --build api
```

Open:

- API: `https://localhost:8443`
- Scalar API interface: `https://localhost:8443/scalar/`
- Historical dashboard after a test: `load-tests/results/dashboard.html`

Check service state and logs:

```bash
docker compose --env-file docker/.env -f docker/docker-compose.yml ps
docker compose --env-file docker/.env -f docker/docker-compose.yml logs -f api
```

Stop the demo API:

```bash
docker compose --env-file docker/.env -f docker/docker-compose.yml down
```

## Run the API locally

```bash
dotnet build AuthLoadDemo.slnx
dotnet run --project src/AuthApi/AuthApi.csproj
```

The relative certificate paths in `appsettings.json` work when the project is launched from the repository. Settings can be overridden with standard .NET environment variables, for example:

```bash
Auth__Username='another-user' \
Auth__Password='another-password' \
Auth__JwtSigningKey='replace-with-at-least-32-random-characters' \
dotnet run --project src/AuthApi/AuthApi.csproj
```

## Test the API

With the API running on port 8443 and the certificates generated, run the test project:

```bash
dotnet test src/IntegrationTests/AuthApi.IntegrationTests.csproj
```

The 14-test xUnit integration suite verifies:

- Health endpoint availability.
- Scalar interface and OpenAPI document availability.
- Open GET and POST.
- JWT login, anonymous rejection, authenticated GET, and authenticated POST.
- Basic anonymous rejection, authenticated GET, and authenticated POST.
- Certificate rejection without a certificate, authenticated GET, and authenticated POST.

The tests are black-box HTTP tests: they do not reference or host the API project. They target `https://localhost:8443` by default. Override the target and credentials when testing another deployment of the same API contract:

```bash
BASE_URL='https://api.example.com' \
AUTH_USERNAME='test-user' \
AUTH_PASSWORD='test-password' \
PROJECT_ROOT="$PWD" \
dotnet test src/IntegrationTests/AuthApi.IntegrationTests.csproj
```

The suite trusts `<PROJECT_ROOT>/certificates/generated/ca-cert.pem` and uses `client-cert.pem` plus `client-key.pem` for the certificate-authenticated checks. `PROJECT_ROOT` is normally discovered by locating `AuthLoadDemo.slnx`. Set it when running compiled tests outside this repository or when testing a deployment that uses another CA/client-certificate set arranged under the same `certificates/generated/` structure.

| Test environment variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `https://localhost:8443` | Base URL of the running API |
| `AUTH_USERNAME` | `load-user` | JWT login and Basic username |
| `AUTH_PASSWORD` | `change-me-now` | JWT login and Basic password |
| `PROJECT_ROOT` | Automatically discovered | Root containing `certificates/generated/` |

The repository uses xUnit v3. `global.json` opts `dotnet test` into Microsoft Testing Platform because the legacy VSTest target is not supported by this setup on .NET 10.

Build validation:

```bash
dotnet build AuthLoadDemo.slnx --no-restore
```

### Manual API calls with curl

Run these commands from the repository root while the API is running.

Open endpoints require no authentication:

```bash
# GET
curl --cacert certificates/generated/ca-cert.pem \
  https://localhost:8443/api/open/data

# POST
curl --cacert certificates/generated/ca-cert.pem \
  -H 'Content-Type: application/json' \
  -d '{"value":"Created through the open endpoint"}' \
  https://localhost:8443/api/open/data
```

For JWT authentication, first log in with the default credentials:

```bash
curl --cacert certificates/generated/ca-cert.pem \
  -H 'Content-Type: application/json' \
  -d '{"username":"load-user","password":"change-me-now"}' \
  https://localhost:8443/api/auth/login
```

Copy the `accessToken` value from the response and replace `<access-token>` below:

```bash
# GET
curl --cacert certificates/generated/ca-cert.pem \
  -H 'Authorization: Bearer <access-token>' \
  https://localhost:8443/api/jwt/data

# POST
curl --cacert certificates/generated/ca-cert.pem \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"value":"Created through the JWT endpoint"}' \
  https://localhost:8443/api/jwt/data
```

Basic authentication uses the default `load-user` / `change-me-now` credentials:

```bash
# GET
curl --cacert certificates/generated/ca-cert.pem \
  --user 'load-user:change-me-now' \
  https://localhost:8443/api/basic/data

# POST
curl --cacert certificates/generated/ca-cert.pem \
  --user 'load-user:change-me-now' \
  -H 'Content-Type: application/json' \
  -d '{"value":"Created through the Basic endpoint"}' \
  https://localhost:8443/api/basic/data
```

Certificate authentication sends the generated client certificate and private key:

```bash
# GET
curl --cacert certificates/generated/ca-cert.pem \
  --cert certificates/generated/client-cert.pem \
  --key certificates/generated/client-key.pem \
  https://localhost:8443/api/certificate/data

# POST
curl --cacert certificates/generated/ca-cert.pem \
  --cert certificates/generated/client-cert.pem \
  --key certificates/generated/client-key.pem \
  -H 'Content-Type: application/json' \
  -d '{"value":"Created through the certificate endpoint"}' \
  https://localhost:8443/api/certificate/data
```

## Use the Scalar interface

With the API running, open `https://localhost:8443/scalar/`. The generated OpenAPI document is available at `https://localhost:8443/openapi/v1.json`.

Use Scalar's request client to call the open endpoints directly. For protected endpoints:

1. **JWT:** call `POST /api/auth/login`, copy the `accessToken` value, open Scalar's authentication panel, and paste only the token into the JWT field. Scalar adds the `Bearer` prefix.
2. **Basic:** open the authentication panel and enter the configured username and password in the Basic fields.
3. **Client certificate:** the certificate is selected during the TLS handshake, before Scalar sends a request. Import `certificates/generated/client-cert.pfx` into the browser or operating-system certificate store, using the password chosen during certificate generation (default `changeit`), then reopen Scalar and select the certificate when prompted. If the browser does not offer it, use the documented `curl --cert ... --key ...` command instead.

The local HTTPS server certificate is signed by the generated development CA. The browser may show a trust warning until `certificates/generated/ca-cert.pem` is added to the local trust store. This is only appropriate for a development machine; do not install development certificates on production systems.

## Run load tests

### Configure an external black-box API

All target-specific settings are in one JSON file:

```text
load-tests/config.json
```

If it does not exist, create it from the template:

```bash
cp load-tests/config.example.json load-tests/config.json
```

Set the application URL, credentials, optional certificate paths, and request lists:

```json
{
  "applicationUrl": "https://api.example.com",
  "startDemoApi": false,
  "healthPath": "/health",
  "certificate": {
    "caPath": "secrets/ca.pem",
    "clientCertificatePath": "secrets/client-cert.pem",
    "clientKeyPath": "secrets/client-key.pem"
  },
  "jwt": {
    "loginPath": "/auth/login",
    "username": "test-user",
    "password": "test-password",
    "loginPayload": {
      "username": "{{username}}",
      "password": "{{password}}"
    },
    "tokenField": "accessToken",
    "expiresInField": "expiresIn"
  },
  "basic": {
    "username": "test-user",
    "password": "test-password"
  }
}
```

Use `"startDemoApi": false` when the target is an external system. Remove `caPath` when the server uses a publicly trusted certificate. Client certificate and key paths are needed only when at least one enabled certificate-authenticated request exists. Remove `healthPath` when the external API has no health endpoint. Paths in this file are relative to `load-tests/`.

Each request category is an array, so it can contain zero, one, or many endpoints:

```json
{
  "requests": {
    "OPEN_GET": [
      {
        "name": "list-products",
        "enabled": true,
        "path": "/products",
        "expectedStatus": 200
      },
      {
        "name": "get-disabled-example",
        "enabled": false,
        "path": "/not-tested",
        "expectedStatus": 200
      }
    ],
    "OPEN_POST": [
      {
        "name": "create-order",
        "enabled": true,
        "path": "/orders",
        "expectedStatus": 201,
        "payload": {
          "customer": { "id": 42, "priority": true },
          "items": [{ "sku": "ABC", "quantity": 2 }],
          "testIteration": "{{iteration}}"
        }
      }
    ],
    "JWT_GET": [],
    "JWT_POST": [],
    "CERTIFICATE_GET": [],
    "CERTIFICATE_POST": [],
    "BASIC_GET": [],
    "BASIC_POST": []
  }
}
```

One k6 iteration calls every request whose `enabled` field is `true`, exactly once and in the order of the category lists. Consequently, all enabled endpoint requests have equal counts after each completed iteration. If a test ends partway through an iteration, the final counts can differ slightly. JWT login calls are authentication traffic and are additional to these endpoint counts.

For arrival-rate scenarios, the configured rate is therefore **complete iterations per second**, not individual HTTP requests per second. For example, 25 iterations per second with eight enabled requests targets roughly 200 endpoint requests per second, plus occasional JWT login traffic.

`payload` may contain any valid JSON value or structure; the runner does not impose an API-specific schema. String values can contain `{{vu}}`, `{{iteration}}`, and `{{timestamp}}`. Login payloads additionally support `{{username}}` and `{{password}}`, filled from the JWT configuration. Optional `headers` can be added to any request object. `expectedStatus` accepts either one status code or an array such as `[200, 204]`.

`tokenField` identifies the JWT in the login response and supports a dotted path such as `data.accessToken`. `expiresInField` is optional; when absent, the test reads `exp` from the JWT when possible. Certificate files used by Docker must be inside this repository so they can be mounted. `load-tests/secrets/` and `config.json` are ignored by Git to protect secrets.

To keep multiple environment configurations, select a different file:

```bash
./load-tests/run-load-test.sh smoke load-tests/config.staging.json
```

On Windows PowerShell:

```powershell
.\load-tests\run-load-test.ps1 smoke .\load-tests\config.staging.json
```

### Execute a scenario

Both runners use a local `k6` binary when one exists. Otherwise they start the Docker stack and run the official k6 image.

macOS/Linux:

```bash
./load-tests/run-load-test.sh smoke
./load-tests/run-load-test.sh average-load
./load-tests/run-load-test.sh stress
./load-tests/run-load-test.sh spike
./load-tests/run-load-test.sh soak
./load-tests/run-load-test.sh breakpoint
```

Windows PowerShell:

```powershell
.\load-tests\run-load-test.ps1 smoke
.\load-tests\run-load-test.ps1 average-load
.\load-tests\run-load-test.ps1 stress
.\load-tests\run-load-test.ps1 spike
.\load-tests\run-load-test.ps1 soak
.\load-tests\run-load-test.ps1 breakpoint
```

To execute the complete default suite sequentially, use:

```bash
for scenario in smoke average-load stress spike soak breakpoint; do
  ./load-tests/run-load-test.sh "$scenario"
done
```

Windows PowerShell:

```powershell
"smoke", "average-load", "stress", "spike", "soak", "breakpoint" | ForEach-Object {
    .\load-tests\run-load-test.ps1 $_
}
```

The complete default suite has 32 minutes of configured stages. Graceful-stop windows can extend it to about 35 minutes, before API startup and report-generation time. With the Bash runner, `Ctrl+C` still generates reports for the interrupted scenario and exits with code 130. In PowerShell, `Ctrl+C` interrupts the active command; partial raw output may remain, but post-run exports are not guaranteed.

| Scenario | Purpose | Stages | Default load | Configured stage time | Possible time with graceful stop |
|---|---|---:|---|---:|---:|
| `smoke` | Validate scripts, TLS, auth, and thresholds | 1 | 1 VU | 10 seconds | About 15 seconds |
| `average-load` | Expected operating load | 3 | Ramps from 5 to 25 iterations/sec, holds 25, then ramps down | 4m 30s | About 5 minutes |
| `stress` | Capacity above normal operation | 4 | Ramps through 50, 100, and 200 iterations/sec, then ramps down | 7 minutes | About 7m 30s |
| `spike` | Sudden traffic increase and recovery | 6 | Jumps from 20 to 500 VUs, holds 500, then recovers | 3m 20s | About 3m 50s |
| `soak` | Leaks and long-term degradation | 1 | Holds 25 iterations/sec | 7 minutes | About 8 minutes |
| `breakpoint` | Find sustained SLO failure | 3 | Ramps from 10 to 300 and then 1,000 iterations/sec before ramp-down | 10 minutes | About 10m 30s |

Configured stage time is the sum of the scenario stages. A graceful-stop window is used only when k6 needs additional time to finish active iterations; it is not an extra load stage and may finish earlier than the stated maximum.

### How the k6 executors behave

The executor defines how k6 schedules load. Every VU repeatedly runs complete iterations, and one iteration calls every enabled request in `config.json` once. The executor decides whether k6 controls the number of concurrent VUs or the rate at which new iterations start.

| Executor | Used by | k6 controls | Resulting behavior |
|---|---|---|---|
| `constant-vus` | `smoke` | A fixed number of concurrent VUs | Each VU starts another iteration after completing the previous iteration and its think time. The resulting iteration rate and HTTP RPS depend on API speed. |
| `ramping-vus` | `spike` | A VU count that changes through stages | k6 adds or removes concurrent VUs according to each stage. The resulting HTTP RPS is not fixed. |
| `constant-arrival-rate` | `soak` | A fixed number of iteration starts per time unit | k6 uses as many VUs as necessary, up to `maxVUs`, to start iterations at the requested rate. |
| `ramping-arrival-rate` | `average-load`, `stress`, `breakpoint` | An iteration-start rate that changes through stages | k6 adds VUs as necessary while gradually changing the target iterations per second. |

`constant-vus` example from smoke:

```javascript
executor: 'constant-vus',
vus: 1,
duration: '10s'
```

This keeps one VU active for ten seconds. It does not define a fixed number of iterations. A faster API allows that VU to complete more iterations.

`ramping-vus` example from spike:

```javascript
executor: 'ramping-vus',
startVUs: 5,
stages: [
  { target: 20, duration: '30s' },
  { target: 20, duration: '1m' },
  { target: 500, duration: '10s' },
  { target: 500, duration: '1m' },
  { target: 20, duration: '10s' },
  { target: 0, duration: '30s' }
]
```

This ramps from 5 to 20 VUs, holds 20, spikes to 500, holds 500, recovers to 20, and finally stops all VUs. Each VU can complete multiple iterations while active.

`constant-arrival-rate` example from soak:

```javascript
executor: 'constant-arrival-rate',
rate: 25,
timeUnit: '1s',
duration: '7m',
preAllocatedVUs: 50,
maxVUs: 500
```

This attempts to start 25 iterations every second for seven minutes. If iterations become slower, k6 uses more concurrent VUs to maintain 25 starts per second. If 500 VUs are insufficient, k6 records dropped iterations.

`ramping-arrival-rate` example from breakpoint:

```javascript
executor: 'ramping-arrival-rate',
startRate: 10,
timeUnit: '1s',
preAllocatedVUs: 200,
maxVUs: 2000,
stages: [
  { target: 300, duration: '3m' },
  { target: 1000, duration: '6m' },
  { target: 0, duration: '1m' }
]
```

This ramps iteration starts from 10 to 300 per second, then from 300 to 1,000 per second, and finally down to zero. The requested rate drives the load; the VU count grows or shrinks as required to achieve it.

The main distinction is:

```text
VU-based executors:
control concurrent VUs → iteration rate and RPS depend on API speed

Arrival-rate executors:
control iteration starts/second → required VUs depend on API speed
```

Iteration rate is not HTTP request rate. If an iteration contains eight enabled requests and k6 starts 25 iterations per second, the expected application traffic is approximately `25 × 8 = 200` HTTP requests per second, plus occasional supporting calls such as JWT login or token refresh.

### Override scenario parameters

The scenario files provide safe local defaults. Override them with process environment variables when you need a different duration or load. The runner forwards these variables to either the local k6 executable or the Docker k6 container.

| Variable | Used by | Default | What it represents |
|---|---|---:|---|
| `DURATION` | All scenarios | Scenario-specific; see below | Duration of the principal stage. It does not replace fixed warm-up, ramp-down, or graceful-stop periods. k6 duration values include `30s`, `2m`, and `1h`. |
| `RATE` | `soak` | `25` | Iterations started per second throughout the soak test. One iteration calls every enabled request in `config.json`, so this is not necessarily the same as HTTP requests per second. |
| `SPIKE_VUS` | `spike` | `500` | Number of concurrent virtual users at the spike peak. |
| `START_RATE` | `breakpoint` | `10` | Iterations per second at the beginning of the breakpoint test. |
| `MID_RATE` | `breakpoint` | `300` | Iterations per second targeted at the end of the first three-minute ramp. |
| `MAX_RATE` | `breakpoint` | `1000` | Iterations per second targeted at the end of the final load ramp. |
| `MAX_VUS` | `breakpoint` | `2000` | Maximum VUs k6 may allocate to sustain the requested arrival rate. It must be at least the fixed `preAllocatedVUs` value of `200`. Reaching this limit can produce dropped iterations. |

`DURATION` affects each scenario as follows:

| Scenario | Default | Stage controlled by `DURATION` |
|---|---:|---|
| `smoke` | `10s` | Complete constant-one-VU execution period. |
| `average-load` | `3m` | Steady period at 25 iterations per second, after the one-minute ramp-up. |
| `stress` | `3m` | Ramp from 100 to 200 iterations per second. |
| `spike` | `1m` | Period held at `SPIKE_VUS` after the ten-second spike ramp. |
| `soak` | `7m` | Complete constant-arrival-rate execution period. |
| `breakpoint` | `6m` | Ramp from `MID_RATE` to `MAX_RATE`; together with the fixed three-minute first ramp and one-minute ramp-down, the configured test time is 10 minutes. |

For macOS/Linux, place overrides before the runner command. They apply only to that command:

```bash
DURATION=2m ./load-tests/run-load-test.sh stress

MAX_RATE=2000 MAX_VUS=3000 \
  ./load-tests/run-load-test.sh breakpoint
```

Windows PowerShell:

PowerShell environment variables remain set in the current terminal until removed or changed, so the examples clean them up after the run:

```powershell
$env:DURATION = "2m"
.\load-tests\run-load-test.ps1 stress
Remove-Item Env:DURATION

$env:MAX_RATE = "2000"
$env:MAX_VUS = "3000"
.\load-tests\run-load-test.ps1 breakpoint
Remove-Item Env:MAX_RATE, Env:MAX_VUS
```

Other supported runner overrides are:

| Variable | Default | What it represents |
|---|---|---|
| `K6_CONFIG_FILE` | `load-tests/config.json` | Configuration file containing the target URL, authentication, requests, payloads, and test settings. A second runner argument takes precedence over this variable. |
| `TEST_ID` | `<scenario>-<UTC timestamp>` | Result-directory and run identifier. Supply a unique filesystem-safe value to choose the name yourself. |

Example using a different configuration and explicit test identifier:

```bash
K6_CONFIG_FILE=load-tests/config.remote.json TEST_ID=remote-smoke-01 \
  ./load-tests/run-load-test.sh smoke
```

```powershell
$env:K6_CONFIG_FILE = "load-tests/config.remote.json"
$env:TEST_ID = "remote-smoke-01"
.\load-tests\run-load-test.ps1 smoke
Remove-Item Env:K6_CONFIG_FILE, Env:TEST_ID
```

The target URL, request list, authentication credentials, certificate paths, payloads, thresholds, think time, TLS verification, and connection reuse are not scenario environment variables. Configure them in `load-tests/config.json`, as described in **Configure an external black-box API** above.

Thresholds, think time, TLS verification, and connection reuse are configured in `testSettings` inside `config.json`:

| Setting | Default | Effect |
|---|---:|---|
| `thinkTimeSeconds` | `0.1` | Pauses each VU after one complete iteration. It models user delay and lowers the request rate in VU-based scenarios. |
| `p95LimitMilliseconds` | `500` | Pass criterion requiring at least 95% of measured requests to complete in under 500 ms. It also applies per authentication type. |
| `errorRateLimit` | `0.01` | Pass criterion requiring fewer than 1% of HTTP requests to fail. For example, 11 failures in 1,000 requests is 1.1% and fails the threshold. |
| `noConnectionReuse` | `false` | When `true`, prevents connection reuse so more requests include connection/TLS setup cost. |
| `insecureSkipTlsVerify` | `false` | When `true`, disables server-certificate verification. Use only for isolated diagnostics, never as the normal fix for TLS trust. |

`p95LimitMilliseconds` and `errorRateLimit` are SLO pass/fail markers; they do not throttle traffic or stop the scenario immediately. If a threshold is breached at the end of a run, k6 returns exit code `99`. The runner still generates the available dashboard and result exports. Disabling connection reuse is useful for measuring TLS/client-certificate handshake cost, but it is not representative of most production clients.

## Results and exports

Every run receives a permanent directory named with its scenario and UTC timestamp:

```text
load-tests/results/
├── dashboard.html
├── dashboard-data.json
├── load-test-history.pdf
├── load-test-history.xlsx
└── smoke-20261029T194438Z/
    ├── dashboard.html
    ├── raw.json
    ├── end-summary.json
    ├── run-metadata.json
    ├── k6-native-report.html
    ├── load-test-report.pdf
    └── load-test-results.xlsx
```

### Which dashboard to open

Open **`load-tests/results/dashboard.html` as the main dashboard**. It contains every saved run and provides filters for test type, run, authentication type, and individual request. After multiple smoke, stress, spike, soak, or breakpoint tests, this is the dashboard used to compare them.

Open **`load-tests/results/<test-id>/dashboard.html` when investigating one run**. It uses the same dashboard design but opens with that run selected, for example `load-tests/results/smoke-20261029T194438Z/dashboard.html`.

The additional **`load-tests/results/<test-id>/k6-native-report.html`** is k6's native per-run report. Use it as a secondary diagnostic view of standard k6 metrics. It does not replace the project dashboard's historical comparison and authentication/request filters. The **Open native k6 report** button above the summary opens this file in a new browser tab for whichever test run is currently selected.

The Test type and Test run selectors contain only actual values from the saved results. Authentication and API request are checkbox dropdowns: select All, one item, or any subset of authentication types and requests. Clicking elsewhere on the dashboard closes an open checkbox dropdown. The summary rows, endpoint table, and response-time, request-rate, and error-rate graph series update to include only checked items. When a selected API request does not exist under one of the checked authentication types, that summary row displays “No data,” and the dashboard does not invent zero-latency points. Maximum VUs and the breaking point describe the complete run, so those run-level values repeat in each displayed authentication row.

The **Test history: p95 response time** panel is expanded initially and can be collapsed by selecting its heading. It remains expanded by default in newly generated dashboards and PDF exports.

When only one run exists, the top-level and run-specific dashboards can look nearly identical. Both are self-contained HTML files and can be opened directly in a browser:

macOS:

```bash
open load-tests/results/dashboard.html
```

Linux:

```bash
xdg-open load-tests/results/dashboard.html
```

Windows PowerShell:

```powershell
Start-Process .\load-tests\results\dashboard.html
```

These dashboards are generated from k6 client-side measurements; neither Grafana nor Prometheus is installed or required. The `grafana/k6` Docker image name identifies the k6 image publisher and does not add a Grafana server.

Each run directory contains:

| File | Content |
|---|---|
| `raw.json` | Timestamped k6 metric points; canonical detailed result |
| `end-summary.json` | Aggregated end-of-test metrics and threshold status |
| `run-metadata.json` | Test identity, target, thresholds, start time and enabled request definitions |
| `dashboard.html` | Run-focused project dashboard with interactive filters |
| `k6-native-report.html` | Native k6 diagnostic report for this run |
| `load-test-report.pdf` | Landscape PDF of the standalone dashboard |
| `load-test-results.xlsx` | Per-run summary, endpoint percentiles, timeline and breakpoint analysis |

The top-level `dashboard-data.json` contains the processed data embedded in the dashboard, `load-test-history.xlsx` contains all runs and endpoints, and `load-test-history.pdf` is an export of the historical dashboard. The runners automatically install missing locked reporting dependencies with `npm ci`. If installation is unavailable, HTML dashboards are still generated, while XLSX and PDF exports are skipped with a warning. PDF export additionally requires a supported Chrome, Edge, or Playwright Chromium browser.

Regenerate every run dashboard, per-run XLSX/PDF file, and both historical exports without rerunning k6:

```bash
cd load-tests
npm ci
npm run report:all
```

The `report:all` command is also the backfill command for older result folders whose PDF or XLSX files are missing.

The Excel format is `.xlsx` rather than legacy `.xls` because `.xlsx` supports substantially larger result sets. Raw, unaggregated samples remain available in `raw.json`; the workbook uses bounded percentile sampling and 10-second time buckets so large breakpoint/soak tests remain practical.

### Breaking-point calculation

The workbook marks a breaking point after three consecutive 10-second windows where any of these is true:

- p95 HTTP duration exceeds `testSettings.p95LimitMilliseconds` (default 500 ms),
- failed-request rate exceeds `testSettings.errorRateLimit` (default 1%), or
- one or more iterations are dropped.

The **Breaking Point** worksheet shows every evaluated window. The **Summary** worksheet reports the first sustained breach and its achieved request rate. The historical dashboard displays the same externally observed latency, errors, dropped iterations, throughput and VUs for saved runs.

## Recommended k6 approach

1. Define SLOs and a realistic endpoint/authentication mix before selecting load levels.
2. Run smoke and average-load tests first; only then run stress or breakpoint tests.
3. Prefer arrival-rate executors for capacity work. They maintain the requested traffic rate independently of system slowdown and make saturation visible through dropped iterations.
4. Keep login behavior realistic. This project caches JWTs per VU and refreshes them near expiry instead of logging in on every request.
5. Measure connection reuse and fresh TLS handshakes separately. Mixing them hides certificate-authentication cost.
6. Monitor response time, throughput, errors, VUs, TLS/connect/wait time, and dropped work from k6. Internal CPU, memory, GC, database, and thread metrics are unavailable in a black-box test unless the external system exposes its own monitoring separately.
7. Warm up the service, keep data and infrastructure stable, and repeat important runs. Treat one test as an observation, not a capacity guarantee.
8. Keep the generated run folders so the historical dashboard can compare test types and changes over time.
9. Stop increasing load after a sustained breach; continuing far beyond saturation usually produces less useful diagnostic data.

## Certificate model

The Bash and PowerShell certificate generators create:

- `ca-cert.pem` / `ca-key.pem`: local certificate authority.
- `server-cert.pem` / `server-key.pem`: HTTPS certificate for `localhost`, `api`, and `127.0.0.1`.
- `client-cert.pem` / `client-key.pem`: client certificate with the Client Authentication EKU and common name `k6-client`.
- `server-cert.pfx` and `client-cert.pfx`: password-protected alternatives for tools that require PFX.

Kestrel requests an optional client certificate during TLS negotiation so open/JWT/Basic routes stay accessible. The certificate authentication handler then requires and validates it only for `/api/certificate/data`. Validation uses a custom root trust chain against the generated CA, verifies validity dates and Client Authentication EKU, checks the expected common name, and caches successful validation briefly. The host trust store is not modified.

Never commit `certificates/generated/`; it contains private keys and is ignored by Git.

## Security notes

- Replace every default credential and signing key.
- Basic authentication is safe only inside TLS; this application exposes HTTPS only.
- The JWT implementation intentionally demonstrates a symmetric HMAC token. Production systems should normally obtain tokens from a dedicated OpenID Connect/OAuth identity provider and use standard JWT bearer middleware.
- The development CA has no revocation service. Use managed PKI and revocation checking in production.
- The in-memory store is intentionally ephemeral and resets whenever the API restarts.
- Avoid high-cardinality request names, such as unique request IDs or record IDs, because they create unnecessary report rows.

## Troubleshooting

- **API cannot find certificates:** run `./certificates/generate-certificates.sh` on macOS/Linux or `.\certificates\generate-certificates.ps1` on Windows, then confirm `certificates/generated/server-cert.pem` exists.
- **PowerShell certificate generation cannot find OpenSSL:** install OpenSSL for Windows, ensure `openssl.exe` is on `PATH`, and open a new PowerShell session.
- **Certificate route returns 401:** send both `client-cert.pem` and `client-key.pem`; do not send the server certificate.
- **k6 reports unknown certificate authority:** set `certificate.caPath` in `config.json`. The runner passes it to k6 automatically.
- **PDF export says no browser is installed:** run `cd load-tests && npx playwright install chromium`.
- **A stress/breakpoint command exits 99:** k6 uses exit code 99 for a failed threshold. The reports are still generated and should be inspected.
- **PowerShell blocks a Windows script:** run `Set-ExecutionPolicy -Scope Process Bypass`, then execute the certificate generator or load-test runner again. This changes policy only for the current PowerShell process.
- **Ports are already in use:** change the left side of the relevant port mapping in `docker/docker-compose.yml` and adjust `applicationUrl` where necessary.
