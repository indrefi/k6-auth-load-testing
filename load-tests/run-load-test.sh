#!/usr/bin/env bash
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"
docker_dir="${project_dir}/docker"
compose_file="${docker_dir}/docker-compose.yml"
compose_args=(-f "${compose_file}")
if [[ -f "${docker_dir}/.env" ]]; then
  compose_args=(--env-file "${docker_dir}/.env" "${compose_args[@]}")
fi
scenario="${1:-smoke}"
scenario_file="scenarios/${scenario}.js"
config_file="${2:-${K6_CONFIG_FILE:-${script_dir}/config.json}}"

if [[ ! -f "${config_file}" ]]; then
  printf 'Configuration file not found: %s\n' "${config_file}" >&2
  printf 'Create it with: cp load-tests/config.example.json load-tests/config.json\n' >&2
  exit 2
fi
config_file="$(cd "$(dirname "${config_file}")" && pwd)/$(basename "${config_file}")"

if [[ ! -f "${script_dir}/${scenario_file}" ]]; then
  printf 'Unknown scenario: %s\n' "${scenario}" >&2
  printf 'Available: smoke, average-load, stress, spike, soak, breakpoint\n' >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  printf 'Node.js 20 or newer is required to read config.json and generate reports.\n' >&2
  exit 2
fi

json_value() {
  node -e '
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const value = process.argv[2].split(".").reduce((current, key) => current?.[key], config);
    if (value !== undefined && value !== null) process.stdout.write(String(value));
  ' "${config_file}" "$1"
}

config_path() {
  local value
  value="$(json_value "$1")"
  if [[ -z "${value}" ]]; then
    return
  fi
  node -e '
    const path = require("node:path");
    process.stdout.write(path.resolve(path.dirname(process.argv[1]), process.argv[2]));
  ' "${config_file}" "${value}"
}

docker_path() {
  local value="$1"
  if [[ -z "${value}" ]]; then
    return
  fi
  if [[ "${value}" == "${project_dir}/"* ]]; then
    printf '/work/%s' "${value#"${project_dir}/"}"
  else
    printf 'Path %s is outside the repository and cannot be mounted into the k6 container.\n' "${value}" >&2
    printf 'Copy the file into load-tests/secrets/ and update config.json.\n' >&2
    return 1
  fi
}

application_url="$(json_value applicationUrl)"
start_demo_api="$(json_value startDemoApi)"
health_path="$(json_value healthPath)"
p95_limit="$(json_value testSettings.p95LimitMilliseconds)"
error_rate_limit="$(json_value testSettings.errorRateLimit)"
local_ca_path="$(config_path certificate.caPath)"
local_client_cert_path="$(config_path certificate.clientCertificatePath)"
local_client_key_path="$(config_path certificate.clientKeyPath)"

if [[ -z "${application_url}" ]]; then
  printf 'config.json must contain applicationUrl.\n' >&2
  exit 2
fi

test_id="${TEST_ID:-$(json_value testId)}"
test_id="${test_id:-${scenario}-$(date -u +%Y%m%dT%H%M%SZ)}"
test_started_at=""
results_root="${script_dir}/results"
run_directory="${results_root}/${test_id}"
results_relative="results/${test_id}"
mkdir -p "${run_directory}"

set +e
if command -v k6 >/dev/null 2>&1; then
  cd "${script_dir}" || exit 1
  output_args=(--out "json=${results_relative}/raw.json")
  environment=(
    "K6_CONFIG_FILE=${config_file}"
    "K6_CLIENT_CERT_FILE=${local_client_cert_path}"
    "K6_CLIENT_KEY_FILE=${local_client_key_path}"
    "TEST_ID=${test_id}"
    "TEST_TYPE=${scenario}"
    "RESULTS_DIR=${results_relative}"
    "K6_WEB_DASHBOARD=true"
    "K6_WEB_DASHBOARD_PORT=-1"
    "K6_WEB_DASHBOARD_PERIOD=1s"
    "K6_WEB_DASHBOARD_EXPORT=${results_relative}/k6-native-report.html"
  )
  if [[ -n "${local_ca_path}" ]]; then
    environment+=("SSL_CERT_FILE=${local_ca_path}")
  fi
  test_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  env "${environment[@]}" k6 run "${output_args[@]}" "${scenario_file}"
  test_exit=$?
else
  cd "${project_dir}" || exit 1
  docker_config_file="$(docker_path "${config_file}")" || exit 2
  docker_client_cert_path="$(docker_path "${local_client_cert_path}")" || exit 2
  docker_client_key_path="$(docker_path "${local_client_key_path}")" || exit 2
  docker_ca_path="$(docker_path "${local_ca_path}")" || exit 2

  if [[ "${start_demo_api}" == "true" ]]; then
    docker_application_url="https://api:8443"
  else
    docker_application_url="$(node -e '
      const url = new URL(process.argv[1]);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") url.hostname = "host.docker.internal";
      process.stdout.write(url.toString().replace(/\/$/, ""));
    ' "${application_url}")"
  fi

  export DOCKER_K6_CONFIG_FILE="${docker_config_file}"
  export DOCKER_APPLICATION_URL="${docker_application_url}"
  export DOCKER_CLIENT_CERT_PATH="${docker_client_cert_path}"
  export DOCKER_CLIENT_KEY_PATH="${docker_client_key_path}"
  export DOCKER_CA_CERT_PATH="${docker_ca_path:-/etc/ssl/certs/ca-certificates.crt}"
  export AUTH_USERNAME="${AUTH_USERNAME:-$(json_value jwt.username)}"
  export AUTH_PASSWORD="${AUTH_PASSWORD:-$(json_value jwt.password)}"

  if [[ "${start_demo_api}" == "true" ]]; then
    if ! docker compose "${compose_args[@]}" up -d --build api; then
      printf 'Unable to start the demo API.\n' >&2
      exit 1
    fi
  fi

  if [[ "${start_demo_api}" == "true" && -n "${health_path}" ]]; then
    ready=false
    curl_options=(-fsS)
    if [[ -n "${local_ca_path}" ]]; then
      curl_options+=(--cacert "${local_ca_path}")
    fi
    for _ in {1..60}; do
      if curl "${curl_options[@]}" "${application_url}${health_path}" >/dev/null 2>&1; then
        ready=true
        break
      fi
      sleep 1
    done
    if [[ "${ready}" != "true" ]]; then
      printf 'The configured API did not become healthy within 60 seconds.\n' >&2
      exit 1
    fi
  fi

  test_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  TEST_ID="${test_id}" TEST_TYPE="${scenario}" \
    docker compose "${compose_args[@]}" run --rm \
      -e TEST_ID="${test_id}" -e TEST_TYPE="${scenario}" \
      -e RESULTS_DIR="${results_relative}" \
      -e K6_WEB_DASHBOARD_EXPORT="${results_relative}/k6-native-report.html" \
      k6 run --out "json=${results_relative}/raw.json" "${scenario_file}"
  test_exit=$?
fi
set -e

cd "${script_dir}" || exit 1
reporting_ready=true
if [[ ! -f node_modules/exceljs/package.json || ! -f node_modules/playwright/package.json ]]; then
  printf 'Reporting packages are missing; installing locked dependencies with npm ci...\n'
  if ! npm ci; then
    printf 'Unable to install reporting packages; XLSX and PDF exports will be skipped.\n' >&2
    reporting_ready=false
  fi
fi
K6_CONFIG_FILE="${config_file}" RUN_DIRECTORY="${run_directory}" \
  TEST_ID="${test_id}" TEST_TYPE="${scenario}" TEST_STARTED_AT="${test_started_at}" \
  node reporting/write-run-metadata.mjs

if [[ "${reporting_ready}" == "true" && -f node_modules/exceljs/package.json && -f node_modules/playwright/package.json ]]; then
  K6_RAW_RESULTS="${run_directory}/raw.json" K6_SUMMARY="${run_directory}/end-summary.json" \
    XLSX_OUTPUT="${run_directory}/load-test-results.xlsx" \
    P95_LIMIT_MS="${p95_limit:-500}" ERROR_RATE_LIMIT="${error_rate_limit:-0.01}" \
    npm run export:xlsx || true
  RESULTS_ROOT="${results_root}" DEFAULT_RUN_ID="${test_id}" \
    RUN_DASHBOARD_OUTPUT="${run_directory}/dashboard.html" npm run dashboard || true
  RESULTS_ROOT="${results_root}" HISTORY_XLSX_OUTPUT="${results_root}/load-test-history.xlsx" \
    npm run export:history-xlsx || true
  HTML_REPORT="${run_directory}/dashboard.html" PDF_REPORT="${run_directory}/load-test-report.pdf" \
    npm run export:pdf || true
  HTML_REPORT="${results_root}/dashboard.html" PDF_REPORT="${results_root}/load-test-history.pdf" \
    npm run export:pdf || true
else
  RESULTS_ROOT="${results_root}" DEFAULT_RUN_ID="${test_id}" \
    RUN_DASHBOARD_OUTPUT="${run_directory}/dashboard.html" node reporting/generate-dashboard.mjs || true
  printf 'Reporting packages are unavailable; run "cd load-tests && npm ci" to generate XLSX/PDF exports.\n'
fi

printf 'Test ID: %s\n' "${test_id}"
printf 'Configuration: %s\n' "${config_file}"
printf 'Run report: %s\n' "${run_directory}/dashboard.html"
printf 'Historical dashboard: %s\n' "${results_root}/dashboard.html"
printf 'k6 exit code: %s (99 indicates a threshold failure)\n' "${test_exit}"
exit "${test_exit}"
