const configPath = __ENV.K6_CONFIG_FILE || '../config.json';

export const configuration = JSON.parse(open(import.meta.resolve(configPath)));

export function commonOptions(executor) {
  const settings = configuration.testSettings || {};
  const p95Limit = Number(settings.p95LimitMilliseconds ?? 500);
  const errorRateLimit = Number(settings.errorRateLimit ?? 0.01);

  return {
    scenarios: { workload: executor },
    insecureSkipTLSVerify: settings.insecureSkipTlsVerify === true,
    discardResponseBodies: true,
    noConnectionReuse: settings.noConnectionReuse === true,
    userAgent: 'k6-black-box-load-test/1.0',
    thresholds: {
      http_req_failed: [`rate<${errorRateLimit}`],
      http_req_duration: [`p(95)<${p95Limit}`],
      checks: ['rate>0.99'],
      dropped_iterations: ['count==0'],
      'http_req_duration{auth_type:open}': [`p(95)<${p95Limit}`],
      'http_req_duration{auth_type:jwt}': [`p(95)<${p95Limit}`],
      'http_req_duration{auth_type:certificate}': [`p(95)<${p95Limit}`],
      'http_req_duration{auth_type:basic}': [`p(95)<${p95Limit}`],
    },
    summaryTrendStats: ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    systemTags: ['status', 'method', 'name', 'scenario', 'group', 'check', 'error', 'error_code'],
    tags: {
      testid: __ENV.TEST_ID || configuration.testId || `local-${Date.now()}`,
      test_type: __ENV.TEST_TYPE || 'custom',
    },
  };
}

export function tlsAuthOptions() {
  const certificate = configuration.certificate || {};
  const certificatePath = __ENV.K6_CLIENT_CERT_FILE || certificate.clientCertificatePath || '';
  const keyPath = __ENV.K6_CLIENT_KEY_FILE || certificate.clientKeyPath || '';
  if (!certificatePath || !keyPath) {
    return [];
  }

  return [{
    cert: open(resolveConfigurationPath(certificatePath)),
    key: open(resolveConfigurationPath(keyPath)),
  }];
}

function resolveConfigurationPath(value) {
  if (value.startsWith('/') || value.startsWith('file:')) {
    return import.meta.resolve(value);
  }

  // This module is one directory below config.json, so ../ makes certificate
  // paths relative to the configuration file's normal load-tests/ location.
  return import.meta.resolve(`../${value}`);
}
