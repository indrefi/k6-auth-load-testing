import fs from 'node:fs';
import readline from 'node:readline';
import ExcelJS from 'exceljs';

const rawPath = process.env.K6_RAW_RESULTS || 'results/raw.json';
const summaryPath = process.env.K6_SUMMARY || 'results/end-summary.json';
const outputPath = process.env.XLSX_OUTPUT || 'results/load-test-results.xlsx';
const p95Limit = Number(process.env.P95_LIMIT_MS || 500);
const errorRateLimit = Number(process.env.ERROR_RATE_LIMIT || 0.01);
const bucketMilliseconds = Number(process.env.REPORT_BUCKET_MS || 10_000);

if (!fs.existsSync(rawPath)) {
  throw new Error(`Raw k6 output was not found: ${rawPath}`);
}

class Statistics {
  constructor(maxSamples = 20_000) {
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
}

const endpoints = new Map();
const series = new Map();
const windows = new Map();
const selectedMetrics = new Set(['http_req_duration', 'http_req_failed', 'http_reqs', 'vus', 'dropped_iterations']);

const input = fs.createReadStream(rawPath);
const lines = readline.createInterface({ input, crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  let event;
  try { event = JSON.parse(line); } catch { continue; }
  if (event.type !== 'Point' || !event.data) continue;

  const metric = event.metric;
  const value = Number(event.data.value);
  const timestamp = Date.parse(event.data.time);
  const tags = event.data.tags || {};
  const authType = tags.auth_type || 'unknown';
  const endpoint = tags.name || 'unknown';

  if (metric === 'http_req_duration') {
    const endpointKey = `${authType}\u0000${endpoint}`;
    if (!endpoints.has(endpointKey)) endpoints.set(endpointKey, new Statistics());
    endpoints.get(endpointKey).add(value);
  }

  if (!Number.isFinite(timestamp) || !selectedMetrics.has(metric)) continue;
  const bucket = Math.floor(timestamp / bucketMilliseconds) * bucketMilliseconds;
  const seriesKey = `${bucket}\u0000${metric}\u0000${authType}\u0000${endpoint}`;
  if (!series.has(seriesKey)) series.set(seriesKey, new Statistics(2_000));
  series.get(seriesKey).add(value);

  if (!windows.has(bucket)) {
    windows.set(bucket, { duration: new Statistics(20_000), failures: 0, failureSamples: 0, requests: 0, dropped: 0 });
  }
  const window = windows.get(bucket);
  if (metric === 'http_req_duration') window.duration.add(value);
  if (metric === 'http_req_failed') { window.failures += value; window.failureSamples += 1; }
  if (metric === 'http_reqs') window.requests += value;
  if (metric === 'dropped_iterations') window.dropped += value;
}

const workbook = new ExcelJS.Workbook();
workbook.creator = 'AuthLoadDemo';
workbook.created = new Date();

const summarySheet = workbook.addWorksheet('Summary');
summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 42 }, { header: 'Statistic', key: 'statistic', width: 24 }, { header: 'Value', key: 'value', width: 22 }];
if (fs.existsSync(summaryPath)) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  for (const [metric, definition] of Object.entries(summary.metrics || {})) {
    for (const [statistic, value] of Object.entries(definition.values || {})) {
      summarySheet.addRow({ metric, statistic, value });
    }
  }
}

const endpointSheet = workbook.addWorksheet('Endpoints');
endpointSheet.columns = [
  { header: 'Authentication', key: 'authentication', width: 18 }, { header: 'Request', key: 'request', width: 28 },
  { header: 'Samples', key: 'samples', width: 12 }, { header: 'Average ms', key: 'average', width: 14 },
  { header: 'Minimum ms', key: 'minimum', width: 14 }, { header: 'P90 ms', key: 'p90', width: 14 },
  { header: 'P95 ms', key: 'p95', width: 14 }, { header: 'P99 ms', key: 'p99', width: 14 },
  { header: 'Maximum ms', key: 'maximum', width: 14 },
];
for (const [key, stats] of [...endpoints.entries()].sort()) {
  const [authentication, request] = key.split('\u0000');
  endpointSheet.addRow({
    authentication, request, samples: stats.count, average: stats.average(), minimum: stats.min,
    p90: stats.percentile(90), p95: stats.percentile(95), p99: stats.percentile(99), maximum: stats.max,
  });
}

const timeSeriesSheet = workbook.addWorksheet('Time Series');
timeSeriesSheet.columns = [
  { header: 'Timestamp UTC', key: 'timestamp', width: 25 }, { header: 'Metric', key: 'metric', width: 24 },
  { header: 'Authentication', key: 'authentication', width: 18 }, { header: 'Request', key: 'request', width: 28 },
  { header: 'Samples', key: 'samples', width: 12 }, { header: 'Average', key: 'average', width: 16 },
  { header: 'Minimum', key: 'minimum', width: 16 }, { header: 'Maximum', key: 'maximum', width: 16 },
];
for (const [key, stats] of [...series.entries()].sort()) {
  const [timestamp, metric, authentication, request] = key.split('\u0000');
  timeSeriesSheet.addRow({
    timestamp: new Date(Number(timestamp)).toISOString(), metric, authentication, request,
    samples: stats.count, average: stats.average(), minimum: stats.min, maximum: stats.max,
  });
}

const breakpointSheet = workbook.addWorksheet('Breaking Point');
breakpointSheet.columns = [
  { header: 'Timestamp UTC', key: 'timestamp', width: 25 }, { header: 'Requests/sec', key: 'rps', width: 16 },
  { header: 'P95 ms', key: 'p95', width: 14 }, { header: 'Error rate', key: 'errorRate', width: 14 },
  { header: 'Dropped iterations', key: 'dropped', width: 20 }, { header: 'SLO breached', key: 'breached', width: 16 },
];
let consecutiveBreaches = 0;
let detectedBreakpoint = null;
for (const [timestamp, window] of [...windows.entries()].sort((a, b) => a[0] - b[0])) {
  const p95 = window.duration.percentile(95);
  const errorRate = window.failureSamples === 0 ? 0 : window.failures / window.failureSamples;
  const rps = window.requests / (bucketMilliseconds / 1000);
  const breached = p95 > p95Limit || errorRate > errorRateLimit || window.dropped > 0;
  consecutiveBreaches = breached ? consecutiveBreaches + 1 : 0;
  const row = { timestamp: new Date(timestamp).toISOString(), rps, p95, errorRate, dropped: window.dropped, breached };
  breakpointSheet.addRow(row);
  if (!detectedBreakpoint && consecutiveBreaches >= 3) detectedBreakpoint = row;
}

summarySheet.insertRow(2, { metric: 'Detected breaking point', statistic: 'First 3 consecutive breached windows', value: detectedBreakpoint ? `${detectedBreakpoint.timestamp} at ${detectedBreakpoint.rps.toFixed(2)} req/s` : 'Not reached' });

for (const sheet of workbook.worksheets) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F60C4' } };
}

await workbook.xlsx.writeFile(outputPath);
console.log(`Excel report written to ${outputPath}`);

