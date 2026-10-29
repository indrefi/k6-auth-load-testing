#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
output_dir="${script_dir}/generated"
certificate_password="${CERTIFICATE_PASSWORD:-changeit}"

mkdir -p "${output_dir}"

openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
  -keyout "${output_dir}/ca-key.pem" \
  -out "${output_dir}/ca-cert.pem" \
  -days 3650 \
  -subj "/CN=AuthLoadDemo Local CA/O=AuthLoadDemo"

openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout "${output_dir}/server-key.pem" \
  -out "${output_dir}/server.csr" \
  -subj "/CN=localhost/O=AuthLoadDemo"

openssl x509 -req -sha256 \
  -in "${output_dir}/server.csr" \
  -CA "${output_dir}/ca-cert.pem" \
  -CAkey "${output_dir}/ca-key.pem" \
  -CAcreateserial \
  -out "${output_dir}/server-cert.pem" \
  -days 825 \
  -extfile "${script_dir}/server.ext"

openssl pkcs12 -export \
  -out "${output_dir}/server-cert.pfx" \
  -inkey "${output_dir}/server-key.pem" \
  -in "${output_dir}/server-cert.pem" \
  -certfile "${output_dir}/ca-cert.pem" \
  -keypbe AES-256-CBC \
  -certpbe AES-256-CBC \
  -macalg sha256 \
  -passout "pass:${certificate_password}"

openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout "${output_dir}/client-key.pem" \
  -out "${output_dir}/client.csr" \
  -subj "/CN=k6-client/O=AuthLoadDemo"

openssl x509 -req -sha256 \
  -in "${output_dir}/client.csr" \
  -CA "${output_dir}/ca-cert.pem" \
  -CAkey "${output_dir}/ca-key.pem" \
  -CAcreateserial \
  -out "${output_dir}/client-cert.pem" \
  -days 825 \
  -extfile "${script_dir}/client.ext"

openssl pkcs12 -export \
  -out "${output_dir}/client-cert.pfx" \
  -inkey "${output_dir}/client-key.pem" \
  -in "${output_dir}/client-cert.pem" \
  -certfile "${output_dir}/ca-cert.pem" \
  -keypbe AES-256-CBC \
  -certpbe AES-256-CBC \
  -macalg sha256 \
  -passout "pass:${certificate_password}"

rm -f "${output_dir}/server.csr" "${output_dir}/client.csr" "${output_dir}/ca-cert.srl"
chmod 600 "${output_dir}"/*-key.pem "${output_dir}"/*.pfx

printf 'Certificates generated in %s\n' "${output_dir}"
printf 'PFX password: %s\n' "${certificate_password}"

