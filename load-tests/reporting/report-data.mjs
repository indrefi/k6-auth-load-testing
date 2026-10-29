import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

class Statistics {
  constructor(maxSamples = 30_000) {
    this.count = 0;
    this.sum = 0;
    this.min = Number.POSITIVE_INFINITY;
    this.max = Number.NEGATIVE_INFINITY;
    this.samples = [];
    this.maxSamples = maxSamples;
  }

  add(value) {
    if (!Number.isFinite(value)) return;
    this.count += 1;
    this.sum += value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    if (this.samples.length < this.maxSamples) {
      this.samples.push(value);
    } else {
      const candidate = Math.floor(Math.random() * this.count);
      if (candidate < this.maxSamples) this.samples[candidate] = value;
    }
  }

  percentile(percent) {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((percent / 100) * sorted.length) - 1)];
  }

  average() { return this.count === 0 ? 0 : this.sum / this.count; }

  values() {
    return {
      count: this.count,
      avg: this.average(),
      min: this.count ? this.min : 0,
      p90: this.percentile(90),
      p95: this.percentile(95),
      p99: this.percentile(99),
      max: this.count ? this.max : 0,
    };
  }
}

export async function analyzeRun(runDirectory) {
  const rawPath = path.join(runDirectory, 'raw.json');
  if (!fs.existsSync(rawPath)) return null;

  const metadataPath = path.join(runDirectory, 'run-metadata.json');
  const metadata = fs.existsSync(metadataPath)
    ? JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    : { id: path.basename(runDirectory), type: path.basename(runDirectory).split('-')[0] };
  const overall = new Statistics();
  const endpoints = new Map();
  const seconds = new Map();
  const tenSecondWindows = new Map();
  let totalRequests = 0;
  let failedRequests = 0;
  let failureSamples = 0;
  let droppedIterations = 0;
  let maxVus = 0;
  let firstTimestamp = Number.POSITIVE_INFINITY;
  let lastTimestamp = 0;

  const lines = readline.createInterface({ input: fs.createReadStream(rawPath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'Point' || !event.data) continue;

    const metric = event.metric;
    const value = Number(event.data.value);
    const timestamp = Date.parse(event.data.time);
    const tags = event.data.tags || {};
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
    firstTimestamp = Math.min(firstTimestamp, timestamp);
    lastTimestamp = Math.max(lastTimestamp, timestamp);

    const second = Math.floor(timestamp / 1000) * 1000;
    if (!seconds.has(second)) {
      seconds.set(second, { timestamp: second, duration: new Statistics(5_000), requests: 0, failures: 0, failureSamples: 0, vus: 0, dropped: 0, endpoints: new Map() });
    }
    const point = seconds.get(second);

    const tenSecond = Math.floor(timestamp / 10_000) * 10_000;
    if (!tenSecondWindows.has(tenSecond)) {
      tenSecondWindows.set(tenSecond, { timestamp: tenSecond, duration: new Statistics(20_000), requests: 0, failures: 0, failureSamples: 0, dropped: 0 });
    }
    const window = tenSecondWindows.get(tenSecond);

    if (metric === 'http_req_duration') {
      overall.add(value);
      point.duration.add(value);
      window.duration.add(value);
      const endpointName = tags.name || 'unknown';
      const endpointKey = `${tags.auth_type || 'unknown'}\u0000${tags.operation || 'unknown'}\u0000${endpointName}`;
      if (!endpoints.has(endpointKey)) {
        endpoints.set(endpointKey, { stats: new Statistics(), failures: 0, failureSamples: 0, statuses: {} });
      }
      endpoints.get(endpointKey).stats.add(value);
      const endpointPoint = pointEndpoint(point, endpointKey);
      endpointPoint.duration.add(value);
    } else if (metric === 'http_reqs') {
      totalRequests += value;
      point.requests += value;
      window.requests += value;
      const endpointName = tags.name || 'unknown';
      const endpointKey = `${tags.auth_type || 'unknown'}\u0000${tags.operation || 'unknown'}\u0000${endpointName}`;
      if (!endpoints.has(endpointKey)) {
        endpoints.set(endpointKey, { stats: new Statistics(), failures: 0, failureSamples: 0, statuses: {} });
      }
      const status = tags.status || 'unknown';
      endpoints.get(endpointKey).statuses[status] = (endpoints.get(endpointKey).statuses[status] || 0) + value;
      pointEndpoint(point, endpointKey).requests += value;
    } else if (metric === 'http_req_failed') {
      failedRequests += value;
      failureSamples += 1;
      point.failures += value;
      point.failureSamples += 1;
      window.failures += value;
      window.failureSamples += 1;
      const endpointName = tags.name || 'unknown';
      const endpointKey = `${tags.auth_type || 'unknown'}\u0000${tags.operation || 'unknown'}\u0000${endpointName}`;
      if (!endpoints.has(endpointKey)) {
        endpoints.set(endpointKey, { stats: new Statistics(), failures: 0, failureSamples: 0, statuses: {} });
      }
      endpoints.get(endpointKey).failures += value;
      endpoints.get(endpointKey).failureSamples += 1;
      pointEndpoint(point, endpointKey).failures += value;
      pointEndpoint(point, endpointKey).failureSamples += 1;
    } else if (metric === 'vus' || metric === 'vus_max') {
      maxVus = Math.max(maxVus, value);
      point.vus = Math.max(point.vus, value);
    } else if (metric === 'dropped_iterations') {
      droppedIterations += value;
      point.dropped += value;
      window.dropped += value;
    }
  }

  const p95Limit = Number(metadata.p95LimitMilliseconds ?? 500);
  const errorRateLimit = Number(metadata.errorRateLimit ?? 0.01);
  let consecutiveBreaches = 0;
  let breakingPoint = null;
  const windows = [...tenSecondWindows.values()].sort((a, b) => a.timestamp - b.timestamp).map((window) => {
    const p95 = window.duration.percentile(95);
    const errorRate = window.failureSamples ? window.failures / window.failureSamples : 0;
    const breached = p95 > p95Limit || errorRate > errorRateLimit || window.dropped > 0;
    consecutiveBreaches = breached ? consecutiveBreaches + 1 : 0;
    const result = { timestamp: window.timestamp, rps: window.requests / 10, p95, errorRate, dropped: window.dropped, breached };
    if (!breakingPoint && consecutiveBreaches >= 3) breakingPoint = result;
    return result;
  });

  const durationSeconds = firstTimestamp === Number.POSITIVE_INFINITY ? 0 : Math.max(1, (lastTimestamp - firstTimestamp) / 1000);
  const endpointRows = [...endpoints.entries()].map(([key, endpoint]) => {
    const [authType, operation, name] = key.split('\u0000');
    return {
      name,
      authType,
      operation,
      ...endpoint.stats.values(),
      errorRate: endpoint.failureSamples ? endpoint.failures / endpoint.failureSamples : 0,
      statuses: endpoint.statuses,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  let timeline = [...seconds.values()].sort((a, b) => a.timestamp - b.timestamp).map((point) => ({
    timestamp: point.timestamp,
    elapsed: firstTimestamp === Number.POSITIVE_INFINITY ? 0 : Math.max(0, (point.timestamp - firstTimestamp) / 1000),
    rps: point.requests,
    p95: point.duration.percentile(95),
    avg: point.duration.average(),
    errorRate: point.failureSamples ? point.failures / point.failureSamples : 0,
    vus: point.vus,
    dropped: point.dropped,
    endpoints: [...point.endpoints.entries()].map(([key, endpoint]) => {
      const [authType, operation, name] = key.split('\u0000');
      return {
        name,
        authType,
        operation,
        rps: endpoint.requests,
        avg: endpoint.duration.average(),
        p95: endpoint.duration.percentile(95),
        errorRate: endpoint.failureSamples ? endpoint.failures / endpoint.failureSamples : 0,
      };
    }),
  }));
  if (timeline.length > 600) {
    const stride = Math.ceil(timeline.length / 600);
    timeline = timeline.filter((_, index) => index % stride === 0 || index === timeline.length - 1);
  }

  return {
    id: metadata.id || path.basename(runDirectory),
    resultDirectory: path.basename(runDirectory),
    type: metadata.type || 'unknown',
    startedAt: metadata.startedAt || (firstTimestamp === Number.POSITIVE_INFINITY ? '' : new Date(firstTimestamp).toISOString()),
    applicationUrl: metadata.applicationUrl || '',
    durationSeconds,
    totalRequests,
    requestsPerSecond: totalRequests / durationSeconds,
    maxVus,
    errorRate: failureSamples ? failedRequests / failureSamples : 0,
    droppedIterations,
    latency: overall.values(),
    breakingPoint,
    endpoints: endpointRows,
    timeline,
    windows,
    thresholds: { p95LimitMilliseconds: p95Limit, errorRateLimit },
    hasNativeReport: fs.existsSync(path.join(runDirectory, 'k6-native-report.html')),
  };
}

function pointEndpoint(point, key) {
  if (!point.endpoints.has(key)) {
    point.endpoints.set(key, { duration: new Statistics(2_000), requests: 0, failures: 0, failureSamples: 0 });
  }
  return point.endpoints.get(key);
}

export async function analyzeHistory(resultsDirectory) {
  if (!fs.existsSync(resultsDirectory)) return [];
  const entries = fs.readdirSync(resultsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(resultsDirectory, entry.name));
  const runs = (await Promise.all(entries.map(analyzeRun))).filter(Boolean);
  return runs.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}
