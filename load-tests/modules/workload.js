import encoding from 'k6/encoding';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { configuration } from './configuration.js';

const requestGroups = [
  ['OPEN_GET', 'open', 'GET'],
  ['OPEN_POST', 'open', 'POST'],
  ['JWT_GET', 'jwt', 'GET'],
  ['JWT_POST', 'jwt', 'POST'],
  ['CERTIFICATE_GET', 'certificate', 'GET'],
  ['CERTIFICATE_POST', 'certificate', 'POST'],
  ['BASIC_GET', 'basic', 'GET'],
  ['BASIC_POST', 'basic', 'POST'],
];

const baseUrl = (__ENV.K6_APPLICATION_URL_OVERRIDE || configuration.applicationUrl || '').replace(/\/$/, '');
const thinkTime = Number(configuration.testSettings?.thinkTimeSeconds ?? 0.1);
const enabledRequests = buildEnabledRequests();
let jwtToken = '';
let jwtExpiresAt = 0;

validateConfiguration();

export function setupWorkload() {
  const healthPath = configuration.healthPath;
  if (!healthPath) {
    return;
  }

  const response = http.get(buildUrl(healthPath), {
    tags: { name: 'health', request_type: 'HEALTH', auth_type: 'open', operation: 'get' },
  });
  if (!check(response, { 'API health check succeeds': (result) => result.status === 200 })) {
    throw new Error(`API health check failed with status ${response.status}`);
  }
}

export function executeWorkload() {
  // One iteration is one complete pass. Every enabled request is called once.
  for (const request of enabledRequests) {
    invoke(request);
  }

  if (thinkTime > 0) {
    sleep(thinkTime);
  }
}

export function summary(data) {
  const resultsDirectory = __ENV.RESULTS_DIR || 'results';
  return {
    [`${resultsDirectory}/end-summary.json`]: JSON.stringify(data, null, 2),
    stdout: summaryText(data),
  };
}

function invoke(request) {
  const headers = { ...(request.definition.headers || {}) };
  if (request.authType === 'jwt') {
    headers.Authorization = `Bearer ${getJwtToken()}`;
  } else if (request.authType === 'basic') {
    const basic = configuration.basic || {};
    headers.Authorization = `Basic ${encoding.b64encode(`${basic.username}:${basic.password}`)}`;
  }

  const params = {
    headers,
    tags: {
      name: request.definition.name,
      request_type: request.groupName,
      auth_type: request.authType,
      operation: request.method.toLowerCase(),
    },
  };

  let response;
  if (request.method === 'POST') {
    params.headers['Content-Type'] ??= 'application/json';
    const payload = replacePlaceholders(request.definition.payload);
    response = http.post(buildUrl(request.definition.path), JSON.stringify(payload), params);
  } else {
    response = http.get(buildUrl(request.definition.path), params);
  }

  const expectedStatuses = Array.isArray(request.definition.expectedStatus)
    ? request.definition.expectedStatus
    : [request.definition.expectedStatus];
  check(response, {
    [`${request.definition.name} returns ${expectedStatuses.join(' or ')}`]:
      (result) => expectedStatuses.includes(result.status),
  });
}

function getJwtToken() {
  if (jwtToken && Date.now() < jwtExpiresAt - 30_000) {
    return jwtToken;
  }

  const jwt = configuration.jwt || {};
  const loginPayload = replacePlaceholders(jwt.loginPayload, {
    username: jwt.username,
    password: jwt.password,
  });
  const response = http.post(
    buildUrl(jwt.loginPath),
    JSON.stringify(loginPayload),
    {
      headers: { 'Content-Type': 'application/json', ...(jwt.loginHeaders || {}) },
      responseType: 'text',
      tags: { name: 'jwt-login', request_type: 'JWT_LOGIN', auth_type: 'jwt', operation: 'login' },
    },
  );
  if (!check(response, { 'JWT login succeeds': (result) => result.status === (jwt.loginExpectedStatus ?? 200) })) {
    return '';
  }

  const loginResponse = response.json();
  jwtToken = readField(loginResponse, jwt.tokenField || 'accessToken');
  if (typeof jwtToken !== 'string' || !jwtToken) {
    throw new Error(`JWT login response does not contain token field "${jwt.tokenField || 'accessToken'}"`);
  }

  const expiresIn = jwt.expiresInField ? Number(readField(loginResponse, jwt.expiresInField)) : Number.NaN;
  jwtExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? Date.now() + expiresIn * 1000
    : expirationFromJwt(jwtToken) || Date.now() + 3_600_000;
  return jwtToken;
}

function replacePlaceholders(value, additionalValues = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => replacePlaceholders(item, additionalValues));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, additionalValues)]),
    );
  }
  if (typeof value !== 'string') {
    return value;
  }

  const values = {
    vu: String(__VU),
    iteration: String(__ITER),
    timestamp: new Date().toISOString(),
    ...additionalValues,
  };
  return value.replace(/\{\{(username|password|vu|iteration|timestamp)\}\}/g, (match, key) => {
    const replacement = values[key];
    return replacement === undefined || replacement === null ? match : String(replacement);
  });
}

function readField(value, path) {
  return path.split('.').reduce((current, part) => current?.[part], value);
}

function expirationFromJwt(token) {
  try {
    const payload = JSON.parse(encoding.b64decode(token.split('.')[1], 'rawurl', 's'));
    return Number.isFinite(Number(payload.exp)) ? Number(payload.exp) * 1000 : 0;
  } catch {
    return 0;
  }
}

function buildEnabledRequests() {
  const configuredRequests = configuration.requests || {};
  return requestGroups.flatMap(([groupName, authType, method]) => {
    const definitions = configuredRequests[groupName] || [];
    if (!Array.isArray(definitions)) {
      throw new Error(`requests.${groupName} must be an array`);
    }
    return definitions
      .filter((definition) => definition.enabled === true)
      .map((definition) => ({ groupName, authType, method, definition }));
  });
}

function validateConfiguration() {
  if (!baseUrl) {
    throw new Error('applicationUrl is required');
  }
  if (enabledRequests.length === 0) {
    throw new Error('At least one request must have "enabled": true');
  }

  const names = new Set();
  for (const request of enabledRequests) {
    const definition = request.definition;
    if (!definition.name || !definition.path) {
      throw new Error(`Every enabled ${request.groupName} request requires name and path`);
    }
    if (names.has(definition.name)) {
      throw new Error(`Enabled request name must be unique: ${definition.name}`);
    }
    names.add(definition.name);
    if (definition.expectedStatus === undefined) {
      throw new Error(`${definition.name} requires expectedStatus`);
    }
    if (request.method === 'POST' && !Object.prototype.hasOwnProperty.call(definition, 'payload')) {
      throw new Error(`${definition.name} requires payload (it may be null)`);
    }
  }

  if (enabledRequests.some((request) => request.authType === 'jwt')) {
    const jwt = configuration.jwt || {};
    if (!jwt.loginPath || !jwt.username || !jwt.password || jwt.loginPayload === undefined) {
      throw new Error('Enabled JWT requests require jwt.loginPath, username, password, and loginPayload');
    }
  }
  if (enabledRequests.some((request) => request.authType === 'basic')) {
    if (!configuration.basic?.username || !configuration.basic?.password) {
      throw new Error('Enabled Basic requests require basic.username and basic.password');
    }
  }
}

function buildUrl(path) {
  return /^https?:\/\//i.test(path) ? path : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function summaryText(data) {
  const duration = data.metrics.http_req_duration?.values || {};
  const failures = data.metrics.http_req_failed?.values || {};
  return [
    '',
    'Black-box load-test result summary',
    `  requests: ${data.metrics.http_reqs?.values?.count || 0}`,
    `  p95: ${duration['p(95)'] || 0} ms`,
    `  p99: ${duration['p(99)'] || 0} ms`,
    `  failure rate: ${((failures.rate || 0) * 100).toFixed(2)}%`,
    '',
  ].join('\n');
}
